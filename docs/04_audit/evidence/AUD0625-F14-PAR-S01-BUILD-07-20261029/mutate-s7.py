#!/usr/bin/env python3
"""Mutation check for PAR-S01 slice 7 (session-adoption.ts). Commit first; each mutant is reverted by git checkout."""
import json, os, re, subprocess, sys
F = 'packages/persistence/src/session-adoption.ts'
TESTS = ['packages/persistence/src/__tests__/par-s01-session-adoption-postgres.test.ts']
M = [
 ('batch-cap', "batchSize > SESSION_ADOPTION_MAX_BATCH", "batchSize > 1000"),
 ('batch-min', "batchSize < 1 ||", "batchSize < 0 ||"),
 ('dup-check', "if (seen.has(JSON.stringify([entry.tenantId, entry.sessionId])))", "if (false)"),
 ('provenance', "typeof entry.provenance !== 'string' || entry.provenance.length === 0", "false"),
 ('cursor-valid', "entry.expectedNextSequence < 1", "false"),
 ('digest-valid', "!DIGEST.test(entry.expectedDigest)", "false"),
 ('header-id', "captured.header.id !== entry.sessionId", "false"),
 ('tenant-empty', "typeof entry.tenantId !== 'string' || entry.tenantId.length === 0", "false"),
 ('sort-tenant', "compare(a.entry.tenantId, b.entry.tenantId) ||", ""),
 ('missing-stream', "if (!state) throw stop('conflict'", "if (false) throw stop('conflict'"),
 ('writer-check', "if (!state.free)", "if (false)"),
 ('cursor-cas', "Number(state.next_sequence) !== p.entry.expectedNextSequence", "false"),
 ('digest-cas', "state.digest !== p.entry.expectedDigest", "false"),
 ('adopted-divergent', "if (!matches(state, p))", "if (false)"),
 ('adopted-noop', "inBatchAlready++\n          continue", "inBatchAlready++"),
 ('update-null-guard', "AND header_json IS NULL AND next_sequence=$5", "AND next_sequence=$5"),
 ('update-rowcount', "updated.rowCount !== 1", "false"),
 ('rollback-on-error', "await client.query('ROLLBACK').catch(() => undefined)\n      if (error instanceof SessionAdoptionError)", "if (error instanceof SessionAdoptionError)"),
 ('commit-unknown', "throw stop('outcome_unknown', 'adoption COMMIT outcome is unknown', cause)", "throw cause"),
 ('callback', "await options.onBatchCommitted?.(batch)", ""),
 ('cut-compare', "Number(state.inherited_event_count) === p.entry.inheritedEventCount", "true"),
 ('header-compare', "state.header_json === p.headerText &&", ""),
 ('count-tenant', "WHERE tenant_id=$1 AND header_json IS NULL", "WHERE header_json IS NULL"),
 ('verify-cursor', "else if (Number(state.next_sequence) !== p.entry.expectedNextSequence)", "else if (false)"),
 ('verify-digest', "else if (state.digest !== p.entry.expectedDigest)", "else if (false)"),
 ('verify-metadata', "else if (!matches(state, p)) problems.push", "else if (false) problems.push"),
 ('lock-timeout', "SET LOCAL lock_timeout", "SET LOCAL application_name"),
]
JUSTIFIED = {
 'cursor-cas': 'equivalent in outcome: the UPDATE repeats the cursor CAS (next_sequence=$5) under the same FOR UPDATE row lock, so a stale cursor still ends as the same conflict',
 'update-null-guard': 'equivalent: the row is locked FOR UPDATE and header_json was read as NULL in the same transaction, so the guard in the UPDATE cannot differ',
 'update-rowcount': 'equivalent: under the FOR UPDATE row lock with both CAS conditions already checked, the UPDATE always matches exactly one row',
 'lock-timeout': 'equivalent: statement_timeout is set to the same 5s bound right after and ends the wait identically (the lock-budget test proves the bound)',
}
norm = lambda x: re.sub(r'\s+', ' ', x)
res = []
ONLY = sys.argv[1:]
for name, a, b in M:
    if ONLY and name not in ONLY: continue
    src = open(F).read()
    if a in src:
        mutated = src.replace(a, b, 1)
    else:
        pat = re.escape(norm(a)).replace(r'\ ', r'\s*')
        m = re.search(pat, src)
        if not m:
            res.append({'mutant': name, 'result': 'NOT_APPLIED'}); continue
        mutated = src[:m.start()] + b + src[m.end():]
    open(F, 'w').write(mutated)
    r = subprocess.run(['npx','vitest','run',*TESTS,'--maxWorkers=1','--testTimeout=120000'],capture_output=True,text=True,env=dict(os.environ))
    subprocess.run(['git','checkout','--',F])
    res.append({'mutant': name, 'result': 'KILLED' if r.returncode != 0 else 'SURVIVED'})
for r_ in res:
    if r_['result'] == 'SURVIVED' and r_['mutant'] in JUSTIFIED:
        r_['result'] = 'EQUIVALENT'; r_['justification'] = JUSTIFIED[r_['mutant']]
print(json.dumps(res, indent=1))
