"""Revalidate unchanged build inputs without relabelling their generation event."""
from pathlib import Path
import datetime, hashlib, json, subprocess, sys

ev=Path(__file__).resolve().parent
candidate=Path('/home/ricardo/cvg-candidates/hiso005-resolver-fix-20261018')
owned=Path('/tmp/cvg-hiso005-resolver-fix-20261018')
node='/home/ricardo/.nvm/versions/node/v22.23.2/bin/node'
sha=lambda b:hashlib.sha256(b).hexdigest()
freeze=json.loads((ev/'source-freeze-r2.json').read_text())
head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=candidate,text=True).strip()
assert head==freeze['commit']
phase=sys.argv[1] if len(sys.argv)==2 else 'precert'
assert phase in ['precert','postcert']
generation='1c2012d9514c0f30be1c27cdc7458a9484ab6c6f'
changed=subprocess.check_output(['git','diff','--name-only',generation,head],cwd=candidate,text=True).splitlines()
assert set(changed)=={x['path']for x in freeze['files']}
refpath=owned/'compiled-reference-r1/reference.json'
ref=json.loads(refpath.read_text())
assert ref['commit']==generation and ref['evaluatedRoot']==str(candidate)
assert sha(refpath.read_bytes())=='d6df970d627424bc15e28bcc64ea5ebc9d9c6903337b176ce7979ddd4d5052f3'
assert sha((candidate/'scripts/boundary-semantic-compiled.mjs').read_bytes())==ref['recipeSha256']
verified={}
for name in ['inputs','compilerSources','outputs']:
 for row in ref[name]:
  for root in [candidate,Path(ref['root'])]:
   p=root/row['file'];data=p.read_bytes()
   assert len(data)==row['bytes'] and sha(data)==row['sha256'],str(p)
 verified[name]=len(ref[name])
installed={'manifestPath':'/tmp/cvg-hiso005-integration-20261018/reference-r2/reference.json','expectedSha256':'89fd40e9c87c327aa96265d8730b08169f9220bb4904c97460fe0e536ec9b0ef'}
args={'root':str(candidate),'compiled':{'manifestPath':str(refpath),'expectedSha256':sha(refpath.read_bytes())},'installedReference':installed}
script="import {loadCompiledBuildReference} from './scripts/boundary-semantic-compiled.mjs'; const x=JSON.parse(process.argv[1]); console.log(JSON.stringify(loadCompiledBuildReference(x.root,x.compiled,{installedReference:x.installedReference})))"
env={'PATH':str(Path(node).parent)+':/usr/bin:/bin','LANG':'C','LC_ALL':'C','TZ':'UTC'}
p=subprocess.run([node,'--input-type=module','--eval',script,json.dumps(args)],cwd=candidate,env=env,capture_output=True,timeout=240)
(ev/f'compiled-reference-{phase}-reader.stdout.json').write_bytes(p.stdout)
(ev/f'compiled-reference-{phase}-reader.stderr.txt').write_bytes(p.stderr)
assert p.returncode==0 and not p.stderr,(p.returncode,p.stderr)
loaded=json.loads(p.stdout);assert loaded['status']=='PROVEN' and len(loaded['files'])==112
variant=owned/'without-product-r1';prep=json.loads((ev/'consumer-r1-preparation.json').read_text())
assert prep['commit']==generation and not (variant/'products').exists()
# All tracked package, example, build-recipe and TypeScript inputs must match the fresh archive.
tracked=subprocess.check_output(['git','ls-files','-z'],cwd=candidate).decode().split('\0')
inputs=[]
for name in tracked:
 if not name or name in changed:continue
 path=Path(name)
 if (path.parts[0]in ['packages','examples'] or name in ['package.json','package-lock.json','tsconfig.base.json','tsconfig.json','docs/architecture/PUBLIC_API.md'] or name.startswith('scripts/build-')):
  a=candidate/name;b=variant/name
  if a.is_file()and not a.is_symlink():
   assert b.is_file() and not b.is_symlink() and a.read_bytes()==b.read_bytes(),name
   inputs.append({'file':name,'sha256':sha(a.read_bytes())})
old=json.loads((ev/'compiled-consumer-r1.json').read_text())
assert sha((variant/'audit-consumer/smoke.mjs').read_bytes())==prep['observerCurrentSha256']
runtime=[]
for row in old['moduleResolutions']:
 from urllib.parse import unquote,urlparse
 absolute=Path(unquote(urlparse(row['url']).path));rel=absolute.relative_to(variant)
 assert not absolute.is_symlink() and absolute.is_file()
 if str(rel).startswith('audit-consumer/'):
  runtime.append({'file':str(rel),'sha256':sha(absolute.read_bytes()),'compiledConsumerOwnOutput':True})
 else:
  assert absolute.read_bytes()==(candidate/rel).read_bytes(),str(rel)
  runtime.append({'file':str(rel),'sha256':sha(absolute.read_bytes()),'candidateByteExact':True})
resultpath=ev/f'compiled-consumer-{phase}.json';assert not resultpath.exists()
argv=[node,'audit-consumer/smoke.mjs',str(resultpath)]
p=subprocess.run(argv,cwd=variant,env=env,capture_output=True,timeout=120)
(ev/f'compiled-consumer-{phase}.stdout.txt').write_bytes(p.stdout)
(ev/f'compiled-consumer-{phase}.stderr.txt').write_bytes(p.stderr)
assert p.returncode==0 and not p.stderr,(p.returncode,p.stderr)
actual=json.loads(resultpath.read_text());assert actual['status']=='PASS'and actual['candidateCommit']==generation and actual['documentedImportsCompiled']==207 and actual['runtimeExportsChecked']==76 and actual['networkAttempts']==0
result={'status':'PASS_UNCHANGED_INPUT_PROJECTION_AND_CURRENT_REPLAY','observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'qualificationSourceCommit':head,'actualCompiledGenerationCommit':generation,'changedPathsOutsideGateInputs':changed,'compiledReferenceSha256':sha(refpath.read_bytes()),'compiledReaderStatus':loaded['status'],'compiledVerified':verified,'installedDependenciesRevalidatedByOfficialReader':len(ref['dependencies']),'consumerTrackedInputsVerified':inputs,'consumerRuntimeBytesVerified':runtime,'consumerReplayCommand':argv,'consumerReplayExitCode':p.returncode,'consumerReplaySha256':sha(resultpath.read_bytes()),'sourceAliases':False,'productPresent':False,'networkAttempts':0,'newCompilationClaimed':False,'b6Accepted':False}
(ev/f'projection-revalidation-{phase}.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items()if k not in ['consumerTrackedInputsVerified','consumerRuntimeBytesVerified']}))
