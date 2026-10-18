from pathlib import Path
import datetime,json,os,socket,subprocess
b=Path(__file__).resolve().parent
c='/mnt/ia/cvg-hiso005-build0237-20261018';runtime='/mnt/ia/cvg-hiso005-build0237-runtime-20261018'
cert=json.loads((b/'certify-r2-receipt.json').read_text());assert cert['status']=='FINISHED'
pg=json.loads((b/'postgres-resource.json').read_text());ident=pg['containerId'];assert ident=='9d51374f0e9edf97dfb8135690c8fc5ca80ca0b285dc9aae0602d60a56da5ab2'
observations=[]
def run(argv):
 p=subprocess.run(argv,capture_output=True,text=True,timeout=60);observations.append({'argv':argv,'exitCode':p.returncode,'stdout':p.stdout,'stderr':p.stderr});return p
info=run(['docker','inspect',ident]);assert info.returncode==0
container=json.loads(info.stdout)[0];assert container['Id']==ident and container['Config']['Labels']['cvg.task']=='HISO005-P2-BUILD-0237'
active=[]
for path in Path('/proc').iterdir():
 if not path.name.isdigit():continue
 try:args=(path/'cmdline').read_bytes().split(b'\0');exe=Path(os.fsdecode(args[0])).name;cwd=os.readlink(path/'cwd')
 except(OSError,IndexError):continue
 if exe in ['node','npm','chromium','chrome']and(cwd==c or cwd.startswith(c+'/')or cwd==runtime or cwd.startswith(runtime+'/')):active.append({'pid':int(path.name),'exe':exe,'cwd':cwd})
assert not active,active
sql="select count(*) from pg_stat_activity where datname in ('cvg_build0237_r1','cvg_build0237_r2') and pid<>pg_backend_pid() and backend_type='client backend'"
p=run(['docker','exec','-e','PGPASSWORD=postgres',ident,'psql','-h','127.0.0.1','-U','postgres','-d','cvg_build0237_r2','-tAc',sql]);assert p.returncode==0 and p.stdout.strip()=='0'
p=run(['docker','rm','-f',ident]);assert p.returncode==0
p=run(['docker','inspect',ident]);assert p.returncode!=0
for port in [56239,3416,4416]:
 with socket.socket()as server:server.bind(('127.0.0.1',port))
result={'status':'OWN_RUNTIME_CLEANED','observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'containerId':ident,'identityAndLabelVerified':True,'clientBackendsBeforeRemoval':0,'containerAbsent':True,'portsFree':[56239,3416,4416],'ownProcesses':active,'commands':observations}
(b/'cleanup-owned-runtime.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({k:v for k,v in result.items()if k!='commands'}))
