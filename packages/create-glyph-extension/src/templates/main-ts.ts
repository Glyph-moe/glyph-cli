import type { TemplateContext } from './types'

// NOTE: keep in sync with @glyphmoe/cli src/commands/add.ts
export function mainTs(ctx: TemplateContext): string {
  return `import { createSource, get, buildUrl, RateLimit } from '@glyphmoe/sdk'
import { Parser } from './parser'

const BASE = 'https://example.com' // TODO: replace with your site URL
const parser = new Parser(BASE)

export const source = createSource({
  id: ${JSON.stringify(ctx.sourceId)},
  name: ${JSON.stringify(ctx.sourceName)},
  version: '1.0.0',
  baseUrl: BASE,
  icon: \`\${BASE}/favicon.ico\`,
  language: ${JSON.stringify(ctx.language)},
  dev: ${JSON.stringify(ctx.author)},
  sourceType: 'reader',
  rateLimit: RateLimit.balanced,

  // filters: [
  //   select('status', 'Status', ['All', 'Ongoing', 'Completed']),
  //   sort('sort', 'Sort by', ['Popular', 'Latest', 'Rating']),
  // ],

  searchNovels(query, page, filters) {
    // TODO: implement search
    const html = get(buildUrl(BASE, '/search', { q: query, page }))
    return parser.parseSearchResults(html)
  },

  fetchNovelDetails(novelUrl) {
    // TODO: implement novel details
    const html = get(novelUrl)
    return parser.parseNovelDetails(html, novelUrl)
  },

  fetchChapterContent(chapterUrl) {
    // TODO: implement chapter content
    const html = get(chapterUrl)
    return parser.parseChapterContent(html)
  },
})
`
}
