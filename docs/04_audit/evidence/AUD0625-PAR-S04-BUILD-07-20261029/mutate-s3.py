import subprocess,json,sys,os
F='packages/persistence/src/session-persistence.ts'
T=['packages/persistence/src/__tests__/par-s04-session-resume-postgres.test.ts','tests/par-s04-session-fork-processes-postgres.test.ts']
src=open(F).read()
M=[
('R1 resume opens read-only',"await this.open(id, 'write', resumeOptions)","await this.open(id, 'read', resumeOptions)"),
('R2 handle kept when the analysis fails',"await handle.close().catch(() => undefined)\n      throw error","throw error"),
('R3 analysis of an empty log',"analysis: analyzeSessionLog(events)","analysis: analyzeSessionLog([])"),
('R4 resume closes the interrupted turn',"      return { handle, analysis: analyzeSessionLog(events) }","      const analysis = analyzeSessionLog(events)\n      if (analysis.openTurn)\n        await handle.append([materializeSessionEvent({ tenantId: this.options.tenantId, sessionId: id, formatVersion: 1, eventId: 'synthetic-close', timestamp: '2026-10-29T00:00:00.000Z', correlationId: analysis.openTurn.correlationId, traceId: 't', type: 'turn/end', payload: { correlationId: analysis.openTurn.correlationId, stopReason: 'COMPLETED' } } as never, events.length + 1)])\n      return { handle, analysis }"),
('R5 live owner waited for instead of refused',"await this.open(id, 'write', resumeOptions)","await (async () => { try { return await this.open(id, 'write', resumeOptions) } catch (e) { if (e instanceof SessionAlreadyOwnedError) return await this.open(id, 'read', resumeOptions); throw e } })()"),
]
out=[]
for name,a,b in M:
    if a not in src:
        out.append((name,'PATTERN-MISSING'));print(out[-1],flush=True);continue
    open(F,'w').write(src.replace(a,b,1))
    r=subprocess.run(['npx','vitest','run',*T],capture_output=True,text=True)
    out.append((name,'KILLED' if r.returncode else 'SURVIVED'))
    print(out[-1],flush=True)
open(F,'w').write(src)
json.dump(out,open(sys.argv[1],'w'),indent=1)
