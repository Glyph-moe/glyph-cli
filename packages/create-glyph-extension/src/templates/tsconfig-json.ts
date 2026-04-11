export function tsconfigJson(): string {
  return JSON.stringify(
    {
      compilerOptions: {
        target: 'ES2022',
        module: 'ES2022',
        moduleResolution: 'bundler',
        lib: ['ES2022'],
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        declaration: true,
        outDir: './dist',
      },
      include: ['sources/**/*'],
      exclude: ['node_modules', 'dist'],
    },
    null,
    2,
  ) + '\n'
}
