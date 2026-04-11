import { build, context, type BuildContext } from 'esbuild'
import { createRequire } from 'module'
import { readFileSync, writeFileSync, mkdirSync, existsSync, cpSync, readdirSync } from 'fs'
import { join } from 'path'
import { RUNTIME_SHIM } from './runtime-shim.js'

const _require = createRequire(import.meta.url)

// ---------------------------------------------------------------------------
// Stdlib polyfills — resolved at runtime from node-stdlib-browser
// ---------------------------------------------------------------------------

function getStdlibPaths() {
  const stdLibBrowser = _require('node-stdlib-browser')
  const plugin = _require('node-stdlib-browser/helpers/esbuild/plugin')
  const shimPath = _require.resolve('node-stdlib-browser/helpers/esbuild/shim')
  return { stdLibBrowser, plugin, shimPath }
}

// ---------------------------------------------------------------------------
// Shared esbuild options
// ---------------------------------------------------------------------------

interface BaseEsbuildOpts {
  nodePaths?: string[]
  absWorkingDir?: string
}

function baseEsbuildOptions(entryPoint: string, outfile: string, minify: boolean, opts?: BaseEsbuildOpts) {
  const { stdLibBrowser, plugin, shimPath } = getStdlibPaths()

  return {
    entryPoints: [entryPoint],
    bundle: true,
    outfile,
    format: 'iife' as const,
    globalName: 'GlyphExtension',
    mainFields: ['browser', 'module', 'main'],
    minify,
    external: ['fs'],
    inject: [shimPath],
    define: {
      Buffer: 'Buffer',
      process: 'process',
      global: 'global',
    },
    plugins: [plugin(stdLibBrowser)],
    nodePaths: opts?.nodePaths ?? [],
    absWorkingDir: opts?.absWorkingDir,
    footer: {
      js: `if (typeof globalThis !== 'undefined') { globalThis.GlyphExtension = GlyphExtension; }`,
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

export async function buildSource(opts: BuildSourceOpts): Promise<void> {
  await build(baseEsbuildOptions(opts.entryPoint, opts.outfile, opts.minify, {
    nodePaths: opts.nodePaths,
    absWorkingDir: opts.absWorkingDir,
  }))
}

// ---------------------------------------------------------------------------
// createWatchContext — long-running context for dev mode
// ---------------------------------------------------------------------------

export interface WatchContextOpts {
  entryPoint: string
  outfile: string
  nodePaths?: string[]
  absWorkingDir?: string
}

export async function createWatchContext(opts: WatchContextOpts): Promise<BuildContext> {
  return context({
    ...baseEsbuildOptions(opts.entryPoint, opts.outfile, false, {
      nodePaths: opts.nodePaths,
      absWorkingDir: opts.absWorkingDir,
    }),
    logLevel: 'info',
  })
}

// ---------------------------------------------------------------------------
// validateBundle — execute bundle in mock runtime and check exports
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
}

const REQUIRED_INFO_FIELDS = ['id', 'name', 'version', 'baseUrl', 'icon', 'language'] as const
const FIXABLE_INFO_FIELDS = new Set<string>(['icon', 'version', 'language'])
const REQUIRED_METHODS = ['searchNovels', 'fetchNovelDetails', 'fetchChapterContent'] as const

export function validateBundle(sourceId: string, bundlePath: string): ValidationResult {
  const errors: ValidationError[] = []

  const bundleCode = readFileSync(bundlePath, 'utf-8')

  let ext: Record<string, unknown>
  try {
    // Runs the developer's own compiled bundle in the current Node process.
    // This has full access to Node APIs — acceptable for a local dev tool.
    // eslint-disable-next-line no-new-func
    const fn = new Function(RUNTIME_SHIM + bundleCode + '; return GlyphExtension;')
    ext = fn() as Record<string, unknown>
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return {
      sourceId,
      passed: false,
      errors: [{ field: 'bundle', message: `bundle execution failed — ${msg}`, fixable: false }],
    }
  }

  const source = (ext.default ?? ext) as Record<string, unknown>
  const info = source.info as Record<string, unknown> | undefined

  if (!info) {
    errors.push({ field: 'info', message: 'missing info object', fixable: false })
  } else {
    for (const field of REQUIRED_INFO_FIELDS) {
      if (info[field] == null || (typeof info[field] === 'string' && info[field].trim() === '')) {
        errors.push({
          field: `info.${field}`,
          message: `info.${field} is missing`,
          fixable: FIXABLE_INFO_FIELDS.has(field),
        })
      } else if (typeof info[field] !== 'string') {
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

  return {
    sourceId,
    passed: errors.length === 0,
    errors,
    info: info as Record<string, unknown> | undefined,
  }
}

// ---------------------------------------------------------------------------
// copyStaticAssets — copy sources/<id>/static/ -> dist/<id>/
// ---------------------------------------------------------------------------

export function copyStaticAssets(sourceId: string, sourcesDir: string, distDir: string): void {
  const staticDir = join(sourcesDir, sourceId, 'static')
  if (!existsSync(staticDir)) return

  const destDir = join(distDir, sourceId)
  mkdirSync(destDir, { recursive: true })
  cpSync(staticDir, destDir, { recursive: true })
}

// ---------------------------------------------------------------------------
// resolveIcon — prefer local icon file, fall back to info.icon
// ---------------------------------------------------------------------------

export const ICON_EXTENSIONS = ['png', 'jpg', 'jpeg', 'svg', 'webp'] as const

export function resolveIcon(
  sourceId: string,
  sourcesDir: string,
  baseUrl: string,
  fallbackIcon: string,
): string {
  for (const ext of ICON_EXTENSIONS) {
    const iconPath = join(sourcesDir, sourceId, 'static', `icon.${ext}`)
    if (existsSync(iconPath)) {
      return `${baseUrl}/dist/${sourceId}/icon.${ext}`
    }
  }
  return fallbackIcon
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
  dev?: string
  bundleUrl: string
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
    repository: opts.repoConfig.url,
    sources: opts.sources,
  }

  writeFileSync(join(opts.distDir, 'index.json'), JSON.stringify(index, null, 2) + '\n')
}
