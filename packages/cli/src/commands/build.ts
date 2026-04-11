import type { Command } from 'commander'
import { join } from 'path'
import { mkdirSync } from 'fs'
import { findProjectRoot, discoverSources, readRepoConfig } from '../lib/project.js'
import { buildSource, validateBundle, copyStaticAssets, resolveIcon, generateIndex } from '../lib/builder.js'
import { GlyphError, ensureNodeModules, ensureRepoJson, ensureSourcesDir } from '../utils/errors.js'
import * as log from '../utils/log.js'

export function registerBuildCommand(program: Command) {
  program
    .command('build')
    .description('Build all extensions for production')
    .action(async () => {
      const root = findProjectRoot()
      ensureRepoJson(root)
      ensureNodeModules(root)
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
        log.info('No sources found. Nothing to build.')
        return
      }

      const distDir = join(root, 'dist')
      const sourcesDir = join(root, 'sources')
      mkdirSync(distDir, { recursive: true })

      // Resolve node_modules from the target project so esbuild can find dependencies
      const nodePaths = [join(root, 'node_modules')]

      // Build each source
      const buildErrors: { id: string; error: string }[] = []
      for (const source of sources) {
        const outfile = join(distDir, `${source.id}.js`)
        log.info(`Building ${source.id}...`)
        try {
          await buildSource({ entryPoint: source.entryPoint, outfile, minify: true, nodePaths, absWorkingDir: root })
          console.log(`  -> ${outfile}`)
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          log.error(`${source.id}: build failed — ${msg}`)
          buildErrors.push({ id: source.id, error: msg })
        }
      }
      if (buildErrors.length > 0) {
        throw new GlyphError(
          `${buildErrors.length} source(s) failed to build.`,
          'Fix the errors above and rebuild.',
        )
      }

      // Validate bundles
      log.info('\nValidating sources...')
      const indexSources = []
      let allPassed = true

      for (const source of sources) {
        const bundlePath = join(distDir, `${source.id}.js`)
        const result = validateBundle(source.id, bundlePath)

        if (!result.passed) {
          log.error(`${source.id}: validation failed`)
          for (const err of result.errors) {
            console.log(`    - ${err.field}: ${err.message}`)
          }
          allPassed = false
          continue
        }

        // Check that info.id matches the directory name
        const info = result.info as Record<string, any>
        if (info.id !== source.id) {
          log.error(`${source.id}: info.id "${info.id}" does not match directory name "${source.id}"`)
          allPassed = false
          continue
        }

        // Copy static assets
        copyStaticAssets(source.id, sourcesDir, distDir)
        const icon = resolveIcon(source.id, sourcesDir, repoConfig.url, info.icon || '')

        indexSources.push({
          id: info.id,
          name: info.name,
          version: info.version,
          language: info.language,
          icon,
          nsfw: info.nsfw || false,
          dev: info.dev || undefined,
          bundleUrl: `${repoConfig.url}/dist/${source.id}.js`,
        })

        log.success(source.id)
      }

      if (!allPassed) {
        throw new GlyphError('Some sources failed validation.', 'Fix the errors above and rebuild.')
      }

      // Generate index.json
      generateIndex({ distDir, repoConfig, sources: indexSources })
      log.success(`Generated dist/index.json with ${indexSources.length} source(s).`)
    })
}
