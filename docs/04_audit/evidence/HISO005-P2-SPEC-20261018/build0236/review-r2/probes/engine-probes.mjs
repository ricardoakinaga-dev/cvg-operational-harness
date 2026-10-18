import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {runSemanticBoundary,validateSemanticBoundary,semanticCanonicalJson} from '/home/ricardo/cvg-candidates/hiso005-integrated-20261018/scripts/boundary-semantic-engine.mjs';
const base='/tmp/cvg-hiso005-integration-20261018/review0236-r2';const sha=x=>createHash('sha256').update(x).digest('hex');const put=(r,f,v)=>{const p=path.join(r,f);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,typeof v==='string'?v:JSON.stringify(v,null,2))};const rows=[];
const cases=[
['p08-inline-type-cap','entry.ts','import {type T} from "./products/shift/index.ts"; export const result=1;',{'products/shift/index.ts':'export type T=number; export const x=1;'}, {maxFiles:1},'VIOLATION'],
['p09-inline-type-neutral','entry.ts','import {type T} from "./neutral.js"; export const result=1;',{'neutral.js':'export const x=1;'},undefined,'PROVEN'],
['p10-explicit-type-erased','entry.ts','import type {T} from "./absent.ts"; export const result=1;',{},undefined,'PROVEN'],
['p11-neutral-computed','entry.js','const {["x"]:value}={x:1}; export const result=1;',{},undefined,'UNKNOWN'],
['p12-product-node-cap','entry.js','import "./products/shift/index.js"; export const result=1;',{'products/shift/index.js':'export const x=1;'}, {maxNodes:0},'VIOLATION'],
['p13-forged-proof','entry.js','const data={x:1}; export const result=Object.getOwnPropertyDescriptor(data,"x").value;',{},undefined,'PROVEN; forged dependency rejected']
];
for(const[id,entry,code,extra,limits,expected]of cases){const root=path.join(base,id);for(const [f,v]of Object.entries({'package.json':'{"type":"module"}',[entry]:code,...extra}))put(root,f,v);const input={root,starts:[entry],origins:[],installed:[],...(limits?{limits}:{})};const output=runSemanticBoundary(input);let forgedValidation;
if(id==='p13-forged-proof'){const forged=structuredClone(output);const p=forged.proofs[0];p.dependencies=['f'.repeat(64)];const{id,...body}=p;p.id=sha(semanticCanonicalJson(body));forgedValidation=validateSemanticBoundary(input,forged);put(root,'forged-output.json',forged);put(root,'forged-validation.json',forgedValidation)}
put(root,'input.json',input);put(root,'output.json',output);const row={id,expected,status:output.status,validation:output.validation,proofs:output.proofs.length,inputs:output.inputs,unknowns:output.unknowns,violations:output.violations,codeSha256:sha(code),forgedValidation};rows.push(row);console.log(JSON.stringify(row));}
put(base,'engine-summary.json',rows);
