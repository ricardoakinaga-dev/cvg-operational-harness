// Provisiona/inspeciona/remove o banco próprio c100_j225_qualification no recurso R2.
// Uso: node --experimental-strip-types j16-qualification-db.mts provision|inventory|cleanup
// Credencial lida do runtime privado; nunca impressa.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import pg from '/mnt/ia/cvg-claude100-journal0225-20261018/node_modules/pg/lib/index.js'
const T = '/mnt/ia/cvg-claude100-journal0225-runtime-20261018'
const live = JSON.parse(readFileSync('/home/ricardo/Área de trabalho/cvg-operational-harness/docs/04_audit/evidence/CLAUDE100-EXEC-20261017/journal0225-build/restart-r2-20261018/native-resource-r2-live.json', 'utf8'))
const admin = JSON.parse(readFileSync(T + '/private/admin.json', 'utf8'))
const database = 'c100_j225_qualification'
const mode = process.argv[2]
assert(['provision', 'inventory', 'cleanup'].includes(mode))
const client = new pg.Client({ ...admin, application_name: 'c100-j225-j16-' + mode, connectionTimeoutMillis: 5000, statement_timeout: 30000 })
await client.connect()
const q = async (sql: string, values: unknown[] = []) => (await client.query(sql, values)).rows
const out: Record<string, unknown> = { at: new Date().toISOString(), mode, resourceId: live.id, database, credentialInEvidence: false }
const baseRoles = ['c100_journal_owner']
const roles = async () => (await q("SELECT rolname FROM pg_roles WHERE rolname !~ '^pg_' ORDER BY 1")).map((r) => r.rolname).filter((r) => !baseRoles.includes(r))
if (mode === 'provision') {
  assert.equal((await q('SELECT count(*)::int AS c FROM pg_database WHERE datname=$1', [database]))[0].c, 0)
  out.initialRoles = await roles()
  await q(`CREATE DATABASE ${database} OWNER c100_journal_owner TEMPLATE template0`)
  out.created = true
  // DSN only to a private 0600 file consumed by the runner as redacted env.
  const dsn = `postgresql://${admin.user}:${admin.password}@127.0.0.1:55880/${database}`
  writeFileSync(T + '/private/j16-env.json', JSON.stringify({ TEST_DATABASE_URL: dsn }) + '\n', { mode: 0o600, flag: 'wx' })
} else if (mode === 'inventory') {
  out.databases = (await q("SELECT datname FROM pg_database WHERE NOT datistemplate ORDER BY 1")).map((r) => r.datname)
  out.roles = await roles()
  out.otherSessions = (await q("SELECT count(*)::int AS c FROM pg_stat_activity WHERE pid<>pg_backend_pid() AND backend_type='client backend'"))[0].c
} else {
  out.otherSessionsInDatabase = (await q('SELECT count(*)::int AS c FROM pg_stat_activity WHERE datname=$1', [database]))[0].c
  assert.equal(out.otherSessionsInDatabase, 0)
  if ((await q('SELECT count(*)::int AS c FROM pg_database WHERE datname=$1', [database]))[0].c === 1) {
    await q(`DROP DATABASE ${database}`)
    out.databaseRemoved = true
  }
  out.remainingRoles = await roles()
}
await client.end()
console.log(JSON.stringify(out))
