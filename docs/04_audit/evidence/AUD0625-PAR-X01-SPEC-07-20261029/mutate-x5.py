import subprocess,json,sys
SVC='packages/sandbox/src/process-service/service.ts'
BND='tests/par-x01-spawn-boundary.test.ts'
PER='tests/par-x01-process-persistent.test.ts'
M=[
 ('F1a node:child_process not forbidden',BND,"'node:child_process',",""),
 ('F1b template literal not flagged',BND,"ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)","ts.isStringLiteral(node)"),
 ('F1c Bun element access not flagged',BND,"ts.isElementAccessExpression(node) &&","false &&"),
 ('F1d comments scanned as text',BND,"createsProcesses(path, readFileSync(path, 'utf8'))","/child_process/.test(readFileSync(path, 'utf8'))"),
 ('F2a drop allowed for every consumer',SVC,"request.consumer !== 'shell' || request.mode !== 'oneshot'","false"),
 ('F2b drop allowed for shell persistent',SVC,"request.consumer !== 'shell' || request.mode !== 'oneshot'","request.consumer !== 'shell'"),
 ('F2c drop allowed for other consumers oneshot',SVC,"request.consumer !== 'shell' || request.mode !== 'oneshot'","request.mode !== 'oneshot'"),
 ('F3a block not cut at the ceiling',SVC,"const kept = chunk.length > room ? chunk.subarray(0, room) : chunk","const kept = chunk"),
 ('F3b rest of a cut block lost',SVC,"if (kept.length < chunk.length) stream.unshift(chunk.subarray(room))",""),
 ('F3c held streams not released on drain',SVC,"for (const read of readers) read()\n  }\n  const offer","}\n  const offer"),
 ('F3d teardown does not discard',SVC,"discarding = true\n      for (const read of readers) read()","for (const read of readers) read()"),
 ('F4a next after return pends',SVC,"if (consumerGone) return resolve({ value: undefined, done: true })",""),
 ('F4b pending next not resolved by return',SVC,"while (waiters.length > 0)\n          waiters.shift()!({ value: undefined, done: true })\n        releaseHeld()","releaseHeld()"),
]
src={}
out=[]
for name,f,a,b in M:
    src.setdefault(f,open(f).read())
for name,f,a,b in M:
    t=src[f]
    if a not in t:
        out.append((name,'PATTERN-MISSING'));print(out[-1],flush=True);continue
    open(f,'w').write(t.replace(a,b,1))
    files=[BND] if f==BND else [PER,BND]
    args=['npx','vitest','run',*files] + (['-t','F[1-4]|holds a payload|stops cleanly while|consumer that leaves'] if f==SVC else [])
    try:
        r=subprocess.run(args,capture_output=True,text=True,timeout=300)
        res='KILLED' if r.returncode else 'SURVIVED'
    except subprocess.TimeoutExpired:
        res='KILLED(timeout)'
    open(f,'w').write(t)
    out.append((name,res));print(out[-1],flush=True)
for f,t in src.items(): open(f,'w').write(t)
json.dump(out,open(sys.argv[1],'w'),indent=1)
