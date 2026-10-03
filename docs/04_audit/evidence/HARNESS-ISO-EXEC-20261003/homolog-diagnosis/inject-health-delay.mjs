import { createRequire } from 'node:module'
import { appendFileSync } from 'node:fs'
// Diagnostic fault injection only: one delayed queue probe after startup preflight.
if (process.env.HOMOLOG_DIAG_INJECT === '1' && process.env.CVG_WORKER_RUNTIME === 'operational-harness-homolog') {
  const url = new URL(process.env.DATABASE_URL)
  if (url.hostname !== '127.0.0.1' || url.port !== '55594' || url.pathname !== '/hiso') throw new Error('Diagnostic refused non-owned database')
  const require = createRequire('/tmp/cvg-harness-iso-exec-20261003/snapshot/package.json')
  const { Client } = require('pg')
  const query = Client.prototype.query
  let probes = 0
  Client.prototype.query = function (...args) {
    const sql = typeof args[0] === 'string' ? args[0] : args[0]?.text
    if (sql?.includes('SELECT COUNT(*) AS pending') && sql.includes('operational_execution_outbox')) {
      probes++
      if (probes === 2) {
        appendFileSync(process.env.HOMOLOG_DIAG_CAPTURE + '.injection.jsonl', JSON.stringify({ at: new Date().toISOString(), kind: 'synthetic_queue_probe_delay', probe: probes, delayMs: 50, schema: process.env.POSTGRES_SCHEMA, pid: process.pid })+'\n')
        return new Promise(resolve => setTimeout(resolve, 50)).then(() => query.apply(this, args))
      }
    }
    return query.apply(this, args)
  }
}
