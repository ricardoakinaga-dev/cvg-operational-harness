#!/usr/bin/env python3
"""Mutation check for PAR-S01 slice 5 (sessionEventStoreForHandle). Commit first; each mutant is reverted by git checkout."""
import json, os, re, subprocess, sys
F = 'packages/persistence/src/session-persistence.ts'
TESTS = ['packages/persistence/src/__tests__/par-s01-session-bridge-postgres.test.ts']
M = [
 ('capability-missing', "if (!capability || !capability.active())", "if (!capability)"),
 ('capability-active', "if (!capability || !capability.active())", "if (false)"),
 ('capability-weakmap', "typeof handle === 'object' && handle !== null\n      ? writerCapabilities.get(handle)\n      : undefined", "(handle as never)"),
 ('capability-write-only', "if (state.access === 'write')\n      writerCapabilities.set", "if (true)\n      writerCapabilities.set"),
 ('active-closing', "active: () => !this.#closing && !this.#lost", "active: () => !this.#lost"),
 ('active-lost', "active: () => !this.#closing && !this.#lost", "active: () => !this.#closing"),
 ('bind-tenant', "if (tenantId !== this.#cap.tenantId)", "if (false)"),
 ('bind-session', "if (sessionId !== this.#cap.sessionId)", "if (false)"),
 ('bind-active', "    if (!this.#cap.active())\n      throw new SessionEventError(", "    if (false)\n      throw new SessionEventError("),
 ('open-validate', "const input = validateSessionStream(raw)\n    this.#bind", "const input = raw\n    this.#bind"),
 ('append-validate', "const input = validateSessionEventAppend(raw)\n    this.#bind", "const input = raw\n    this.#bind"),
 ('append-digest', "const digest = sessionEventInputDigest(input)\n    try {", "const digest = 'a'.repeat(64)\n    try {"),
 ('read-validate', "const input = validateSessionEventRead(raw)", "const input = { afterSequence: 0, limit: 100, ...raw } as never"),
 ('read-after', "this.#cap.read(input.afterSequence, input.limit)", "this.#cap.read(0, input.limit)"),
 ('read-limit', "this.#cap.read(input.afterSequence, input.limit)", "this.#cap.read(input.afterSequence, 100)"),
 ('error-map', "if (error instanceof SessionEventError) return error\n  const wrapped", "const wrapped"),
 ('error-code', "'session_storage_unavailable',\n    'Session storage is unavailable; retry only with the original event identity and input'\n  )\n  Object.defineProperty", "'session_not_open',\n    'x'\n  )\n  Object.defineProperty"),
 ('admit-queue', "this.#admit(undefined, () => this.#appendInputAtomic(input, digest))", "this.#appendInputAtomic(input, digest)"),
 ('atomic-notopen', "throw new SessionEventError('session_not_open', 'Session stream is not open')", "throw new SessionStorageUnavailableError('x', this.id)"),
 ('atomic-format', "if (row.format_version !== input.formatVersion)", "if (false)"),
 ('atomic-replay', "if (previous.input_digest !== digest)", "if (false)"),
 ('atomic-prior-return', "return checkEvent(previous, this.id, tenant, sequence)", "return materializeSessionEvent(input, Number(row.next_sequence))"),
 ('atomic-sequence', "const event = materializeSessionEvent(input, next)", "const event = materializeSessionEvent(input, next + 1)"),
 ('atomic-cursor', "[tenant, this.id, next + 1]\n      )\n      if (advanced.rowCount !== 1)\n        throw new SessionStorageUnavailableError('Session cursor was not advanced', this.id)\n      this.#highWater", "[tenant, this.id, next]\n      )\n      if (advanced.rowCount !== 1)\n        throw new SessionStorageUnavailableError('Session cursor was not advanced', this.id)\n      this.#highWater"),
 ('atomic-digest-stored', "          digest,\n          canonicalizeJson(event)\n        ]\n      )\n      const advanced", "          'b'.repeat(64),\n          canonicalizeJson(event)\n        ]\n      )\n      const advanced"),
 ('classify-eventerror', "error instanceof SessionPersistenceError || error instanceof SessionEventError", "error instanceof SessionPersistenceError"),
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
