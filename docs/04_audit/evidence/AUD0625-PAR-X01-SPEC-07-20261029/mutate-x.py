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
  ('env-forbid-tls', D+'env.ts', "|OPENSSL_|SSL_CERT_|", "|"),
  ('env-forbid-git', D+'env.ts', "|GIT_|SSH_|", "|"),
  ('env-forbid-editor', D+'env.ts', "|EDITOR$|VISUAL$|PAGER$)", ")"),
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
  ('env-allowlist-check', D+'env.ts', "!NAME.test(name) || PROFILE_OWNED.has(name) || FORBIDDEN.test(name)", "false"),
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
  ('pf-lastparen', D+'procfs.ts', "stat.lastIndexOf(')')", "stat.indexOf(')')"),
  ('pf-exclude', D+'procfs.ts', "if (skip.has(pid)) continue", ""),
  ('pf-ns', D+'procfs.ts', "=== wanted)", "!== wanted)"),
  ('pf-enoent', D+'procfs.ts', "if (code === 'ENOENT' || code === 'ESRCH') continue", ""),
  ('pf-uid', D+'procfs.ts', "realUid(entry, procRoot) === uid ||", "true ||"),
  ('pf-nolist', D+'procfs.ts', "return { members: [], unverified: 1 }", "return { members: [], unverified: 0 }"),
  ('pf-numeric', D+'procfs.ts', "if (!NUMERIC.test(entry)) continue", ""),
  ('pf-start', D+'procfs.ts', "return readStartTime(pid, procRoot) === startTime", "return true"),
 ]),
 's2': ('tests/par-x01-process-service.test.ts', [
  ('startup-disarm', D+'service.ts', "nsInode = snap.pidNamespace\n      clearTimeout(startupTimer)", "nsInode = snap.pidNamespace"),
  ('abort-listener', D+'service.ts', "s.request.signal?.addEventListener('abort', onAbort, { once: true })", ""),
  ('lifetime-timer', D+'service.ts', "setTimeout(() => trigger('timeout'), limits.lifetimeMs)", "setTimeout(() => undefined, limits.lifetimeMs)"),
  ('startup-timer', D+'service.ts', "trigger('startup_timeout')", "undefined"),
  ('cause-first', D+'service.ts', "if (cause === undefined) cause = why", "cause = why"),
  ('cleanup-once', D+'service.ts', "cleanupTask ??= settle()\n  }", "cleanupTask = settle()\n  }"),
  ('grace-skip', D+'service.ts', "limits.graceMs > 0 &&", "false &&"),
  ('grace-signal', D+'service.ts', "process.kill(pid, 'SIGTERM')", "process.kill(pid, 'SIGCONT')"),
  ('kill-group', D+'service.ts', "signalIfSame(child.pid, childStart, 'SIGKILL', true, 'group')", ""),
  ('kill-init', D+'service.ts', "signalIfSame(initPid, initStart, 'SIGKILL', false, 'init')", ""),
  ('identity-guard', D+'service.ts', "if (!sameProcess(pid, start, procRoot)) return", ""),
  ('wait-closed', D+'service.ts', "await Promise.race([\n      closedPromise,\n      delay(Math.max(0, deadline - Date.now()))\n    ])", ""),
  ('member-kill', D+'service.ts', "process.kill(pid, 'SIGKILL')", "void pid"),
  ('clean-needs-closed', D+'service.ts', "closed && scan.members.length === 0 && unverified === 0", "scan.members.length === 0 && unverified === 0"),
  ('clean-needs-empty', D+'service.ts', "closed && scan.members.length === 0 && unverified === 0", "closed && unverified === 0"),
  ('clean-needs-verified', D+'service.ts', "closed && scan.members.length === 0 && unverified === 0", "closed && scan.members.length === 0"),
  ('ns-unknown', D+'service.ts', "(snapshot.invalid || cause === 'startup_timeout')", "false"),
  ('output-trigger', D+'service.ts', "truncated = true\n      trigger('output_limit')", "truncated = true"),
  ('truncated-flag', D+'service.ts', "truncated = true\n      trigger", "trigger"),
  ('exit-only', D+'service.ts', "cause === 'exit' ? (exitFromStatus ?? child.exitCode) : null", "exitFromStatus ?? child.exitCode"),
  ('cls-invalid', D+'service.ts', "if (snap.invalid) {", "if (false) {"),
  ('cls-nochild', D+'service.ts', "} else if (snap.childPid === undefined) {", "} else if (false) {"),
  ('cls-signal', D+'service.ts', "child.signalCode !== null && snap.exitCode === undefined", "false"),
  ('slot-release', D+'service.ts', "s.release()\n    resolveOutcome", "resolveOutcome"),
  ('busy', D+'service.ts', "if (reserved >= maxConcurrent)", "if (false)"),
  ('preabort', D+'service.ts', "if (request.signal?.aborted) return nothingLaunched('cancelled', [])", ""),
  ('env-validate', D+'service.ts', "const env = validateProcessEnv(request.consumer, request.env, allowlist)", "const env = request.env ?? {}"),
  ('limits-validate', D+'service.ts', "validateProcessLimits(request.limits, caps)", "request.limits"),
  ('argv-empty', D+'service.ts', "argv.length === 0 ||", ""),
  ('detached', D+'service.ts', "detached: true", "detached: false"),
  ('status-fd', D+'service.ts', "statusFd: true,", "statusFd: false,"),
  ('persistent', D+'service.ts', "if (request.mode === 'persistent')", "if (false)"),
  ('stdin', D+'service.ts', "child.stdin?.end(s.request.stdin)", "child.stdin?.end()"),
  ('spawn-error', D+'service.ts', "secondary.push('spawn_error')", ""),
  ('stdin-cap', D+'service.ts', "if (request.stdin.length > limits.maxStdinBytes) bad('stdin size')", ""),
  ('output-room', D+'service.ts', "chunk.length > room ? chunk.subarray(0, Math.max(0, room)) : chunk", "chunk"),
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
