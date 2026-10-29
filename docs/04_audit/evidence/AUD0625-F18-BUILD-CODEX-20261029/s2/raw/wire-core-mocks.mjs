import ts from './candidate/node_modules/typescript/lib/typescript.js'
import {readFileSync,writeFileSync} from 'node:fs'
const root=new URL('./candidate/',import.meta.url)
{
 const path='packages/harness/src/__tests__/pdsh-031-slice2d-dispatch.test.ts';const p=new URL(path,root);let text=readFileSync(p,'utf8');const src=ts.createSourceFile(path,text,ts.ScriptTarget.Latest,true),edits=[];let count=0
 function visit(n){if(ts.isObjectLiteralExpression(n)){const plugin=n.properties.find(p=>ts.isPropertyAssignment(p)&&p.name.getText(src)==='plugin');const fn=n.properties.find(p=>ts.isPropertyAssignment(p)&&p.name.getText(src)==='fn');if(plugin&&fn&&plugin.initializer.getText(src)==="'control.approvals'"){
 const varname=ts.isVariableDeclaration(n.parent)?n.parent.name.getText(src):'';if(!['reservationListener','reserveListener'].includes(varname))return;const point=varname==='reserveListener'?'tool/execute':'tool/pre-execute';edits.push({a:fn.initializer.getStart(src),b:fn.initializer.end,replacement:`coreHook('${point}', ${fn.initializer.getText(src)})`});edits.push({a:n.getStart(src)+1,b:n.getStart(src)+1,replacement:"\nkind: 'control',"});count++}}ts.forEachChild(n,visit)}visit(src);if(count!==3)throw Error('Unexpected approval doubles:'+count)
 for(const x of edits.sort((a,b)=>b.a-a.a))text=text.slice(0,x.a)+x.replacement+text.slice(x.b)
 writeFileSync(p,"import { coreHook } from '../kernel/hook-authority.ts'\n"+text)
}
