# @glyphmoe/cli

CLI toolchain for building and testing [Glyph](https://glyph.moe) novel reader extensions.

## Requirements

- Node.js >= 20

## Installation

Installed automatically as a devDependency when you scaffold a project:

```bash
npx create-glyph-extension my-extensions
```

Or add it manually:

```bash
npm install -D @glyphmoe/cli
```

## Commands

| Command | Description |
|---------|-------------|
| `glyph dev [--port] [--open]` | Development server with hot reload and LAN access |
| `glyph build` | Production build with validation |
| `glyph test [-- vitest args]` | Run tests with embedded runtime setup |
| `glyph validate [--typecheck] [--tests] [--smoke] [--fix] [--ci]` | Validate extensions |
| `glyph add <source-id>` | Scaffold a new source in your project |

## License

MIT
