from pathlib import Path
import subprocess,json
r=Path('/mnt/dados/cvg-work/aud0625-f18-build-codex-20261029');c=r/'candidate';p=c/'packages/harness/src/kernel/controls.ts';s=p.read_text();a=s.index('        if (!call.grant) {');b=s.index('        const gate = await reserve',a)
try:
 p.write_text(s[:a]+'        if (!call.grant) return next()\n'+s[b:]);out=r/'s1-mutant-vitest.json';x=subprocess.run(['python3',str(r/'run.py'),'s1-mutant','120','node','node_modules/vitest/vitest.mjs','run','tests/aud0625-f18-approval-admission.test.ts','--no-file-parallelism','--maxWorkers=2','--reporter=json','--outputFile='+str(out)]);d=json.loads(out.read_text());assert x.returncode==1 and d['numFailedTests']==3 and d['numPassedTests']==1
 (r/'s1-mutant-proof.json').write_text(json.dumps({'name':'remove execute missing-grant fence','failed':3,'passed':1,'source_restored':True},indent=2)+'\n')
finally:p.write_text(s);assert p.read_text()==s
print('Missing-grant guard mutant killed3; source restored')
