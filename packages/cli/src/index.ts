import { createRequire } from 'module'
import { Command } from 'commander'
import { GlyphError } from './utils/errors.js'
import * as log from './utils/log.js'
import { registerBuildCommand } from './commands/build.js'
import { registerValidateCommand } from './commands/validate.js'
import { registerDevCommand } from './commands/dev.js'
import { registerTestCommand } from './commands/test.js'
import { registerAddCommand } from './commands/add.js'
import { registerLogcatCommand } from './commands/logcat.js'

const require = createRequire(import.meta.url)
const pkg = require('../package.json')

const program = new Command()
  .name('glyph')
  .description('CLI for building and testing Glyph extensions')
  .version(pkg.version)
registerBuildCommand(program)
registerValidateCommand(program)
registerDevCommand(program)
registerTestCommand(program)
registerAddCommand(program)
registerLogcatCommand(program)

try {
  await program.parseAsync()
} catch (err) {
  if (err instanceof GlyphError) {
    log.error(err.message)
    if (err.hint) console.error(`  ${log.dim(err.hint)}`)
  } else {
    log.error(err instanceof Error ? err.message : String(err))
  }
  process.exit(1)
}
