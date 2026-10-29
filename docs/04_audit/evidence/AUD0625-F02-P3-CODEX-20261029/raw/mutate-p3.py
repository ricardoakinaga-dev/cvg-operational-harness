from pathlib import Path
import json,subprocess,hashlib
r=Path('/mnt/dados/cvg-work/aud0625-f02-p3-codex-20261029');c=r/'candidate';rows=[]
for name,path,needle,replacement,pattern in [
 ('drop-launch-close','packages/sandbox/src/run.ts','    } finally {\n      launch.close()\n    }','    } finally {\n      /* deliberate mutant: omit parent FD cleanup */\n    }','host FD count unchanged'),
 ('accept-network-grant','packages/sandbox/src/process-profile.ts','    !request.handle.allowSubprocess ||\n    request.handle.allowNetwork','    !request.handle.allowSubprocess','refuses an allowNetwork grant')]:
 p=c/path;original=p.read_text();assert original.count(needle)==1
 try:
  p.write_text(original.replace(needle,replacement));report=r/(name+'-vitest.json');run=subprocess.run(['python3',str(r/'run.py'),name,'90','node','node_modules/vitest/vitest.mjs','run','tests/aud0625-process-profile-lifecycle.test.ts','--testNamePattern='+pattern,'--no-file-parallelism','--maxWorkers=2','--reporter=verbose','--reporter=json','--outputFile='+str(report)]);d=json.loads(report.read_text());fail=[a for t in d['testResults'] for a in t['assertionResults'] if a['status']=='failed'];messages='\n'.join(str(a['failureMessages']) for a in fail);assert run.returncode==1 and len(fail)==1 and 'AssertionError' in messages and 'timed out' not in messages
  rows.append({'name':name,'failed':len(fail),'filtered':d['numPendingTests'],'assertion':fail[0]['fullName'],'assertion_failure':True,'reason':'native success with growing parent FD counts' if name=='drop-launch-close' else 'native payload succeeded despite forbidden allowNetwork grant; --unshare-net retained','exit':run.returncode})
 finally:p.write_text(original);assert p.read_text()==original
(r/'mutations.json').write_text(json.dumps({'mutants':rows,'source_restored':True},indent=2)+'\n');print('2 mutants killed; production sources restored byte-identically')
