export function prettierrc(): string {
  return JSON.stringify(
    {
      semi: false,
      singleQuote: true,
      trailingComma: 'all',
      printWidth: 100,
      tabWidth: 2,
      arrowParens: 'avoid',
    },
    null,
    2,
  ) + '\n'
}
