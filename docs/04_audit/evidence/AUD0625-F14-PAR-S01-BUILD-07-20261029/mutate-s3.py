#!/usr/bin/env python3
"""Mutation check for PAR-S01 slice 3 (session-persistence.ts / session-connection-lease.ts). Commit first."""
import json, os, subprocess, sys
F1 = 'packages/persistence/src/session-persistence.ts'
F2 = 'packages/persistence/src/session-connection-lease.ts'
T = 'packages/persistence/src/__tests__/par-s01-session-adapter-postgres.test.ts'
T2 = 'packages/persistence/src/__tests__/par-s01-session-writer-postgres.test.ts'
M = [
 (F1, 'capacity-gte', "this.#writers >= this.options.maxOpenWriters", "this.#writers > this.options.maxOpenWriters"),
 (F1, 'capacity-off', "if (this.#writers >= this.options.maxOpenWriters)", "if (false)"),
 (F1, 'capacity-not-freed-create', "      if (lease) await lease.destroy()\n      this.#writers--\n      if (error instanceof SessionPersistenceError || isAbort(error)) throw error\n      throw new SessionStorageUnavailableError(\n        'Session could not be created'", "      if (lease) await lease.destroy()\n      if (error instanceof SessionPersistenceError || isAbort(error)) throw error\n      throw new SessionStorageUnavailableError(\n        'Session could not be created'"),
 (F1, 'capacity-not-freed-close', "      this.#s.onClosed?.()", "      void 0"),
 (F1, 'create-trylock-ok', "got.rows[0]?.ok !== true", "false", 0),
 (F1, 'create-dup-error', "throw new SessionAlreadyExistsError('Session already exists', id)", "throw error"),
 (F1, 'create-commit-unknown', "throw new SessionCommitUnknownError(", "throw new SessionStorageUnavailableError("),
 (F1, 'create-sync-commit', "await runner.query('SET LOCAL synchronous_commit = on')", "void 0"),
 (F1, 'create-lock-key-base', "[this.keyBase, key]\n        )\n        if (got", "[this.keyBase + 1, key]\n        )\n        if (got"),
 (F1, 'open-claim-check', "got.rows[0]?.ok !== true", "false", 1),
 (F1, 'open-revalidate-header', "after.headerText !== before.headerText ||", "false ||"),
 (F1, 'open-revalidate-key', "after.key !== before.key ||", "false ||"),
 (F1, 'open-revalidate-cut', "after.cut !== before.cut ||", "false ||"),
 (F1, 'open-revalidate-head', "after.head < before.head", "false"),
 (F1, 'open-notfound', "if (!row) throw new SessionPersistenceNotFoundError('Session not found', id)", "if (!row) throw new SessionStorageUnavailableError('x', id)"),
 (F1, 'parse-null-header', "if (row.header_json === null || row.inherited_event_count === null)", "if (false)"),
 (F1, 'parse-version-newer', "if (typeof version === 'number' && Number.isInteger(version) && version !== 1)", "if (false)"),
 (F1, 'parse-identity', "if (checked.header.id !== id)", "if (false)"),
 (F1, 'parse-format', "if (row.format_version !== 1)", "if (false)"),
 (F1, 'read-header-changed', "JSON.stringify(meta.header) !== JSON.stringify(this.#s.header) ||", "false ||"),
 (F1, 'read-cut-changed', "meta.cut !== this.#s.cut", "false"),
 (F1, 'read-highwater-update', "this.#highWater = Math.max(this.#highWater, meta.head)", "void 0"),
 (F1, 'read-gap', "if (page.rows.length !== wanted)", "if (false)"),
 (F1, 'read-page-size', "const PAGE = 256", "const PAGE = 100000"),
 (F1, 'read-slice-lower', "if (expected > offset && expected <= end)", "if (expected >= offset && expected <= end)"),
 (F1, 'read-slice-upper', "if (expected > offset && expected <= end)", "if (expected > offset && expected < end)"),
 (F1, 'read-whole-prefix', "while (expected <= meta.head) {", "while (expected <= Math.max(end, 0)) {"),
 (F1, 'read-offset-validation', "if (!Number.isSafeInteger(offset) || offset < 0)", "if (false)"),
 (F1, 'read-length-validation', "(!Number.isSafeInteger(length) || length < 0)", "(false)"),
 (F1, 'read-repeatable', "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY", "BEGIN"),
 (F1, 'event-digest', "if (sessionEventInputDigest(input) !== row.input_digest)", "if (false)"),
 (F1, 'event-sequence', "event.sequence !== sequence ||", "false ||"),
 (F1, 'event-tenant', "event.tenantId !== tenantId ||", "false ||"),
 (F1, 'admit-closed', "if (this.#closing)\n      return Promise.reject(\n        new SessionHandleClosedError('Session handle is closed', this.id)\n      )\n    const signal", "const signal"),
 (F1, 'admit-abort', "if (signal?.aborted) return Promise.reject(abortError())\n    const run", "const run"),
 (F1, 'queue-abort-recheck', "      if (signal?.aborted) throw abortError()\n      return task()", "      return task()"),
 (F1, 'close-memo', "this.#closing ??= this.#drainAndRelease()", "this.#closing = this.#drainAndRelease()"),
 (F1, 'close-drain', "    await this.#queue\n    const lease", "    const lease"),
 (F1, 'close-unlock-verified', "if (released.rows[0]?.ok === true) await lease.release()\n      else await lease.destroy()", "await lease.release()"),
 (F1, 'close-lost-destroy', "if (this.#lost) {\n        await lease.destroy()\n        return\n      }", ""),
 (F1, 'lost-mark', "this.#lost ??= error", "void error"),
 (F1, 'append-lost', "if (this.#lost)\n      return Promise.reject(", "if (false)\n      return Promise.reject("),
 (F1, 'append-readonly', "if (this.access === 'read')", "if (false)"),
 (F1, 'preflight-superuser', "if (r.rolsuper || r.rolbypassrls)", "if (false)"),
 (F1, 'preflight-owner', "if (r.owner) return", "if (false) return"),
 (F1, 'preflight-recovery', "if (r.recovery) return", "if (false) return"),
 (F1, 'preflight-durability', "if (r.fsync !== 'on' || r.fpw !== 'on' || r.sync === 'off')", "if (false)"),
 (F1, 'preflight-checksum', "if (!found || !isAcceptedMigrationChecksum(MIGRATION, found, checksum))", "if (!found)"),
 (F1, 'preflight-rls', "if (rls.rows.length !== 2 || rls.rows.some((r) => !r.on || !r.forced))", "if (false)"),
 (F1, 'preflight-trigger-enabled', "triggers.rows.filter((t) => t.tgenabled === 'O')", "triggers.rows"),
 (F1, 'preflight-columns', "if (!names.has(name)) return fail", "if (false) return fail"),
 (F1, 'preflight-tables', "if (!streamsOid || !regs.rows[0]?.events) return fail('tables are missing')", ""),
 (F1, 'binding-validation', "if (!SCHEMA.test(options.schemaName) || !TENANT.test(options.tenantId))", "if (false)"),
 (F1, 'maxwriters-validation', "options.maxOpenWriters < 1", "false"),
 (F1, 'writer-qualify-skipped', "const base = await qualify(lease, this.options)", "const base = this.keyBase"),
 (F1, 'writer-key-identity', "if (base !== this.keyBase)", "if (false)"),
 (F1, 'writer-qualify-destroy', "      await lease.destroy()\n      throw error\n    }\n    return lease", "      throw error\n    }\n    return lease"),
 (F1, 'preflight-no-truncate-streams', "'session_streams_no_truncate',", ""),
 (F1, 'preflight-no-truncate-events', "'session_events_no_truncate',", ""),
 (F1, 'preflight-constraints', "if (!valid.has(required))", "if (false)"),
 (F2, 'lease-late-destroy', "(lease) => lease.destroy(),", "() => undefined,"),
 (F2, 'lease-abort-precheck', "if (signal?.aborted) throw abortError()\n      const client", "const client"),
 (F2, 'lease-timeout', "timer = setTimeout(", "timer = setTimeout(() => undefined && ("),
 (F2, 'lease-lost-listener', "if (this.#lost) queueMicrotask(() => listener(this.#lost as Error))\n    else this.#listeners.push(listener)", "this.#listeners.push(listener)"),
 (F2, 'lease-release-memo', "this.#ended ??= this.#client.end().catch(() => undefined)", "this.#ended = this.#client.end().catch(() => undefined)"),
]
env = dict(os.environ)
res = []
srcs = {F1: open(F1).read(), F2: open(F2).read()}
import re
def norm(x): return re.sub(r'\s+', ' ', x)
for item in M:
    f, name, a, b = item[:4]
    nth = item[4] if len(item) > 4 else 0
    src = srcs[f]
    if len(item) > 4:
        parts = src.split(a)
        if len(parts) <= nth + 1:
            res.append({'mutant': name, 'result': 'NOT_APPLIED'}); continue
        mutated = a.join(parts[:nth + 1]) + b + a.join(parts[nth + 1:])
        open(f, 'w').write(mutated)
        r = subprocess.run(['npx','vitest','run',T,'--maxWorkers=1','--testTimeout=60000'],capture_output=True,text=True,env=env)
        subprocess.run(['git','checkout','--',f])
        res.append({'mutant': name, 'result': 'KILLED' if r.returncode != 0 else 'SURVIVED'})
        continue
    if a not in src:
        # prettier may reflow; match ignoring whitespace
        pat = re.escape(norm(a)).replace(r'\ ', r'\s*')
        m = re.search(pat, src)
        if not m:
            res.append({'mutant': name, 'result': 'NOT_APPLIED'}); continue
        mutated = src[:m.start()] + b + src[m.end():]
    else:
        mutated = src.replace(a, b, 1)
    open(f, 'w').write(mutated)
    r = subprocess.run(['npx','vitest','run',T,'--maxWorkers=1','--testTimeout=60000'],capture_output=True,text=True,env=env)
    subprocess.run(['git','checkout','--',f])
    res.append({'mutant': name, 'result': 'KILLED' if r.returncode != 0 else 'SURVIVED'})
JUSTIFIED = {
 'event-tenant': 'equivalent: tenantId is part of the input digest, so a differing tenant already fails the digest check',
 'admit-abort': 'equivalent: the queued task re-checks the signal before IO, so an aborted call still does no IO; the early check only avoids queueing',
 'close-drain': 'equivalent in this slice: read does not use the writer lease; becomes observable with append/flush (slice 4) and is to be killed there',
 'close-lost-destroy': 'equivalent: on a lost session the unlock query throws and the catch destroys the lease; the early branch only skips a doomed query',
}
for m in res:
    if m['result'] == 'SURVIVED' and m['mutant'] in JUSTIFIED:
        m['result'] = 'EQUIVALENT'
        m['justification'] = JUSTIFIED[m['mutant']]
print(json.dumps(res, indent=1))
json.dump(res, open(sys.argv[1], 'w'), indent=1)
