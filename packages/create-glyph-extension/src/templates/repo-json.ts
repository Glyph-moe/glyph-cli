import type { TemplateContext } from './types'

export function repoJson(ctx: TemplateContext): string {
  const repo: Record<string, string> = {
    name: ctx.projectName,
    author: ctx.author,
    description: 'My custom Glyph extension repository.',
  }

  if (ctx.repoUrl) {
    repo.website = ctx.repoUrl
    const match = ctx.repoUrl.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/)
    if (match) {
      repo.url = `https://${match[1]}.github.io/${match[2]}`
    } else {
      repo.url = ctx.repoUrl
    }
  } else {
    repo.website = ''
    repo.url = ''
  }

  return JSON.stringify(repo, null, 2) + '\n'
}
