import ts from './candidate/node_modules/typescript/lib/typescript.js'
import {readFileSync,writeFileSync} from 'node:fs'
const root=new URL('./candidate/',import.meta.url)
for(const [path,mode,prefix] of [
 ['packages/harness/src/compaction.ts','all',"import { coreHook } from './kernel/hook-authority.ts'\n"],
 ['packages/harness/src/__tests__/aud0597-kplg004-regressions.test.ts','rewrite',"import { coreHook } from '../kernel/hook-authority.ts'\n"]
]){
 const p=new URL(path,root);let text=readFileSync(p,'utf8');const src=ts.createSourceFile(path,text,ts.ScriptTarget.Latest,true),changes=[]
 function visit(n){if(ts.isCallExpression(n)&&n.expression.getText(src)==='ctx.on'){const [point,fn]=n.arguments;if(fn&&(mode==='all'||fn.getText(src).includes('Object.assign(call.request')))changes.push({a:fn.getStart(src),b:fn.end,point:point.getText(src)})}ts.forEachChild(n,visit)}visit(src);if(changes.length!==1)throw Error(path+' unexpected '+changes.length)
 for(const x of changes.sort((a,b)=>b.a-a.a))text=text.slice(0,x.a)+`coreHook(${x.point}, `+text.slice(x.a,x.b)+')'+text.slice(x.b)
 writeFileSync(p,prefix+text)
}
{
 const path='packages/harness/src/__tests__/pdsh-031-slice2d-dispatch.test.ts';const p=new URL(path,root);let text=readFileSync(p,'utf8');const src=ts.createSourceFile(path,text,ts.ScriptTarget.Latest,true),edits=[];let count=0
 function visit(n){if(ts.isObjectLiteralExpression(n)){const plugin=n.properties.find(p=>ts.isPropertyAssignment(p)&&p.name.getText(src)==='plugin');const fn=n.properties.find(p=>ts.isPropertyAssignment(p)&&p.name.getText(src)==='fn');if(plugin&&fn&&plugin.initializer.getText(src)==="'control.approvals'"){
 const varname=ts.isVariableDeclaration(n.parent)?n.parent.name.getText(src):'';const point=varname==='reserveListener'?'tool/execute':'tool/pre-execute';edits.push({a:fn.initializer.getStart(src),b:fn.initializer.end,replacement:`coreHook('${point}', ${fn.initializer.getText(src)})`});edits.push({a:n.getStart(src)+1,b:n.getStart(src)+1,replacement:"\nkind: 'control',"});count++}}ts.forEachChild(n,visit)}visit(src);if(count!==3)throw Error('Unexpected approval doubles:'+count)
 for(const x of edits.sort((a,b)=>b.a-a.a))text=text.slice(0,x.a)+x.replacement+text.slice(x.b)
 writeFileSync(p,"import { coreHook } from '../kernel/hook-authority.ts'\n"+text)
}
