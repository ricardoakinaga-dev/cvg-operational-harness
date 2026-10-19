from pathlib import Path
import datetime,hashlib,json,os,subprocess
b=Path(__file__).resolve().parent;runtime=Path('/mnt/ia/cvg-hiso005-metadata-recon-20261018');candidate=Path('/mnt/ia/cvg-hiso005-build0237-20261018');node='/home/ricardo/.nvm/versions/node/v22.23.2/bin/node';env={'PATH':str(Path(node).parent)+':/usr/bin:/bin','LANG':'C','LC_ALL':'C','TZ':'UTC','TMPDIR':str(runtime)};h=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();commands=[]
def run(argv,cwd,timeout=60):
 p=subprocess.run(argv,cwd=cwd,env=env,capture_output=True,text=True,timeout=timeout);row={'argv':argv,'cwd':str(cwd),'exitCode':p.returncode,'stdout':p.stdout,'stderr':p.stderr,'finishedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()};commands.append(row);(b/'node-witness-commands.json').write_text(json.dumps(commands,indent=2)+'\n');assert p.returncode==0,'Inspect node-witness-commands.json';return json.loads(p.stdout)
native=run([node,'--input-type=module','-e',"const n=process.binding('natives');console.log(JSON.stringify({node:process.versions.node,sources:Object.fromEntries(['internal/modules/esm/resolve','internal/modules/cjs/loader','internal/modules/package_json_reader'].map(k=>[k,n[k]]))}));"],candidate)
sourceDir=b/'node-primary-sources';sourceDir.mkdir();nativeRows=[]
for name,source in native['sources'].items():
 assert source and isinstance(source,str);p=sourceDir/(name.replace('/','__')+'.source.txt');p.write_text(source);nativeRows.append({'module':name,'path':str(p.relative_to(b)),'bytes':p.stat().st_size,'sha256':h(p)})
(b/'node-primary-source-binding.json').write_text(json.dumps({'node':native['node'],'binary':node,'binarySha256':h(Path(node)),'sources':nativeRows,'sourceKind':'Actual built-in JS from the pinned Node binary; not internet/third-party description.'},indent=2)+'\n')
oracle="""import fs from 'node:fs';import {createRequire,registerHooks}from'node:module';import{pathToFileURL,fileURLToPath}from'node:url';let blocked=0;registerHooks({load(url,c,next){if(url.startsWith('file:')){blocked++;throw Error('TARGET_LOAD_FORBIDDEN')}return next(url,c)}});const[mode,from,spec]=process.argv.slice(1);try{const value=mode==='import'?import.meta.resolve(spec):createRequire(pathToFileURL(from)).resolve(spec);let regular=null;try{const file=value.startsWith('file:')?fileURLToPath(value):value;const s=fs.lstatSync(file);regular=s.isFile()&&!s.isSymbolicLink()}catch{}console.log(JSON.stringify({status:'RESOLVED',mode,specifier:spec,value,regular,blockedLoads:blocked,targetModuleEvaluations:0}))}catch(e){console.log(JSON.stringify({status:'ERROR',mode,specifier:spec,code:e.code||e.name,message:e.message,blockedLoads:blocked,targetModuleEvaluations:0}))}"""
helper="""import fs from'node:fs';import{registerHooks}from'node:module';import{pathToFileURL}from'node:url';const helper=process.argv[1];let blocked=0;registerHooks({load(u,c,next){if(u.startsWith('file:')&&u!==pathToFileURL(helper).href){blocked++;throw Error('TARGET_LOAD_FORBIDDEN:'+u)}return next(u,c)}});const{createResolutionSession}=await import(pathToFileURL(helper));const[root,from,specifier,mode]=process.argv.slice(2);const products=[];const s=createResolutionSession({root,onProduct:(target,from)=>products.push({target,from})});let r;try{const t=s.resolve({from,specifier,mode});r={status:'RESOLVED',file:t.file,logicalURL:t.logicalURL,trace:t,products}}catch(e){r={status:'REFUSED',reason:e.message.split(':')[0],message:e.message,products}}finally{s.close()}console.log(JSON.stringify({...r,blockedLoads:blocked,targetModuleEvaluations:0,descriptorHighWater:s.usage.openDescriptors}));"""
census=json.loads((b/'census.json').read_text());real=[];seen=set()
for edge in census['edges']:
 if edge['reason']!='UNKNOWN_AMBIGUOUS_RESOLUTION':continue
 key=(edge['specifier'],edge['mode'])
 if key in seen:continue
 seen.add(key);file=candidate/edge['file'];out=run([node,'--input-type=module','-e',oracle,edge['mode'],str(file),edge['specifier']],file.parent)
 real.append({'file':edge['file'],'sourceSha256':h(file),'specifier':edge['specifier'],'mode':edge['mode'],'frozenHelperGuard':edge['guardClass'],'helperEdgeId':edge['id'],'nodeResolution':out})
# Also observe CJS condition selection independently, without asserting it is the actual importer mode.
first=next(e for e in census['edges']if e['reason']=='UNKNOWN_AMBIGUOUS_RESOLUTION'and e['specifier']=='vitest');file=candidate/first['file'];real.append({'file':first['file'],'specifier':'vitest','mode':'require','scope':'Counterfactual CJS oracle mode, not an actual ESM importer edge','nodeResolution':run([node,'--input-type=module','-e',oracle,'require',str(file),'vitest'],file.parent)})
(b/'real-node-resolution-witnesses.json').write_text(json.dumps({'status':'NODE_ONLY_RESOLUTION_OBSERVED','rows':real,'noTargetEvaluation':True,'notAClosureProof':True},indent=2)+'\n')
fixtureDir=runtime/'selector-witnesses';fixtureDir.mkdir();rows=[];fixtureInventory=[]
variants=['plain','imports-unused','inactive-pattern','both-unused','active-pattern','active-hash','selected-missing','opaque-body','mixed-global','numeric-selected','selected-array','inactive-bad-target','selected-product-alias','both-unused-product-alias']
for case in variants:
 root=fixtureDir/case;(root/'packages/demo/src').mkdir(parents=True);(root/'node_modules').mkdir();(root/'node_modules/demo').symlink_to('../packages/demo')
 (root/'package.json').write_text(json.dumps({'name':'metadata-fixture','type':'module','workspaces':['packages/*']}))
 cond={'import':'./main.mjs','require':'./main.cjs'};exports=cond;body={'name':'demo','type':'module'}
 if case in ['inactive-pattern','both-unused','active-pattern','both-unused-product-alias']:exports={'.':cond,'./src/*':{'import':'./src/*.mjs','require':'./src/*.cjs'}}
 if case in ['imports-unused','both-unused','active-hash','both-unused-product-alias']:body['imports']={'#private':{'import':'./private.mjs','require':'./private.cjs'}}
 if case=='selected-missing':exports={'import':'./absent.mjs','require':'./absent.cjs'}
 if case=='mixed-global':exports={'.':cond,'node':'./main.mjs'}
 if case=='numeric-selected':exports={'.':{'0':'./main.mjs','default':'./main.mjs'}}
 if case=='selected-array':exports={'.':['./main.mjs']}
 if case=='inactive-bad-target':exports={'.':cond,'./unused':'../products/consumer/mod.mjs'}
 if case in ['selected-product-alias','both-unused-product-alias']:
  (root/'products/consumer').mkdir(parents=True);(root/'products/consumer/mod.mjs').write_text('export const answer=99;');(root/'packages/demo/alias.mjs').symlink_to('../../products/consumer/mod.mjs')
  if case=='selected-product-alias':exports='./alias.mjs'
  else:exports['.']='./alias.mjs'
 body['exports']=exports;(root/'packages/demo/package.json').write_text(json.dumps(body))
 (root/'entry.mjs').write_text("import {answer} from 'demo';export const result=answer;")
 (root/'entry.cjs').write_text("module.exports=require('demo');")
 (root/'packages/demo/main.mjs').write_text('export const answer=42;'if case!='opaque-body'else"export const answer=Reflect.get(globalThis,'open');")
 (root/'packages/demo/main.cjs').write_text('module.exports=42;'if case!='opaque-body'else"module.exports=Reflect.get(globalThis,'open');")
 for ext in ['mjs','cjs']:
  (root/f'packages/demo/src/leaf.{ext}').write_text('export const answer=7;'if ext=='mjs'else'module.exports=7;')
  marker=str(root/'TARGET_WAS_EXECUTED');hostile="import fs from 'node:fs';fs.writeFileSync("+json.dumps(marker)+",'bad');export const answer=0;"if ext=='mjs'else"require('node:fs').writeFileSync("+json.dumps(marker)+",'bad');module.exports=0;"
  (root/f'packages/demo/private.{ext}').write_text(hostile)
 for mode in ['import','require']:
  entry=root/('entry.mjs'if mode=='import'else'entry.cjs');specifier='demo/src/leaf'if case=='active-pattern'else'#private'if case=='active-hash'else'demo'
  # A #specifier is resolved from the owning package directory, as Node actually requires.
  if case=='active-hash':entry=root/('packages/demo/main.mjs'if mode=='import'else'packages/demo/main.cjs')
  nativeResult=run([node,'--input-type=module','-e',oracle,mode,str(entry),specifier],entry.parent)
  helperResult=run([node,'--input-type=module','-e',helper,str(candidate/'scripts/boundary-semantic-resolution.mjs'),str(root),str(entry.relative_to(root)),specifier,mode],root)
  assert not(root/'TARGET_WAS_EXECUTED').exists();assert nativeResult['targetModuleEvaluations']==helperResult['targetModuleEvaluations']==0
  rows.append({'case':case,'root':str(root),'mode':mode,'from':str(entry.relative_to(root)),'specifier':specifier,'manifest':body,'node':nativeResult,'frozenHelper':helperResult,'markerAbsent':True,'semanticProofAccepted':False})
 for p in sorted(root.rglob('*')):
  if p.is_symlink():fixtureInventory.append({'path':str(p.relative_to(runtime)),'kind':'symlink','target':os.readlink(p)})
  elif p.is_file():fixtureInventory.append({'path':str(p.relative_to(runtime)),'kind':'file','bytes':p.stat().st_size,'sha256':h(p)})
(b/'selector-fixture-inventory.json').write_text(json.dumps({'root':str(runtime),'files':fixtureInventory},indent=2)+'\n');(b/'selector-witnesses.json').write_text(json.dumps({'status':'DISCRIMINATING_NODE_RESOLUTION_CASES_EXECUTED','node':'22.23.2','cases':rows,'targetModuleEvaluations':0,'semanticProofsAccepted':0,'scope':'Pinned Node resolution and unchanged helper only. Inactive selectors and body closure are distinct.'},indent=2)+'\n');print(json.dumps({'realCases':len(real),'syntheticCases':len(rows),'fixtures':len(variants),'targetModuleEvaluations':0,'newProofsAccepted':0}))
