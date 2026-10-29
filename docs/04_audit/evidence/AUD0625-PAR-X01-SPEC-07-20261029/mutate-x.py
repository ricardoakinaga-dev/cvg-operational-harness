#!/usr/bin/env python3
"""Mutation check for PAR-X01 BUILD slices. usage: mutate-x.py <slice> [mutant...]. Commit first; each mutant is reverted by git checkout."""
import json, os, re, subprocess, sys
D = 'packages/sandbox/src/process-service/'
SLICES = {
 's1': ('packages/sandbox/src/__tests__/par-x01-process-service-core.test.ts', [
  ('env-lowercase', D+'env.ts', "/^[A-Z_][A-Z0-9_]{0,63}$/", "/^[A-Za-z_][A-Za-z0-9_]{0,63}$/"),
  ('env-name-len', D+'env.ts', "{0,63}$/", "{0,640}$/"),
  ('env-owned-path', D+'env.ts', "  'PATH',\n", ""),
  ('env-owned-check', D+'env.ts', "PROFILE_OWNED.has(name) || FORBIDDEN.test(name))\n      throw new ProcessServiceError('invalid_env', 'env name is never", "false)\n      throw new ProcessServiceError('invalid_env', 'env name is never"),
  ('env-forbid-ld', D+'env.ts', "/^(LD_|", "/^("),
  ('env-forbid-node', D+'env.ts', "|NODE_|", "|"),
  ('env-forbid-proxy', D+'env.ts', "|_PROXY$|^PROXY$", ""),
  ('env-allowlist', D+'env.ts', "if (!allowed.has(name))", "if (false)"),
  ('env-nul', D+'env.ts', "typeof value !== 'string' || value.includes('\\0')", "typeof value !== 'string'"),
  ('env-value-bytes', D+'env.ts', "bytes > ENV_MAX_VALUE_BYTES ||", "false ||"),
  ('env-utf8', D+'env.ts', "Buffer.from(value, 'utf8').toString('utf8') !== value", "false"),
  ('env-total', D+'env.ts', "if (total > ENV_MAX_TOTAL_BYTES)", "if (false)"),
  ('env-count', D+'env.ts', "names.length > ENV_MAX_ENTRIES", "false"),
  ('env-proto', D+'env.ts', "proto !== Object.prototype && proto !== null", "false"),
  ('env-array', D+'env.ts', "env === null || typeof env !== 'object' || Array.isArray(env)", "false"),
  ('env-frozen', D+'env.ts', "return Object.freeze(out)", "return out"),
  ('env-allowlist-check', D+'env.ts', "if (!NAME.test(name) || PROFILE_OWNED.has(name) || FORBIDDEN.test(name))\n        throw new ProcessServiceError('invalid_env', 'allowlist", "if (false)\n        throw new ProcessServiceError('invalid_env', 'allowlist"),
  ('lim-cleanup-min', D+'limits.ts', "'cleanupMs', caps.cleanupMs, 100)", "'cleanupMs', caps.cleanupMs, 1)"),
  ('lim-cap', D+'limits.ts', "value > cap", "false"),
  ('lim-min', D+'limits.ts', "value < min ||", "false ||"),
  ('lim-int', D+'limits.ts', "!Number.isSafeInteger(value) ||", "false ||"),
  ('lim-grace', D+'limits.ts', "if (out.graceMs > out.cleanupMs)", "if (false)"),
  ('lim-frozen', D+'limits.ts', "return Object.freeze(out)", "return out"),
  ('lim-null', D+'limits.ts', "limits === null || typeof limits !== 'object'", "false"),
  ('st-oversize', D+'status.ts', "if (this.#bytes > STATUS_MAX_BYTES)", "if (false)"),
  ('st-nonobject', D+'status.ts', "this.#buffer[start] !== '{'", "false"),
  ('st-second-child', D+'status.ts', "|| this.#childPid !== undefined)", ")"),
  ('st-child-ns', D+'status.ts', "pid === undefined || ns === undefined", "pid === undefined"),
  ('st-exit-range', D+'status.ts', "code < 0 ||\n        code > 255 ||", ""),
  ('st-exit-int', D+'status.ts', "!Number.isInteger(code) ||", ""),
  ('st-exit-second', D+'status.ts', "|| this.#exitCode !== undefined\n      )", "\n      )"),
  ('st-string-aware', D+'status.ts', "else if (c === '\"') inString = true", "else if (false) inString = true"),
  ('st-invalid-sticky', D+'status.ts', "if (this.#invalid) return\n    this.#bytes", "this.#bytes"),
  ('st-array', D+'status.ts', "|| Array.isArray(doc)", ""),
  ('pf-lastparen', D+'procfs.ts', "stat.lastIndexOf(')')", "stat.indexOf(')')"),
  ('pf-exclude', D+'procfs.ts', "if (skip.has(pid)) continue", ""),
  ('pf-ns', D+'procfs.ts', "=== wanted)", "!== wanted)"),
  ('pf-enoent', D+'procfs.ts', "if (code === 'ENOENT' || code === 'ESRCH') continue", ""),
  ('pf-uid', D+'procfs.ts', "realUid(entry, procRoot) === uid ||", "true ||"),
  ('pf-nolist', D+'procfs.ts', "return { members: [], unverified: 1 }", "return { members: [], unverified: 0 }"),
  ('pf-numeric', D+'procfs.ts', "if (!NUMERIC.test(entry)) continue", ""),
  ('pf-start', D+'procfs.ts', "return readStartTime(pid, procRoot) === startTime", "return true"),
 ]),
}
sl = sys.argv[1]
test, M = SLICES[sl]
only = sys.argv[2:]
norm = lambda x: re.sub(r'\s+', ' ', x)
res = []
for name, F, a, b in M:
    if only and name not in only: continue
    src = open(F).read()
    if a in src:
        mutated = src.replace(a, b, 1)
    else:
        m = re.search(re.escape(norm(a)).replace(r'\ ', r'\s*'), src)
        if not m:
            res.append({'mutant': name, 'result': 'NOT_APPLIED'}); continue
        mutated = src[:m.start()] + b + src[m.end():]
    open(F, 'w').write(mutated)
    r = subprocess.run(['npx','vitest','run',test,'--maxWorkers=1'],capture_output=True,text=True,env=dict(os.environ))
    subprocess.run(['git','checkout','--',F])
    res.append({'mutant': name, 'result': 'KILLED' if r.returncode != 0 else 'SURVIVED'})
print(json.dumps(res, indent=1))
