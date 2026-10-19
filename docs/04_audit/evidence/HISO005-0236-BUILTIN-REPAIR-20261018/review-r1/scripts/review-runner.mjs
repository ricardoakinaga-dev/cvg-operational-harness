import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
const C='/home/ricardo/cvg-candidates/hiso005-resolver-fix-20261018';
const T='/tmp/cvg-hiso005-builtin-fix-20261018/review-r1';
const O='/home/ricardo/Área de trabalho/cvg-operational-harness/docs/04_audit/evidence/HISO005-0236-BUILTIN-REPAIR-20261018/review-r1';
const NODE='/home/ricardo/.nvm/versions/node/v22.23.2/bin/node';
const ENV={PATH:path.dirname(NODE)+':/usr/bin:/bin',LANG:'C',LC_ALL:'C',TZ:'UTC',HOME:T,TMPDIR:T};
const H=b=>createHash('sha256').update(b).digest('hex');
function write(p,b){fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,b)}
const save=(n,x)=>write(path.join(O,n),JSON.stringify(x,null,2)+'\n');
const I=await import(pathToFileURL(C+'/scripts/boundary-installed-identity.mjs'));
const toolchain=I.fingerprintToolchain();
let calls=0;
function run(label,args,cwd=C,input){
  const id=String(++calls).padStart(3,'0');
  const command={id,label,executable:NODE,argv:args,cwd,environment:ENV,input:input??null,startedAt:new Date().toISOString(),timeoutMs:30000};
  save('raw/'+id+'.command.json',command);
  const r=spawnSync(NODE,args,{cwd,env:ENV,encoding:'utf8',input,timeout:30000,maxBuffer:24*1024*1024});
  write(O+'/raw/'+id+'.stdout.txt',r.stdout??'');write(O+'/raw/'+id+'.stderr.txt',r.stderr??'');
  let json=null,parseError=null;
  try{json=JSON.parse(r.stdout)}catch(e){parseError=e.message}
  const result={id,label,exit:r.status,signal:r.signal,error:r.error?.message??null,jsonParsed:json!==null,parseError,finishedAt:new Date().toISOString()};
  save('raw/'+id+'.result.json',result);
  return {...result,stdout:r.stdout,stderr:r.stderr,json};
}
const defs=[
 {id:'S01',name:'CJS module homonym (prior S13)',mode:'require',spec:'module',pkg:'module',native:true},
 {id:'S02',name:'ESM fs homonym (prior S20)',mode:'import',spec:'fs',pkg:'fs',native:true},
 {id:'S03',name:'CJS builtin subpath',mode:'require',spec:'fs/promises',pkg:'fs',native:true},
 {id:'S04',name:'ESM explicit node prefix',mode:'import',spec:'node:fs',pkg:'fs',native:true},
 {id:'S05',name:'CJS prefix-only node:test',mode:'require',spec:'node:test',pkg:'test',native:true},
 {id:'S06',name:'ESM builtin shadows same-name self reference',mode:'import',spec:'module',pkg:'module',native:true,self:true,skipCLI:true},
 {id:'S07',name:'CJS builtin shadows same-name self reference',mode:'require',spec:'fs',pkg:'fs',native:true,self:true,skipCLI:true},
 {id:'S08',name:'Bare test is ordinary package',mode:'require',spec:'test',pkg:'test',positive:true},
 {id:'S09',name:'fs-extra is ordinary package',mode:'import',spec:'fs-extra',pkg:'fs-extra',positive:true},
 {id:'S10',name:'Relative fs.js is ordinary file',mode:'import',spec:'./fs.js',positive:true,relative:true},
 {id:'S11',name:'Known product FAIL wins over native UNKNOWN and limit',mode:'import',spec:'fs',pkg:'fs',native:true,product:true},
 {id:'S12',name:'Ordinary vendor; strict/default/P1 same physical fixture',mode:'import',spec:'vendor',pkg:'vendor',positive:true,compat:true}
];
save('scenarios-plan.json',defs);
const results=[];
for(const d of defs){
 const P=T+'/fixtures/'+d.id, E=P+'/evaluated', R=P+'/reference', key=d.pkg?'node_modules/'+d.pkg:null;
 const body=d.mode==='require'?'module.exports=17\n':'export const value=17\n';
 const core=(d.mode==='require'?`module.exports=require(${JSON.stringify(d.spec)})\n`:`import {value} from ${JSON.stringify(d.spec)};export const result=value\n`)+(d.product?"import('../../../pro'+'ducts/shift/src/index.js')\n":'');
 for(const root of [E,R]){
  write(root+'/package.json',JSON.stringify({name:'synthetic',version:'1.0.0',private:true,type:'module',workspaces:['packages/*','products/*']}));
  write(root+'/package-lock.json',JSON.stringify({lockfileVersion:3,packages:{'':{name:'synthetic',version:'1.0.0'},...(key?{[key]:{version:'1.0.0',resolved:`https://registry.npmjs.org/${d.pkg}/-/${d.pkg}-1.0.0.tgz`,integrity:'sha512-'+Buffer.alloc(64,1).toString('base64')}}:{})}}));
  write(root+'/tsconfig.base.json',JSON.stringify({compilerOptions:{module:'NodeNext',moduleResolution:'NodeNext',allowJs:true,target:'ES2022'}}));
  write(root+'/packages/core/package.json',JSON.stringify({name:d.self?d.pkg:'@synthetic/core',version:'1.0.0',type:d.mode==='require'?'commonjs':'module',main:'src/index.js',...(key?{dependencies:{[d.pkg]:'1.0.0'}}:{}),...(d.self?{exports:'./src/self.js'}:{})}));
  write(root+'/packages/core/src/index.js',core);
  if(d.self)write(root+'/packages/core/src/self.js',body);
  if(d.relative)write(root+'/packages/core/src/fs.js',body);
  write(root+'/products/shift/package.json',JSON.stringify({name:'@private/product',version:'1.0.0',type:'module',main:'src/index.js'}));
  write(root+'/products/shift/src/index.js','export const productOnly=43\n');
  if(key){write(root+'/'+key+'/package.json',JSON.stringify({name:d.pkg,version:'1.0.0',type:d.mode==='require'?'commonjs':'module',main:'index.js'}));write(root+'/'+key+'/index.js',body);write(root+'/'+key+'/promises.js',body)}
 }
 const packages=[];let identity=null;
 if(key){
  const ref=I.collectPackageInventory(R+'/'+key),actual=I.collectPackageInventory(E+'/'+key);
  // Verify exact physical files independently as well as the inventory collector.
  const files=fs.readdirSync(E+'/'+key).sort().map(n=>({path:n,evaluatedSha256:H(fs.readFileSync(E+'/'+key+'/'+n)),referenceSha256:H(fs.readFileSync(R+'/'+key+'/'+n)),evaluatedRealpath:fs.realpathSync(E+'/'+key+'/'+n),referenceRealpath:fs.realpathSync(R+'/'+key+'/'+n),regular:fs.lstatSync(E+'/'+key+'/'+n).isFile(),symlink:fs.lstatSync(E+'/'+key+'/'+n).isSymbolicLink()}));
  identity={key,reference:ref,actual,files,match:ref.inventorySha256===actual.inventorySha256&&files.every(x=>x.regular&&!x.symlink&&x.evaluatedSha256===x.referenceSha256)};
  if(!identity.match)throw Error('Invalid physical premise '+d.id);
  packages.push({key,name:d.pkg,version:'1.0.0',...ref});
 }
 const receipt={schemaVersion:1,kind:'cvg-installed-content-reference',commit:'f'.repeat(40),root:R,...I.fingerprintResolution(R),toolchain,toolchainSha256:H(I.canonicalJson(toolchain)),recipe:{argv:['ci','--offline','--ignore-scripts','--audit=false','--fund=false','--include=dev','--include=optional','--cache',P+'/cache'],exitCode:0,offline:true,ignoreScripts:true,completed:true},selection:{platform:process.platform,arch:process.arch,dev:true,optional:true},limits:{...I.INSTALLED_IDENTITY_LIMITS},usage:{entries:packages.reduce((n,p)=>n+p.usage.entries,0),regularBytes:packages.reduce((n,p)=>n+p.usage.regularBytes,0),maxDepth:packages.length?Math.max(...packages.map(p=>p.usage.maxDepth)):0},packages};
 const rb=I.canonicalJson(receipt),rp=P+'/installed-reference.json',rd=H(rb);write(rp,rb);
 save(d.id+'.physical-identity.json',{identity,receiptDigest:rd,syntheticOnly:true,offlineInstallAttestation:false});
 const input={root:E,starts:['packages/core/src/index.js'],origins:[],installed:key?[{key,manifest:key+'/package.json',identityStatus:'MATCH',referenceDigest:rd}]:[],compiled:{status:'UNAVAILABLE',files:[]}};
 save(d.id+'.kernel-input.json',input);
 const oracleProgram=d.mode==='require'?'process.stdout.write(require.resolve(process.argv[1]))':'process.stdout.write(import.meta.resolve(process.argv[1]))';
 const oracle=run(d.id+' native resolution only',[...(d.mode==='import'?['--input-type=module']:[]),'--eval',oracleProgram,d.spec],E+'/packages/core/src');
 const kp='import fs from "node:fs";import {runSemanticBoundary} from '+JSON.stringify(pathToFileURL(C+'/scripts/boundary-semantic-engine.mjs').href)+';process.stdout.write(JSON.stringify(runSemanticBoundary(JSON.parse(fs.readFileSync(0,"utf8")))))';
 const kernel=run(d.id+' supervised kernel',['--input-type=module','--eval',kp],C,JSON.stringify(input));
 save(d.id+'.kernel.json',kernel.json??{invalid:true,raw:kernel.id});
 const flags=[`--installed-reference=${rp}`,`--installed-reference-sha256=${rd}`];
 function cli(label,args=[],base=false){
  const graph=P+'/'+label+'.graph.json';
  const r=run(d.id+' '+label,[(base?T+'/base':C)+'/scripts/check-product-boundary.mjs',E,'--graph='+graph,...args],C);
  if(r.json)save(d.id+'.'+label+'.report.json',r.json);
  if(fs.existsSync(graph))write(O+'/'+d.id+'.'+label+'.graph.json',fs.readFileSync(graph));
  return r;
 }
 const cr=d.skipCLI?null:cli('semantic',['--semantic',...flags]);
 let extras={};
 if(d.product){const limited=run(d.id+' reduced maxNodes=0 kernel',['--input-type=module','--eval',kp],C,JSON.stringify({...input,limits:{maxNodes:0}}));save(d.id+'.limited-kernel.json',limited.json??{invalid:true,raw:limited.id});extras.limitedKernel={raw:limited.id,status:limited.json?.status,violations:limited.json?.violations,proofs:limited.json?.proofs?.length}}
 if(d.compat){
  const strict=cli('strict',['--semantic',...flags,'--strict']);const normal=structuredClone(cr.json),s=structuredClone(strict.json);if(normal)delete normal.semanticTelemetry;if(s)delete s.semanticTelemetry;
  const def=cli('default'),p1=cli('p1',flags),bdef=cli('base-default',[],true),bp1=cli('base-p1',flags,true);
  extras.compatibility={strict:{raw:strict.id,exit:strict.exit,equalPayloadWithoutTelemetry:JSON.stringify(normal)===JSON.stringify(s)},default:{currentRaw:def.id,baseRaw:bdef.id,currentExit:def.exit,baseExit:bdef.exit,byteEqual:def.stdout===bdef.stdout,bothJSON:!!def.json&&!!bdef.json},p1:{currentRaw:p1.id,baseRaw:bp1.id,currentExit:p1.exit,baseExit:bp1.exit,byteEqual:p1.stdout===bp1.stdout,bothJSON:!!p1.json&&!!bp1.json}};
 }
 const k=kernel.json,selected=d.positive?(d.relative?E+'/packages/core/src/fs.js':E+'/'+key+'/index.js'):null;
 const expectedOracle=d.native?(d.mode==='require'?d.spec:(d.spec.startsWith('node:')?d.spec:'node:'+d.spec)):(d.mode==='require'?selected:pathToFileURL(selected).href);
 const nativeBodyNotSelected=!key||!k?.inputs?.some(x=>x.file.startsWith(key+'/'));
 const selectedProofInput=selected?k?.inputs?.some(x=>path.join(E,x.file)===selected&&x.sha256===H(fs.readFileSync(selected))):null;
 const assertions={oracleExitZero:oracle.exit===0,oracleSelectionExact:oracle.stdout===expectedOracle,kernelExitZero:kernel.exit===0,kernelJSON:!!k,validation:k?.validation?.valid===true,
  kernelStatus:k?.status===(d.product?'VIOLATION':d.native?'UNKNOWN':'PROVEN'),
  noNativeConsumableProof:d.native?k?.proofs?.length===0:true,
  noHomonymousBody:d.native?nativeBodyNotSelected:true,
  nativeReason:d.native?k?.unknowns?.some(x=>x.reason==='UNKNOWN_NATIVE_BUILTIN'):true,
  selectedPositiveFileInInputs:d.positive?selectedProofInput:true,
  noInstalledNativeProof:d.native?k?.installed?.every(x=>x.status!=='PROVEN'&&!x.proofIds.length):true,
  cli:d.skipCLI?true:!!cr?.json&&cr.exit===(d.positive?0:1)&&cr.json.status===(d.product?'FAIL':d.native?'INCOMPLETE':'PASS'),
  productLimitPriority:d.product?extras.limitedKernel.status==='VIOLATION'&&extras.limitedKernel.violations.length>0:true,
  compatibility:d.compat?extras.compatibility.strict.equalPayloadWithoutTelemetry&&extras.compatibility.default.byteEqual&&extras.compatibility.default.bothJSON&&extras.compatibility.p1.byteEqual&&extras.compatibility.p1.bothJSON:true};
 const result={...d,oracle:{raw:oracle.id,exit:oracle.exit,selection:oracle.stdout,expectedSelection:expectedOracle},kernel:{raw:kernel.id,status:k?.status,proofCount:k?.proofs?.length,unknowns:k?.unknowns,installed:k?.installed,inputs:k?.inputs},cli:cr?{raw:cr.id,exit:cr.exit,status:cr.json?.status,semanticStatus:cr.json?.semanticBoundary?.status,jsonParsed:!!cr.json}:null,positiveSelection:selected?{file:path.relative(E,selected),sha256:H(fs.readFileSync(selected)),realpath:fs.realpathSync(selected),regular:fs.lstatSync(selected).isFile(),symlink:fs.lstatSync(selected).isSymbolicLink(),amongProofInputs:selectedProofInput}:null,...extras,assertions,meetsCriteria:Object.values(assertions).every(Boolean)};
 save(d.id+'.json',result);results.push(result);save('results.json',{scenarioCount:results.length,controlledCalls:calls,results});
 process.stdout.write(JSON.stringify({id:d.id,status:k?.status,cli:cr?.json?.status,meetsCriteria:result.meetsCriteria,failedAssertions:Object.entries(assertions).filter(x=>!x[1]).map(x=>x[0])})+'\n');
}
save('collector-attempts.json',{invalidAttempts:[],incompleteAttempts:[],controlledCalls:calls,oracleOnlyNonJSONExpected:true});
