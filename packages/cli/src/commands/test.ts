import type { Command } from 'commander'
import { spawnSync } from 'child_process'
import { existsSync, writeFileSync, mkdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { join } from 'path'
import { findProjectRoot, discoverSources } from '../lib/project.js'
import { ensureNodeModules } from '../utils/errors.js'
import { writeVitestConfig } from '../lib/vitest-config.js'
import * as log from '../utils/log.js'

const NPX_CMD = process.platform === 'win32' ? 'npx.cmd' : 'npx'

export function registerTestCommand(program: Command) {
  program
    .command('test')
    .description('Run tests with vitest')
    .option('--generate', 'Generate test files for sources that don\'t have them')
    .allowUnknownOption()
    .helpOption(false)
    .action((_opts, cmd) => {
      // --generate: scaffold test files then exit
      if (cmd.opts().generate) {
        const root = findProjectRoot()
        const sources = discoverSources(root)
        let created = 0
        for (const source of sources.filter(s => s.language === 'js')) {
          const testPath = join(root, 'sources', source.id, 'src', `${source.id}.test.ts`)
          if (existsSync(testPath)) {
            log.info(`${source.id} — test file already exists`)
            continue
          }
          mkdirSync(join(root, 'sources', source.id, 'src'), { recursive: true })
          writeFileSync(testPath, `import { describe, it, expect, beforeEach } from 'vitest'
import { clearMocks } from '@glyphmoe/sdk/testing'

describe('${source.id}', () => {
  beforeEach(() => clearMocks())

  it('should parse search results', () => {
    // TODO: add mock HTML and test parser
  })
})
`)
          log.success(`Created sources/${source.id}/src/${source.id}.test.ts`)
          created++
        }
        console.log(`\n${created} test file(s) generated.`)
        return
      }
      const root = findProjectRoot()
      ensureNodeModules(root)

      const testRuntimePath = join(root, 'node_modules', '@glyphmoe', 'sdk', 'dist', 'test-runtime.js')
        .split('\\').join('/')
      if (!existsSync(testRuntimePath)) {
        console.error('Error: @glyphmoe/sdk is not installed or missing test-runtime.')
        console.error('Run "npm install @glyphmoe/sdk" first.')
        process.exit(1)
      }

      const setupTemplate = fileURLToPath(new URL('../src/runtime/test-setup.js', import.meta.url))
      if (!existsSync(setupTemplate)) {
        console.error('Error: CLI runtime files are missing (expected test-setup.js).')
        console.error('Try reinstalling @glyphmoe/cli.')
        process.exit(1)
      }

      const tempConfigPath = writeVitestConfig({
        root,
        setupFilePath: setupTemplate,
        testRuntimePath,
        configName: 'vitest.config.ts',
        setupName: 'test-setup.js',
      })

      // Only add 'run' if user didn't pass --watch or similar vitest subcommand
      const hasSubcommand = cmd.args.some((a: string) => ['--watch', '--ui', 'watch', 'bench'].includes(a))
      const vitestArgs = [
        'vitest',
        ...(hasSubcommand ? [] : ['run']),
        '--config',
        tempConfigPath,
        ...cmd.args,
      ]

      const result = spawnSync(NPX_CMD, vitestArgs, {
        cwd: root,
        stdio: 'inherit',
        env: { ...process.env },
      })

      if (result.error) {
        console.error(`Failed to run vitest: ${result.error.message}`)
      }
      process.exit(result.status ?? 1)
    })
}
