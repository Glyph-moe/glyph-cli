import { build, context, type BuildContext } from 'esbuild'
import { readFileSync, writeFileSync, mkdirSync, existsSync, cpSync, statSync } from 'fs'
import { execSync } from 'child_process'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'

const _require = createRequire(import.meta.url)

// esbuild plugin — redirects glyph:extension/* imports to local shim files (dev)
function witShimPlugin() {
  const thisDir = typeof __dirname !== 'undefined'
    ? __dirname
    : dirname(fileURLToPath(import.meta.url))
  const pkgRoot = join(thisDir, '..')
  const shimDir = join(pkgRoot, 'src', 'lib', 'shims')
  const mapping: Record<string, string> = {
    'glyph:extension/http@0.1.0': join(shimDir, 'http.ts'),
    'glyph:extension/html@0.1.0': join(shimDir, 'html.ts'),
    'glyph:extension/host@0.1.0': join(shimDir, 'host.ts'),
  }
  return {
    name: 'wit-shim',
    setup(build: any) {
      build.onResolve({ filter: /^glyph:extension\// }, (args: any) => {
        const shimPath = mapping[args.path]
        if (shimPath) return { path: shimPath }
        return null
      })
    },
  }
}

// esbuild plugin for production IIFE — resolves glyph:extension/* to window.__wit.* globals
function witBridgePlugin() {
  const WIT_TO_GLOBAL: Record<string, string> = {
    'glyph:extension/http@0.1.0': 'window.__wit.http',
    'glyph:extension/html@0.1.0': 'window.__wit.html',
    'glyph:extension/host@0.1.0': 'window.__wit.host',
  }
  return {
    name: 'wit-bridge',
    setup(build: any) {
      build.onResolve({ filter: /^glyph:extension\// }, (args: any) => {
        if (WIT_TO_GLOBAL[args.path]) {
          return { path: args.path, namespace: 'wit-bridge' }
        }
        return null
      })
      build.onLoad({ filter: /.*/, namespace: 'wit-bridge' }, (args: any) => {
        const global = WIT_TO_GLOBAL[args.path]
        return {
          contents: `module.exports = ${global};`,
          loader: 'js',
        }
      })
    },
  }
}

// ---------------------------------------------------------------------------
// Production esbuild options — IIFE with WIT imports resolved to window.__wit.*
// ---------------------------------------------------------------------------

interface BaseEsbuildOpts {
  nodePaths?: string[]
  absWorkingDir?: string
}

function productionEsbuildOptions(entryPoint: string, outfile: string, minify: boolean, opts?: BaseEsbuildOpts) {
  return {
    entryPoints: [entryPoint],
    bundle: true,
    outfile,
    format: 'iife' as const,
    globalName: 'GlyphExtension',
    minify,
    plugins: [witBridgePlugin()],
    nodePaths: opts?.nodePaths ?? [],
    absWorkingDir: opts?.absWorkingDir,
    footer: {
      js: 'if (typeof globalThis !== "undefined") { globalThis.GlyphExtension = GlyphExtension; globalThis.source = GlyphExtension.source; }',
    },
  }
}

// ---------------------------------------------------------------------------
// Dev/validate esbuild options — IIFE with WIT imports aliased to shims
// ---------------------------------------------------------------------------

function devEsbuildOptions(entryPoint: string, outfile: string, opts?: BaseEsbuildOpts) {
  return {
    entryPoints: [entryPoint],
    bundle: true,
    outfile,
    format: 'iife' as const,
    globalName: 'GlyphExtension',
    platform: 'node' as const,
    minify: false,
    plugins: [witShimPlugin()],
    nodePaths: opts?.nodePaths ?? [],
    absWorkingDir: opts?.absWorkingDir,
    footer: {
      js: 'if (typeof globalThis !== "undefined") { globalThis.GlyphExtension = GlyphExtension; globalThis.source = GlyphExtension.source; }',
    },
  }
}

// ---------------------------------------------------------------------------
// buildSource — one-shot production build
// ---------------------------------------------------------------------------

export interface BuildSourceOpts {
  entryPoint: string
  outfile: string
  minify: boolean
  nodePaths?: string[]
  absWorkingDir?: string
}

export async function buildSource(opts: BuildSourceOpts): Promise<{ sizeBytes: number }> {
  const result = await build({
    ...productionEsbuildOptions(opts.entryPoint, opts.outfile, opts.minify, {
      nodePaths: opts.nodePaths,
      absWorkingDir: opts.absWorkingDir,
    }),
    metafile: true,
  })
  if (result.metafile) {
    const metafilePath = opts.outfile.replace(/\.js$/, '.metafile.json')
    writeFileSync(metafilePath, JSON.stringify(result.metafile, null, 2))
  }
  const sizeBytes = statSync(opts.outfile).size
  return { sizeBytes }
}

// ---------------------------------------------------------------------------
// buildSourceDev — dev/validate build with shims inlined
// ---------------------------------------------------------------------------

export interface BuildSourceDevOpts {
  entryPoint: string
  outfile: string
  nodePaths?: string[]
  absWorkingDir?: string
}

export async function buildSourceDev(opts: BuildSourceDevOpts): Promise<void> {
  await build(devEsbuildOptions(opts.entryPoint, opts.outfile, {
    nodePaths: opts.nodePaths,
    absWorkingDir: opts.absWorkingDir,
  }))
}

// ---------------------------------------------------------------------------
// createWatchContext — long-running context for dev mode (uses dev config)
// ---------------------------------------------------------------------------

export interface WatchContextOpts {
  entryPoint: string
  outfile: string
  nodePaths?: string[]
  absWorkingDir?: string
}

/** Watch context for dev/eval builds (IIFE with shims inlined, for server-side eval). */
export async function createWatchContext(opts: WatchContextOpts): Promise<BuildContext> {
  return context({
    ...devEsbuildOptions(opts.entryPoint, opts.outfile, {
      nodePaths: opts.nodePaths,
      absWorkingDir: opts.absWorkingDir,
    }),
    logLevel: 'silent',
  })
}

/** Watch context for production builds (IIFE with WIT → window.__wit.*, served to app). */
export async function createProdWatchContext(opts: WatchContextOpts): Promise<BuildContext> {
  return context({
    ...productionEsbuildOptions(opts.entryPoint, opts.outfile, false, {
      nodePaths: opts.nodePaths,
      absWorkingDir: opts.absWorkingDir,
    }),
    logLevel: 'info',
  })
}

// ---------------------------------------------------------------------------
// validateBundle — execute dev bundle and check exports
// ---------------------------------------------------------------------------

export interface ValidationError {
  field: string
  message: string
  fixable: boolean
}

export interface ValidationResult {
  sourceId: string
  passed: boolean
  errors: ValidationError[]
  info?: Record<string, unknown>
  capabilities: string[]
}

const REQUIRED_INFO_FIELDS = ['id', 'name', 'version', 'baseUrl', 'icon', 'language'] as const
const FIXABLE_INFO_FIELDS = new Set<string>(['icon', 'version', 'language'])
const REQUIRED_METHODS = ['searchNovels', 'fetchNovelDetails'] as const

export function validateBundle(sourceId: string, bundlePath: string): ValidationResult {
  const errors: ValidationError[] = []
  const bundleCode = readFileSync(bundlePath, 'utf-8')

  let ext: Record<string, unknown>
  try {
    // Dev builds are IIFE with shims inlined — safe to eval in Node.
    // Pass require so bundled CJS deps (cheerio → buffer etc.) can resolve.
    // eslint-disable-next-line no-new-func
    const fn = new Function('require', bundleCode + '; return GlyphExtension;')
    ext = fn(_require) as Record<string, unknown>
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return {
      sourceId,
      passed: false,
      errors: [{ field: 'bundle', message: `bundle execution failed — ${msg}`, fixable: false }],
      capabilities: [],
    }
  }

  // New export shape: GlyphExtension.source (via createSource)
  const source = (ext.source ?? ext.default ?? ext) as Record<string, unknown>

  // Extract metadata: new SDK uses non-enumerable __info, old SDK uses source.info
  const info = (
    Object.getOwnPropertyDescriptor(source, '__info')?.value
    ?? source.info
  ) as Record<string, unknown> | undefined

  if (!info) {
    errors.push({ field: 'info', message: 'missing info object (createSource metadata)', fixable: false })
  } else {
    for (const field of REQUIRED_INFO_FIELDS) {
      if (info[field] == null || (typeof info[field] === 'string' && (info[field] as string).trim() === '')) {
        errors.push({
          field: `info.${field}`,
          message: `info.${field} is missing`,
          fixable: FIXABLE_INFO_FIELDS.has(field),
        })
      } else if (typeof info[field] !== 'string' && typeof info[field] !== 'boolean') {
        errors.push({
          field: `info.${field}`,
          message: `info.${field} must be a string, got ${typeof info[field]}`,
          fixable: false,
        })
      }
    }
  }

  for (const method of REQUIRED_METHODS) {
    if (typeof source[method] !== 'function') {
      errors.push({
        field: method,
        message: `missing required method: ${method}()`,
        fixable: false,
      })
    }
  }

  // Validate sourceType-specific methods
  const sourceType = info?.sourceType as string | undefined
  if (sourceType === 'reader') {
    if (typeof source.fetchChapterContent !== 'function') {
      errors.push({
        field: 'fetchChapterContent',
        message: 'reader sources must export fetchChapterContent()',
        fixable: false,
      })
    }
  } else if (sourceType === 'download') {
    if (typeof source.getDownloadLinks !== 'function') {
      errors.push({
        field: 'getDownloadLinks',
        message: 'download sources must export getDownloadLinks()',
        fixable: false,
      })
    }
  } else if (sourceType) {
    errors.push({
      field: 'info.sourceType',
      message: `invalid sourceType "${sourceType}" — must be "reader" or "download"`,
      fixable: false,
    })
  }

  const rawCaps = Object.getOwnPropertyDescriptor(source, '__capabilities')?.value
  const capabilities = Array.isArray(rawCaps) ? rawCaps.filter((c): c is string => typeof c === 'string') : []

  return {
    sourceId,
    passed: errors.length === 0,
    errors,
    info: info as Record<string, unknown> | undefined,
    capabilities,
  }
}

// ---------------------------------------------------------------------------
// copyStaticAssets
// ---------------------------------------------------------------------------

export function copyStaticAssets(sourceId: string, sourcesDir: string, distDir: string): void {
  const staticDir = join(sourcesDir, sourceId, 'static')
  if (!existsSync(staticDir)) return
  const destDir = join(distDir, sourceId)
  mkdirSync(destDir, { recursive: true })
  cpSync(staticDir, destDir, { recursive: true })
}

// ---------------------------------------------------------------------------
// resolveIcon
// ---------------------------------------------------------------------------

export const ICON_EXTENSIONS = ['png', 'jpg', 'jpeg', 'svg', 'webp'] as const

// Build a production asset URL for a source. `file` is the path relative to the
// dist/ directory (e.g. `<id>.js` for JS bundles, `<id>/ext.js` for wasm, and
// `<id>/icon.png` for icons). When a base URL is set, emits an absolute URL;
// otherwise emits a path RELATIVE to the index.json location (e.g. `<id>.js`),
// which the app resolves against the index URL. Index-relative (not root-relative)
// is critical: it preserves any path prefix the site is hosted under (e.g. the
// `/<repo>/` segment of a GitHub Pages project page), whereas a root-relative
// `/dist/<id>.js` would drop that prefix and 404.
export function buildAssetUrl(baseUrl: string, file: string): string {
  return baseUrl ? `${baseUrl}/dist/${file}` : file
}

export function resolveIcon(sourceId: string, sourcesDir: string, baseUrl: string, fallbackIcon: string): string {
  for (const ext of ICON_EXTENSIONS) {
    const iconPath = join(sourcesDir, sourceId, 'static', `icon.${ext}`)
    if (existsSync(iconPath)) {
      return buildAssetUrl(baseUrl, `${sourceId}/icon.${ext}`)
    }
  }
  return fallbackIcon
}

// Derive the non-empty `repository` value for the index.
// Prefers repoConfig.url, then derives from the git origin remote (parsed to a
// GitHub Pages URL), and finally falls back to the repo name.
export function resolveRepository(repoConfig: { name: string; url: string }): string {
  if (repoConfig.url) return repoConfig.url
  try {
    const remote = execSync('git config --get remote.origin.url', { encoding: 'utf-8' }).trim()
    if (remote) {
      // Handles both https://github.com/owner/repo and git@github.com:owner/repo
      const match = remote.match(/github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?$/)
      if (match) return `https://${match[1]}.github.io/${match[2]}`
      return remote
    }
  } catch {
    // no git remote available
  }
  return repoConfig.name
}

// ---------------------------------------------------------------------------
// generateIndex — write dist/index.json
// ---------------------------------------------------------------------------

export interface IndexSource {
  id: string
  name: string
  version: string
  language: string
  icon: string
  nsfw: boolean
  type: 'js' | 'wasm'
  dev?: string
  bundleUrl: string
  sha256: string
  requiresLogin?: boolean
  loginUrl?: string
  sourceType?: string
  capabilities?: string[]
}

export interface GenerateIndexOpts {
  distDir: string
  repoConfig: { name: string; author: string; description: string; website: string; url: string }
  sources: IndexSource[]
}

export function generateIndex(opts: GenerateIndexOpts): void {
  mkdirSync(opts.distDir, { recursive: true })
  const index = {
    name: opts.repoConfig.name,
    author: opts.repoConfig.author,
    description: opts.repoConfig.description,
    website: opts.repoConfig.website,
    repository: resolveRepository(opts.repoConfig),
    sources: opts.sources,
  }
  writeFileSync(join(opts.distDir, 'index.json'), JSON.stringify(index, null, 2) + '\n')
}
