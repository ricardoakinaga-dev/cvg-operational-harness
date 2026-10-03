import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {auditProductBoundary} from '/home/ricardo/Área de trabalho/cvg-operational-harness/scripts/check-product-boundary.mjs';
const base=path.dirname(new URL(import.meta.url).pathname);
function fixture(id,source,extension='cjs',extra={}) {
 const root=path.join(base,'fixtures',id); fs.mkdirSync(root,{recursive:true});
 const write=(file,data)=>{const full=path.join(root,file);fs.mkdirSync(path.dirname(full),{recursive:true});fs.writeFileSync(full,data)};
 write('package.json',JSON.stringify({private:true,workspaces:['packages/*','products/*']}));
 write('tsconfig.base.json',JSON.stringify({compilerOptions:{module:'NodeNext',moduleResolution:'NodeNext',allowJs:true,baseUrl:'.',paths:{'@private/product':['products/shift/src/index.cjs'],'@neutral/core':['packages/core/src/neutral.cjs']}}}));
 write('packages/core/package.json',JSON.stringify({name:'@neutral/core',version:'1.0.0'}));
 write('packages/core/src/neutral.cjs','module.exports = {marker:"neutral"};');
 write('products/shift/package.json',JSON.stringify({name:'@private/product',version:'1.0.0'}));
 write('products/shift/src/index.cjs','module.exports = {marker:"PRODUCT_LOADED"};');
 const entry=`packages/core/src/index.${extension}`;write(entry,source);
 for(const [f,v] of Object.entries(extra))write(f,v);
 let audit;try{audit=auditProductBoundary(root)}catch(e){audit={passed:false,error:e.message}}
 const cli=spawnSync(process.execPath,['/home/ricardo/Área de trabalho/cvg-operational-harness/scripts/check-product-boundary.mjs',root],{encoding:'utf8',timeout:10000});
 const runtime=spawnSync(process.execPath,[path.join(root,entry)],{cwd:root,encoding:'utf8',timeout:10000});
 return {id,root,source,extra,expectedReject:!id.startsWith('positive-'),audit,cliExit:cli.status,runtimeExit:runtime.status,runtimeStdout:runtime.stdout.trim(),runtimeStderr:runtime.stderr.trim()};
}
const target='../../../products/shift/src/index.cjs';
const cases=[
 ['positive-anchored-neutral',`const {createRequire}=require('node:module');const load=createRequire(__filename);console.log(load('./neutral.cjs').marker)`],
 ['negative-dev-manifest',`console.log('neutral')`,'cjs',{'packages/core/package.json':JSON.stringify({name:'@neutral/core',devDependencies:{'@private/product':'1.0.0'}})}],
 ['negative-type-reference',`console.log('neutral')`,'cjs',{'packages/core/src/types.d.ts':'/// <reference path="../../../products/shift/src/types.d.ts" />','products/shift/src/types.d.ts':'export declare const marker:string;'}],
 ['positive-neutral',`console.log(require('./neutral.cjs').marker)`],
 ['negative-direct',`console.log(require('${target}').marker)`],
 ['negative-anchored',`const {createRequire}=require('node:module');const load=createRequire(__filename);console.log(load('${target}').marker)`],
 ['negative-alias-namespace',`const r=require;const mod=r('node:module');const load=mod.createRequire(__filename);console.log(load('${target}').marker)`],
 ['negative-module-require-factory',`const {createRequire}=module.require('node:module');const load=createRequire(__filename);console.log(load('${target}').marker)`],
 ['negative-commonjs-module-alias',`const host=module;console.log(host.require('${target}').marker)`],
 ['negative-commonjs-computed',`const key='require';console.log(module[key]('${target}').marker)`],
 ['negative-resolve-alias',`const resolve=require.resolve;console.log(resolve('${target}'))`],
 ['negative-script-declaration-shadow',`import {marker} from '../../../scripts/bridge.mjs';console.log(marker)`,'mjs',{'scripts/bridge.mjs':`import p from '../products/shift/src/index.cjs';export const marker=p.marker;`,'scripts/bridge.d.mts':'export declare const marker:string;'}],
 ['negative-script-no-shadow',`import {marker} from '../../../scripts/bridge.mjs';console.log(marker)`,'mjs',{'scripts/bridge.mjs':`import p from '../products/shift/src/index.cjs';export const marker=p.marker;`}],
 ['positive-script-declaration',`import {marker} from '../../../scripts/bridge.mjs';console.log(marker)`,'mjs',{'scripts/bridge.mjs':`export const marker='neutral';`,'scripts/bridge.d.mts':'export declare const marker:string;'}],
 ['negative-unknown-import',`const name='${target}';import(name)`],
 ['positive-domain-method',`const policy={require(action){return action}};console.log(policy.require('safe'))`],
 ['negative-script-env-shadow',`import {marker} from '../../../scripts/bridge.mjs';console.log(marker)`,'mjs',{'scripts/bridge.mjs':`export const marker=process.env.SHIFT_PORT ?? 'SHIFT_ENV_READ';`,'scripts/bridge.d.mts':'export declare const marker:string;'}]
];
const selected=process.argv.includes('--supplement') ? cases.slice(0,3) : cases.slice(3);
const results=selected.map(args=>fixture(...args));
fs.writeFileSync(path.join(base,process.argv.includes('--supplement')?'boundary-probes-supplement.json':'boundary-probes.json'),JSON.stringify({node:process.version,auditor:'/home/ricardo/Área de trabalho/cvg-operational-harness/scripts/check-product-boundary.mjs',results},null,2)+'\n');
for(const r of results)console.log(JSON.stringify({id:r.id,expectedReject:r.expectedReject,passed:r.audit.passed,cliExit:r.cliExit,violations:r.audit.violations?.length,diagnostics:r.audit.diagnostics?.map(x=>x.reason),runtimeExit:r.runtimeExit,stdout:r.runtimeStdout}));
