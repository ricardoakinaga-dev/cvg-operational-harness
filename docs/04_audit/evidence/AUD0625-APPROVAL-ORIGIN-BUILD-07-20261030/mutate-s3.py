import subprocess,json,sys,os
RT='packages/agent-runtime/src/runtime.ts'
RQ='packages/agent-runtime/src/runtime-approval-request.ts'
AG='packages/shared/src/audit-governance.ts'
KC='apps/worker/src/kernel-composition.ts'
T=['apps/worker/src/__tests__/aud0625-approval-origin-worker.integration.test.ts','packages/agent-runtime/src/__tests__/aud0625-approval-session-binding-red.test.ts','packages/shared/src/__tests__/audit-governance-hardening.test.ts']
M=[
('W1 origin check off at the runtime',RT,"record.origin.conversationId !== input.conversationId ||","false ||"),
('W2 request does not record the origin',RQ,"origin: {\n        conversationId: input.conversationId,\n        ...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {})\n      },",""),
('W3 origin_mismatch redacted in the outbox',AG,"  'origin_mismatch',\n",""),
('W4 worker drops the session of the message',KC,"...(input.context.session !== null\n      ? { sessionId: input.context.session.id }\n      : {}),",""),
('W5 worker uses one conversation for every message',KC,"conversationId: input.context.message.conversationId,","conversationId: 'conv_constant',"),
('W6 durable-execution cross-path rule off',RT,"record.origin === undefined && record.executionRef !== undefined","false"),
]
src={}
for _,f,_,_ in M: src.setdefault(f,open(f).read())
out=[]
for name,f,a,b in M:
    t=src[f]
    if a not in t:
        out.append((name,'PATTERN-MISSING'));print(out[-1],flush=True);continue
    open(f,'w').write(t.replace(a,b,1))
    r=subprocess.run(['npx','vitest','run',*T,'--testTimeout=120000','--hookTimeout=120000'],capture_output=True,text=True,timeout=600)
    open(f,'w').write(t)
    out.append((name,'KILLED' if r.returncode else 'SURVIVED'));print(out[-1],flush=True)
for f,t in src.items(): open(f,'w').write(t)
json.dump(out,open(sys.argv[1],'w'),indent=1)
