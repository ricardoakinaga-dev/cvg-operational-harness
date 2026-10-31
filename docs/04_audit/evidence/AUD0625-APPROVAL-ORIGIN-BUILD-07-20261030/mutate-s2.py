import subprocess,json,sys,os
ST='packages/persistence/src/runtime-approval-store.ts'
MG='packages/persistence/migrations/0035_runtime_approval_origin.sql'
T=['packages/persistence/src/__tests__/aud0625-approval-origin-postgres.test.ts']
env=dict(os.environ)
M=[
('P1 origin not written',ST,"    record.origin?.conversationId ?? null,\n    record.origin?.sessionId ?? null\n","    null,\n    null\n"),
('P2 origin session not written',ST,"    record.origin?.sessionId ?? null\n  ]","    null\n  ]"),
('P3 row mapping drops the session',ST,"...(row.origin_session_id !== null\n              ? { sessionId: row.origin_session_id }\n              : {})","..."+"({})"),
('P4 row mapping drops the origin',ST,"...(row.origin_conversation_id !== null\n      ? {","...(false\n      ? {"),
('P5 trigger removed',MG,"CREATE TRIGGER runtime_approvals_origin_immutable\n  BEFORE UPDATE ON runtime_approvals\n  FOR EACH ROW EXECUTE FUNCTION cvg_runtime_approvals_origin_immutable();","SELECT 1;"),
('P6 trigger blind to the session',MG,"     OR NEW.origin_session_id IS DISTINCT FROM OLD.origin_session_id THEN","     THEN"),
('P7 trigger blind to the conversation',MG,"  IF NEW.origin_conversation_id IS DISTINCT FROM OLD.origin_conversation_id\n     OR","  IF FALSE\n     OR"),
('P8 trigger lets a legacy NULL row gain an origin',MG,"  IF NEW.origin_conversation_id IS DISTINCT FROM OLD.origin_conversation_id\n     OR NEW.origin_session_id IS DISTINCT FROM OLD.origin_session_id THEN","  IF OLD.origin_conversation_id IS NOT NULL AND (NEW.origin_conversation_id IS DISTINCT FROM OLD.origin_conversation_id\n     OR NEW.origin_session_id IS DISTINCT FROM OLD.origin_session_id) THEN"),
('P9 shape check removed',MG,"ADD CONSTRAINT runtime_approvals_origin_check CHECK (","ADD CONSTRAINT runtime_approvals_origin_check CHECK (TRUE OR "),
('P10 session without conversation allowed',MG,"        (origin_conversation_id IS NULL AND origin_session_id IS NULL)\n        OR (","        origin_conversation_id IS NULL\n        OR ("),
]
src={}
for _,f,_,_ in M: src.setdefault(f,open(f).read())
out=[]
for name,f,a,b in M:
    t=src[f]
    if a not in t:
        out.append((name,'PATTERN-MISSING'));print(out[-1],flush=True);continue
    open(f,'w').write(t.replace(a,b,1))
    r=subprocess.run(['npx','vitest','run',*T,'--testTimeout=120000','--hookTimeout=120000'],capture_output=True,text=True,timeout=500,env=env)
    open(f,'w').write(t)
    out.append((name,'KILLED' if r.returncode else 'SURVIVED'));print(out[-1],flush=True)
for f,t in src.items(): open(f,'w').write(t)
json.dump(out,open(sys.argv[1],'w'),indent=1)
