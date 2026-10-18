from pathlib import Path
import datetime,hashlib,json,os,subprocess
b=Path(__file__).resolve().parent;c=Path('/mnt/ia/cvg-hiso005-build0237-20261018');r=Path('/mnt/ia/cvg-hiso005-build0237-runtime-20261018');node='/home/ricardo/.nvm/versions/node/v22.23.2/bin/node';s=json.loads((b/'state.json').read_text());f=json.loads((b/s['sourceFreeze']).read_text());h=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=c,text=True).strip()==f['commit']
for row in f['files']+f['unchangedOriginal0236']:assert h(c/row['path'])==row['sha256']
tmp=r/'retry-preparation';tmp.mkdir();env={'PATH':str(Path(node).parent)+':/usr/bin:/bin','LANG':'C','LC_ALL':'C','TZ':'UTC','TMPDIR':str(tmp)};rows=[]
for argv in [[node,'scripts/build-runtime.mjs'],[node,'node_modules/typescript/bin/tsc','-b','packages/shared/tsconfig.json','--force'],[node,'node_modules/vitest/vitest.mjs','run','tests/pare100-compiled-kernel-boundary.test.js','tests/pare100-sdk-boundary-qualification.test.js','--no-file-parallelism','--maxWorkers=2']]:
 start=datetime.datetime.now(datetime.timezone.utc).isoformat();p=subprocess.run(argv,cwd=c,env=env,capture_output=True,text=True,timeout=600);rows.append({'argv':argv,'cwd':str(c),'startedAt':start,'finishedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'exitCode':p.returncode,'stdout':p.stdout,'stderr':p.stderr});(b/'retry-preparation-commands.json').write_text(json.dumps(rows,indent=2)+'\n');assert p.returncode==0,'See retry-preparation-commands.json'
m=json.loads(Path(s['compiledReference']['manifestPath']).read_text())
for row in m['outputs']:assert h(c/row['file'])==row['sha256'],row['file']
for row in f['files']+f['unchangedOriginal0236']:assert h(c/row['path'])==row['sha256']
result={'status':'RUNTIME_PREPARED_MISSING_INPUTS_REPRODUCTION_PASS','observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sourceCommit':f['commit'],'source20Unchanged':True,'compiled112OutputsStillExact':True,'commands':'retry-preparation-commands.json','sourceEdited':False,'reviewBudgetReset':False};(b/'retry-preparation.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
