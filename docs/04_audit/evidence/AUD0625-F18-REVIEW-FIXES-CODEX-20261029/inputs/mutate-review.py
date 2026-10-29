import json, subprocess, sys, os
os.chdir('/mnt/dados/cvg-work/aud0625-review-f18-s2-07')
H='packages/harness/src/kernel/hook-authority.ts'; P='packages/harness/src/kernel/pipeline.ts'; K='packages/harness/src/kernel/kernel-runtime.ts'; C='packages/harness/src/kernel/controls.ts'
M=[
 ('R1 gate stop not sticky',H,"  if (before?.kind === 'stop') return before\n  const value = observation(proposed) as KernelGate | undefined","  const value = observation(proposed) as KernelGate | undefined"),
 ('R2 failed/uncertain outcome not sticky',H,"  if (before.kind !== 'succeeded') return before\n  const value = observation(proposed) as ToolOutcome | undefined","  const value = observation(proposed) as ToolOutcome | undefined"),
 ('R3 turn stop not sticky for non-core',H,"  if (before.stopReason !== 'COMPLETED' && !core) return before","  if (false) return before"),
 ('R4 observation falls back to the original on error',H,"    } catch {\n      return OPAQUE\n    }\n  }\n  return copy(input, 0) as T","    } catch {\n      return value\n    }\n  }\n  return copy(input, 0) as T"),
 ('R5 next may be called twice',H,"if (!active || calls++ > 0) {","if (!active) {"),
 ('R6 next after the hook ended is accepted',H,"if (!active || calls++ > 0) {","if (calls++ > 0) {"),
 ('R7 positive result without next accepted',H,"  if (!running && positive(value))\n    return failure('Positive hook result requires exactly one continuation.')\n","")
,
 ('R8 any control function is credentialed',H,"    entry.kind === 'control' &&\n    typeof entry.fn === 'function' &&\n    adapters.has(entry.fn)","    entry.kind === 'control' &&\n    typeof entry.fn === 'function'"),
 ('R9 hookState hands the real state to everyone',H,"  if (isCoreHook(entry)) return state\n  if (state && typeof state === 'object') {","  if (true) return state\n  if (state && typeof state === 'object') {"),
 ('R10 executor kept in the tool view',H,"tool: without(call.tool, ['execute']),","tool: observation(call.tool),"),
 ('R11 signal handed through in the turn view',H,"signal: Object.freeze({ aborted: turn.signal.aborted }),","signal: turn.signal,"),
 ('R12 turn input signal kept',H,"input: without(turn.input, ['signal']),","input: observation(turn.input),"),
 ('R13 class instances projected by reference-prototype',H,"if (proto !== Object.prototype && proto !== null && !Array.isArray(value))\n        return OPAQUE","if (false) return OPAQUE"),
 ('R14 projection not frozen',H,"      return Object.freeze(result)\n    } catch {","      return result\n    } catch {"),
 ('R15 getter invoked in projection',H,"value: 'value' in d ? copy(d.value, depth + 1) : OPAQUE,","value: 'value' in d ? copy(d.value, depth + 1) : copy((value as Record<string, unknown>)[key], depth + 1),"),
 ('R16 succeeded outcome accepts any status',H,"if (value.kind === 'succeeded' && value.result?.status === 'SUCCEEDED')\n    return { ...before, result: value.result }","if (value.kind === 'succeeded')\n    return { ...before, result: value.result }"),
 ('R17 not_started claim after success is honored',H,"  // It is too late to claim that a successful physical effect never started.\n  return invalidOutcome(before)","  return value"),
 ('R18 throw after delegation hides the effect',H,"  if (threw) return reconcile(fact, immediateFailure)","  if (threw) return fact as V"),
 ('R19 violation does not invalidate',H,"  if (violation)\n    return reconcile(\n      fact,\n      failure('Continuation invoked more than once or after its hook ended.')\n    )","  if (violation) return fact as V"),
 ('R20 ledger records the claimed kind (CTL-W02)',P,"(physical ?? outcome).kind","outcome.kind"),
 ('R21 continuation fault does not stop dispatch',P,"    if (continuationFault)\n      return {","    if (false)\n      return {"),
 ('R22 guards get the real call',P,"hookState({ kind: 'observer', plugin: 'guard', fn: guard }, call)","call"),
 ('R23 checkpoint hook gets the real call',P,"      hookState(\n        { kind: 'observer', plugin: 'checkpoint', fn: hooks.beforeDispatch },\n        call\n      )","      call as never"),
 ('R24 post-execute hooks get the real call',P,"await entry.fn(hookState(entry, call), exposed)","await entry.fn(call as never, exposed)"),
 ('R25 turn/end core flag always false',K,"current = reconcileTurn(current, proposed, exposed, isCoreHook(entry))","current = reconcileTurn(current, proposed, exposed, false)"),
 ('R26 turn/end hooks get the real state',K,"const proposed = await entry.fn(hookState(entry, this.#state), exposed)","const proposed = await entry.fn(this.#state as never, exposed)"),
 ('R27 gate stop COMPLETED accepted',H,"    value.stopReason !== 'COMPLETED' &&\n","") ,
 ('R28 post-execute proposed===exposed shortcut inverted',H,"  if (proposed === exposed || proposed === before) return before","  if (proposed === before) return before"),
 ('R29 turn proposed identity shortcut removed',H,"  if (proposed === exposed || proposed === before) return before\n  if (before.stopReason !== 'COMPLETED' && !core) return before","  if (before.stopReason !== 'COMPLETED' && !core) return before"),
 ('R30 unbound approval no longer fails closed',C,"          if (!call.grant) {\n            return requiresGrant(call)","          if (!call.grant) {\n            return false")
]
TESTS_ALL=['tests/aud0625-f18-observer-boundary.test.ts','tests/aud0625-internal-hooks-authority-red.test.ts','tests/aud0625-f18-approval-admission.test.ts','packages/harness/src/__tests__/pare100-public-controls.test.ts','packages/harness/src/__tests__/aud0597-kplg004-regressions.test.ts','packages/harness/src/__tests__/pdsh-031-slice2d-dispatch.test.ts','packages/harness/src/__tests__/pdsh-031-slice2d-kernel.test.ts','packages/harness/src/__tests__/pdsh-025-compaction.test.ts','packages/harness/src/__tests__/capability-boundary.test.ts','packages/harness/src/__tests__/pdsh-031-core-coverage.test.ts']
TESTS = ['tests/zz-f18s2-review-probes.test.ts','-t','PROPOSED'] if os.environ.get('PROBES')=='1' else TESTS_ALL
only=set(sys.argv[2:]); res=[]
for name,f,old,new in M:
    if only and name.split()[0] not in only: continue
    src=open(f).read()
    if src.count(old)!=1:
        res.append({'mutant':name,'status':'NOT_APPLIED','count':src.count(old)}); print(name,'NOT_APPLIED',src.count(old),flush=True); continue
    open(f,'w').write(src.replace(old,new))
    try:
        r=subprocess.run(['npx','vitest','run',*TESTS,'--maxWorkers=2'],capture_output=True,text=True,timeout=600)
        killed=r.returncode!=0
        tail=[l for l in (r.stdout+r.stderr).split('\n') if 'FAIL' in l][:2]
    finally:
        subprocess.run(['git','checkout','--',f],check=True)
    res.append({'mutant':name,'status':'KILLED' if killed else 'SURVIVED','by':tail}); print(name,res[-1]['status'],flush=True)
json.dump(res,open(sys.argv[1],'w'),indent=1)
