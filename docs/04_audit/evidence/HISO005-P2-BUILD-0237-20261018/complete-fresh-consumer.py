from pathlib import Path
import datetime,hashlib,json,os,subprocess
project=Path('/home/ricardo/Área de trabalho/cvg-operational-harness')
candidate=Path('/mnt/ia/cvg-hiso005-build0237-20261018')
runtime=Path('/mnt/ia/cvg-hiso005-build0237-runtime-20261018')
ev=Path(__file__).resolve().parent
node='/home/ricardo/.nvm/versions/node/v22.23.2/bin/node'
h=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
state=json.loads((ev/'state.json').read_text());freeze=json.loads((ev/state['sourceFreeze']).read_text())
head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=candidate,text=True).strip()
assert head==freeze['commit']
for row in freeze['files']:assert h(candidate/row['path'])==row['sha256']
variant=runtime/'without-product-r2';consumer=variant/'audit-consumer';archive=runtime/'without-product-r2-source.tar'
assert not (variant/'products').exists()
exports=json.loads((consumer/'supported-exports.json').read_text());projects=list(dict.fromkeys(x['package']for x in exports))
removed=[{'path':'node_modules/@cvg/shift-assistant','target':'../../products/shift-assistant'}]
observer=Path('/tmp/cvg-hiso005-resolver-fix-20261018/without-product-r1/audit-consumer/smoke.mjs')
commands=[]
env={'PATH':str(Path(node).parent)+':/usr/bin:/bin','LANG':'C','LC_ALL':'C','TZ':'UTC','TMPDIR':str(runtime/'without-product-r2-tmp')}
def run(argv,cwd):
 p=subprocess.run(argv,cwd=cwd,env=env,capture_output=True,text=True,timeout=600)
 commands.append({'argv':argv,'cwd':str(cwd),'exitCode':p.returncode,'stdout':p.stdout,'stderr':p.stderr,'finishedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()})
 (ev/'consumer-completion-commands.json').write_text(json.dumps(commands,indent=2)+'\n')
 assert p.returncode==0,'See consumer-completion-commands.json'
 return p
config=runtime/'without-product-r2-tmp/sdk.json'
config.write_text(json.dumps({'extends':str(variant/'tsconfig.base.json'),'compilerOptions':{'paths':{},'typeRoots':[str(variant/'node_modules/@types')],'rootDir':str(variant/'packages/sdk/src'),'outDir':str(variant/'packages/sdk/dist'),'composite':False,'incremental':False,'noEmitOnError':True},'include':[str(variant/'packages/sdk/src/**/*.ts')],'exclude':[str(variant/'packages/sdk/src/**/*.test.ts'),str(variant/'packages/sdk/src/**/__tests__/**')]},indent=2)+'\n')
run([node,'node_modules/typescript/bin/tsc','-p',str(config)],variant)
run([node,'node_modules/typescript/bin/tsc','-p','audit-consumer/tsconfig.json'],variant)
report=ev/'consumer-precert.json';assert not report.exists()
run([node,'audit-consumer/smoke.mjs',str(report)],variant)
out=json.loads(report.read_text())
assert out['status']=='PASS'and out['candidateCommit']==head and out['networkAttempts']==0
assert out['documentedImportsCompiled']==len(exports)
assert out['runtimeExportsChecked']==sum(x['kind']=='valor'for x in exports)
summary={'status':'FRESH_COMPILED_CONSUMER_PASS','observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'actualGenerationCommit':head,'variant':str(variant),'archiveSha256':h(archive),'productPresent':False,'removedProductLinks':removed,'exportRows':len(exports),'runtimeExports':out['runtimeExportsChecked'],'packageCount':len(projects),'observerOriginalSha256':h(observer),'observerCurrentSha256':h(consumer/'smoke.mjs'),'exampleSha256':h(consumer/'reception-agent.mts'),'sourceAliases':False,'networkAttempts':0,'commands':'consumer-preparation-r2-commands.json + consumer-completion-commands.json','report':'consumer-precert.json','semanticApproval':False,'productionApproved':False}
(ev/'consumer-fresh-preparation.json').write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps(summary))
