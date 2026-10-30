from pathlib import Path
import subprocess,json,hashlib
r=Path('/mnt/dados/cvg-work/aud0625-f18-build-codex-20261029');c=r/'candidate';paths=[c/'tests/aud0625-internal-hooks-authority-red.test.ts',c/'tests/aud0625-f18-approval-admission.test.ts'];original={p:p.read_text() for p in paths}
try:
 for p,text in original.items():(r/(p.name+'.baseline.txt')).write_text(text);p.write_text(text.replace('it.fails','it'))
 report=r/'baseline-causal-vitest.json';a=subprocess.run(['python3',str(r/'run.py'),'baseline-causal','120','node','node_modules/vitest/vitest.mjs','run',*[str(p.relative_to(c)) for p in paths],'--no-file-parallelism','--maxWorkers=2','--reporter=verbose','--reporter=json','--outputFile='+str(report)]);d=json.loads(report.read_text());fail=[v for t in d['testResults'] for v in t['assertionResults'] if v['status']=='failed'];assert a.returncode==1 and len(fail)==12 and d['numPassedTests']==6 and d['numPendingTests']==0
 assert all('AssertionError' in str(f['failureMessages']) and 'timed out' not in str(f['failureMessages']) for f in fail)
 (r/'baseline-causality.json').write_text(json.dumps({'red':12,'ordinary_positive':6,'failures':[{'test':f['fullName'],'messages':f['failureMessages']} for f in fail]},indent=2)+'\n')
finally:
 for p,text in original.items():p.write_text(text)
print('12 causal RED / 6 controls, exact tests restored')
