import * as cp from 'node:child_process'
export const spawn = cp.spawn
export const execFileSync = cp.execFileSync
export function spawnSync(command, args, options) {
  const row = { command, args: [...args] }
  ;(globalThis.__cpLog ??= []).push(row)
  if (globalThis.__stopBeforeArchive && args.includes('archive')) {
    row.stopped = true
    throw Object.assign(new Error('PROBE_STOP_BEFORE_ARCHIVE'), { code: 'PROBE_STOP_BEFORE_ARCHIVE' })
  }
  const r = cp.spawnSync(command, args, options)
  row.status = r.status
  row.errorCode = r.error?.code ?? null
  if (args.includes('ls-tree')) row.stdout = r.stdout
  return r
}
export default cp
