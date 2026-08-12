declare const __VERSION__: string

import { execSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import prompts from 'prompts'
import pc from 'picocolors'

import type { TemplateContext } from './templates/types'
import { packageJson } from './templates/package-json'
import { repoJson } from './templates/repo-json'
import { deployYml } from './templates/deploy-yml'
import { tsconfigJson } from './templates/tsconfig-json'
import { vitestConfig } from './templates/vitest-config'
import { gitignore } from './templates/gitignore'
import { prettierrc } from './templates/prettierrc'
import { indexHtml } from './templates/index-html'
import { sourcePackageJson } from './templates/source-package-json'
import { sourceTsconfigJson } from './templates/source-tsconfig-json'
import { mainTs } from './templates/main-ts'
import { parserTs } from './templates/parser-ts'
import { testTs } from './templates/test-ts'

async function main() {
  const argName = process.argv[2]

  if (argName === '--version' || argName === '-v') {
    console.log(`create-glyph-extension ${__VERSION__}`)
    process.exit(0)
  }
  if (argName === '--help' || argName === '-h') {
    console.log('Usage: npx create-glyph-extension [project-name]')
    console.log('\nScaffolds a new Glyph extension project with SDK, build scripts, and an example source.')
    process.exit(0)
  }

  // Try to get git user name for author default
  let gitUser = ''
  try {
    gitUser = execSync('git config user.name', { encoding: 'utf-8' }).trim()
  } catch {
    // ignore
  }

  const response = await prompts(
    [
      {
        type: 'text',
        name: 'projectName',
        message: 'Project name',
        initial: argName || 'my-glyph-extensions',
        validate: (v: string) => {
          const trimmed = v.trim()
          if (!trimmed) return 'Project name is required'
          if (trimmed !== basename(trimmed)) return 'Project name cannot contain path separators'
          if (trimmed === '.' || trimmed === '..') return 'Invalid project name'
          if (!/^[a-zA-Z0-9._-]+$/.test(trimmed)) return 'Project name can only contain letters, numbers, dots, hyphens, and underscores'
          return true
        },
      },
      {
        type: 'text',
        name: 'sourceId',
        message: 'First source ID (lowercase, e.g. "royalroad")',
        validate: (v: string) =>
          /^[a-z][a-z0-9-]*$/.test(v.trim())
            ? true
            : 'Must start with a letter, lowercase alphanumeric and hyphens only',
      },
      {
        type: 'text',
        name: 'sourceName',
        message: 'Source display name (e.g. "Royal Road")',
        validate: (v: string) => (v.trim() ? true : 'Display name is required'),
      },
      {
        type: 'text',
        name: 'language',
        message: 'Language code',
        initial: 'en',
      },
      {
        type: 'text',
        name: 'author',
        message: 'Author',
        initial: gitUser,
      },
      {
        type: 'text',
        name: 'repoUrl',
        message: 'GitHub repo URL (optional)',
        initial: '',
      },
    ],
    {
      onCancel: () => {
        console.log('\nAborted.')
        process.exit(130)
      },
    },
  )

  // Handle Ctrl+C — prompts returns empty object
  if (!response.projectName || !response.sourceId || !response.sourceName) {
    console.log('\nAborted.')
    process.exit(1)
  }

  const ctx: TemplateContext = {
    projectName: response.projectName.trim(),
    sourceId: response.sourceId.trim(),
    sourceName: response.sourceName.trim(),
    language: (response.language || 'en').trim(),
    author: (response.author || '').trim(),
    repoUrl: (response.repoUrl || '').trim(),
  }

  const projectDir = resolve(process.cwd(), ctx.projectName)

  console.log(`\nCreating ${pc.bold(ctx.projectName)}...\n`)

  if (existsSync(projectDir)) {
    console.error(pc.red(`Directory "${ctx.projectName}" already exists.`))
    process.exit(1)
  }

  // Create directories
  const sourceDir = join(projectDir, 'sources', ctx.sourceId)
  const srcDir = join(sourceDir, 'src')
  const staticDir = join(sourceDir, 'static')
  const workflowsDir = join(projectDir, '.github', 'workflows')

  mkdirSync(srcDir, { recursive: true })
  mkdirSync(staticDir, { recursive: true })
  mkdirSync(workflowsDir, { recursive: true })

  // Write root files
  const files: [string, string][] = [
    [join(projectDir, 'package.json'), packageJson(ctx)],
    [join(projectDir, 'repo.json'), repoJson(ctx)],
    [join(projectDir, 'tsconfig.json'), tsconfigJson()],
    [join(projectDir, 'vitest.config.ts'), vitestConfig()],
    [join(projectDir, '.gitignore'), gitignore()],
    [join(projectDir, '.prettierrc'), prettierrc()],
    [join(projectDir, 'index.html'), indexHtml()],
    // Source files
    [join(sourceDir, 'package.json'), sourcePackageJson(ctx)],
    [join(sourceDir, 'tsconfig.json'), sourceTsconfigJson()],
    [join(srcDir, 'main.ts'), mainTs(ctx)],
    [join(srcDir, 'parser.ts'), parserTs()],
    [join(srcDir, `${ctx.sourceId}.test.ts`), testTs(ctx)],
    // Static dir gitkeep
    [join(staticDir, '.gitkeep'), ''],
    // CI workflow (build + deploy to GitHub Pages)
    [join(workflowsDir, 'deploy.yml'), deployYml()],
  ]

  for (const [filePath, content] of files) {
    writeFileSync(filePath, content, 'utf-8')
  }

  console.log(`  ${pc.green('\u2713')} Created ${files.length} files`)

  // Run npm install
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  try {
    await new Promise<void>((resolvePromise, reject) => {
      const child = spawn(npmCmd, ['install'], {
        cwd: projectDir,
        stdio: 'inherit',
      })
      child.on('close', code => {
        if (code === 0) resolvePromise()
        else reject(new Error(`npm install exited with code ${code}`))
      })
      child.on('error', reject)
    })
    console.log(`  ${pc.green('\u2713')} Installed dependencies`)
  } catch {
    console.log()
    console.log(pc.yellow('  Warning: npm install failed. You can retry manually:'))
    console.log(`    cd ${ctx.projectName} && npm install`)
  }
  console.log()
  console.log(`Next steps:`)
  console.log(`  ${pc.cyan(`cd ${ctx.projectName}`)}`)
  console.log(`  ${pc.cyan('npm run dev')}`)
  console.log()
}

main().catch(err => {
  console.error(pc.red(err.message))
  process.exit(1)
})
