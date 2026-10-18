import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import {createRequire} from 'node:module';
const repo=process.cwd(),out='/tmp/cvg-codex100-exec-20261017/native-delivery-probe',lane=repo+'/docs/04_audit/evidence/CODEX100-EXEC-20261017/g03/native-delivery-probe';
const require=createRequire(repo+'/package.json'),esbuild=require('esbuild');if(esbuild.version!=='0.28.2')throw Error('esbuild version mismatch');
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex'),all={};
function walk(p){for(const f of fs.readdirSync(p,{withFileTypes:true})){const n=path.join(p,f.name);if(f.isDirectory())walk(n);else if(f.isFile())all[n]=hash(n)}}
walk(repo+'/packages');walk(lane);const alias={};for(const name of fs.readdirSync(repo+'/packages')){const p=repo+'/packages/'+name;if(fs.existsSync(p+'/package.json')&&fs.existsSync(p+'/src/index.ts'))alias[JSON.parse(fs.readFileSync(p+'/package.json')).name]=p+'/src/index.ts'}
fs.writeFileSync(out+'/prebuild-source-hashes.json',JSON.stringify(all,null,2)+'\n');
const options={entryPoints:[lane+'/probe.ts'],outfile:out+'/probe.mjs',bundle:true,platform:'node',format:'esm',target:'node22',metafile:true,alias,packages:'bundle',write:true,logLevel:'silent'};
const result=await esbuild.build(options);fs.writeFileSync(out+'/metafile.json',JSON.stringify(result.metafile,null,2)+'\n');
const inputs=Object.keys(result.metafile.inputs).map(p=>{const absolute=path.resolve(repo,p);return{path:absolute,sha256Before:all[absolute],sha256After:hash(absolute)}});if(inputs.some(i=>!i.sha256Before||i.sha256Before!==i.sha256After||i.path.includes('/dist/')))throw Error('source drift or dist input');
const externals=Object.values(result.metafile.outputs).flatMap(o=>o.imports).filter(i=>i.external);if(externals.some(i=>!i.path.startsWith('node:')))throw Error('unbundled dependency');
const toolPaths=[require.resolve('esbuild'),repo+'/node_modules/esbuild/package.json',repo+'/node_modules/@esbuild/linux-x64/bin/esbuild','/home/ricardo/.nvm/versions/node/v22.23.2/bin/node'];
fs.writeFileSync(out+'/provenance.json',JSON.stringify({node:process.version,esbuild:esbuild.version,options,plugins:[],inputs,externals,toolHashes:toolPaths.map(p=>({path:fs.realpathSync(p),sha256:hash(p)})),bundle:{path:out+'/probe.mjs',sha256:hash(out+'/probe.mjs')}},null,2)+'\n');await esbuild.stop();console.log(JSON.stringify({inputs:inputs.length,bundleSha256:hash(out+'/probe.mjs')}));
