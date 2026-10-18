from pathlib import Path
import datetime,json,socket,subprocess

ev=Path(__file__).resolve().parent
prepared=json.loads((ev/'postgres-preparation.json').read_text())
cert=json.loads((ev/'certify-r1-receipt.json').read_text())
assert cert['status']=='FINISHED', 'Do not remove a live certification database'
cid=prepared['containerId']
info=json.loads(subprocess.check_output(['docker','inspect',cid]))[0]
assert info['Id']==cid and info['Name']=='/cvg-hiso005-builtin-fix-pg'
assert info['Config']['Labels']['cvg.task']=='HISO005-0236-BUILTIN-REPAIR-20261018'
argv=['docker','exec',cid,'psql','-h','127.0.0.1','-U','postgres','-d',prepared['database'],'-Atc',"select count(*) from pg_stat_activity where datname=current_database() and pid<>pg_backend_pid();"]
p=subprocess.run(argv,capture_output=True,text=True)
assert p.returncode==0 and p.stdout.strip()=='0',(p.returncode,p.stdout,p.stderr)
operations=[]
for operation in ['stop','rm']:
    argv=['docker',operation,cid]
    p=subprocess.run(argv,capture_output=True,text=True,timeout=60)
    operations.append({'argv':argv,'exitCode':p.returncode,'stdout':p.stdout,'stderr':p.stderr})
    assert p.returncode==0
assert subprocess.run(['docker','inspect',cid],capture_output=True).returncode!=0
ports=[]
for port in [56238,3406,4406]:
    with socket.socket() as stream:
        stream.bind(('127.0.0.1',port))
    ports.append({'port':port,'observedFree':True})
result={'status':'PASS_OWN_RESOURCES_REMOVED','observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'containerId':cid,'ownerLabel':prepared['label'],'otherClientsBeforeStop':0,'operations':operations,'absenceConfirmed':True,'ports':ports,'retained':'Candidate/Git commits, prior sealed evidence, compiled reference and physical consumer retained; no peer resources changed.'}
(ev/'resource-cleanup-final.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'status':result['status'],'containerId':cid,'portsFree':[x['port']for x in ports]}))
