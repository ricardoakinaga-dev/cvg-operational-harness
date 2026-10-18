import subprocess,pathlib,json,os,hashlib
w=pathlib.Path('/tmp/cvg-codex100-exec-20261017/native-delivery-probe')
u='cvg-codex100-native-delivery-'+str(os.getpid())+'.scope'
a=['/usr/bin/systemd-run','--user','--scope','--unit='+u,'--property=MemoryMax=2147483648','--property=CPUQuota=100%','--property=TasksMax=128','--property=RuntimeMaxSec=120s','/usr/bin/python3',str(pathlib.Path(__file__).resolve().parent/'guard.py'),u]
def save(n,v): (w/n).write_text(json.dumps(v,indent=2)+'\n')
save('scope-command.json',{'unit':u,'argv':a})
try:
 with (w/'scope.stdout.log').open('wb') as stdout,(w/'scope.stderr.log').open('wb') as stderr:
  r=subprocess.run(a,stdout=stdout,stderr=stderr,timeout=115)
 save('scope-exit.json',{'returncode':r.returncode})
except BaseException as e:
 save('scope-error.json',{'type':type(e).__name__,'message':str(e)})
 raise
finally:
 t=subprocess.run(['/usr/bin/systemctl','--user','show',u,'--property=ActiveState,SubState,Result,ControlGroup,TasksCurrent'],capture_output=True,text=True,timeout=5)
 if 'ActiveState=active' in t.stdout:
  stop=subprocess.run(['/usr/bin/systemctl','--user','stop',u],capture_output=True,text=True,timeout=8)
  save('own-timeout-cleanup.json',{'unit':u,'returncode':stop.returncode,'stdout':stop.stdout,'stderr':stop.stderr})
  t=subprocess.run(['/usr/bin/systemctl','--user','show',u,'--property=ActiveState,SubState,Result,ControlGroup,TasksCurrent'],capture_output=True,text=True,timeout=5)
 save('terminal-scope.json',{'unit':u,'returncode':t.returncode,'stdout':t.stdout,'stderr':t.stderr})
 provenance=json.loads((w/'provenance.json').read_text());checks=[]
 for item in provenance['inputs']:
  checks.append({'path':item['path'],'sha256Before':item['sha256Before'],'sha256AfterExecution':hashlib.sha256(pathlib.Path(item['path']).read_bytes()).hexdigest()})
 save('inputs-after-execution.json',{'inputs':checks,'unchanged':all(i['sha256Before']==i['sha256AfterExecution'] for i in checks)})
 print('scope terminal:',t.stdout)
 print((w/'target.stdout.log').read_text() if (w/'target.stdout.log').exists() else 'target not reached')
 print((w/'target.stderr.log').read_text() if (w/'target.stderr.log').exists() else '')
