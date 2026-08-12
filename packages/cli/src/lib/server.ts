import http from 'http'
import { execFile } from 'child_process'
import { createInterface } from 'readline'
import { createRequire } from 'module'
import { existsSync, readFileSync, writeFile, mkdirSync, statSync, realpathSync } from 'fs'

const _require = createRequire(import.meta.url)
import { join, resolve, extname, sep } from 'path'
import type { BuildContext } from 'esbuild'
import pc from 'picocolors'
import { readRepoConfig, discoverSources, type SourceEntry } from './project.js'
import { createWatchContext, createProdWatchContext, ICON_EXTENSIONS } from './builder.js'
import { buildRustSource, readRustSourceMeta, checkRustPrerequisites } from './rust-builder.js'
// Runtime shims are now bundled into dev builds via esbuild aliases
import { getLanIP, getAllIPs } from '../utils/net.js'
import * as log from '../utils/log.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DevServerOpts {
  root: string
  port: number
  open: boolean
  publicUrl?: string
}

// ---------------------------------------------------------------------------
// MIME types
// ---------------------------------------------------------------------------

const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.json': 'application/json',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
}

// ---------------------------------------------------------------------------
// Private / internal address detection (SSRF protection for image proxy)
// ---------------------------------------------------------------------------

function isPrivateHostname(hostname: string): boolean {
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '0.0.0.0' ||
    hostname.endsWith('.local')
  ) return true

  // IPv4 private ranges
  if (hostname.startsWith('10.')) return true
  if (hostname.startsWith('192.168.')) return true
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) return true
  // Link-local (incl. AWS IMDS at 169.254.169.254)
  if (hostname.startsWith('169.254.')) return true
  // RFC 6598 shared address space (100.64.0.0/10, incl. Tailscale)
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(hostname)) return true
  // 0.x.x.x
  if (hostname.startsWith('0.')) return true

  // IPv6 loopback and private
  if (hostname.startsWith('fe80:') || hostname.startsWith('fc') || hostname.startsWith('fd')) return true

  return false
}

// ---------------------------------------------------------------------------
// startDevServer
// ---------------------------------------------------------------------------

export async function startDevServer(opts: DevServerOpts): Promise<void> {
  const { root, open } = opts
  let port = opts.port

  const repoConfig = readRepoConfig(root)
  const sources: SourceEntry[] = discoverSources(root)
  const distDir = join(root, 'dist')
  const sourcesDir = join(root, 'sources')
  const nodePaths = [join(root, 'node_modules')]
  const watchedIds = new Set<string>()

  mkdirSync(distDir, { recursive: true })

  // Dev builds go to .dev/ subdirectory (for server-side eval only)
  const devDir = join(distDir, '.dev')
  mkdirSync(devDir, { recursive: true })

  // Cache evaluated bundle modules to avoid re-evaluating on every /api/call
  const bundleCache = new Map<string, { mtime: number; module: Record<string, (...a: unknown[]) => unknown> }>()
  // Serialize bundle evaluation per source to prevent globalThis.GlyphExtension collisions
  const evalLocks = new Map<string, Promise<void>>()

  // ── Build all extensions (watch mode) ─────────────────────────────
  // Two watch contexts per source:
  //   - Production IIFE → dist/<id>.js (served to the app, WIT imports → window.__wit.*)
  //   - Dev IIFE → dist/.dev/<id>.js (for server-side /api/call eval, shims inlined)

  const contexts: BuildContext[] = []

  for (const source of sources.filter(s => s.language === 'js')) {
    // Production build (app downloads this)
    const prodOutfile = join(distDir, `${source.id}.js`)
    const prodCtx = await createProdWatchContext({
      entryPoint: source.entryPoint,
      outfile: prodOutfile,
      absWorkingDir: root,
      nodePaths,
    })
    await prodCtx.watch()
    contexts.push(prodCtx)

    // Dev build (server evals this for /api/call)
    const devOutfile = join(devDir, `${source.id}.js`)
    const devCtx = await createWatchContext({
      entryPoint: source.entryPoint,
      outfile: devOutfile,
      absWorkingDir: root,
      nodePaths,
    })
    await devCtx.watch()
    contexts.push(devCtx)

    watchedIds.add(source.id)
    console.log(`  watching ${source.id}`)
  }

  // ── Build Rust sources once at startup (no watch — cargo is too slow) ─
  const rustSources = sources.filter(s => s.language === 'rust')
  if (rustSources.length > 0) {
    try {
      checkRustPrerequisites()
      for (const source of rustSources) {
        try {
          console.log(`  building ${source.id} (rust)...`)
          await buildRustSource({ sourceDir: source.dir, sourceId: source.id, distDir })
          console.log(`  ${pc.green('✔')} ${source.id} built`)
        } catch (err) {
          log.error(`Rust build failed for ${source.id}: ${err instanceof Error ? err.message : String(err)}`)
        }
      }
    } catch (err) {
      log.warn(`Rust toolchain not available, skipping Rust sources: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // ── Mutable base URL (refreshed from current network on each index regeneration) ─

  function currentBaseUrl() {
    if (opts.publicUrl) return opts.publicUrl.replace(/\/+$/, '')
    return `http://${getLanIP()}:${port}`
  }
  let baseUrl = currentBaseUrl()

  // ── Generate index.json with local dev URLs ───────────────────────

  // Track bundle mtimes to avoid re-generating index.json on every request
  const lastIndexMtimes = new Map<string, number>()

  function regenerateIndex(requestHost?: string) {
    // Use the Host header from the incoming request if available,
    // so bundleUrls match the IP the client actually connected to.
    if (requestHost && !opts.publicUrl) {
      const host = requestHost.replace(/\/+$/, '')
      baseUrl = `http://${host}`
    } else {
      baseUrl = currentBaseUrl()
    }

    // Skip if no bundles have changed since last generation
    if (lastIndexMtimes.size > 0) {
      let changed = false
      for (const source of sources) {
        const outfile = join(distDir, `${source.id}.js`)
        try {
          if (statSync(outfile).mtimeMs !== lastIndexMtimes.get(source.id)) { changed = true; break }
        } catch {
          if (lastIndexMtimes.has(source.id)) { changed = true; break }
        }
      }
      if (!changed) return
    }

    // Re-discover sources to pick up ones added while the server is running
    const latestSources = discoverSources(root)
    for (const source of latestSources.filter(s => s.language === 'js')) {
      if (!watchedIds.has(source.id)) {
        sources.push(source)
        watchedIds.add(source.id)
        Promise.all([
          createProdWatchContext({
            entryPoint: source.entryPoint,
            outfile: join(distDir, `${source.id}.js`),
            absWorkingDir: root,
            nodePaths,
          }),
          createWatchContext({
            entryPoint: source.entryPoint,
            outfile: join(devDir, `${source.id}.js`),
            absWorkingDir: root,
            nodePaths,
          }),
        ]).then(async ([prodCtx, devCtx]) => {
          await prodCtx.watch()
          await devCtx.watch()
          contexts.push(prodCtx, devCtx)
          console.log(`  ${pc.green('+')} watching ${source.id}`)
        }).catch((err) => {
          log.warn(`Failed to watch new source: ${err instanceof Error ? err.message : String(err)}`)
        })
      }
    }

    const indexSources = []

    for (const source of sources) {
      // ── Rust sources: read metadata from source.json ───��──────────
      if (source.language === 'rust') {
        const extJs = join(distDir, source.id, 'ext.js')
        if (!existsSync(extJs)) continue
        try {
          const meta = readRustSourceMeta(source.dir)
          if (!meta.id) continue

          let iconUrl = (meta.icon as string) || ''
          for (const iconExt of ICON_EXTENSIONS) {
            if (existsSync(join(sourcesDir, source.id, 'static', `icon.${iconExt}`))) {
              iconUrl = `${baseUrl}/static/${source.id}/icon.${iconExt}`
              break
            }
          }

          const rustCaps = Array.isArray(meta.capabilities)
            ? (meta.capabilities as unknown[]).filter((c): c is string => typeof c === 'string')
            : undefined

          indexSources.push({
            id: meta.id,
            name: meta.name,
            version: meta.version,
            language: meta.language,
            icon: iconUrl,
            nsfw: (meta.nsfw as boolean) || false,
            type: 'wasm',
            dev: (meta.dev as string) || undefined,
            bundleUrl: `${baseUrl}/dist/${source.id}/ext.js`,
            ...(meta.requiresLogin ? { requiresLogin: true } : {}),
            ...(meta.loginUrl ? { loginUrl: meta.loginUrl as string } : {}),
            ...(meta.sourceType ? { sourceType: meta.sourceType as string } : {}),
            ...(rustCaps && rustCaps.length > 0 ? { capabilities: rustCaps } : {}),
          })
        } catch {
          // Skip Rust sources with invalid source.json
        }
        continue
      }

      // ── JS sources: extract metadata from evaluated bundle ────────
      const devOutfile = join(devDir, `${source.id}.js`)
      const outfile = join(distDir, `${source.id}.js`)
      if (!existsSync(devOutfile) && !existsSync(outfile)) continue

      try {
        const bundleCode = readFileSync(existsSync(devOutfile) ? devOutfile : outfile, 'utf-8')
        // Runs the developer's own compiled bundle in the current Node process.
        // eslint-disable-next-line no-new-func
        const fn = new Function('require', bundleCode + '; return GlyphExtension;')
        const ext = fn(_require) as Record<string, unknown>
        const src = (ext.source ?? ext.default ?? ext) as Record<string, unknown>
        const info = (Object.getOwnPropertyDescriptor(src, '__info')?.value ?? src.info) as Record<string, unknown> | undefined
        if (!info?.id) continue

        const rawCaps = Object.getOwnPropertyDescriptor(src, '__capabilities')?.value
        const capabilities = Array.isArray(rawCaps)
          ? rawCaps.filter((c): c is string => typeof c === 'string')
          : []

        // Resolve icon: local static file or fallback to info.icon
        let iconUrl = (info.icon as string) || ''
        for (const iconExt of ICON_EXTENSIONS) {
          if (existsSync(join(sourcesDir, source.id, 'static', `icon.${iconExt}`))) {
            iconUrl = `${baseUrl}/static/${source.id}/icon.${iconExt}`
            break
          }
        }

        indexSources.push({
          id: info.id,
          name: info.name,
          version: info.version,
          language: info.language,
          icon: iconUrl,
          nsfw: (info.nsfw as boolean) || false,
          dev: (info.dev as string) || undefined,
          bundleUrl: `${baseUrl}/dist/${source.id}.js`,
          ...(info.requiresLogin ? { requiresLogin: true } : {}),
          ...(info.loginUrl ? { loginUrl: info.loginUrl as string } : {}),
          ...(info.sourceType ? { sourceType: info.sourceType as string } : {}),
          ...(capabilities.length > 0 ? { capabilities } : {}),
        })
      } catch {
        // Skip sources that fail to evaluate
      }
    }

    const index = {
      name: repoConfig.name || 'Dev Extensions',
      author: repoConfig.author || '',
      description: repoConfig.description || '',
      website: repoConfig.website || '',
      repository: baseUrl,
      sources: indexSources,
    }

    writeFile(join(distDir, 'index.json'), JSON.stringify(index, null, 2) + '\n', () => {})

    // Update mtime cache
    for (const source of sources) {
      const outfile = join(distDir, `${source.id}.js`)
      try {
        lastIndexMtimes.set(source.id, statSync(outfile).mtimeMs)
      } catch {
        lastIndexMtimes.delete(source.id)
      }
    }
  }

  // ── HTTP server ───────────────────────────────────────────────────

  const server = http.createServer((req, res) => {
    const urlPath = (req.url ?? '/').split('?')[0]

    // Path traversal protection
    const safePath = resolve(root, '.' + urlPath)
    if (safePath !== root && !safePath.startsWith(root + sep)) {
      res.writeHead(403)
      res.end('Forbidden')
      return
    }

    // ── /api/log – receive logs from the iOS app ─────────────────────
    if (req.method === 'OPTIONS' && urlPath === '/api/log') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'Content-Type',
      })
      res.end()
      return
    }

    if (req.method === 'POST' && urlPath === '/api/log') {
      ;(async () => {
      let body = ''
      for await (const chunk of req) {
        body += chunk
        if (body.length > 100_000) { req.destroy(); res.writeHead(413); res.end(); return }
      }
      try {
        const entries = JSON.parse(body) as Array<{
          level?: string
          category?: string
          message?: string
          timestamp?: string
        }>
        for (const entry of Array.isArray(entries) ? entries : [entries]) {
          const level = (entry.level ?? 'INFO').toUpperCase()
          const cat = entry.category ?? ''
          const msg = entry.message ?? ''
          const time = entry.timestamp
            ? new Date(entry.timestamp).toLocaleTimeString('en-US', { hour12: false, fractionalSecondDigits: 3 })
            : new Date().toLocaleTimeString('en-US', { hour12: false, fractionalSecondDigits: 3 })

          const levelColor = level === 'ERROR' ? pc.red(level)
            : level === 'WARN' ? pc.yellow(level)
            : pc.blue(level)
          console.log(`  ${pc.dim(time)} ${levelColor} ${pc.dim(`[${cat}]`)} ${msg}`)
        }
      } catch {
        // Ignore malformed log payloads
      }
      res.writeHead(200, { 'Access-Control-Allow-Origin': '*' })
      res.end('ok')
      })().catch(() => { if (!res.headersSent) { res.writeHead(500); res.end() } })
      return
    }

    // ── /api/call – execute extension methods server-side ────────────
    if (req.method === 'OPTIONS' && urlPath === '/api/call') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'Content-Type',
      })
      res.end()
      return
    }

    if (req.method === 'POST' && urlPath === '/api/call') {
      ;(async () => {
        const MAX_BODY = 1_000_000 // 1 MB
        let body = ''
        for await (const chunk of req) {
          body += chunk
          if (body.length > MAX_BODY) {
            if (!res.headersSent) {
              res.writeHead(413, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ ok: false, error: 'Request body too large' }))
            }
            req.destroy()
            return
          }
        }

        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Access-Control-Allow-Origin', '*')

        const start = Date.now()

        let parsed: Record<string, unknown>
        try {
          parsed = JSON.parse(body)
        } catch {
          res.writeHead(400)
          res.end(JSON.stringify({ ok: false, error: 'Invalid JSON body' }))
          return
        }
        const { sourceId, method, args } = parsed as { sourceId?: string; method?: string; args?: unknown[] }

        if (args && !Array.isArray(args)) {
          res.writeHead(400)
          res.end(JSON.stringify({ ok: false, error: 'args must be an array' }))
          return
        }

        if (!sourceId || !method) {
          res.writeHead(400)
          res.end(JSON.stringify({ ok: false, error: 'Missing sourceId or method' }))
          return
        }

        // Check method allowlist BEFORE evaluating the bundle
        const ALLOWED_METHODS = new Set([
          'searchNovels', 'fetchNovelDetails', 'fetchChapterContent',
          'getDownloadLinks', 'getSourceType',
          'discover', 'getDiscoverSections', 'getDiscoverSectionItems',
          'getSettings', 'getFilters',
        ])
        if (!ALLOWED_METHODS.has(method)) {
          res.writeHead(400)
          res.end(
            JSON.stringify({
              ok: false,
              error: `Method not allowed: ${method}()`,
              duration: Date.now() - start,
            }),
          )
          return
        }

        // Validate sourceId against known sources to prevent path traversal
        const knownIds = new Set(sources.map((s) => s.id))
        if (!knownIds.has(sourceId)) {
          res.writeHead(404)
          res.end(JSON.stringify({ ok: false, error: `Unknown source: ${sourceId}` }))
          return
        }

        // Use dev build (IIFE with shims) for server-side eval
        const bundlePath = join(devDir, `${sourceId}.js`)
        if (!existsSync(bundlePath)) {
          res.writeHead(404)
          res.end(JSON.stringify({ ok: false, error: `Bundle not found: ${sourceId}.js` }))
          return
        }

        // Use cached bundle module if available and up-to-date
        const bundleMtime = statSync(bundlePath).mtimeMs
        let cached = bundleCache.get(sourceId)
        if (!cached || cached.mtime !== bundleMtime) {
          // Wait for any in-progress evaluation of this source to complete
          if (evalLocks.has(sourceId)) await evalLocks.get(sourceId)
          // Re-check cache after waiting — another request may have populated it
          cached = bundleCache.get(sourceId)
          if (!cached || cached.mtime !== bundleMtime) {
            let unlock!: () => void
            evalLocks.set(sourceId, new Promise<void>((r) => { unlock = r }))
            try {
              const bundleCode = readFileSync(bundlePath, 'utf-8')
              // Runs the developer's own compiled bundle in the current Node process
              // with real HTTP via Node fetch.
              // eslint-disable-next-line no-new-func
              const fn = new Function('require', bundleCode + '; return GlyphExtension;')
              const ext = fn(_require) as Record<string, unknown>
              const source = (ext.source ?? ext.default ?? ext) as Record<string, (...a: unknown[]) => unknown>

              cached = { mtime: bundleMtime, module: source }
              bundleCache.set(sourceId, cached)
            } finally {
              evalLocks.delete(sourceId)
              unlock()
            }
          }
        }

        const source = cached.module

        if (typeof source[method] !== 'function') {
          res.writeHead(400)
          res.end(
            JSON.stringify({
              ok: false,
              error: `Method not found: ${method}()`,
              duration: Date.now() - start,
            }),
          )
          return
        }

        const result = await source[method](...(args || []))
        res.writeHead(200)
        res.end(JSON.stringify({ ok: true, result, duration: Date.now() - start }))
      })().catch((err) => {
        const detail = err instanceof Error ? err.message : String(err)
        log.error(`/api/call error: ${detail}`)
        if (!res.headersSent) {
          res.writeHead(500)
          res.end(
            JSON.stringify({
              ok: false,
              error: 'Internal error — check terminal for details',
              duration: 0,
            }),
          )
        }
      })
      return
    }

    // ── /api/image-proxy – proxy images to bypass hotlinking protection ─
    if (req.method === 'GET' && urlPath === '/api/image-proxy') {
      ;(async () => {
        const imageUrl = new URL(req.url ?? '', `http://localhost`).searchParams.get('url')
        if (!imageUrl) {
          res.writeHead(400)
          res.end('Missing url parameter')
          return
        }

        // Validate URL scheme and reject internal/private addresses
        let parsed: URL
        try {
          parsed = new URL(imageUrl)
        } catch {
          res.writeHead(400)
          res.end('Invalid URL')
          return
        }
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          res.writeHead(400)
          res.end('Only http/https URLs are allowed')
          return
        }
        const hostname = parsed.hostname
        if (isPrivateHostname(hostname)) {
          res.writeHead(403)
          res.end('Proxying to internal addresses is not allowed')
          return
        }

        const MAX_IMAGE_SIZE = 10 * 1024 * 1024 // 10 MB

        try {
          const imgResp = await fetch(imageUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
              'Referer': new URL(imageUrl).origin + '/',
            },
            redirect: 'manual',
          })

          // Reject redirects to prevent SSRF bypass
          if (imgResp.status >= 300 && imgResp.status < 400) {
            res.writeHead(403)
            res.end('Redirects are not followed by the image proxy')
            return
          }

          if (!imgResp.ok) {
            res.writeHead(imgResp.status)
            res.end()
            return
          }

          // Early reject if content-length exceeds limit
          const contentLength = parseInt(imgResp.headers.get('content-length') || '', 10)
          if (contentLength > MAX_IMAGE_SIZE) {
            res.writeHead(413)
            res.end('Image too large')
            return
          }

          const rawContentType = imgResp.headers.get('content-type') || 'image/jpeg'
          const contentType = rawContentType.startsWith('image/') ? rawContentType : 'image/jpeg'

          // Stream response with size limit to prevent memory exhaustion
          const reader = imgResp.body?.getReader()
          if (!reader) {
            res.writeHead(502)
            res.end('No response body')
            return
          }
          const chunks: Uint8Array[] = []
          let totalSize = 0
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            totalSize += value.length
            if (totalSize > MAX_IMAGE_SIZE) {
              reader.cancel()
              res.writeHead(413)
              res.end('Image too large')
              return
            }
            chunks.push(value)
          }

          const buffer = Buffer.concat(chunks)
          res.writeHead(200, {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=3600',
            'Access-Control-Allow-Origin': '*',
          })
          res.end(buffer)
        } catch {
          res.writeHead(502)
          res.end('Failed to fetch image')
        }
      })().catch((err) => {
        if (!res.headersSent) {
          res.writeHead(500)
          res.end(err instanceof Error ? err.message : String(err))
        }
      })
      return
    }

    let filePath = urlPath === '/' ? join(root, 'index.html') : safePath

    // Serve static files from sources/<id>/static/ at /static/<id>/
    if (urlPath.startsWith('/static/')) {
      const parts = urlPath.replace('/static/', '').split('/')
      const sourceId = parts[0]
      const fileName = parts.slice(1).join('/')
      filePath = join(sourcesDir, sourceId, 'static', fileName)

      // Re-validate path traversal after reassigning filePath
      if (!resolve(filePath).startsWith(resolve(sourcesDir))) {
        res.writeHead(403)
        res.end('Forbidden')
        return
      }
    }

    // Regenerate index.json on request (picks up meta changes)
    if (urlPath === '/dist/index.json') {
      try { regenerateIndex(req.headers.host) } catch { /* best-effort; serves stale file on failure */ }
    }

    try {
      if (!existsSync(filePath) || !statSync(filePath).isFile()) {
        res.writeHead(404)
        res.end('Not found')
        return
      }
      // Resolve symlinks and re-validate to prevent symlink-based traversal
      const realFilePath = realpathSync(filePath)
      const realRoot = realpathSync(root)
      if (realFilePath !== realRoot && !realFilePath.startsWith(realRoot + sep)) {
        res.writeHead(403)
        res.end('Forbidden')
        return
      }
      const ext = extname(filePath)
      const mime = MIME[ext] || 'application/octet-stream'
      const body = readFileSync(filePath)
      res.writeHead(200, {
        'Content-Type': mime,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      })
      res.end(body)
    } catch (e) {
      log.error(`Static file error: ${e instanceof Error ? e.message : String(e)}`)
      res.writeHead(500)
      res.end('Internal server error')
    }
  })

  // ── Cleanup on SIGINT / SIGTERM ───────────────────────────────────

  let shuttingDown = false
  const shutdown = async () => {
    if (shuttingDown) return
    shuttingDown = true
    console.log('\nShutting down...')
    try {
      for (const ctx of contexts) await ctx.dispose()
    } catch {
      // Best-effort cleanup
    }
    server.closeAllConnections()
    server.close(() => process.exit(0))
  }

  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)

  // ── Handle EADDRINUSE by incrementing port ────────────────────────

  const MAX_PORT_RETRIES = 10
  let portRetries = 0

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      portRetries++
      if (portRetries > MAX_PORT_RETRIES) {
        console.error(`\nFailed to find an available port after ${MAX_PORT_RETRIES} attempts.`)
        process.exit(1)
      }
      port++
      baseUrl = currentBaseUrl()
      console.log(`Port ${port - 1} in use, trying ${port}...`)
      server.listen(port, '0.0.0.0')
    } else {
      console.error(`\nServer error: ${err.message}`)
      shutdown()
    }
  })

  server.listen(port, '0.0.0.0')

  // ── Print styled header on listening ──────────────────────────────

  server.on('listening', () => {
    regenerateIndex()

    const indexUrl = `${baseUrl}/dist/index.json`
    const deepLink = `glyph://add-repo?url=${encodeURIComponent(indexUrl)}`
    const landing = `${baseUrl}/`

    const repoName = repoConfig.name || 'Extensions'
    const repoAuthor = repoConfig.author || ''

    const allIPs = getAllIPs()

    console.log('')
    console.log(`  ${log.bold('Glyph Dev Server')}`)
    console.log(`  ${log.dim(repoName + (repoAuthor ? ' by ' + repoAuthor : ''))}`)
    console.log('')
    console.log(`  ${log.dim('Local')}     ${pc.cyan(`http://localhost:${port}`)}`)
    for (const ip of allIPs) {
      const label = ip.iface.padEnd(9)
      console.log(`  ${log.dim(label)} ${pc.cyan(`http://${ip.address}:${port}`)}`)
    }
    console.log('')
    console.log(`  ${log.dim('Landing')}   ${pc.green(landing)}`)
    console.log(`  ${log.dim('JSON')}      ${pc.green(indexUrl)}`)
    console.log('')
    console.log(`  ${log.dim('Deep link')} ${pc.yellow(deepLink)}`)
    console.log('')
    console.log(`  ${log.dim(`${sources.length} extension(s) watching for changes.`)}`)
    console.log(`  ${log.dim(`Type`)} ${pc.green('h')} ${log.dim('for help,')} ${pc.green('q')} ${log.dim('to quit.')}`)
    console.log('')

    // Open browser if requested
    if (open) {
      const url = `http://localhost:${port}`
      const onError = (err: Error | null) => {
        if (err) log.warn(`Could not open browser: ${err.message}`)
      }
      if (process.platform === 'win32') {
        execFile('cmd', ['/c', 'start', '', url], onError)
      } else {
        execFile(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], onError)
      }
    }

    // ── Interactive prompt ─────────────────────────────────────────────
    const rl = createInterface({ input: process.stdin, output: process.stdout })

    const prompt = () => rl.question(pc.dim('> '), async (input) => {
      const cmd = input.trim().toLowerCase()

      if (cmd === 'h' || cmd === 'help') {
        console.log('')
        console.log(`  ${pc.bold('Commands')}`)
        console.log(`  ${pc.green('h')}, ${pc.green('help')}      Show this message`)
        console.log(`  ${pc.green('r')}, ${pc.green('restart')}   Rebuild all sources and regenerate index`)
        console.log(`  ${pc.green('u')}, ${pc.green('urls')}      Show all network URLs and deep link`)
        console.log(`  ${pc.green('q')}, ${pc.green('quit')}      Stop the server`)
        console.log('')
      } else if (cmd === 'r' || cmd === 'restart') {
        console.log('')
        log.info('Rebuilding all sources...')
        for (const ctx of contexts) {
          try { await ctx.rebuild() } catch (e) {
            log.error(`Rebuild failed: ${e instanceof Error ? e.message : String(e)}`)
          }
        }
        regenerateIndex()
        log.success('Rebuilt and index regenerated.')
        console.log('')
      } else if (cmd === 'u' || cmd === 'urls') {
        const freshIPs = getAllIPs()
        console.log('')
        console.log(`  ${log.dim('Local')}     ${pc.cyan(`http://localhost:${port}`)}`)
        for (const ip of freshIPs) {
          const label = ip.iface.padEnd(9)
          console.log(`  ${log.dim(label)} ${pc.cyan(`http://${ip.address}:${port}`)}`)
        }
        const freshIndex = `http://${freshIPs[0]?.address ?? 'localhost'}:${port}/dist/index.json`
        const freshDeep = `glyph://add-repo?url=${encodeURIComponent(freshIndex)}`
        console.log('')
        console.log(`  ${log.dim('JSON')}      ${pc.green(freshIndex)}`)
        console.log(`  ${log.dim('Deep link')} ${pc.yellow(freshDeep)}`)
        console.log('')
      } else if (cmd === 'q' || cmd === 'quit' || cmd === 's' || cmd === 'stop') {
        rl.close()
        await shutdown()
        return
      } else if (cmd) {
        console.log(`  ${log.dim('Unknown command. Type')} ${pc.green('h')} ${log.dim('for help.')}`)
      }

      prompt()
    })

    prompt()
  })
}
