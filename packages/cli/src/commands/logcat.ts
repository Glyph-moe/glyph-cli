import type { Command } from 'commander'
import http from 'http'
import pc from 'picocolors'
import * as log from '../utils/log.js'

export function registerLogcatCommand(program: Command) {
  program
    .command('logcat')
    .description('Start a log receiver — the app streams logs here when connected to a dev server')
    .option('-p, --port <number>', 'Port to listen on', '9999')
    .action((opts) => {
      const port = parseInt(opts.port, 10)

      const server = http.createServer(async (req, res) => {
        // CORS preflight
        if (req.method === 'OPTIONS') {
          res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST',
            'Access-Control-Allow-Headers': 'Content-Type',
          })
          res.end()
          return
        }

        if (req.method === 'POST' && req.url === '/api/log') {
          let body = ''
          for await (const chunk of req) {
            body += chunk
            if (body.length > 100_000) { req.destroy(); return }
          }
          try {
            const entries = JSON.parse(body)
            for (const entry of Array.isArray(entries) ? entries : [entries]) {
              const level = (entry.level ?? 'INFO').toUpperCase()
              const cat = entry.category ?? ''
              const msg = entry.message ?? ''
              const time = entry.timestamp
                ? new Date(entry.timestamp).toLocaleTimeString('en-US', { hour12: false, fractionalSecondDigits: 3 })
                : new Date().toLocaleTimeString('en-US', { hour12: false, fractionalSecondDigits: 3 })

              const levelColor = level === 'ERROR' ? pc.red(level)
                : level === 'WARN' ? pc.yellow(level)
                : pc.blue(level)
              console.log(`${pc.dim(time)} ${levelColor} ${pc.dim(`[${cat}]`)} ${msg}`)
            }
          } catch {
            // Ignore malformed payloads
          }
          res.writeHead(200, { 'Access-Control-Allow-Origin': '*' })
          res.end('ok')
          return
        }

        res.writeHead(404)
        res.end()
      })

      server.listen(port, '0.0.0.0', () => {
        console.log('')
        console.log(`  ${log.bold('Glyph Logcat')}`)
        console.log(`  Listening on port ${pc.cyan(String(port))}`)
        console.log('')
        console.log(`  ${log.dim('The app sends logs here when connected to a dev server.')}`)
        console.log(`  ${log.dim('Press Ctrl+C to stop.')}`)
        console.log('')
      })
    })
}
