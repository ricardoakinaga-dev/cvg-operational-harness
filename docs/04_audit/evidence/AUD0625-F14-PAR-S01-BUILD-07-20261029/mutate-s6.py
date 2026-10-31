#!/usr/bin/env python3
"""Mutation check for PAR-S01 slice 6 (witnesses in distinct processes). Commit first; each mutant is reverted by git checkout."""
import json, os, re, subprocess, sys
SRC = 'packages/persistence/src/session-persistence.ts'
SQL = 'packages/persistence/migrations/0034_session_writer_ownership.sql'
TESTS = ['tests/par-s01-session-processes-postgres.test.ts']
# A survivor of the process witnesses may be a property owned by an earlier slice; it is re-run there.
EARLIER = ['packages/persistence/src/__tests__/par-s01-session-ownership-postgres.test.ts', 'packages/persistence/src/__tests__/par-s01-session-writer-postgres.test.ts', 'packages/persistence/src/__tests__/par-s01-session-adapter-postgres.test.ts']
LOCK = "'SELECT pg_try_advisory_lock($1,$2) AS ok'"
M = [
 ('create-lock-fake', SRC, LOCK, "'SELECT true AS ok'", 'first'),
 ('open-lock-fake', SRC, LOCK, "'SELECT true AS ok'", 'last'),
 ('lost-not-recorded-onlost', SRC, "      this.#lost ??= error\n    })", "      void error\n    })", 'first'),
 ('lost-not-recorded-lose', SRC, "this.#lost ??= cause instanceof Error ? cause : new Error('Session lost')", "void cause", 'first'),
 ('unlock-fake', SRC, "'SELECT pg_advisory_unlock($1,$2) AS ok'", "'SELECT true AS ok'", 'first'),
 ('flush-noop', SRC, "UPDATE ${schema}.session_streams SET next_sequence=next_sequence WHERE tenant_id=$1 AND session_id=$2", "SELECT 1 WHERE $1::text IS NOT NULL AND $2::text IS NOT NULL", 'first'),
 ('guard-off', SQL, "IF NOT pg_try_advisory_xact_lock((to_regclass('session_streams')::oid::bigint - 2147483648)::integer, lock_id) THEN", "IF false THEN", 'first'),
 ('guard-wrong-key', SQL, "2147483648)::integer, lock_id) THEN", "2147483648)::integer, lock_id + 1) THEN", 'first'),
 ('per-event-commit', SRC, "        next++\n      }\n      return next - 1", "        next++\n        await lease.query('COMMIT')\n        await lease.query('BEGIN')\n        await lease.query(\"SET LOCAL statement_timeout = '5s'\")\n        await lease.query(\"SET LOCAL lock_timeout = '5s'\")\n        await lease.query('SET LOCAL synchronous_commit = on')\n        await lease.query(\"SELECT set_config('cvg.tenant_id', $1, true)\", [tenant])\n      }\n      return next - 1", 'first'),
 ('guard-cursor-off', SQL, "IF NEW.sequence IS DISTINCT FROM expected THEN", "IF false THEN", 'first'),
]
JUSTIFIED = {}
norm = lambda x: re.sub(r'\s+', ' ', x)
res = []
ONLY = sys.argv[1:]
for name, F, a, b, which in M:
    if ONLY and name not in ONLY: continue
    src = open(F).read()
    if which == 'last' and a in src:
        i = src.rindex(a); mutated = src[:i] + b + src[i + len(a):]
    elif a in src:
        mutated = src.replace(a, b, 1)
    else:
        pat = re.escape(norm(a)).replace(r'\ ', r'\s*')
        m = re.search(pat, src)
        if not m:
            res.append({'mutant': name, 'result': 'NOT_APPLIED'}); continue
        mutated = src[:m.start()] + b + src[m.end():]
    open(F, 'w').write(mutated)
    r = subprocess.run(['npx','vitest','run',*TESTS,'--maxWorkers=1','--testTimeout=60000'],capture_output=True,text=True,env=dict(os.environ))
    subprocess.run(['git','checkout','--',F])
    result = 'KILLED' if r.returncode != 0 else 'SURVIVED'
    if result == 'SURVIVED':
        open(F, 'w').write(mutated)
        r2 = subprocess.run(['npx','vitest','run',*EARLIER,'--maxWorkers=1','--testTimeout=60000'],capture_output=True,text=True,env=dict(os.environ))
        subprocess.run(['git','checkout','--',F])
        if r2.returncode != 0: result = 'KILLED_BY_EARLIER_SLICE'
    res.append({'mutant': name, 'result': result})
for r_ in res:
    if r_['result'] == 'SURVIVED' and r_['mutant'] in JUSTIFIED:
        r_['result'] = 'EQUIVALENT'; r_['justification'] = JUSTIFIED[r_['mutant']]
print(json.dumps(res, indent=1))
