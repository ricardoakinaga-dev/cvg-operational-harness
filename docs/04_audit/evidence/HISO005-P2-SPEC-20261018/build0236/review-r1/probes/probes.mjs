import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {runSemanticBoundary,validateSemanticBoundary,semanticOriginId} from '/home/ricardo/cvg-candidates/hiso005-integrated-20261018/scripts/boundary-semantic-engine.mjs';
const base='/tmp/cvg-hiso005-integration-20261018/review0236-r1';
const sha=x=>createHash('sha256').update(x).digest('hex');
const ts=createRequire(import.meta.url)('/home/ricardo/cvg-candidates/hiso005-integrated-20261018/node_modules/typescript/lib/typescript.js');
const cases=[
['p01-positive','const data={x:1}; export const answer=Object.getOwnPropertyDescriptor(data,"x").value;','PROVEN'],
['p02-computed-binding','const run=(s)=>import(s); const {[run("./products/shift/index.js")]: value}={value:1}; Object.getPrototypeOf({});','UNKNOWN_OR_VIOLATION'],
['p03-anonymous-default','export default function(specifier) { return import(specifier); } Object.getPrototypeOf({});','UNKNOWN'],
['p04-types-runtime','import {type T} from "./products/shift/index.ts"; Object.getPrototypeOf({});','VIOLATION', 'entry.ts'],
['p05-this-extracted','const obj={x:1, f(){return this.x}}; const f=obj.f; f();','UNKNOWN'],
['p06-public-capture','const obj={x:1}; export {obj}; export function read(){ return Object.getOwnPropertyDescriptor(obj,"x").value; }','UNKNOWN'],
['p07-mutated-intrinsic','const O=Object; O.getPrototypeOf=()=>1; Object.getPrototypeOf({});','UNKNOWN'],
['p08-dag-cycle','import "./other.js"; export const x=1;','UNKNOWN','entry.js',{'other.js':'import "./entry.js"; export const y=1;'}],
['p09-shadow-this-param','export function inspect(Object){return Object.getPrototypeOf({})}','UNKNOWN'],
['p10-opaque-getter','const obj={get x(){return unknown()}}; Object.getOwnPropertyDescriptor(obj,"x");','UNKNOWN']
];
const summaries=[];
for(const [id,code,expected,filename='entry.js',extra={}] of cases){
 const root=path.join(base,id);fs.mkdirSync(root,{recursive:true});
 const files={'package.json':'{"type":"module"}',[filename]:code,'products/shift/index.js':'export const x=1;','products/shift/index.ts':'export type T=number; export const x=1;',...extra};
 for(const [f,v]of Object.entries(files)){fs.mkdirSync(path.dirname(path.join(root,f)),{recursive:true});fs.writeFileSync(path.join(root,f),v)}
 const input={root,starts:[filename],origins:[],installed:[],compiled:{status:'UNAVAILABLE',files:[]}};
 const sf=ts.createSourceFile(filename,code,ts.ScriptTarget.Latest,true);
 function visit(n){if(ts.isCallExpression(n)&&n.expression.getText(sf)==='Object.getPrototypeOf'){
 const o={file:filename,fileSha256:sha(code),kind:ts.SyntaxKind[n.kind],start:n.getStart(sf),end:n.end,reason:'UNVERIFIED_DYNAMIC_CODE_EXECUTION',ordinal:0,expression:n.getText(sf)};input.origins.push({...o,id:semanticOriginId(o)});
 }ts.forEachChild(n,visit)}visit(sf);
 const output=runSemanticBoundary(input); const validation=validateSemanticBoundary(input,output);
 fs.writeFileSync(path.join(root,'input.json'),JSON.stringify(input,null,2));fs.writeFileSync(path.join(root,'output.json'),JSON.stringify(output,null,2));
 const row={id,expected,actual:output.status,validation,proofs:output.proofs.length,unknowns:output.unknowns,violations:output.violations,inputs:output.inputs,codehash:sha(code)};summaries.push(row);console.log(JSON.stringify(row));
 if(id==='p04-types-runtime'){fs.writeFileSync(path.join(root,'compiler-runtime-output.json'),JSON.stringify(ts.transpileModule(code,{fileName:filename,compilerOptions:{module:ts.ModuleKind.ESNext,verbatimModuleSyntax:true}}),null,2));}
}
fs.writeFileSync(path.join(base,'probe-summary.json'),JSON.stringify(summaries,null,2));
