from pathlib import Path
import datetime,hashlib,json,os,subprocess,time
root=Path('/home/ricardo/cvg-candidates/hiso005-resolver-fix-20261018')
ev=Path(__file__).resolve().parent
freeze=json.loads((ev/'source-freeze-r2.json').read_text())
head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()
assert head==freeze['commit']
for row in freeze['files']: assert hashlib.sha256((root/row['path']).read_bytes()).hexdigest()==row['sha256'],row['path']
assert subprocess.check_output(['git','status','--porcelain'],cwd=root,text=True)==''
review=json.loads((ev/'review-r2/review.json').read_text())
assert review.get('sourceCommit')==head and review.get('summary',{}).get('mandatoryFindings')==0, 'Fresh review must bind current source and close all mandatory findings'
assert not any(x.get('mandatory',True)for x in review.get('findings',[])), 'No unresolved mandatory findings'
assert review.get('verdict')=='APPROVE', 'Fresh review must approve actual frozen source before this attempt'
owned=Path('/tmp/cvg-hiso005-resolver-fix-20261018/certify-r1')
owned.mkdir();(owned/'tmp').mkdir();(owned/'npm-cache').mkdir()
for name in ['user.npmrc','global.npmrc']:(owned/name).write_text('')
nodebin=Path('/home/ricardo/.nvm/versions/node/v22.23.2/bin')
env={k:os.environ[k]for k in ['HOME','USER','LOGNAME','LANG','LC_ALL','TZ','DISPLAY','XAUTHORITY']if k in os.environ}
env.update(PATH=str(nodebin)+':/usr/local/bin:/usr/bin:/bin',CI='true',CVG_TEST_SCOPE='all',TEST_DATABASE_URL='postgres://postgres:postgres@127.0.0.1:56237/cvg_resolver_fix_r1',PHASE4A_DISPOSABLE_PG='1',PHASE4A_PG_REQUIRED='1',CVG_API_PORT='3396',CVG_WEB_PORT='4396',TMPDIR=str(owned/'tmp'),NPM_CONFIG_CACHE=str(owned/'npm-cache'),NPM_CONFIG_USERCONFIG=str(owned/'user.npmrc'),NPM_CONFIG_GLOBALCONFIG=str(owned/'global.npmrc'),NPM_CONFIG_UPDATE_NOTIFIER='false')
argv=[str(nodebin/'npm'),'run','certify']
receipt={'task':'HISO005-0236-RESOLVER-CONFORMANCE-20261018','attempt':1,'command':argv,'cwd':str(root),'head':head,'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'status':'RUNNING','testScope':'all','database':'own synthetic loopback56237 cvg_resolver_fix_r1','e2ePorts':[3396,4396],'ownNpmCache':str(owned/'npm-cache'),'environmentKeys':sorted(env),'sourceFreeze':'source-freeze-r2.json','compiledPinsPrepared':True,'reviewSha256':hashlib.sha256((ev/'review-r2/review.json').read_bytes()).hexdigest()}
start=time.time()
with (ev/'certify-r1.log').open('w')as log:
 process=subprocess.Popen(argv,cwd=root,env=env,stdout=log,stderr=subprocess.STDOUT)
 stat=Path(f'/proc/{process.pid}/stat').read_text();receipt.update(pid=process.pid,processStartTicks=stat[stat.rindex(')')+2:].split()[19])
 (ev/'certify-r1-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({'pid':process.pid,'startedAt':receipt['startedAt']}),flush=True);code=process.wait()
receipt.update(status='FINISHED',exitCode=code,finishedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),elapsedSeconds=round(time.time()-start,3));(ev/'certify-r1-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({'exitCode':code,'elapsedSeconds':receipt['elapsedSeconds']}));raise SystemExit(code)
