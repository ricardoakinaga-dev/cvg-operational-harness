from pathlib import Path
import datetime,hashlib,json,os,re,shutil,subprocess
project=Path('/home/ricardo/Área de trabalho/cvg-operational-harness')
candidate=Path('/mnt/ia/cvg-hiso005-build0237-20261018')
runtime=Path('/mnt/ia/cvg-hiso005-build0237-runtime-20261018')
ev=Path(__file__).resolve().parent
node='/home/ricardo/.nvm/versions/node/v22.23.2/bin/node'
h=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
state=json.loads((ev/'state.json').read_text())
freeze=json.loads((ev/state['sourceFreeze']).read_text())
review=json.loads((ev/state['acceptedCodeReview']).read_text())
assert review['verdict']=='APPROVE' and not review['requiredFindings']
head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=candidate,text=True).strip()
assert head==freeze['commit']==review['sourceCommit']
for row in freeze['files']:assert h(candidate/row['path'])==row['sha256']
variant=runtime/'without-product-r2'
consumerTmp=runtime/'without-product-r2-tmp'
consumerTmp.mkdir()
assert not variant.exists() and shutil.disk_usage(runtime).free>8*1024**3
variant.mkdir()
env={'PATH':str(Path(node).parent)+':/usr/bin:/bin','LANG':'C','LC_ALL':'C','TZ':'UTC','TMPDIR':str(consumerTmp)}
commands=[]
def run(argv,cwd):
 start=datetime.datetime.now(datetime.timezone.utc).isoformat()
 p=subprocess.run(argv,cwd=cwd,env=env,capture_output=True,text=True,timeout=600)
 record={'argv':argv,'cwd':str(cwd),'startedAt':start,'finishedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'exitCode':p.returncode,'stdout':p.stdout,'stderr':p.stderr}
 commands.append(record)
 (ev/'consumer-preparation-r2-commands.json').write_text(json.dumps(commands,indent=2)+'\n')
 assert p.returncode==0, 'Command failed; inspect consumer-preparation-r2-commands.json'
 return p
archive=runtime/'without-product-r2-source.tar'
assert not archive.exists()
run(['/usr/bin/git','-c','core.hooksPath=/dev/null','archive','--format=tar','--output='+str(archive),head],candidate)
run(['/usr/bin/tar','-xf',str(archive),'-C',str(variant),'--no-same-owner','--no-same-permissions','--exclude=products','--exclude=products/*','--exclude=node_modules','--exclude=*/node_modules','--exclude=dist','--exclude=*/dist','--exclude=*.tsbuildinfo','--exclude=.env*','--exclude=*/.env*'],candidate)
assert not (variant/'products').exists()
shutil.copytree(candidate/'node_modules',variant/'node_modules',symlinks=True)
removed=[]
for p in (variant/'node_modules/@cvg').glob('*'):
 if not p.is_symlink():continue
 target=(p.parent/os.readlink(p)).resolve()
 assert target.is_relative_to(variant),str(p)
 if target.is_relative_to(variant/'products'):
  removed.append({'path':str(p.relative_to(variant)),'target':os.readlink(p)})
  p.unlink()
assert h(variant/'node_modules/typescript/lib/typescript.js')=='569177652966bd528c319171c7dd22860dbf72bde116cbc4f644f1d02bb12e39'
def rows(doc):
 result=[]
 for package,body in re.findall(r'<!-- supported-exports:([^ >]+) -->(.*?)<!-- /supported-exports -->',doc.read_text(),re.S):
  assert re.fullmatch(r'@cvg/[a-z0-9-]+',package)
  for line in body.splitlines():
   fields=line.split('|')
   if len(fields)<5 or fields[2].strip()not in ['tipo','valor']:continue
   for name in re.findall(r'`([^`]+)`',fields[1]):
    assert re.fullmatch(r'[A-Za-z_$][A-Za-z0-9_$]*',name)
    result.append({'package':package,'name':name,'kind':fields[2].strip(),'stability':fields[4].strip().strip('`')})
 return result
exports=rows(candidate/'docs/architecture/PUBLIC_API.md')
assert exports and exports==rows(project/'docs/architecture/PUBLIC_API.md')==rows(variant/'docs/architecture/PUBLIC_API.md')
consumer=variant/'audit-consumer';consumer.mkdir()
(consumer/'supported-exports.json').write_text(json.dumps(exports,ensure_ascii=False,indent=2)+'\n')
imports=[]
for i,row in enumerate(exports):
 imports.append('import '+('type 'if row['kind']=='tipo'else '')+'{ '+row['name']+' as E'+str(i)+' } from '+json.dumps(row['package'])+';')
(consumer/'public-imports.mts').write_text('\n'.join(imports)+'\nexport const importCount = '+str(len(exports))+';\n')
shutil.copyfile(variant/'examples/consumers/reception-agent/index.ts',consumer/'reception-agent.mts')
(consumer/'tsconfig.json').write_text(json.dumps({'extends':'../tsconfig.base.json','compilerOptions':{'paths':{},'rootDir':'.','outDir':'dist','composite':False,'declaration':False,'sourceMap':False,'incremental':False,'noEmitOnError':True},'include':['*.mts']},indent=2)+'\n')
observer=Path('/tmp/cvg-hiso005-resolver-fix-20261018/without-product-r1/audit-consumer/smoke.mjs')
assert h(observer)=='097c5f11599bff0e3f31e05306b2ca5c9031a8946ca265b7e187f97634d128d1'
source=observer.read_text().replace('HISO005-0236-RESOLVER-CONFORMANCE-20261018','HISO005-P2-BUILD-0237').replace('26d866c39060669680aca01b34a916d45e1ba362',freeze['base']).replace('1c2012d9514c0f30be1c27cdc7458a9484ab6c6f',head)
(consumer/'smoke.mjs').write_text(source)
projects=[]
for name in dict.fromkeys(x['package']for x in exports):
 package=(variant/'node_modules'/name).resolve()
 assert package.is_relative_to(variant/'packages')
 config=package/'tsconfig.json';assert config.is_file()
 projects.append(str(config.relative_to(variant)))
run([node,'scripts/build-runtime.mjs'],variant)
run([node,'node_modules/typescript/bin/tsc','-p','audit-consumer/tsconfig.json'],variant)
report=ev/'consumer-precert.json';assert not report.exists()
run([node,'audit-consumer/smoke.mjs',str(report)],variant)
out=json.loads(report.read_text())
assert out['status']=='PASS'and out['candidateCommit']==head and out['networkAttempts']==0
assert out['documentedImportsCompiled']==len(exports)
assert out['runtimeExportsChecked']==sum(x['kind']=='valor'for x in exports)
summary={'status':'FRESH_COMPILED_CONSUMER_PASS','observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'actualGenerationCommit':head,'variant':str(variant),'archiveSha256':h(archive),'productPresent':False,'removedProductLinks':removed,'exportRows':len(exports),'runtimeExports':out['runtimeExportsChecked'],'packageCount':len(projects),'observerOriginalSha256':h(observer),'observerCurrentSha256':h(consumer/'smoke.mjs'),'exampleSha256':h(consumer/'reception-agent.mts'),'sourceAliases':False,'networkAttempts':0,'commands':'consumer-preparation-r2-commands.json','report':'consumer-precert.json','semanticApproval':False,'productionApproved':False}
(ev/'consumer-fresh-preparation.json').write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps(summary))
