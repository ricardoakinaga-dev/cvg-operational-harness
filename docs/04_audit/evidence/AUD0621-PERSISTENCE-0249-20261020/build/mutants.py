import json, os, shutil, subprocess, sys, time
C = '/mnt/dados/cvg-work/cvg-aud0621-persistence0249-20261020'
OUT = sys.argv[1]
env = dict(os.environ)
env['PATH'] = '/home/ricardo/.nvm/versions/node/v22.23.2/bin:' + env['PATH']
env['NO_UPDATE_NOTIFIER'] = '1'
env['TEST_DATABASE_URL'] = 'postgresql://postgres:postgres@127.0.0.1:56267/cvg_p0249'
M = [
 ('M1', 'packages/persistence/src/effect-journal-postgres.ts',
  [("""         WHERE state = 'RESERVED'
           AND tenant_id = NULLIF(current_setting('cvg.tenant_id', true), '')""", """         WHERE state = 'RESERVED'"""),
   ("""         WHERE state = 'EFFECT_STARTED'
           AND tenant_id = NULLIF(current_setting('cvg.tenant_id', true), '')""", """         WHERE state = 'EFFECT_STARTED'""")],
  'apps/worker/src/__tests__/postgres-role-preflight.test.ts', 'sweep stays inside the tenant'),
 ('M2', 'packages/persistence/src/postgres-outbox.ts',
  [("""    !row.newer &&
    (outcome === 'open' ? row.outcome === null : row.outcome === 'processed')""", """    (outcome === 'open' || row.outcome === 'processed')""")],
  'packages/persistence/src/__tests__/outbox-durability.test.ts', 'AC0[35]'),
 ('M3', 'packages/persistence/src/postgres-outbox.ts',
  [("""SET lease_until = GREATEST(lease_until, $3::timestamptz)""", """SET lease_until = lease_until + ($3::timestamptz - $3::timestamptz)""")],
  'packages/persistence/src/__tests__/outbox-durability.test.ts', 'AC07'),
 ('M3w', 'packages/persistence/src/postgres-outbox.ts',
  [("""SET lease_until = GREATEST(lease_until, $3::timestamptz)""", """SET lease_until = lease_until + ($3::timestamptz - $3::timestamptz)""")],
  'apps/worker/src/__tests__/continuous-worker-postgres.integration.test.ts', 'AC08'),
 ('M4', 'packages/persistence/src/postgres-outbox.ts',
  [("""        row.attempts >= OUTBOX_MAX_ATTEMPTS
      ) {
        await deadLetterExhaustedOutbox(""", """        row.attempts >= OUTBOX_MAX_ATTEMPTS * 1000
      ) {
        await deadLetterExhaustedOutbox(""")],
  'packages/persistence/src/__tests__/outbox-durability.test.ts', 'AC09'),
 ('M5', 'packages/persistence/src/operational-execution-postgres.ts',
  [("""          if (row.attempt >= this.maxAttempts) {
            await this.terminateExhaustedRecovery(""", """          if (row.attempt >= this.maxAttempts * 1000) {
            await this.terminateExhaustedRecovery(""")],
  'packages/persistence/src/__tests__/operational-execution-postgres.test.ts', 'AC10'),
 ('M6', 'apps/worker/src/kernel-composition.ts',
  [("""    insert: (ledgerId, records) =>
      withTenantTransaction(pool, tenantId, async (client) => {""", """    insert: (ledgerId, records) =>
      withTenantContext(pool, tenantId, async (client) => {""")],
  'apps/worker/src/__tests__/kernel-composition-postgres.integration.test.ts', 'AC12'),
 ('M7', 'scripts/production-stack-smoke.ts',
  [("""    const at = Date.parse(value)
    return Number.isFinite(at) && at >= options.stoppedAt""", """    return Number.isFinite(Date.parse(value))""")],
  'tests/production-stack-alert-oracle.test.ts', 'known negative|rejects deliveries'),
 ('M8', 'apps/worker/src/postgres-role-preflight.ts',
  [("""export const WORKER_CRITICAL_TABLES: readonly string[] = TENANT_SCHEMA_TABLES""", """export const WORKER_CRITICAL_TABLES: readonly string[] =
  TENANT_SCHEMA_TABLES.filter((table) => table !== 'effect_journal')""")],
  'apps/worker/src/__tests__/postgres-role-preflight.test.ts', 'worker preflight refuses an effect journal'),
 ('M9', 'apps/worker/src/kernel-composition.ts',
  [("""      await assertTenantIsolatedTables(client, KERNEL_DURABLE_TABLES)""", """      void assertTenantIsolatedTables""")],
  'apps/worker/src/__tests__/postgres-role-preflight.test.ts', 'kernel prerequisites refuse'),
 ('M10', 'packages/persistence/src/outbox.ts',
  [("""        Math.max(0, candidate.attempts ?? 0) >= this.maxAttempts
      ) {""", """        Math.max(0, candidate.attempts ?? 0) >= this.maxAttempts * 1000
      ) {""")],
  'packages/persistence/src/__tests__/outbox-claim-fence-memory.test.ts', 'AC11'),
 ('M11', 'apps/worker/src/jobs/process-outbox-event.ts',
  [("""  return event.claimToken !== undefined ? { claimToken: event.claimToken } : {}""", """  return event.claimToken !== undefined ? {} : {}""")],
  'apps/worker/src/__tests__/continuous-worker-fencing.test.ts', 'shutdown|stale run'),
 ('M12', 'apps/worker/src/kernel-composition.ts',
  [("""      cursor.persisted = through
      cursor.uncertain = false""", """      cursor.uncertain = false""")],
  'apps/worker/src/__tests__/kernel-audit-trail.test.ts', 'ambiguous commit'),
]
results = []
SKIP = set(os.environ.get('SKIP_MUTANTS','').split(','))
for name, path, edits, test, pattern in M:
    if name in SKIP:
        continue
    full = os.path.join(C, path)
    backup = full + '.p0249bak'
    shutil.copyfile(full, backup)
    try:
        s = open(full, encoding='utf-8').read()
        for old, new in edits:
            assert s.count(old) == 1, (name, old[:60], s.count(old))
            s = s.replace(old, new)
        open(full, 'w', encoding='utf-8').write(s)
        t0 = time.time()
        r = subprocess.run(['npx', 'vitest', 'run', '--testTimeout=60000', test, '-t', pattern],
                           cwd=C, env=env, capture_output=True, text=True, timeout=900)
        tail = [l for l in (r.stdout + r.stderr).splitlines() if 'Tests ' in l]
        results.append({'mutant': name, 'file': path, 'test': test, 'filter': pattern,
                        'exit': r.returncode, 'killed': r.returncode != 0,
                        'summary': tail[-1].strip() if tail else None,
                        'seconds': round(time.time() - t0, 1)})
    finally:
        shutil.move(backup, full)
    print(json.dumps(results[-1]), flush=True)
json.dump(results, open(OUT, 'w'), indent=2)
