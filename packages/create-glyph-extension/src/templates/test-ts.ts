import type { TemplateContext } from './types'

// NOTE: keep in sync with @glyphmoe/cli src/commands/add.ts
export function testTs(ctx: TemplateContext): string {
  return `import { describe, it, expect, beforeEach } from 'vitest'
import { clearMocks } from '@glyphmoe/sdk/testing'

describe(${JSON.stringify(ctx.sourceId)}, () => {
  beforeEach(() => clearMocks())

  it('should parse search results', async () => {
    // TODO: add mock HTML and test parser
  })
})
`
}
