import { existsSync, readdirSync } from 'fs'
import { join } from 'path'

export class GlyphError extends Error {
  constructor(
    message: string,
    public hint?: string,
  ) {
    super(message)
    this.name = 'GlyphError'
  }
}

export function ensureRepoJson(root: string): void {
  if (!existsSync(join(root, 'repo.json'))) {
    throw new GlyphError(
      'repo.json not found.',
      'Are you in a Glyph extension project? Run "npx create-glyph-extension" to create one.',
    )
  }
}

export function ensureNodeModules(root: string): void {
  if (!existsSync(join(root, 'node_modules'))) {
    throw new GlyphError('Dependencies not installed.', 'Run "npm install" first.')
  }
}

export function ensureSourcesDir(root: string): void {
  const sourcesDir = join(root, 'sources')
  if (!existsSync(sourcesDir)) {
    throw new GlyphError(
      'No sources directory found.',
      'Run "glyph add <source-id>" to create your first source.',
    )
  }

  const entries = readdirSync(sourcesDir, { withFileTypes: true })
  const subdirs = entries.filter((e) => e.isDirectory())
  if (subdirs.length === 0) {
    throw new GlyphError(
      'No sources found in sources/.',
      'Run "glyph add <source-id>" to create your first source.',
    )
  }
}
