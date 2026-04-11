export function sourceTsconfigJson(): string {
  return JSON.stringify(
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
  ) + '\n'
}
