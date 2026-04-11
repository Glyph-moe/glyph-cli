import type { TemplateContext } from './types'

// NOTE: keep in sync with @glyphmoe/cli src/commands/add.ts
export function mainTs(ctx: TemplateContext): string {
  return `import { createSource, get, buildUrl, RateLimit } from '@glyphmoe/sdk'
import { Parser } from './parser'

const BASE = 'https://example.com' // TODO: replace with your site URL
const parser = new Parser(BASE)

export default createSource({
  id: ${JSON.stringify(ctx.sourceId)},
  name: ${JSON.stringify(ctx.sourceName)},
  version: '1.0.0',
  baseUrl: BASE,
  icon: \`\${BASE}/favicon.ico\`,
  language: ${JSON.stringify(ctx.language)},
  dev: ${JSON.stringify(ctx.author)},
  rateLimit: RateLimit.balanced,

  async searchNovels(query, page) {
    // TODO: implement search
    const html = await get(buildUrl(BASE, '/search', { q: query, page }))
    return parser.parseSearchResults(html)
  },

  async fetchNovelDetails(novelUrl) {
    // TODO: implement novel details
    const html = await get(novelUrl)
    return parser.parseNovelDetails(html, novelUrl)
  },

  async fetchChapterContent(chapterUrl) {
    // TODO: implement chapter content
    const html = await get(chapterUrl)
    return parser.parseChapterContent(html)
  },
})
`
}
