import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import {spawnSync} from 'node:child_process';
import {auditProductBoundary} from '/home/ricardo/cvg-candidates/hiso005-integrated-20261018/scripts/check-product-boundary.mjs';
import {canonicalJson,fingerprintResolution,fingerprintToolchain,collectPackageInventory,INSTALLED_IDENTITY_LIMITS} from '/home/ricardo/cvg-candidates/hiso005-integrated-20261018/scripts/boundary-installed-identity.mjs';
const base='/tmp/cvg-hiso005-integration-20261018/review0236-r1';const hash=x=>createHash('sha256').update(x).digest('hex');const put=(root,f,v)=>{const p=path.join(root,f);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,v)};
const toolchain=fingerprintToolchain();const summaries=[];
const cases=[
['p17-host-installed-computed-finite','import "vendor"; Object.getPrototypeOf({});','index.js','const run=(s)=>import(s); const {[run("../../"+"pro"+"ducts/shift/src/index.js")]: value}={value:1};']
];
for(const [id,source,entry='index.js',vendor] of cases){
 const parent=path.join(base,id);const evaluated=path.join(parent,'evaluated'),reference=path.join(parent,'reference');const key='node_modules/vendor';
 const lock={lockfileVersion:3,packages:{'':{name:'synthetic',version:'1.0.0'},...(vendor?{[key]:{version:'1.0.0',resolved:'https://registry.npmjs.org/vendor/-/vendor-1.0.0.tgz',integrity:'sha512-'+Buffer.alloc(64,1).toString('base64')}}:{})}};
 for(const root of [evaluated,reference]){
  const files={'package.json':JSON.stringify({name:'synthetic',version:'1.0.0',private:true,type:'module',workspaces:['packages/*','products/*']}),'package-lock.json':JSON.stringify(lock),'tsconfig.base.json':JSON.stringify({compilerOptions:{module:'NodeNext',moduleResolution:'NodeNext',allowJs:true,target:'ES2022'}}),'packages/core/package.json':JSON.stringify({name:'@synthetic/core',version:'1.0.0',type:'module',main:'src/'+entry,...(vendor?{dependencies:{vendor:'1.0.0'}}:{})}),['packages/core/src/'+entry]:source,'products/shift/package.json':JSON.stringify({name:'@private/product',version:'1.0.0',type:'module',main:'src/index.js'}),'products/shift/src/index.js':'export const productOnly=1;','products/shift/src/index.ts':'export type T=number; export const productOnly=1;',...(vendor?{[key+'/package.json']:JSON.stringify({name:'vendor',version:'1.0.0',type:'module',main:'index.js'}),[key+'/index.js']:vendor}:{})};
  for(const [f,v]of Object.entries(files))put(root,f,v);
 }
 const packages=vendor?[{key,name:'vendor',version:'1.0.0',...collectPackageInventory(path.join(reference,key))}]:[];
 const receipt={schemaVersion:1,kind:'cvg-installed-content-reference',commit:'f'.repeat(40),root:reference,...fingerprintResolution(reference),toolchain,toolchainSha256:hash(canonicalJson(toolchain)),recipe:{argv:['ci','--offline','--ignore-scripts','--audit=false','--fund=false','--include=dev','--include=optional','--cache',path.join(parent,'cache')],exitCode:0,offline:true,ignoreScripts:true,completed:true},selection:{platform:process.platform,arch:process.arch,dev:true,optional:true},limits:{...INSTALLED_IDENTITY_LIMITS},usage:{entries:packages.reduce((n,p)=>n+p.usage.entries,0),regularBytes:packages.reduce((n,p)=>n+p.usage.regularBytes,0),maxDepth:packages.length?Math.max(...packages.map(p=>p.usage.maxDepth)):0},packages};
 const bytes=canonicalJson(receipt);const installedReference={manifestPath:path.join(parent,'installed-reference.json'),expectedSha256:hash(bytes)};put(parent,'installed-reference.json',bytes);
 const options={semantic:true,installedReference};put(parent,'request.json',JSON.stringify({evaluated,options},null,2));
 const before=auditProductBoundary(evaluated,{installedReference});put(parent,'default-output.json',JSON.stringify(before,null,2));
 const output=auditProductBoundary(evaluated,options);put(parent,'output.json',JSON.stringify(output,null,2));
 const cli=spawnSync('/home/ricardo/.nvm/versions/node/v22.23.2/bin/node',['/home/ricardo/cvg-candidates/hiso005-integrated-20261018/scripts/check-product-boundary.mjs',evaluated,'--semantic','--installed-reference='+installedReference.manifestPath,'--installed-reference-sha256='+installedReference.expectedSha256],{encoding:'utf8',env:{PATH:'/home/ricardo/.nvm/versions/node/v22.23.2/bin:/usr/bin:/bin',LANG:'C',TZ:'UTC'}});put(parent,'cli-output.json',JSON.stringify({status:cli.status,stdout:cli.stdout,stderr:cli.stderr},null,2));
 const row={id,codehash:hash(source),vendorhash:vendor?hash(vendor):null,before:{status:before.status,diagnostics:before.diagnostics.length},after:{status:output.status,passed:output.passed,diagnostics:output.diagnostics,violations:output.violations,semantic:output.semanticBoundary.status,occurrences:output.semanticBoundary.occurrences,installed:output.graph?.installed ?? null},cliExit:cli.status};summaries.push(row);console.log(JSON.stringify(row));
}
put(base,'host17-summary.json',JSON.stringify(summaries,null,2));
