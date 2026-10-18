from pathlib import Path
import datetime,hashlib,json,os,subprocess,time,shutil,signal
candidate=Path('/mnt/ia/cvg-hiso005-build0237-20261018')
ev=Path(__file__).resolve().parent
runtime=Path('/mnt/ia/cvg-hiso005-build0237-runtime-20261018')
project=Path('/home/ricardo/Área de trabalho/cvg-operational-harness')
state=json.loads((ev/'state.json').read_text())
freeze=json.loads((ev/state['sourceFreeze']).read_text())
head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=candidate,text=True).strip()
assert head==freeze['commit']
for row in freeze['files']: assert hashlib.sha256((candidate/row['path']).read_bytes()).hexdigest()==row['sha256'],row['path']
assert subprocess.check_output(['git','status','--porcelain'],cwd=candidate,text=True)==''
state=json.loads((ev/'state.json').read_text())
reviewPath=ev/state['acceptedCodeReview']
review=json.loads(reviewPath.read_text())
assert review['sourceCommit']==head and review['verdict']=='APPROVE'
assert not review['requiredFindings'], 'Current independent review must close all mandatory findings'
focused=json.loads((ev/'focused-final-r2.json').read_text())
assert focused['exitCode']==0 and focused['sourceStable'] and focused['sourceCommit']==head
consumer=json.loads((ev/'consumer-fresh-preparation.json').read_text())
assert consumer['status']=='FRESH_COMPILED_CONSUMER_PASS' and consumer['actualGenerationCommit']==head
pg=json.loads((ev/'postgres-resource.json').read_text())
assert pg['status']=='READY' and pg['task']=='HISO005-P2-BUILD-0237'
assert shutil.disk_usage(candidate).free>2*1024**3
assert shutil.disk_usage(project).free>512*1024**2
owned=runtime/'certify-r1'
owned.mkdir();(owned/'tmp').mkdir();(owned/'npm-cache').mkdir()
for name in ['user.npmrc','global.npmrc']:(owned/name).write_text('')
nodebin=Path('/home/ricardo/.nvm/versions/node/v22.23.2/bin')
env={k:os.environ[k]for k in ['HOME','USER','LOGNAME','LANG','LC_ALL','TZ','DISPLAY','XAUTHORITY']if k in os.environ}
env.update(PATH=str(nodebin)+':/usr/local/bin:/usr/bin:/bin',CI='true',CVG_TEST_SCOPE='all',TEST_DATABASE_URL='postgres://postgres:postgres@127.0.0.1:56239/cvg_build0237_r1',PHASE4A_DISPOSABLE_PG='1',PHASE4A_PG_REQUIRED='1',CVG_API_PORT='3416',CVG_WEB_PORT='4416',TMPDIR=str(owned/'tmp'),NPM_CONFIG_CACHE=str(owned/'npm-cache'),NPM_CONFIG_USERCONFIG=str(owned/'user.npmrc'),NPM_CONFIG_GLOBALCONFIG=str(owned/'global.npmrc'),NPM_CONFIG_UPDATE_NOTIFIER='false')
argv=[str(nodebin/'npm'),'run','certify']
receipt={'task':'HISO005-P2-BUILD-0237','attempt':1,'command':argv,'cwd':str(candidate),'head':head,'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'status':'RUNNING','testScope':'all','database':'own synthetic loopback56239 cvg_build0237_r1','e2ePorts':[3416,4416],'ownNpmCache':str(owned/'npm-cache'),'environmentKeys':sorted(env),'sourceFreeze':state['sourceFreeze'],'acceptedCodeReview':state['acceptedCodeReview'],'reviewSha256':hashlib.sha256(reviewPath.read_bytes()).hexdigest()}
start=time.time()
with (ev/'certify-r1.log').open('w')as log:
 process=subprocess.Popen(argv,cwd=candidate,env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
 stat=Path(f'/proc/{process.pid}/stat').read_text();receipt.update(pid=process.pid,processStartTicks=stat[stat.rindex(')')+2:].split()[19])
 (ev/'certify-r1-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({'pid':process.pid,'startedAt':receipt['startedAt']}),flush=True)
 while True:
  try: code=process.wait(timeout=5);break
  except subprocess.TimeoutExpired:
   free=shutil.disk_usage(candidate).free
   rootfree=shutil.disk_usage(project).free
   if free<750*1024**2 or rootfree<256*1024**2 or time.time()-start>7200:
    receipt['abortedByOwnedResourceGuard']={'availableCandidateBytes':free,'availableRootBytes':rootfree,'elapsedSeconds':time.time()-start}
    os.killpg(process.pid,signal.SIGTERM)
    try: code=process.wait(timeout=10)
    except subprocess.TimeoutExpired: os.killpg(process.pid,signal.SIGKILL);code=process.wait()
    break
receipt.update(status='FINISHED',exitCode=code,finishedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),elapsedSeconds=round(time.time()-start,3));(ev/'certify-r1-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({'exitCode':code,'elapsedSeconds':receipt['elapsedSeconds']}));raise SystemExit(code)
