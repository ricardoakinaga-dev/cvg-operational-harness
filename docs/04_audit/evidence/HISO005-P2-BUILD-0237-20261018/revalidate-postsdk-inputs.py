from pathlib import Path
import datetime,hashlib,json,os,subprocess
b=Path(__file__).resolve().parent
c=Path('/mnt/ia/cvg-hiso005-build0237-20261018')
r=Path('/mnt/ia/cvg-hiso005-build0237-runtime-20261018')
node='/home/ricardo/.nvm/versions/node/v22.23.2/bin/node'
h=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
s=json.loads((b/'state.json').read_text());f=json.loads((b/s['sourceFreeze']).read_text())
cert=json.loads((b/'certify-r2-receipt.json').read_text());v=json.loads((b/'certification-current-verification.json').read_text())
assert cert['status']=='FINISHED' and cert['exitCode']==0 and v['status']=='PASS_CURRENT_38_HASHES'
assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=c,text=True).strip()==f['commit']==v['sourceCommit']
for row in f['files']+f['unchangedOriginal0236']:assert h(c/row['path'])==row['sha256']
ref=s['compiledReference'];manifest=Path(ref['manifestPath']);assert h(manifest)==ref['expectedSha256']
m=json.loads(manifest.read_text());assert m['commit']==f['commit'] and m['evaluatedRoot']==m['sourceRoot']==str(c)
physical=[]
for root in [c,Path(m['root'])]:
 for category in ['inputs','compilerSources','outputs']:
  for row in m[category]:
   p=root/row['file'];assert p.is_file()and not p.is_symlink()and h(p)==row['sha256']and p.stat().st_size==row['bytes'],str(p)
  physical.append({'root':str(root),'category':category,'files':len(m[category])})
code="""import {loadCompiledBuildReference} from './scripts/boundary-semantic-compiled.mjs';
const r=loadCompiledBuildReference(process.cwd(),JSON.parse(process.argv[1]),{installedReference:JSON.parse(process.argv[2])});console.log(JSON.stringify(r));if(r.status!=='PROVEN'||r.files.length!==112)process.exit(1);"""
env={'PATH':str(Path(node).parent)+':/usr/bin:/bin','LANG':'C','LC_ALL':'C','TZ':'UTC','TMPDIR':str(r/'lead')}
installed={'manifestPath':'/tmp/cvg-hiso005-integration-20261018/reference-r2/reference.json','expectedSha256':'89fd40e9c87c327aa96265d8730b08169f9220bb4904c97460fe0e536ec9b0ef'}
argv=[node,'--input-type=module','-e',code,json.dumps({'manifestPath':str(manifest),'expectedSha256':ref['expectedSha256']}),json.dumps(installed)]
p=subprocess.run(argv,cwd=c,env=env,capture_output=True,text=True,timeout=300)
reader={'argv':argv,'cwd':str(c),'exitCode':p.returncode,'stdout':p.stdout,'stderr':p.stderr}
(b/'compiled-postsdk-reader.json').write_text(json.dumps(reader,indent=2)+'\n');assert p.returncode==0
loaded=json.loads(p.stdout);assert loaded['status']=='PROVEN'and len(loaded['files'])==112
consumer=json.loads((b/'consumer-fresh-preparation.json').read_text());variant=Path(consumer['variant'])
assert consumer['actualGenerationCommit']==f['commit']and not(variant/'products').exists()
tracked=subprocess.check_output(['git','ls-tree','-r','--name-only',f['commit']],cwd=c,text=True).splitlines()
generated=subprocess.check_output(['git','diff','--name-only'],cwd=c,text=True).splitlines()
assert all(name.startswith('certification/')for name in generated),'Unexpected source change after qualification'
projection=[]
for name in tracked:
 if any(part in ['products','node_modules','dist']for part in Path(name).parts):continue # match the actual tar exclusions at every depth, including historical fixtures
 if name.startswith('certification/'):continue # generated qualification artifacts are separately bound by current38, not consumer source inputs
 if name.startswith('products/')or name=='.env'or '/.env' in name or name.startswith('.env'):continue
 if name.startswith('node_modules/')or '/node_modules/'in name or '/dist/'in name or name.endswith('.tsbuildinfo'):continue
 source=c/name;target=variant/name
 if source.is_symlink():
  assert target.is_symlink()and os.readlink(source)==os.readlink(target);projection.append({'path':name,'linkTarget':os.readlink(target)})
 elif source.is_file():
  assert target.is_file()and not target.is_symlink()and h(source)==h(target),name
  projection.append({'path':name,'sha256':h(target)})
for row in f['files']:assert h(variant/row['path'])==row['sha256']
report=b/'consumer-postsdk.json';assert not report.exists()
argv=[node,'audit-consumer/smoke.mjs',str(report)];p=subprocess.run(argv,cwd=variant,env=env,capture_output=True,text=True,timeout=180)
(b/'consumer-postsdk-command.json').write_text(json.dumps({'argv':argv,'cwd':str(variant),'exitCode':p.returncode,'stdout':p.stdout,'stderr':p.stderr},indent=2)+'\n');assert p.returncode==0
out=json.loads(report.read_text());assert out['status']=='PASS'and out['candidateCommit']==f['commit']and out['networkAttempts']==0 and out['documentedImportsCompiled']==207 and out['runtimeExportsChecked']==76
result={'status':'PASS_POSTCERT_COMPILED_AND_CONSUMER','observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sourceCommit':f['commit'],'compiledManifestSha256':h(manifest),'physicalInventoryChecks':physical,'dependencyRecordsRevalidatedByOfficialReader':len(m['dependencies']),'compiledReader':'compiled-postsdk-reader.json','consumerReport':'consumer-postsdk.json','consumerTrackedSourceProjection':projection,'currentQualificationOutputsExcludedFromConsumerSourceProjection':generated,'consumerProductPresent':False,'networkAttempts':0,'rootCertified':False,'b6Accepted':False}
(b/'postsdk-input-revalidation.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({k:v for k,v in result.items()if k!='consumerTrackedSourceProjection'}))
