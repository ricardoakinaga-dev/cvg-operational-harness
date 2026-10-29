from pathlib import Path
r=Path('/mnt/dados/cvg-work/aud0625-f18-review-fixes-codex-20261029');src=Path('/mnt/dados/cvg-work/aud0625-f18-build-codex-20261029/mutate-s2.py').read_text()
src=src.replace("r=Path('/mnt/dados/cvg-work/aud0625-f18-build-codex-20261029');c=r/'candidate';", "r=Path('/mnt/dados/cvg-work/aud0625-f18-review-fixes-codex-20261029');c=Path('/mnt/dados/cvg-work/aud0625-f18-build-codex-20261029/candidate');")
src=src.replace("'s2-mutant-'","'review-mutant-'").replace("'s2-mutations.json'","'mutations.json'").replace("'s2-mutation-source-restored.json'","'mutation-source-restored.json'")
needle='try:\n for name,test,pattern,mutate in mutants:'
assert src.count(needle)==1
extra='''review='tests/aud0625-f18-review-regressions.test.ts'
iterative='tests/aud0625-f18-review-iterative-checkpoint.test.ts'
def p2_failed():
 p=files['hook-authority'];s=p.read_text();a=s.index("    return {\\n      kind: 'threw',",s.index("value.kind === 'failed'"));b=s.index("  if (value.kind === 'confirm_failed'",a);p.write_text(s[:a]+"    return { ...value, durationMs: before.durationMs }\\n"+s[b:])
mutants += [
 ('R16-inconsistent-status',review,'P-R16',lambda:change('hook-authority',"if (value.kind === 'succeeded' && value.result?.status === 'SUCCEEDED') {","if (value.kind === 'succeeded') {")),
 ('R17-release-after-effect',review,'P-R17',lambda:change('hook-authority',"  // It is too late to claim that a successful physical effect never started.\\n  return invalidOutcome(before)","  return value as ToolOutcome")),
 ('R19-gate-violation',review,'P-R19',lambda:change('hook-authority',"  if (violation)\\n    return reconcile(\\n      fact,\\n      failure('Continuation invoked more than once or after its hook ended.')\\n    )","  if (violation) return fact as V")),
 ('R22-raw-guard',review,'P-R22/24/26',lambda:change('pipeline',"hookState({ kind: 'observer', plugin: 'guard', fn: guard }, call)","call")),
 ('R23-raw-iterative-checkpoint',iterative,'P-R23',lambda:change('pipeline',"      hookState(\\n        { kind: 'observer', plugin: 'checkpoint', fn: hooks.beforeDispatch },\\n        call\\n      )","      call as never")),
 ('R24-raw-post',review,'P-R22/24/26',lambda:change('pipeline',"await entry.fn(hookState(entry, call), exposed)","await entry.fn(call as never, exposed)")),
 ('R25-drop-audit-failure',review,'P-R25',lambda:change('kernel-runtime',"current = reconcileTurn(current, proposed, exposed, isCoreHook(entry))","current = reconcileTurn(current, proposed, exposed, false)")),
 ('R26-raw-turn-end',review,'P-R22/24/26',lambda:change('kernel-runtime',"const proposed = await entry.fn(hookState(entry, this.#state), exposed)","const proposed = await entry.fn(this.#state as never, exposed)")),
 ('P2-1-failed-after-success',review,'P2-1',p2_failed),
 ('P2-2-lossy-output-accepted',review,'P2-2',lambda:change('hook-authority',"if (hasOpaque(value.result) || (exposed && hasOpaque(observation(exposed))))","if (false)")),
 ('P2-2-serialized-marker-accepted',review,'serialized copy',lambda:change('hook-authority',"if (hasOpaque(value.result) || (exposed && hasOpaque(observation(exposed))))","if (hasOpaque(value.result))")),
 ('P2-2-fresh-opaque-output-accepted',review,'unprojectable replacement',lambda:change('hook-authority',"if (hasOpaque(value.result) || (exposed && hasOpaque(observation(exposed))))","if (exposed && hasOpaque(observation(exposed)))"))
]
'''
src=src.replace(needle,extra+'\n'+needle).replace("print('18 semantic mutants killed by assertions; production source restored byte-identically')","print(str(len(rows))+' semantic mutants killed by assertions; production source restored byte-identically')")
(r/'mutate-review-fixes.py').write_text(src)
print('30 mutants prepared with restoration and assertion-only kill criteria')
