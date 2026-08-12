import type { Command } from 'commander'
import { join } from 'path'
import { mkdirSync, unlinkSync, readFileSync, statSync } from 'fs'
import { createHash } from 'node:crypto'
import { Listr } from 'listr2'
import { findProjectRoot, discoverSources, readRepoConfig } from '../lib/project.js'
import { buildSource, buildSourceDev, validateBundle, copyStaticAssets, resolveIcon, generateIndex } from '../lib/builder.js'
import { buildRustSource, checkRustPrerequisites, readRustSourceMeta } from '../lib/rust-builder.js'
import { GlyphError, ensureRepoJson, ensureSourcesDir } from '../utils/errors.js'

function sha256File(filePath: string): string {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex')
}

function formatSize(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`
}

export function registerBuildCommand(program: Command) {
  program
    .command('build')
    .description('Build all extensions for production')
    .action(async () => {
      const root = findProjectRoot()
      ensureRepoJson(root)
      ensureSourcesDir(root)

      const repoConfig = readRepoConfig(root)

      if (!repoConfig.url) {
        throw new GlyphError(
          'repo.json is missing a "url" value.',
          'Set "url" in repo.json to your GitHub Pages base URL.\n'
          + '  Example: "https://yourname.github.io/my-extensions"\n'
          + '  This is where your built extensions will be hosted.',
        )
      }

      const sources = discoverSources(root)

      if (sources.length === 0) {
        console.log('No sources found. Nothing to build.')
        return
      }

      // Check Rust prerequisites if any Rust sources exist
      const hasRust = sources.some(s => s.language === 'rust')
      if (hasRust) checkRustPrerequisites()

      const distDir = join(root, 'dist')
      const sourcesDir = join(root, 'sources')
      mkdirSync(distDir, { recursive: true })

      const nodePaths = [join(root, 'node_modules')]
      const buildErrors: { id: string; error: string }[] = []
      const indexSources: any[] = []

      const buildStart = Date.now()

      const tasks = new Listr(
        sources.map((source) => ({
          title: source.id,
          task: async (ctx: any, task: any) => {
            const taskStart = Date.now()

            try {
              if (source.language === 'rust') {
                await buildRustSource({
                  sourceDir: source.dir,
                  sourceId: source.id,
                  distDir,
                })

                const meta = readRustSourceMeta(source.dir)
                copyStaticAssets(source.id, sourcesDir, distDir)
                const icon = resolveIcon(source.id, sourcesDir, repoConfig.url, (meta.icon as string) || '')

                const wasmBundlePath = join(distDir, source.id, 'ext.js')
                const elapsed = Date.now() - taskStart
                const sizeBytes = statSync(wasmBundlePath).size
                task.title = `${source.id} [${elapsed}ms] — ${formatSize(sizeBytes)}`

                const rustCaps = Array.isArray(meta.capabilities)
                  ? (meta.capabilities as unknown[]).filter((c): c is string => typeof c === 'string')
                  : undefined

                indexSources.push({
                  id: meta.id as string,
                  name: meta.name as string,
                  version: (meta.version as string) || '1.0.0',
                  language: (meta.language as string) || 'en',
                  icon,
                  nsfw: (meta.nsfw as boolean) || false,
                  type: 'wasm' as const,
                  dev: (meta.dev as string) || undefined,
                  bundleUrl: `${repoConfig.url}/dist/${source.id}/ext.js`,
                  sha256: sha256File(wasmBundlePath),
                  ...(meta.requiresLogin ? { requiresLogin: true } : {}),
                  ...(meta.loginUrl ? { loginUrl: meta.loginUrl as string } : {}),
                  ...(meta.sourceType ? { sourceType: meta.sourceType as string } : {}),
                  ...(rustCaps && rustCaps.length > 0 ? { capabilities: rustCaps } : {}),
                })
              } else {
                // JS: production ESM build
                const outfile = join(distDir, `${source.id}.js`)
                const { sizeBytes } = await buildSource({ entryPoint: source.entryPoint, outfile, minify: true, nodePaths, absWorkingDir: root })

                // Dev build for validation (IIFE with shims)
                const devOutfile = join(distDir, `.${source.id}.dev.js`)
                await buildSourceDev({ entryPoint: source.entryPoint, outfile: devOutfile, nodePaths, absWorkingDir: root })

                // Validate using dev build
                const result = validateBundle(source.id, devOutfile)
                // Clean up dev build
                try { unlinkSync(devOutfile) } catch {}

                if (!result.passed) {
                  const errMsg = result.errors.map(e => `${e.field}: ${e.message}`).join(', ')
                  buildErrors.push({ id: source.id, error: 'validation failed' })
                  throw new Error(`validation failed — ${errMsg}`)
                }

                const info = result.info as Record<string, any>
                if (info.id !== source.id) {
                  buildErrors.push({ id: source.id, error: 'info.id mismatch' })
                  throw new Error(`info.id "${info.id}" does not match directory name "${source.id}"`)
                }

                copyStaticAssets(source.id, sourcesDir, distDir)
                const icon = resolveIcon(source.id, sourcesDir, repoConfig.url, info.icon || '')

                const elapsed = Date.now() - taskStart
                task.title = `${source.id} [${elapsed}ms] — ${formatSize(sizeBytes)}`

                indexSources.push({
                  id: info.id,
                  name: info.name,
                  version: info.version,
                  language: info.language,
                  icon,
                  nsfw: info.nsfw || false,
                  type: 'js' as const,
                  dev: info.dev || undefined,
                  bundleUrl: `${repoConfig.url}/dist/${source.id}.js`,
                  sha256: sha256File(outfile),
                  ...(info.requiresLogin ? { requiresLogin: true } : {}),
                  ...(info.loginUrl ? { loginUrl: info.loginUrl } : {}),
                  ...(info.sourceType ? { sourceType: info.sourceType } : {}),
                  ...(result.capabilities.length > 0 ? { capabilities: result.capabilities } : {}),
                })
              }
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err)
              const elapsed = Date.now() - taskStart
              task.title = `${source.id} [${elapsed}ms]`
              if (!buildErrors.find(e => e.id === source.id)) {
                buildErrors.push({ id: source.id, error: msg })
              }
              throw err
            }
          },
        })),
        {
          renderer: 'default',
          concurrent: false,
          exitOnError: false,
        },
      )

      await tasks.run()

      if (buildErrors.length > 0) {
        throw new GlyphError(
          `${buildErrors.length} source(s) failed to build.`,
          'Fix the errors above and rebuild.',
        )
      }

      generateIndex({ distDir, repoConfig, sources: indexSources })

      const totalElapsed = Date.now() - buildStart
      console.log(`\n  Generated dist/index.json (${indexSources.length} sources)\n`)
      console.log(`  Build completed in ${totalElapsed}ms`)
    })
}
