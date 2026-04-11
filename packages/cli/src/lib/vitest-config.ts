import { existsSync, writeFileSync, mkdirSync, readFileSync } from 'fs'
import { join } from 'path'

/** Escape a file-system path for safe interpolation into a JS/TS string literal. */
function escapePath(p: string): string {
  return p.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

interface WriteVitestConfigOpts {
  root: string
  setupFilePath: string
  testRuntimePath: string
  configName: string
  setupName: string
}

export function writeVitestConfig(opts: WriteVitestConfigOpts): string {
  const { root, setupFilePath, testRuntimePath, configName, setupName } = opts

  const cacheDir = join(root, 'node_modules', '.cache', 'glyph')
  mkdirSync(cacheDir, { recursive: true })

  let setupContent = readFileSync(setupFilePath, 'utf-8')
  setupContent = setupContent.replace(
    `from '@glyphmoe/sdk/test-runtime'`,
    `from '${testRuntimePath}'`,
  )
  const setupFile = join(cacheDir, setupName)
  writeFileSync(setupFile, setupContent)
  const setupFilePosix = setupFile.split('\\').join('/')

  let userConfigFile = ''
  for (const name of ['vitest.config.ts', 'vitest.config.mts', 'vitest.config.js', 'vitest.config.mjs']) {
    if (existsSync(join(root, name))) {
      userConfigFile = name
      break
    }
  }

  let configContent: string
  if (userConfigFile) {
    const userConfigPath = join(root, userConfigFile).split('\\').join('/')
    configContent = `
import { defineConfig, mergeConfig } from 'vitest/config'
import rawUserConfig from '${escapePath(userConfigPath)}'

const userConfig = typeof rawUserConfig === 'function' ? await rawUserConfig({}) : rawUserConfig
export default mergeConfig(userConfig, defineConfig({
  test: {
    setupFiles: ['${escapePath(setupFilePosix)}'],
  },
}))
`
  } else {
    configContent = `
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    setupFiles: ['${escapePath(setupFilePosix)}'],
    exclude: ['**/node_modules/**'],
  },
})
`
  }

  const tempConfigPath = join(cacheDir, configName)
  writeFileSync(tempConfigPath, configContent)
  return tempConfigPath
}
