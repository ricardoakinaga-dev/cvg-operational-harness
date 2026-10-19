// Remove somente roles residuais criadas pela suíte nesta janela (nome + timestamp), sem CASCADE.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import pg from '/mnt/ia/cvg-claude100-journal0225-20261018/node_modules/pg/lib/index.js'
const admin = JSON.parse(readFileSync('/mnt/ia/cvg-claude100-journal0225-runtime-20261018/private/admin.json', 'utf8'))
const [from, to] = [Number(process.argv[2]), Number(process.argv[3])]
assert(from > 0 && to > from)
const client = new pg.Client({ ...admin, application_name: 'c100-j225-j16-residual-roles', connectionTimeoutMillis: 5000, statement_timeout: 30000 })
await client.connect()
const rows = (await client.query("SELECT rolname,rolcanlogin,(SELECT count(*)::int FROM pg_stat_activity WHERE usename=rolname) AS sessions FROM pg_roles WHERE rolname ~ '^cvg_(chan_role|eff_role|journeys_rls)_[0-9]{13}_[0-9a-f]{6}$' ORDER BY 1")).rows
const removed: string[] = []
for (const r of rows) {
  const ts = Number(r.rolname.match(/_([0-9]{13})_/)[1])
  assert(ts >= from && ts <= to, 'role outside own window: ' + r.rolname)
  assert.equal(r.sessions, 0)
  await client.query(`DROP ROLE ${r.rolname}`)
  removed.push(r.rolname)
}
const remaining = (await client.query("SELECT rolname FROM pg_roles WHERE rolname !~ '^pg_' AND rolname<>'c100_journal_owner' ORDER BY 1")).rows.map((r) => r.rolname)
await client.end()
console.log(JSON.stringify({ at: new Date().toISOString(), window: [from, to], removed, cascade: false, remaining, note: 'teardown original da suíte deixou estas roles; remoção manual não é sucesso do teardown' }))
