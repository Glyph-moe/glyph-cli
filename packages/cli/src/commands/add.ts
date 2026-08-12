import type { Command } from 'commander'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import prompts from 'prompts'
import { findProjectRoot, readRepoConfig } from '../lib/project.js'
import { GlyphError } from '../utils/errors.js'
import * as log from '../utils/log.js'

export function registerAddCommand(program: Command) {
  program
    .command('add <source-id>')
    .description('Scaffold a new source extension')
    .option('-l, --language <lang>', 'Extension language (js or rust)', 'js')
    .action(async (sourceId: string, cmdOpts: { language: string }) => {
      if (!process.stdin.isTTY) {
        throw new GlyphError(
          'glyph add requires an interactive terminal.',
          'Provide --name and --language flags for non-interactive use, or use create-glyph-extension.',
        )
      }

      if (!/^[a-z][a-z0-9]+(-[a-z0-9]+)*$/.test(sourceId)) {
        throw new GlyphError(
          `Invalid source ID "${sourceId}".`,
          'Must be at least 2 characters, start with a letter, lowercase alphanumeric and hyphens only. No trailing hyphens.',
        )
      }

      const root = findProjectRoot()
      const repoConfig = readRepoConfig(root)
      const sourceDir = join(root, 'sources', sourceId)

      if (existsSync(sourceDir)) {
        throw new GlyphError(`sources/${sourceId} already exists.`)
      }

      const response = await prompts(
        [
          {
            type: 'text',
            name: 'name',
            message: 'Source display name',
            validate: (v: string) => (v.trim() ? true : 'Name is required'),
          },
          {
            type: 'text',
            name: 'language',
            message: 'Language',
            initial: 'en',
          },
        ],
        { onCancel: () => process.exit(130) },
      )

      if (!response.name) process.exit(130)

      const sourceName: string = response.name.trim()
      const language: string = (response.language || 'en').trim()

      if (cmdOpts.language === 'rust') {
        // Create directories
        mkdirSync(join(sourceDir, 'src'), { recursive: true })
        mkdirSync(join(sourceDir, 'static'), { recursive: true })

        // Cargo.toml
        writeFileSync(
          join(sourceDir, 'Cargo.toml'),
          `[package]
name = "glyph-${sourceId}"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
wit-bindgen-rt = "0.39.0"

[package.metadata.component]
package = "glyph:extension"

[package.metadata.component.target]
world = "basic"
path = "../../../../wit"
`,
        )

        // src/lib.rs
        writeFileSync(
          join(sourceDir, 'src', 'lib.rs'),
          `#[allow(warnings)]
mod bindings;

use bindings::exports::glyph::extension::source::Guest;
use bindings::glyph::extension::http::{self, Method, Request};
use bindings::glyph::extension::types::*;

struct Extension;

impl Guest for Extension {
    fn search_novels(_query: String, _page: u32) -> SearchResult {
        // TODO: implement search
        SearchResult {
            items: vec![],
            has_next_page: false,
        }
    }

    fn fetch_novel_details(url: String) -> NovelDetails {
        // TODO: implement novel details
        NovelDetails {
            id: url.clone(),
            title: String::new(),
            url,
            cover: None,
            author: None,
            description: None,
            tags: None,
            status: None,
            content_rating: None,
            chapters: vec![],
        }
    }

    fn fetch_chapter_content(_url: String) -> String {
        // TODO: implement chapter content
        String::from("<p>Not implemented</p>")
    }
}

bindings::export!(Extension with_types_in bindings);
`,
        )

        // source.json
        writeFileSync(
          join(sourceDir, 'source.json'),
          JSON.stringify(
            {
              id: sourceId,
              name: sourceName,
              version: '1.0.0',
              language,
              dev: repoConfig.author || '',
            },
            null,
            2,
          ) + '\n',
        )

        // static/.gitkeep
        writeFileSync(join(sourceDir, 'static', '.gitkeep'), '')

        log.success(`Created sources/${sourceId}/`)
        console.log()
        console.log(`  Next: edit sources/${sourceId}/src/lib.rs to implement the extension methods.`)
      } else {
        // Create directories
        mkdirSync(join(sourceDir, 'src'), { recursive: true })
        mkdirSync(join(sourceDir, 'static'), { recursive: true })

        // package.json
        writeFileSync(
          join(sourceDir, 'package.json'),
          JSON.stringify(
            {
              name: `glyph-source-${sourceId}`,
              version: '1.0.0',
              private: true,
            },
            null,
            2,
          ) + '\n',
        )

        // tsconfig.json
        writeFileSync(
          join(sourceDir, 'tsconfig.json'),
          JSON.stringify(
            {
              extends: '../../tsconfig.json',
              compilerOptions: {
                rootDir: 'src',
                outDir: '../../dist',
              },
              include: ['src/**/*'],
              exclude: ['src/**/*.test.ts'],
            },
            null,
            2,
          ) + '\n',
        )

        // static/.gitkeep
        writeFileSync(join(sourceDir, 'static', '.gitkeep'), '')

        // src/main.ts — keep in sync with create-glyph-extension/src/templates/
        writeFileSync(
          join(sourceDir, 'src', 'main.ts'),
          `import { createSource, get, buildUrl, RateLimit } from '@glyphmoe/sdk'
import { Parser } from './parser'

const BASE = 'https://example.com' // TODO: replace with your site URL
const parser = new Parser(BASE)

export const source = createSource({
  id: ${JSON.stringify(sourceId)},
  name: ${JSON.stringify(sourceName)},
  version: '1.0.0',
  baseUrl: BASE,
  icon: \`\${BASE}/favicon.ico\`,
  language: ${JSON.stringify(language)},
  dev: ${JSON.stringify(repoConfig.author || '')},
  sourceType: 'reader',
  rateLimit: RateLimit.balanced,

  searchNovels(query, page) {
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
`,
        )

        // src/parser.ts
        writeFileSync(
          join(sourceDir, 'src', 'parser.ts'),
          `import { load } from '@glyphmoe/sdk'
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
`,
        )

        // src/<id>.test.ts
        writeFileSync(
          join(sourceDir, 'src', `${sourceId}.test.ts`),
          `import { describe, it, expect, beforeEach } from 'vitest'
import { clearMocks } from '@glyphmoe/sdk/testing'

describe(${JSON.stringify(sourceId)}, () => {
  beforeEach(() => clearMocks())

  it('should parse search results', async () => {
    // TODO: add mock HTML and test parser
  })
})
`,
        )

        log.success(`Created sources/${sourceId}/`)
        console.log()
        console.log(`  Next: edit sources/${sourceId}/src/main.ts to add your site URL and implement the methods.`)
      }
    })
}
