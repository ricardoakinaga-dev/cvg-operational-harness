import subprocess,json,sys
RT='packages/agent-runtime/src/runtime.ts'
RQ='packages/agent-runtime/src/runtime-approval-request.ts'
EN='packages/approval-engine/src/engine.ts'
ST='packages/approval-engine/src/store.ts'
T=['packages/agent-runtime/src/__tests__/aud0625-approval-session-binding-red.test.ts','packages/approval-engine/src/__tests__/aud0625-approval-origin.test.ts','packages/agent-runtime/src/__tests__/runtime-execution-recovery.test.ts','packages/agent-runtime/src/__tests__/agent-runtime.test.ts']
M=[
('M1 conversation not compared',RT,"record.origin.conversationId !== input.conversationId ||","false ||"),
('M2 session never compared',RT,"(record.origin.sessionId !== undefined &&\n          record.origin.sessionId !== input.sessionId)","false"),
('M3 absent session treated as equal',RT,"record.origin.sessionId !== undefined &&\n          record.origin.sessionId !== input.sessionId","record.origin.sessionId !== undefined &&\n          input.sessionId !== undefined &&\n          record.origin.sessionId !== input.sessionId"),
('M4 durable-execution rule off',RT,"record.origin === undefined && record.executionRef !== undefined","false"),
('M5 durable-execution rule on any executionRef',RT,"record.origin === undefined && record.executionRef !== undefined","record.executionRef !== undefined"),
('M6 origin_unbound audit removed',RT,"appendAudit('runtime.origin_unbound', { phase: 'approval' })",""),
('M7 origin_unbound metric removed',RT,"telemetry.recordMetric('approval_origin_unbound_total', 1, {\n        capability: input.capability\n      })",""),
('M8 request does not record the origin',RQ,"origin: {\n        conversationId: input.conversationId,\n        ...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {})\n      },",""),
('M9 request drops the session',RQ,"...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {})\n      },","},"),
('M10 engine does not store the origin',EN,"...(request.origin !== undefined","...(false as boolean"),
('M11 store immutability off',ST,"assertOriginUnchanged(current, next)\n",""),
('M12 immutability ignores the session',ST,"before.origin?.sessionId !== after.origin?.sessionId","false"),
('M13 immutability ignores the conversation',ST,"before.origin?.conversationId !== after.origin?.conversationId ||","false ||"),
]
src={}
for _,f,_,_ in M: src.setdefault(f,open(f).read())
out=[]
for name,f,a,b in M:
    t=src[f]
    if a not in t:
        out.append((name,'PATTERN-MISSING'));print(out[-1],flush=True);continue
    open(f,'w').write(t.replace(a,b,1))
    r=subprocess.run(['npx','vitest','run',*T],capture_output=True,text=True,timeout=400)
    open(f,'w').write(t)
    out.append((name,'KILLED' if r.returncode else 'SURVIVED'));print(out[-1],flush=True)
for f,t in src.items(): open(f,'w').write(t)
json.dump(out,open(sys.argv[1],'w'),indent=1)
