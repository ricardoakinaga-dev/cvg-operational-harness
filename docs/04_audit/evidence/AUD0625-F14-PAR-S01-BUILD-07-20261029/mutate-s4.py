#!/usr/bin/env python3
"""Mutation check for PAR-S01 slice 4 (append / flush / close / loss). Commit first; each mutant is reverted by git checkout."""
import json, os, re, subprocess, sys
F = 'packages/persistence/src/session-persistence.ts'
TESTS = ['packages/persistence/src/__tests__/par-s01-session-writer-postgres.test.ts',
         'packages/persistence/src/__tests__/par-s01-session-adapter-postgres.test.ts']
M = [
 ('refuse-closed', "if (this.#closing)\n      return new SessionHandleClosedError('Session handle is closed', this.id)\n    if (this.access === 'read')", "if (this.access === 'read')"),
 ('refuse-readonly', "if (this.access === 'read')\n      return new SessionReadOnlyError", "if (false)\n      return new SessionReadOnlyError"),
 ('refuse-lost', "    if (this.#lost)\n      return new SessionOwnershipLostError(\n        'Session ownership was lost',\n        this.id,\n        { cause: this.#lost }\n      )\n    return undefined", "    return undefined"),
 ('empty-noop', "batch.events.length === 0 ? this.#assertActive() : this.#appendNow(batch)", "this.#appendNow(batch)"),
 ('capture-once', "const copy = captureSessionJson(raw, 'session event')", "const copy = raw"),
 ('envelope', "event.tenantId !== this.#s.options.tenantId ||\n        event.sessionId !== this.id", "false"),
 ('batch-size', "if (bytes > SESSION_BATCH_MAX_BYTES)", "if (false)"),
 ('batch-array', "if (!Array.isArray(events))", "if (false)"),
 ('seq-check', "if (event.sequence !== next)", "if (false)"),
 ('cursor-advance', "[tenant, this.id, next + 1]", "[tenant, this.id, next]"),
 ('next-increment', "        next++\n", ""),
 ('digest-input', "out.push({ event, digest: sessionEventInputDigest(input), text })", "out.push({ event, digest: 'a'.repeat(64), text })"),
 ('flush-update', "SET next_sequence=next_sequence WHERE tenant_id=$1 AND session_id=$2`,\n        [this.#s.options.tenantId, this.id]", "SET next_sequence=next_sequence WHERE false AND tenant_id=$1 AND session_id=$2`,\n        [this.#s.options.tenantId, this.id]"),
 ('flush-select', "`UPDATE ${schema}.session_streams SET next_sequence=next_sequence WHERE tenant_id=$1 AND session_id=$2`,\n        [this.#s.options.tenantId, this.id]", "`SELECT 1 WHERE $1::text IS NOT NULL AND $2::text IS NOT NULL`,\n        [this.#s.options.tenantId, this.id]"),
 ('sync-commit', "await lease.query('SET LOCAL synchronous_commit = on')\n      await lease.query(\"SELECT set_config('cvg.tenant_id', $1, true)\", [\n        this.#s.options.tenantId\n      ])\n      value", "await lease.query(\"SELECT set_config('cvg.tenant_id', $1, true)\", [\n        this.#s.options.tenantId\n      ])\n      value"),
 ('rollback-lose', "throw this.#lose(cause)\n      }\n      throw this.#classify(error)", "throw this.#classify(error)\n      }\n      throw this.#classify(error)"),
 ('commit-unknown-type', "this.#unknown = new SessionCommitUnknownError(", "this.#unknown = new SessionStorageUnavailableError("),
 ('commit-lose', "throw this.#lose(cause, this.#unknown)", "throw this.#unknown"),
 ('lose-destroy', "void this.#s.lease?.destroy()\n    return (", "return ("),
 ('lose-mark', "this.#lost ??= cause instanceof Error ? cause : new Error('Session lost')", "void cause"),
 ('classify-55P03', "code === '55P03' ||", ""),
 ('classify-08', "code.startsWith('08') ||", ""),
 ('classify-57', " || code.startsWith('57')", ""),
 ('classify-23', "if (code.startsWith('23'))", "if (false)"),
 ('classify-nocode', "typeof code !== 'string' ||", ""),
 ('classify-passthrough', "if (error instanceof SessionPersistenceError) return error\n    const code", "const code"),
 ('lost-precheck', "    if (refusal) throw refusal\n    let value: T", "    let value: T"),
 ('close-drain', "    await this.#queue\n    const lease = this.#s.lease", "    const lease = this.#s.lease"),
 ('close-flush', "          await this.#flushNow()\n        } catch (error) {\n          // A failed flush", "        } catch (error) {\n          // A failed flush"),
 ('close-flush-destroy', "          failure = error\n          await lease.destroy()", "          failure = error"),
 ('close-unknown', "failure ??= this.#unknown", "void 0"),
 ('close-throw', "if (failure) throw failure", "void failure"),
 ('qualify-timeout', "await lease.query(\"SET LOCAL statement_timeout = '5s'\")\n      const base", "const base"),
]
env = dict(os.environ)
src = open(F).read()
norm = lambda x: re.sub(r'\s+', ' ', x)
res = []
for name, a, b in M:
    if a in src:
        mutated = src.replace(a, b, 1)
    else:
        pat = re.escape(norm(a)).replace(r'\ ', r'\s*')
        m = re.search(pat, src)
        if not m:
            res.append({'mutant': name, 'result': 'NOT_APPLIED'}); continue
        mutated = src[:m.start()] + b + src[m.end():]
    open(F, 'w').write(mutated)
    r = subprocess.run(['npx','vitest','run',*TESTS,'--maxWorkers=1','--testTimeout=60000'],capture_output=True,text=True,env=env)
    subprocess.run(['git','checkout','--',F])
    res.append({'mutant': name, 'result': 'KILLED' if r.returncode != 0 else 'SURVIVED'})
print(json.dumps(res, indent=1))
json.dump(res, open(sys.argv[1], 'w'), indent=1)
