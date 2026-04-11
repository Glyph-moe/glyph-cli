export function vitestConfig(): string {
  return `import { defineConfig } from 'vitest/config'

// Note: \`glyph test\` uses its own vitest config that injects the SDK test runtime.
// This file is only used when running \`npx vitest\` directly.
export default defineConfig({
  test: {
    testTimeout: 10000,
  },
})
`
}
