import { spawnSync } from 'child_process'
import { existsSync, readFileSync, writeFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { createRequire } from 'module'
import { GlyphError } from '../utils/errors.js'
import type { ValidationError, ValidationResult } from './builder.js'
import { writeVitestConfig } from './vitest-config.js'

const _require = createRequire(import.meta.url)
const NPX_CMD = process.platform === 'win32' ? 'npx.cmd' : 'npx'

/** Run `tsc --noEmit` on the project. Returns { passed, output }. */
export function validateTypecheck(root: string): { passed: boolean; output: string } {
  // Check if typescript is installed
  const check = spawnSync(NPX_CMD, ['tsc', '--version'], { cwd: root, stdio: 'pipe' })
  if (check.status !== 0) {
    throw new GlyphError(
      'typescript is required for --typecheck.',
      'Run "npm install -D typescript".',
    )
  }

  const result = spawnSync(NPX_CMD, ['tsc', '--noEmit'], {
    cwd: root,
    encoding: 'utf-8',
    stdio: 'pipe',
  })

  return {
    passed: result.status === 0,
    output: (result.stdout || '') + (result.stderr || ''),
  }
}

/** Run vitest with the CLI's test setup. Uses a temp config like `glyph test` does. */
export function validateTests(
  root: string,
  setupFilePath: string,
): { passed: boolean; output: string } {
  const testRuntimePath = join(root, 'node_modules', '@glyphmoe', 'sdk', 'dist', 'test-runtime.js')
    .split('\\').join('/')

  if (!existsSync(testRuntimePath)) {
    return { passed: false, output: '@glyphmoe/sdk is not installed or missing test-runtime. Run "npm install @glyphmoe/sdk".' }
  }

  const tempConfigPath = writeVitestConfig({
    root,
    setupFilePath,
    testRuntimePath,
    configName: 'validate-vitest.config.ts',
    setupName: 'validate-test-setup.js',
  })

  const result = spawnSync(NPX_CMD, ['vitest', 'run', '--config', tempConfigPath], {
    cwd: root,
    encoding: 'utf-8',
    stdio: 'pipe',
  })

  return {
    passed: result.status === 0,
    output: (result.stdout || '') + (result.stderr || ''),
  }
}

export interface AutoFixResult {
  applied: string[]
  failed: string[]
}

/** Auto-fix fixable validation errors by editing main.ts. */
export function autoFix(
  sourceId: string,
  sourcesDir: string,
  errors: ValidationError[],
): AutoFixResult {
  const fixable = errors.filter((e) => e.fixable)
  if (fixable.length === 0) return { applied: [], failed: [] }

  // Support both main.ts and index.ts entry points
  let mainPath = join(sourcesDir, sourceId, 'src', 'main.ts')
  if (!existsSync(mainPath)) {
    mainPath = join(sourcesDir, sourceId, 'src', 'index.ts')
  }
  if (!existsSync(mainPath)) {
    return { applied: [], failed: fixable.map((e) => `Could not auto-fix ${e.field} — entry file not found`) }
  }

  const originalContent = readFileSync(mainPath, 'utf-8')
  let content = originalContent
  const applied: string[] = []
  const failed: string[] = []

  for (const err of fixable) {
    if (err.field === 'info.icon' && !content.includes('icon:')) {
      // Match baseUrl line with or without trailing comma
      const updated = content.replace(
        /(baseUrl:\s*[^\n]+?)(?:,\s*\n|\n)/,
        `$1,\n  icon: \`\${BASE}/favicon.ico\`,\n`,
      )
      if (updated !== content) {
        content = updated
        applied.push('Added icon: `${BASE}/favicon.ico`')
      } else {
        failed.push('Could not auto-fix info.icon — add it manually')
      }
    }
    if (err.field === 'info.version' && !content.includes('version:')) {
      // Match id line with or without trailing comma, single/double/backtick quotes
      const updated = content.replace(
        /(id:\s*['"`][^'"`]+['"`])(?:,\s*\n|\n)/,
        `$1,\n  version: '1.0.0',\n`,
      )
      if (updated !== content) {
        content = updated
        applied.push("Added version: '1.0.0'")
      } else {
        failed.push("Could not auto-fix info.version — add it manually")
      }
    }
    if (err.field === 'info.language' && !content.includes('language:')) {
      // Match baseUrl line with or without trailing comma
      const updated = content.replace(
        /(baseUrl:\s*[^\n]+?)(?:,\s*\n|\n)/,
        `$1,\n  language: 'en',\n`,
      )
      if (updated !== content) {
        content = updated
        applied.push("Added language: 'en'")
      } else {
        failed.push("Could not auto-fix info.language — add it manually")
      }
    }
  }

  // Only write if content actually changed
  if (content !== originalContent) {
    writeFileSync(mainPath, content)
  }

  return { applied, failed }
}

/** Scan source .ts files for console.log statements. Returns warnings per source. */
export function detectConsoleLogs(
  sourceId: string,
  sourcesDir: string,
): { file: string; line: number; text: string }[] {
  const srcDir = join(sourcesDir, sourceId, 'src')
  const hits: { file: string; line: number; text: string }[] = []

  let files: string[]
  try {
    files = readdirSync(srcDir, { recursive: true })
      .filter((f): f is string => typeof f === 'string' && f.endsWith('.ts') && !f.endsWith('.test.ts'))
  } catch {
    return hits
  }

  for (const file of files) {
    const content = readFileSync(join(srcDir, file), 'utf-8')
    const lines = content.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (/console\.(log|debug|info)\s*\(/.test(line) && !line.trimStart().startsWith('//')) {
        hits.push({ file, line: i + 1, text: line.trim() })
      }
    }
  }

  return hits
}

/** Smoke test: actually call searchNovels("test", 1) with real HTTP and check it returns results. */
export async function smokeTest(
  sourceId: string,
  distDir: string,
): Promise<{ passed: boolean; error?: string; itemCount?: number; duration: number }> {
  const TIMEOUT_MS = 30_000
  const bundlePath = join(distDir, `${sourceId}.js`)
  const bundleCode = readFileSync(bundlePath, 'utf-8')

  const start = Date.now()
  try {
    // Runs the developer's own compiled bundle in the current Node process.
    // This has full access to Node APIs — acceptable for a local dev tool.
    // eslint-disable-next-line no-new-func
    const fn = new Function('require', bundleCode + '; return GlyphExtension;')
    const ext = fn(_require) as Record<string, unknown>
    const source = (ext.source ?? ext.default ?? ext) as Record<string, unknown>

    let timeoutId: ReturnType<typeof setTimeout>
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('Smoke test timed out after 30s')), TIMEOUT_MS)
    })
    timeout.catch(() => {}) // prevent unhandled rejection if timeout fires after success

    if (typeof source.searchNovels !== 'function') {
      clearTimeout(timeoutId!)
      return { passed: false, error: 'searchNovels is not a function', duration: Date.now() - start }
    }

    const result = await Promise.race([
      (source.searchNovels as (q: string, p: number, f: unknown[]) => Promise<Record<string, unknown>>)('test', 1, []),
      timeout,
    ])
    clearTimeout(timeoutId!)

    const items = result?.items as unknown[] | undefined
    const duration = Date.now() - start

    if (!items || !Array.isArray(items)) {
      return { passed: false, error: 'searchNovels did not return an items array', duration }
    }

    return { passed: true, itemCount: items.length, duration }
  } catch (err) {
    clearTimeout(timeoutId!)
    return {
      passed: false,
      error: err instanceof Error ? err.message : String(err),
      duration: Date.now() - start,
    }
  }
}

/** Structured CI output data (keeps source results separate from typecheck/tests/smoke). */
export interface CiOutputData {
  results: ValidationResult[]
  typecheck?: { passed: boolean }
  tests?: { passed: boolean }
  smoke?: { sourceId: string; passed: boolean; error?: string; itemCount?: number; duration: number }[]
  warnings?: { sourceId: string; consoleLogs: number }[]
}

/** Format validation results as JSON for --ci output. */
export function formatCiOutput(data: CiOutputData): string {
  const allPassed = data.results.every((r) => r.passed)
    && (!data.typecheck || data.typecheck.passed)
    && (!data.tests || data.tests.passed)
    && (!data.smoke || data.smoke.every((s) => s.passed))

  const output: Record<string, unknown> = {
    passed: allPassed,
    sources: data.results.map((r) => ({
      id: r.sourceId,
      passed: r.passed,
      errors: r.errors.map((e) => ({
        field: e.field,
        message: e.message,
        fixable: e.fixable,
      })),
    })),
  }

  if (data.typecheck) output.typecheck = { passed: data.typecheck.passed }
  if (data.tests) output.tests = { passed: data.tests.passed }
  if (data.smoke) output.smoke = data.smoke
  if (data.warnings) output.warnings = data.warnings

  return JSON.stringify(output, null, 2)
}
