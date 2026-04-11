import type { TemplateContext } from './types'

export function sourcePackageJson(ctx: TemplateContext): string {
  return JSON.stringify(
    {
      name: `glyph-source-${ctx.sourceId}`,
      version: '1.0.0',
      private: true,
    },
    null,
    2,
  ) + '\n'
}
