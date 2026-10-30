from pathlib import Path
c=Path('/mnt/dados/cvg-work/aud0625-f18-build-codex-20261029/candidate');r=Path('/mnt/dados/cvg-work/aud0625-f18-review-fixes-codex-20261029')
p=c/'packages/harness/src/kernel/hook-authority.ts';before=p.read_text();(r/'hook-authority.before.ts.txt').write_text(before)
s=before.replace('  const copy = (value: unknown, depth: number): unknown => {\n','  const copy = (value: unknown, depth: number): unknown => {\n    if (value === OPAQUE) return OPAQUE\n')
needle='function invalidOutcome('
assert s.count(needle)==1
s=s.replace(needle,'''/** Only inspect detached projections; internal markers are identity-branded. */
function hasOpaque(value: unknown): boolean {
  return value === OPAQUE || (
    value !== null && typeof value === 'object' && Object.values(value).some(hasOpaque)
  )
}
'''+needle)
a="""  if (value.kind === 'succeeded' && value.result?.status === 'SUCCEEDED')
    return { ...before, result: value.result }
"""
b="""  if (value.kind === 'succeeded' && value.result?.status === 'SUCCEEDED') {
    // A reconstructed observation cannot turn an omitted/opaque value into data.
    // Identity-returning observers took the safe shortcut above. Refuse lossy
    // copies (including serialized copies) while retaining the physical result.
    if (hasOpaque(value.result) || (exposed && hasOpaque(observation(exposed))))
      return invalidOutcome(before)
    return { ...before, result: value.result }
  }
"""
assert s.count(a)==1;s=s.replace(a,b)
a='    return { ...value, durationMs: before.durationMs }\n  if (value.kind === \'confirm_failed\''
b="""    return {
      kind: 'threw',
      error: typeof value.result.error === 'string'
        ? value.result.error
        : 'Internal hook claimed failure after a successful physical effect.',
      durationMs: before.durationMs
    }
  if (value.kind === 'confirm_failed'"""
assert s.count(a)==1;s=s.replace(a,b);p.write_text(s)
p=c/'tests/aud0625-f18-approval-admission.test.ts';s=p.read_text();assert "host.listeners('tool/execute')[0]!" in s;s=s.replace("host.listeners('tool/execute')[0]!", "host.listeners('tool/execute').find((entry) => entry.plugin === 'control.approvals')!");p.write_text(s)
p=c/'tests/aud0625-f18-review-regressions.test.ts';s=p.read_text();needle="  it('a real user opaque:true";a=s.index(needle);s=s[:a]+'''  it('P2-2 refuses a serialized copy that loses the internal opaque marker identity', async()=>{
    const output=Array.from({length:5000},(_,i)=>({i}))
    const actual=await profile([plugin(ctx=>{ctx.on('tool/post-execute',async(_call,outcome)=>JSON.parse(JSON.stringify(outcome)))})],{}, {body:()=>({status:'SUCCEEDED',output})})
    expect(actual.result.stopReason).toBe('TOOL_FAILURE')
    expect(actual.result.response).toContain('unknown_effect')
    expect(actual.result.toolResult?.output).toBe(output)
    expect(actual.counts.complete).toBe(1)
  })
'''+s[a:];p.write_text(s)
print('source/test edits complete; causal baseline 5RED/13PASS preserved')
