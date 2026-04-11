# Glyph CLI

CLI toolchain for building Glyph novel reader extensions.

## Packages

### `create-glyph-extension`

Scaffold a new extension project:

```bash
npx create-glyph-extension my-extensions
cd my-extensions
npm run dev
```

### `@glyphmoe/cli`

Development commands (installed as a devDependency in your project):

| Command | Description |
|---------|-------------|
| `glyph dev [--port] [--open]` | Development server with hot reload |
| `glyph build` | Production build with validation |
| `glyph test [-- vitest args]` | Run tests with embedded runtime setup |
| `glyph validate [--typecheck] [--tests] [--smoke] [--fix] [--ci]` | Validate extensions |
| `glyph add <source-id>` | Scaffold a new source in your project |

## Development

```bash
git clone https://github.com/Glyph-moe/glyph-cli
cd glyph-cli
npm install
npm run build
```

## License

MIT
