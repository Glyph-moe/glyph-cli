import pc from 'picocolors'

export function info(msg: string) {
  console.log(pc.cyan(msg))
}
export function success(msg: string) {
  console.log(pc.green(`  \u2713 ${msg}`))
}
export function warn(msg: string) {
  console.log(pc.yellow(`  \u26A0 ${msg}`))
}
export function error(msg: string) {
  console.error(pc.red(`  \u2717 ${msg}`))
}
export function dim(msg: string) {
  return pc.dim(msg)
}
export function bold(msg: string) {
  return pc.bold(msg)
}

export function clearScreen(header?: string) {
  process.stdout.write('\x1B[2J\x1B[3J\x1B[H')
  if (header) console.log(header)
}
