from pathlib import Path
r=Path('/mnt/dados/cvg-work/aud0625-f18-review-fixes-codex-20261029');c=Path('/mnt/dados/cvg-work/aud0625-f18-build-codex-20261029/candidate');src=(r/'inputs/review-probes.test.ts.txt').read_text();text=src[:src.index("  it('B1")]+src[src.index("  it('B2"):src.index("  it('C1")]+"})\n\n"+src[src.index('// Tests this review PROPOSES'):src.index("describe('REVIEW probe E'")];text=text.replace('  type ToolCallView,\n','').replace('  type ToolOutcome,\n  type Next','  type ToolOutcome');text=text.replace('P-R22/23/24/26','P-R22/24/26')
text+='''describe('F18 review P2 causal regressions', () => {
  it.each(['FAILED', 'REJECTED'] as const)('P2-1 claimed %s after physical success is unknown_effect without repeating settlement', async (status) => {
    const actual = await profile([plugin((ctx) => {
      ctx.on('tool/post-execute', async (_call, outcome) => outcome.kind === 'succeeded'
        ? ({kind:'failed', result:{status, error:'OWNED-HOOK-CLAIM'}, durationMs:0} as ToolOutcome)
        : outcome)
    })])
    expect(actual.counts).toEqual({body:1,begin:1,complete:1,fail:0,release:0})
    expect(actual.effects.entries.map(e=>e.phase)).toEqual(['started','succeeded'])
    expect(actual.result.stopReason).toBe('TOOL_FAILURE')
    expect(actual.result.response).toContain('unknown_effect')
    expect(actual.result.toolResult?.status).not.toBe(status)
  })
  it.each(['wide','deep','instance'] as const)('P2-2 refuses copied %s projection as real successful output', async (kind) => {
    const output: unknown = kind === 'wide' ? Array.from({length:5000}, (_,i)=>({i}))
      : kind === 'deep' ? Array.from({length:20}).reduce<unknown>((child)=>({child}), {leaf:'OWNED'})
      : new Date('2026-01-01T00:00:00Z')
    const actual = await profile([plugin(ctx=>{
      ctx.on('tool/post-execute',async(_call,outcome)=>({...outcome}))
    })], {}, {body:()=>({status:'SUCCEEDED',output})})
    expect(actual.counts).toEqual({body:1,begin:1,complete:1,fail:0,release:0})
    expect(actual.effects.entries.map(e=>e.phase)).toEqual(['started','succeeded'])
    expect(actual.result.stopReason).toBe('TOOL_FAILURE')
    expect(actual.result.response).toContain('unknown_effect')
    expect(actual.result.toolResult?.output).toBe(output)
  })
  it('P2-2 identity returning observer still preserves original unprojectable output', async()=>{
    const output=Array.from({length:5000},(_,i)=>({i}))
    const actual=await profile([plugin(ctx=>{ctx.on('tool/post-execute',async(_call,outcome)=>outcome)})],{}, {body:()=>({status:'SUCCEEDED',output})})
    expect(actual.result.stopReason).toBe('COMPLETED')
    expect(actual.result.toolResult?.output).toBe(output)
    expect(actual.counts.complete).toBe(1)
  })
  it('a real user opaque:true data object is not an internal marker', async()=>{
    const output={opaque:true}
    const actual=await profile([plugin(ctx=>{ctx.on('tool/post-execute',async(_call,outcome)=>({...outcome}))})],{}, {body:()=>({status:'SUCCEEDED',output})})
    expect(actual.result.stopReason).toBe('COMPLETED')
    expect(actual.result.toolResult?.output).toEqual(output)
  })
  it('turn/end shallow copies preserve the original large tool result and counters',async()=>{
    const output=Array.from({length:5000},(_,i)=>({i}))
    const actual=await profile([plugin(ctx=>{ctx.on('turn/end',async(_turn,result)=>({...result}))})],{}, {body:()=>({status:'SUCCEEDED',output})})
    expect(actual.result.stopReason).toBe('COMPLETED')
    expect(actual.result.toolResult?.output).toBe(output)
    expect(actual.result.toolCalls).toBe(1)
    expect(actual.counts.complete).toBe(1)
  })
})
'''
(c/'tests/aud0625-f18-review-regressions.test.ts').write_text(text)
