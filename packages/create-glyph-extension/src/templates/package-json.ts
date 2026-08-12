import type { TemplateContext } from './types'

export function packageJson(ctx: TemplateContext): string {
  return JSON.stringify(
    {
      name: ctx.projectName,
      version: '1.0.0',
      private: true,
      type: 'module',
      engines: { node: '>=20' },
      scripts: {
        dev: 'glyph dev',
        build: 'glyph build',
        test: 'glyph test',
        validate: 'glyph validate',
        format: 'prettier --write "sources/**/*.ts"',
      },
      devDependencies: {
        '@glyphmoe/sdk': '^0.1.10',
        '@glyphmoe/cli': '^1.0.0',
        cheerio: '^1.0.0',
        typescript: '^5.0.0',
        vitest: '^3.0.0',
        prettier: '^3.0.0',
      },
    },
    null,
    2,
  ) + '\n'
}
