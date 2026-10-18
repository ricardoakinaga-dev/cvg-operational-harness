from pathlib import Path
import datetime,hashlib,json,os,re,subprocess
candidate=Path('/mnt/ia/cvg-hiso005-build0237-20261018')
ev=Path(__file__).resolve().parent
receipt=json.loads((ev/'certify-r2-receipt.json').read_text())
state=json.loads((ev/'state.json').read_text())
freeze=json.loads((ev/state['sourceFreeze']).read_text())
assert receipt['status']=='FINISHED' and receipt['exitCode']==0
head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=candidate,text=True).strip()
assert head==receipt['head']==freeze['commit']
for row in freeze['files']:assert hashlib.sha256((candidate/row['path']).read_bytes()).hexdigest()==row['sha256']
owned=Path('/mnt/ia/cvg-hiso005-build0237-runtime-20261018/certify-r2')
nodebin=Path('/home/ricardo/.nvm/versions/node/v22.23.2/bin')
env={k:os.environ[k]for k in ['HOME','USER','LOGNAME','LANG','LC_ALL','TZ','DISPLAY','XAUTHORITY']if k in os.environ}
env.update(PATH=str(nodebin)+':/usr/local/bin:/usr/bin:/bin',CI='true',CVG_TEST_SCOPE='all',TEST_DATABASE_URL='postgres://postgres:postgres@127.0.0.1:56239/cvg_build0237_r2',PHASE4A_DISPOSABLE_PG='1',PHASE4A_PG_REQUIRED='1',CVG_API_PORT='3416',CVG_WEB_PORT='4416',TMPDIR=str(owned/'tmp'),NPM_CONFIG_CACHE=str(owned/'npm-cache'),NPM_CONFIG_USERCONFIG=str(owned/'user.npmrc'),NPM_CONFIG_GLOBALCONFIG=str(owned/'global.npmrc'),NPM_CONFIG_UPDATE_NOTIFIER='false')
argv=[str(nodebin/'npm'),'run','certification:verify']
started=datetime.datetime.now(datetime.timezone.utc).isoformat()
p=subprocess.run(argv,cwd=candidate,env=env,capture_output=True,text=True,timeout=300)
qualified=re.findall(r'current candidate qualified: ([a-f0-9]{64})',p.stdout+p.stderr)
counts=re.findall(r'verified (\d+) artifact hashes',p.stdout+p.stderr)
record={'status':'PASS_CURRENT_38_HASHES'if p.returncode==0 and len(qualified)==1 and counts==['38']else'FAIL','mode':'current','sourceCommit':head,'startedAt':started,'finishedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'argv':argv,'exitCode':p.returncode,'stdout':p.stdout,'stderr':p.stderr,'qualifiedCandidateIds':qualified,'verifiedArtifactCounts':counts}
(ev/'certification-current-verification.json').write_text(json.dumps(record,indent=2)+'\n')
assert record['status']=='PASS_CURRENT_38_HASHES',record
state['certificationCandidateId']=qualified[0]
state['officialCurrentHashesVerified']=38
(ev/'state.json').write_text(json.dumps(state,indent=2)+'\n')
print(json.dumps({k:v for k,v in record.items()if k not in ['stdout','stderr']}))
