import subprocess,pathlib,json,datetime,os,sys,time
s=pathlib.Path('/home/ricardo/.cache/cvg-harness-audit-actions-20261003/product-final-critic'); e=pathlib.Path('/home/ricardo/Área de trabalho/cvg-operational-harness/docs/04_audit/evidence/HARNESS-ISO-EXEC-20261003/audit-actions/product-final-critic'); name=sys.argv[1];cmd=sys.argv[2:];env=os.environ.copy();env['PATH']='/home/ricardo/.nvm/versions/node/v22.23.2/bin:'+env['PATH'];env['TMPDIR']=str(s/'tmp');env.pop('DATABASE_URL',None);env.pop('PG_URL',None)
start=datetime.datetime.now(datetime.timezone.utc).isoformat()
with (e/(name+'.log')).open('w') as f:
 p=subprocess.run(cmd,cwd=s/'candidate',env=env,stdout=f,stderr=subprocess.STDOUT)
(e/(name+'.command.json')).write_text(json.dumps({'command':cmd,'cwd':str(s/'candidate'),'started':start,'ended':datetime.datetime.now(datetime.timezone.utc).isoformat(),'exit':p.returncode,'TMPDIR':env['TMPDIR'],'PATH_prefix':'/home/ricardo/.nvm/versions/node/v22.23.2/bin','log':name+'.log'},indent=2)+'\n');print(name,p.returncode)
