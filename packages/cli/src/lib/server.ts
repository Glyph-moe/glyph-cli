import http from 'http'
import { execFile } from 'child_process'
import { existsSync, readFileSync, writeFile, mkdirSync, statSync, realpathSync } from 'fs'
import { join, resolve, extname, sep } from 'path'
import type { BuildContext } from 'esbuild'
import pc from 'picocolors'
import { readRepoConfig, discoverSources, type SourceEntry } from './project.js'
import { createWatchContext, ICON_EXTENSIONS } from './builder.js'
import { RUNTIME_SHIM, PLAYGROUND_RUNTIME } from './runtime-shim.js'
import { getLanIP } from '../utils/net.js'
import * as log from '../utils/log.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DevServerOpts {
  root: string
  port: number
  open: boolean
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

  // Cache evaluated bundle modules to avoid re-evaluating on every /api/call
  const bundleCache = new Map<string, { mtime: number; module: Record<string, (...a: unknown[]) => unknown> }>()
  // Serialize bundle evaluation per source to prevent globalThis.GlyphExtension collisions
  const evalLocks = new Map<string, Promise<void>>()

  // ── Build all extensions (watch mode) ─────────────────────────────

  const contexts: BuildContext[] = []

  for (const source of sources) {
    const outfile = join(distDir, `${source.id}.js`)
    const ctx = await createWatchContext({
      entryPoint: source.entryPoint,
      outfile,
      absWorkingDir: root,
      nodePaths,
    })
    await ctx.watch()
    contexts.push(ctx)
    watchedIds.add(source.id)
    console.log(`  watching ${source.id}`)
  }

  // ── Mutable base URL (changes if port increments) ─────────────────

  const lanIP = getLanIP()
  let baseUrl = `http://${lanIP}:${port}`

  // ── Generate index.json with local dev URLs ───────────────────────

  // Track bundle mtimes to avoid re-generating index.json on every request
  const lastIndexMtimes = new Map<string, number>()

  function regenerateIndex() {
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
    for (const source of latestSources) {
      if (!watchedIds.has(source.id)) {
        sources.push(source)
        watchedIds.add(source.id)
        createWatchContext({
          entryPoint: source.entryPoint,
          outfile: join(distDir, `${source.id}.js`),
          absWorkingDir: root,
          nodePaths,
        }).then(async (ctx) => {
          await ctx.watch()
          contexts.push(ctx)
          console.log(`  ${pc.green('+')} watching ${source.id}`)
        }).catch((err) => {
          log.warn(`Failed to watch new source: ${err instanceof Error ? err.message : String(err)}`)
        })
      }
    }

    const indexSources = []

    for (const source of sources) {
      const outfile = join(distDir, `${source.id}.js`)
      if (!existsSync(outfile)) continue

      try {
        const bundleCode = readFileSync(outfile, 'utf-8')
        // Runs the developer's own compiled bundle in the current Node process.
        // eslint-disable-next-line no-new-func
        const fn = new Function(RUNTIME_SHIM + bundleCode + '; return GlyphExtension;')
        const ext = fn() as Record<string, unknown>
        const src = (ext.default ?? ext) as Record<string, unknown>
        const info = src.info as Record<string, unknown> | undefined
        if (!info?.id) continue

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

        const bundlePath = join(distDir, `${sourceId}.js`)
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
              const fn = new Function(PLAYGROUND_RUNTIME + bundleCode + '; return GlyphExtension;')
              const ext = fn() as Record<string, unknown>
              const source = (ext.default ?? ext) as Record<string, (...a: unknown[]) => unknown>

              if (typeof source.initialise === 'function') {
                await source.initialise()
              }

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
      try { regenerateIndex() } catch { /* best-effort; serves stale file on failure */ }
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
      baseUrl = `http://${lanIP}:${port}`
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

    console.log('')
    console.log(`  ${log.bold('Glyph Dev Server')}`)
    console.log(`  ${log.dim(repoName + (repoAuthor ? ' by ' + repoAuthor : ''))}`)
    console.log('')
    console.log(`  ${log.dim('Local')}     ${pc.cyan(`http://localhost:${port}`)}`)
    console.log(`  ${log.dim('Network')}   ${pc.cyan(baseUrl)}`)
    console.log('')
    console.log(`  ${log.dim('Landing')}   ${pc.green(landing)}`)
    console.log(`  ${log.dim('JSON')}      ${pc.green(indexUrl)}`)
    console.log('')
    console.log(`  ${log.dim('Deep link')} ${pc.yellow(deepLink)}`)
    console.log('')
    console.log(`  ${log.dim(`${sources.length} extension(s) watching for changes. Ctrl+C to stop.`)}`)
    console.log(`  ${log.dim('Warning: Dev server is accessible on your local network.')}`)
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
  })
}
