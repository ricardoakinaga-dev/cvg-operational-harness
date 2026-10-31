#!/usr/bin/env python3
"""Mutation check for PAR-S01 slice 1 (commit first; each mutant is reverted with git checkout)."""
import json, subprocess, sys
F = 'packages/harness/src/session/persistence.ts'
T = 'packages/harness/src/__tests__/par-s01-session-header.test.ts'
M = [
 ('version-check', "if (h.version !== 1) bad('version must be 1')", ""),
 ('id-length', "if (id.length > SESSION_ID_MAX) bad('id is too long')", ""),
 ('negzero-number', "if (!Number.isFinite(value) || Object.is(value, -0))", "if (!Number.isFinite(value))"),
 ('uint-negzero', "||\n    Object.is(value, -0)\n  )", "\n  )"),
 ('cycle-guard', "if (seen.has(value)) bad('cycle or alias')", ""),
 ('seen-delete', "seen.delete(value)", "void 0"),
 ('symbol-key', "if (Object.getOwnPropertySymbols(value).length) bad('symbol key')", ""),
 ('nonenum', "bad('non-enumerable key')", "void 0"),
 ('sparse', "bad('sparse array or extra array key')", "void 0"),
 ('proto', "if (proto !== Object.prototype && proto !== null) bad('exotic prototype')", ""),
 ('depth', "depth > MAX_DEPTH", "false"),
 ('nodes', "++nodes > MAX_NODES", "false"),
 ('bytes', "> SESSION_HEADER_MAX_BYTES", "> SESSION_HEADER_MAX_BYTES * 100"),
 ('seeded-needs-cut', "if (cut === undefined) bad('a seeded session needs an explicit cut')", ""),
 ('unseeded-cut', "else if (inherited !== 0) bad('an unseeded session only accepts cut 0')", ""),
 ('cwd-abs', "bad('cwd must be absolute')", "void 0"),
 ('origin', "bad('origin must be subagent')", "void 0"),
 ('depth-uint', "uint(h.delegationDepth, 'delegationDepth')", "void 0"),
 ('isSeeded-bool', "bad('isSeeded must be a boolean')", "void 0"),
 ('detached', "const out: Record<string, SessionJson> = Object.create(null) as Record<\n        string,\n        SessionJson\n      >", "const out = value as Record<string, SessionJson>"),
]
src = open(F).read()
res = []
for name, a, b in M:
    if a not in src:
        res.append({'mutant': name, 'result': 'NOT_APPLIED'}); continue
    open(F, 'w').write(src.replace(a, b, 1))
    r = subprocess.run(['npx','vitest','run',T,'--maxWorkers=2'],capture_output=True,text=True)
    subprocess.run(['git','checkout','--',F])
    res.append({'mutant': name, 'result': 'KILLED' if r.returncode != 0 else 'SURVIVED'})
print(json.dumps(res, indent=1))
json.dump(res, open(sys.argv[1], 'w'), indent=1)
