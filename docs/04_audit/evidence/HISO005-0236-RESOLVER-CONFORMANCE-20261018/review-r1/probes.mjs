import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {fixture,write,updateJson,nativeResolution,spawnSync,NODE,CHECKER,hash} from './fixture-helper.mjs';
const OUT=path.dirname(fileURLToPath(import.meta.url));
const cases=[];
function cjs(root, main='entry') {
 updateJson(root,'packages/core/package.json',x=>x.type='commonjs');
 updateJson(root,'node_modules/vendor/package.json',x=>{x.type='commonjs';x.main=main});
 write(root,'node_modules/vendor/entry.js','module.exports=1;');
}
function item(id,name,options,specifier='vendor',mode='import',importer='packages/core/src/index.js',expected='UNKNOWN') {cases.push({id,name,options,specifier,mode,importer,expected})}
const coreCjs="module.exports=require('vendor');";
const coreEsm="import {value} from 'vendor'; export const result=value;";
const safeCjs='module.exports=1;';
const safeEsm='export const value=1;';
const hiddenCjs="import('../pro'+'ducts/shift/src/index.js'); module.exports=2;";
item('S01','CJS sibling vendor.js wins before legacy package directory',{core:coreCjs,vendor:safeCjs,prepare(root){cjs(root);write(root,'node_modules/vendor.js',hiddenCjs)}},'vendor','require');
item('S02','absolute legacy main must not become package relative',{core:coreCjs,vendor:safeCjs,prepare(root){const target=path.join(path.dirname(root),'absolute-target.js');cjs(root,target);write(path.dirname(root),'absolute-target.js',"import('./evaluated/pro'+'ducts/shift/src/index.js');module.exports=2;");write(root,'node_modules/vendor/'+target,safeCjs)}},'vendor','require');
item('S03','CJS exports wins before sibling file',{core:coreCjs,vendor:safeCjs,prepare(root){cjs(root);updateJson(root,'node_modules/vendor/package.json',x=>x.exports='./entry.js');write(root,'node_modules/vendor.js',hiddenCjs)}},'vendor','require',undefined,'PROVEN');
item('S04','URL tab exports',{core:coreEsm,vendor:safeEsm,prepare(root){updateJson(root,'node_modules/vendor/package.json',x=>x.exports='./sa\tfe.mjs');write(root,'node_modules/vendor/sa\tfe.mjs',safeEsm);write(root,'node_modules/vendor/safe.mjs',"import('../../pro'+'ducts/shift/src/index.js');export const value=2;")}});
item('S05','relative percent ESM edge',{core:coreEsm,vendor:"export {value} from './sa%66e.mjs';",prepare(root){write(root,'node_modules/vendor/sa%66e.mjs',safeEsm);write(root,'node_modules/vendor/safe.mjs',"import('../../pro'+'ducts/shift/src/index.js');export const value=2;")}},'./sa%66e.mjs','import','node_modules/vendor/index.js');
item('S06','nearest self-reference rejects outer body',{core:coreEsm,vendor:"export {value} from './sub/index.mjs';",prepare(root){write(root,'node_modules/vendor/sub/package.json',JSON.stringify({name:'vendor',type:'module',exports:'./inner.mjs'}));write(root,'node_modules/vendor/sub/index.mjs',"export {value} from 'vendor';");write(root,'node_modules/vendor/sub/inner.mjs',"import('../../../pro'+'ducts/shift/src/index.js');export const value=2;")}},'vendor','import','node_modules/vendor/sub/index.mjs');
item('S07','nearer manifestless owner directory',{core:coreEsm,vendor:"export {value} from './sub/index.mjs';",prepare(root){write(root,'node_modules/vendor/sub/index.mjs',"export {value} from 'vendor';");write(root,'node_modules/vendor/sub/node_modules/vendor/index.js',safeCjs)}},'vendor','import','node_modules/vendor/sub/index.mjs');
item('S08','exact extensionless exports rejected',{core:coreCjs,vendor:safeCjs,prepare(root){cjs(root);updateJson(root,'node_modules/vendor/package.json',x=>x.exports='./entry')}},'vendor','require');
item('S09','ordinary legacy extension fallback positive',{core:coreCjs,vendor:safeCjs,prepare(root){cjs(root)}},'vendor','require',undefined,'PROVEN');
item('S10','exact .js CJS exports positive',{core:coreCjs,vendor:safeCjs,prepare(root){cjs(root);updateJson(root,'node_modules/vendor/package.json',x=>x.exports='./entry.js')}},'vendor','require',undefined,'PROVEN');
item('S11','unsupported JSON alternative before index',{core:coreCjs,vendor:safeCjs,prepare(root){cjs(root);fs.unlinkSync(path.join(root,'node_modules/vendor/entry.js'));write(root,'node_modules/vendor/entry.json','{"value":2}');write(root,'node_modules/vendor/entry/index.js',safeCjs)}},'vendor','require');
item('S12','directory package config before index',{core:coreCjs,vendor:"module.exports=require('./entry');",prepare(root){cjs(root,'index.js');fs.unlinkSync(path.join(root,'node_modules/vendor/entry.js'));write(root,'node_modules/vendor/entry/package.json',JSON.stringify({type:'commonjs',main:'inner.js'}));write(root,'node_modules/vendor/entry/index.js',safeCjs);write(root,'node_modules/vendor/entry/inner.js',"import('../../../pro'+'ducts/shift/src/index.js');module.exports=2;")}},'./entry','require','node_modules/vendor/index.js');
item('S13','require to ESM interop rejected',{core:coreCjs,vendor:safeEsm,prepare(root){updateJson(root,'packages/core/package.json',x=>x.type='commonjs')}},'vendor','require');
item('S14','conditional exports remain unsupported',{core:coreEsm,vendor:safeEsm,prepare(root){updateJson(root,'node_modules/vendor/package.json',x=>x.exports={import:'./index.js',require:'./index.js'})}});
item('S15','invalid exports node_modules segment',{core:coreCjs,vendor:safeCjs,prepare(root){cjs(root);updateJson(root,'node_modules/vendor/package.json',x=>x.exports='./node_modules/safe.js');write(root,'node_modules/vendor/node_modules/safe.js',safeCjs)}},'vendor','require');
item('S16','closed ESM positive with default/P1 comparison',{core:coreEsm,vendor:safeEsm},'vendor','import',undefined,'PROVEN');
item('S17','finite concatenated product still FAIL',{core:coreEsm,vendor:"import('../../pro'+'ducts/shift/src/index.js');export const value=1;"},'vendor','import',undefined,'VIOLATION');
item('S18','import to CJS interop remains unsupported',{core:"import value from 'vendor';export const result=value;",vendor:safeCjs,prepare(root){updateJson(root,'node_modules/vendor/package.json',x=>x.type='commonjs')}});
item('S19','nearer sibling file without package directory shadows outer',{core:coreCjs,vendor:"module.exports=require('./sub/entry.js');",prepare(root){cjs(root,'index.js');write(root,'node_modules/vendor/sub/entry.js',"module.exports=require('vendor');");write(root,'node_modules/vendor/sub/node_modules/vendor.js',"import('../../../../pro'+'ducts/shift/src/index.js');module.exports=2;")}},'vendor','require','node_modules/vendor/sub/entry.js');
item('S20','closed runtime flags refuse --conditions',{core:coreEsm,vendor:safeEsm});
fs.writeFileSync(path.join(OUT,'scenario-plan.json'),JSON.stringify(cases.map(({options,...x})=>x),null,2)+'\n');
const results=[];
for(const c of cases){
 const f=fixture(c.options);
 const oracle=nativeResolution(c.specifier,path.join(f.evaluated,c.importer||'packages/core/src/index.js'),c.mode);
 let result;
 if(c.id==='S20') {
  const r=spawnSync(NODE,['--conditions=review',CHECKER,f.evaluated,'--semantic',`--graph=${f.parent}/graph.json`,...f.flags],{encoding:'utf8',timeout:30000,env:{PATH:path.dirname(NODE)+':/usr/bin:/bin',LANG:'C',LC_ALL:'C',TZ:'UTC'}});
  result={code:r.status,report:JSON.parse(r.stdout),graph:JSON.parse(fs.readFileSync(f.parent+'/graph.json')),stdout:r.stdout,stderr:r.stderr};
 } else result=f.run();
 let compatibility=null;
 if(c.id==='S16') {
  compatibility=[];
  for(const flags of [[],f.flags]) {
   const outputs=[];
   for(const checker of ['/home/ricardo/cvg-candidates/hiso005-integrated-20261018/scripts/check-product-boundary.mjs',CHECKER]) {
    const r=spawnSync(NODE,[checker,f.evaluated,...flags],{encoding:'utf8',timeout:30000,env:{PATH:path.dirname(NODE)+':/usr/bin:/bin',LANG:'C',TZ:'UTC'}});
    outputs.push({exit:r.status,stdout:r.stdout,stderr:r.stderr});
   }
   compatibility.push({mode:flags.length?'P1':'default',equal:JSON.stringify(outputs[0])===JSON.stringify(outputs[1]),outputs});
  }
 }
 let kernel=null;
 if(['S01','S02','S19'].includes(c.id)) {
  const input={root:f.evaluated,starts:['packages/core/src/index.js'],origins:[],installed:[{key:'node_modules/vendor',manifest:'node_modules/vendor/package.json',identityStatus:'MATCH',referenceDigest:f.expectedSha256}],compiled:{status:'UNAVAILABLE',files:[]}};
  const program='const fs=require("node:fs"); const engine=require(process.argv[1]);process.stdout.write(JSON.stringify(engine.runSemanticBoundary(JSON.parse(fs.readFileSync(0,"utf8")))));';
  const r=spawnSync(NODE,['--eval',program,'/home/ricardo/cvg-candidates/hiso005-resolver-fix-20261018/scripts/boundary-semantic-engine.mjs'],{input:JSON.stringify(input),encoding:'utf8',timeout:30000,env:{PATH:path.dirname(NODE)+':/usr/bin:/bin',LANG:'C',TZ:'UTC'}});
  kernel=JSON.parse(r.stdout);
  fs.writeFileSync(path.join(OUT,c.id+'.kernel.json'),JSON.stringify({input,output:kernel,rawId:r.rawId},null,2)+'\n');
 }
 const summary={id:c.id,name:c.name,fixture:f.parent,oracle:{exit:oracle.status,stdout:oracle.stdout,stderr:oracle.stderr,rawId:oracle.rawId},exit:result.code,status:result.report?.status,semanticStatus:result.report?.semanticBoundary?.status,expected:c.expected,meetsExpected:result.report?.semanticBoundary?.status===c.expected,installed:result.graph?.installed,unknowns:result.report?.semanticBoundary?.unknowns,violations:result.report?.semanticBoundary?.violations,proofCount:result.report?.semanticBoundary?.proofs.length,compatibility,kernel:kernel?{status:kernel.status,installed:kernel.installed,unknowns:kernel.unknowns,proofCount:kernel.proofs.length}:null};
 fs.writeFileSync(path.join(OUT,c.id+'.json'),JSON.stringify(summary,null,2)+'\n');
 fs.writeFileSync(path.join(OUT,c.id+'.report.json'),result.stdout);
 if(fs.existsSync(f.parent+'/graph.json'))fs.copyFileSync(f.parent+'/graph.json',path.join(OUT,c.id+'.graph.json'));
 results.push(summary);
 console.log(JSON.stringify({id:c.id,status:summary.status,semantic:summary.semanticStatus,expected:c.expected,verified:summary.installed?.map(x=>x.verified),native:oracle.stdout,meetsExpected:summary.meetsExpected,compatibility:compatibility?.map(x=>x.equal),kernel:kernel?.status}));
}
fs.writeFileSync(path.join(OUT,'results.json'),JSON.stringify(results,null,2)+'\n');
