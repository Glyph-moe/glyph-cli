import { existsSync, readdirSync, readFileSync } from 'fs'
import { join, resolve } from 'path'
import { GlyphError } from '../utils/errors.js'

export function findProjectRoot(cwd?: string): string {
  let dir = resolve(cwd ?? process.cwd())

  while (true) {
    if (existsSync(join(dir, 'repo.json'))) {
      return dir
    }
    const parent = resolve(dir, '..')
    if (parent === dir) {
      throw new GlyphError(
        'repo.json not found.',
        'Are you in a Glyph extension project? Run "npx create-glyph-extension" to create one.',
      )
    }
    dir = parent
  }
}

export interface SourceEntry {
  id: string
  dir: string
  entryPoint: string
  language: 'js' | 'rust'
}

export function discoverSources(root: string): SourceEntry[] {
  const sourcesDir = join(root, 'sources')
  if (!existsSync(sourcesDir)) return []

  const entries = readdirSync(sourcesDir, { withFileTypes: true })
  const sources: SourceEntry[] = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue

    const dir = join(sourcesDir, entry.name)

    // Check for Rust source (Cargo.toml with component metadata)
    const cargoToml = join(dir, 'Cargo.toml')
    if (existsSync(cargoToml)) {
      const content = readFileSync(cargoToml, 'utf-8')
      if (content.includes('[package.metadata.component]')) {
        sources.push({
          id: entry.name,
          dir,
          entryPoint: join(dir, 'src', 'lib.rs'),
          language: 'rust',
        })
        continue
      }
    }

    // Check for JS/TS source
    const mainTs = join(dir, 'src', 'main.ts')
    const indexTs = join(dir, 'src', 'index.ts')

    let entryPoint: string | undefined
    if (existsSync(mainTs)) entryPoint = mainTs
    else if (existsSync(indexTs)) entryPoint = indexTs

    if (entryPoint) {
      sources.push({ id: entry.name, dir, entryPoint, language: 'js' })
    }
  }

  return sources.sort((a, b) => a.id.localeCompare(b.id))
}

export interface RepoConfig {
  name: string
  author: string
  description: string
  website: string
  url: string
}

export function readRepoConfig(root: string): RepoConfig {
  const configPath = join(root, 'repo.json')
  let content: string
  try {
    content = readFileSync(configPath, 'utf-8')
  } catch (err) {
    throw new GlyphError(
      `Could not read repo.json: ${err instanceof Error ? err.message : String(err)}`,
      'Check file permissions and that the file is not locked.',
    )
  }
  let raw: unknown
  try {
    raw = JSON.parse(content)
  } catch {
    throw new GlyphError('repo.json contains invalid JSON.', 'Check the file for syntax errors.')
  }
  if (!raw || typeof raw !== 'object') {
    throw new GlyphError('repo.json must be a JSON object.')
  }
  const obj = raw as Record<string, unknown>
  const name = String(obj.name ?? '')
  if (!name) {
    throw new GlyphError('repo.json is missing the "name" field.', 'Add a "name" to your repo.json.')
  }

  return {
    name,
    author: String(obj.author ?? ''),
    description: String(obj.description ?? ''),
    website: String(obj.website ?? ''),
    url: String(obj.url ?? ''),
  }
}
