import cp from 'node:child_process'
import { syncBuiltinESMExports } from 'node:module'
import { appendFileSync } from 'node:fs'
const originalSpawn = cp.spawn
cp.spawn = function (...args) {
  const child = originalSpawn.apply(this, args)
  if (Array.isArray(args[1]) && args[1].includes('apps/worker/src/main.ts')) {
    const base = process.env.HOMOLOG_DIAG_CAPTURE
    if (base) {
      const record = (item) => appendFileSync(`${base}.capture.jsonl`, JSON.stringify({ at: new Date().toISOString(), childPid: child.pid, ...item }) + '\n')
      record({ kind: 'spawn', command: args[0], args: args[1] })
      for (const stream of ['stdout', 'stderr']) child[stream]?.on('data', chunk => {
        appendFileSync(`${base}.worker-${stream}.log`, chunk)
        record({ kind: 'data', stream, text: String(chunk) })
      })
      const kill = child.kill
      child.kill = function(signal) { record({ kind: 'kill', signal }); return kill.call(this, signal) }
      child.once('close', (code, signal) => record({ kind: 'close', code, signal }))
    }
  }
  return child
}
syncBuiltinESMExports()
