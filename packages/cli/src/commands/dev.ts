import type { Command } from 'commander'
import { findProjectRoot } from '../lib/project.js'
import { GlyphError, ensureNodeModules, ensureRepoJson } from '../utils/errors.js'
import { startDevServer } from '../lib/server.js'

export function registerDevCommand(program: Command) {
  program
    .command('dev')
    .description('Start development server with hot reload')
    .option('-p, --port <number>', 'Port number', '8888')
    .option('--open', 'Open browser automatically')
    .option('--url <url>', 'Public base URL (for tunnels like cloudflared/ngrok)')
    .action(async (opts) => {
      const port = parseInt(opts.port, 10)
      if (Number.isNaN(port) || port < 1 || port > 65535) {
        throw new GlyphError(
          `Invalid port number: ${opts.port}`,
          'Provide a number between 1 and 65535.',
        )
      }
      const root = findProjectRoot()
      ensureRepoJson(root)
      ensureNodeModules(root)
      await startDevServer({
        root,
        port,
        open: opts.open || false,
        publicUrl: opts.url,
      })
    })
}
