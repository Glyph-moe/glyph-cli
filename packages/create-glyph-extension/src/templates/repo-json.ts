import type { TemplateContext } from './types'

export function repoJson(ctx: TemplateContext): string {
  const repo: Record<string, string> = {
    name: ctx.projectName,
    author: ctx.author,
    description: 'My custom Glyph extension repository.',
    // `url` is intentionally left empty: `glyph build` emits root-relative asset
    // URLs that the app resolves against the deployed index.json URL, so repos no
    // longer need a hand-edited GitHub Pages base URL here.
    url: '',
  }

  repo.website = ctx.repoUrl || ''

  return JSON.stringify(repo, null, 2) + '\n'
}
