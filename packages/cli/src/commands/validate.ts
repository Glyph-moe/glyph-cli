import type { Command } from 'commander'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { findProjectRoot, discoverSources } from '../lib/project.js'
import { buildSource, validateBundle } from '../lib/builder.js'
import { autoFix, formatCiOutput, validateTypecheck, validateTests, detectConsoleLogs, smokeTest } from '../lib/validator.js'
import type { CiOutputData } from '../lib/validator.js'
import { ensureNodeModules, ensureRepoJson, ensureSourcesDir } from '../utils/errors.js'
import * as log from '../utils/log.js'

export function registerValidateCommand(program: Command) {
  program
    .command('validate')
    .description('Validate all extension sources')
    .option('--typecheck', 'Run TypeScript type checking')
    .option('--tests', 'Run test suite')
    .option('--fix', 'Auto-fix fixable issues')
    .option('--ci', 'Non-interactive JSON output')
    .option('--smoke', 'Run smoke test (calls searchNovels with real HTTP)')
    .action(
      async (opts: {
        typecheck?: boolean
        tests?: boolean
        fix?: boolean
        ci?: boolean
        smoke?: boolean
      }) => {
        const root = findProjectRoot()
        ensureRepoJson(root)
        ensureNodeModules(root)
        ensureSourcesDir(root)

        const sources = discoverSources(root)

        if (sources.length === 0) {
          if (opts.ci) {
            console.log(formatCiOutput({ results: [] }))
          } else {
            console.log('No sources found. Nothing to validate.')
          }
          return
        }

        const distDir = join(root, 'dist')
        const sourcesDir = join(root, 'sources')
        mkdirSync(distDir, { recursive: true })

        const nodePaths = [join(root, 'node_modules')]

        // Build all sources
        if (!opts.ci) {
          console.log('Building sources...')
        }
        for (const source of sources) {
          const outfile = join(distDir, `${source.id}.js`)
          await buildSource({
            entryPoint: source.entryPoint,
            outfile,
            minify: true,
            nodePaths,
            absWorkingDir: root,
          })
        }

        // Validate all bundles
        if (!opts.ci) {
          console.log('Validating sources...\n')
        }
        let results = sources.map((source) => {
          const bundlePath = join(distDir, `${source.id}.js`)
          return validateBundle(source.id, bundlePath)
        })

        // --fix: auto-fix fixable errors, then rebuild+revalidate those sources
        if (opts.fix) {
          const needsFix = results.filter((r) => r.errors.some((e) => e.fixable))
          let anyFileChanged = false
          for (const result of needsFix) {
            const fixResult = autoFix(result.sourceId, sourcesDir, result.errors)
            if (!opts.ci) {
              for (const fix of fixResult.applied) {
                log.success(`Fixed ${result.sourceId}: ${fix}`)
              }
              for (const fail of fixResult.failed) {
                log.warn(`${result.sourceId}: ${fail}`)
              }
            }

            if (fixResult.applied.length > 0) {
              anyFileChanged = true
              // Rebuild the fixed source
              const source = sources.find((s) => s.id === result.sourceId)!
              const outfile = join(distDir, `${source.id}.js`)
              await buildSource({
                entryPoint: source.entryPoint,
                outfile,
                minify: true,
                nodePaths,
                absWorkingDir: root,
              })
            }
          }

          // Re-validate all only if files were actually changed
          if (anyFileChanged) {
            if (!opts.ci) {
              console.log('\nRe-validating...\n')
            }
            results = sources.map((source) => {
              const bundlePath = join(distDir, `${source.id}.js`)
              return validateBundle(source.id, bundlePath)
            })
          }
        }

        // Track extra results separately (not mixed into source results)
        let typecheckResult: { passed: boolean; output: string } | undefined
        let testsResult: { passed: boolean; output: string } | undefined
        const smokeResults: { sourceId: string; passed: boolean; error?: string; itemCount?: number; duration: number }[] = []

        // --typecheck
        if (opts.typecheck) {
          if (!opts.ci) console.log('Running type checker...')
          typecheckResult = validateTypecheck(root)
          if (!typecheckResult.passed) {
            if (!opts.ci) {
              log.error('Type checking failed:')
              console.log(typecheckResult.output)
            }
          } else if (!opts.ci) {
            log.success('Type checking passed')
          }
        }

        // --tests
        if (opts.tests) {
          if (!opts.ci) console.log('Running tests...')
          const setupFilePath = fileURLToPath(new URL('../src/runtime/test-setup.js', import.meta.url))
          if (!existsSync(setupFilePath)) {
            if (opts.ci) {
              testsResult = { passed: false, output: 'CLI runtime files missing (test-setup.js). Reinstall @glyphmoe/cli.' }
            } else {
              log.error('CLI runtime files are missing (expected test-setup.js).')
              log.warn('Try reinstalling @glyphmoe/cli.')
              process.exit(1)
            }
          }
          testsResult = testsResult ?? validateTests(root, setupFilePath)
          if (!testsResult.passed) {
            if (!opts.ci) {
              log.error('Tests failed:')
              console.log(testsResult.output)
            }
          } else if (!opts.ci) {
            log.success('Tests passed')
          }
        }

        // console.log detection (always runs)
        const consoleLogWarnings: { sourceId: string; consoleLogs: number }[] = []
        for (const source of sources) {
          const hits = detectConsoleLogs(source.id, sourcesDir)
          if (hits.length > 0) {
            consoleLogWarnings.push({ sourceId: source.id, consoleLogs: hits.length })
            if (!opts.ci) {
              log.warn(`${source.id}: ${hits.length} console.log(s) found in source code`)
              for (const hit of hits) {
                console.log(`    ${hit.file}:${hit.line}  ${hit.text}`)
              }
            }
          }
        }

        // --smoke: call searchNovels("test", 1) with real HTTP
        if (opts.smoke) {
          if (!opts.ci) console.log('\nRunning smoke tests...')
          for (const source of sources) {
            const result = await smokeTest(source.id, distDir)
            smokeResults.push({ sourceId: source.id, ...result })
            if (result.passed) {
              if (!opts.ci) {
                log.success(`${source.id}: searchNovels returned ${result.itemCount} item(s) in ${result.duration}ms`)
              }
            } else if (!opts.ci) {
              log.error(`${source.id}: smoke test failed — ${result.error}`)
            }
          }
        }

        // Compute overall pass/fail
        const allPassed = results.every((r) => r.passed)
          && (!typecheckResult || typecheckResult.passed)
          && (!testsResult || testsResult.passed)
          && smokeResults.every((s) => s.passed)

        // Output
        if (opts.ci) {
          const ciData: CiOutputData = {
            results,
            typecheck: typecheckResult ? { passed: typecheckResult.passed } : undefined,
            tests: testsResult ? { passed: testsResult.passed } : undefined,
            smoke: smokeResults.length > 0 ? smokeResults : undefined,
            warnings: consoleLogWarnings.length > 0 ? consoleLogWarnings : undefined,
          }
          console.log(formatCiOutput(ciData))
        } else {
          for (const result of results) {
            if (result.passed) {
              log.success(result.sourceId)
            } else {
              log.error(result.sourceId)
              for (const err of result.errors) {
                const suffix = err.fixable ? ' (fixable with --fix)' : ''
                console.log(`    - ${err.message}${suffix}`)
              }
            }
          }

          const passedCount = results.filter((r) => r.passed).length
          console.log(`\n${passedCount} of ${results.length} sources passed.`)
        }

        if (!allPassed) process.exit(1)
      },
    )
}
