// NOTE: keep in sync with @glyphmoe/cli src/commands/add.ts
export function parserTs(): string {
  return `import { load } from '@glyphmoe/sdk'
import type { Novel, Chapter, PagedResults } from '@glyphmoe/sdk'

export class Parser {
  constructor(private baseUrl: string) {}

  parseSearchResults(html: string): PagedResults<Novel> {
    const $ = load(html)
    // TODO: implement
    return { items: [], hasNextPage: false }
  }

  parseNovelDetails(html: string, novelUrl: string): Novel & { chapters: Chapter[] } {
    const $ = load(html)
    // TODO: implement
    return { id: novelUrl, title: '', url: novelUrl, chapters: [] }
  }

  parseChapterContent(html: string): string {
    const $ = load(html)
    // TODO: implement
    return $('body').html() ?? ''
  }
}
`
}
