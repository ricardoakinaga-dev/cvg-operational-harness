import ts from './candidate/node_modules/typescript/lib/typescript.js'
import {readFileSync,writeFileSync} from 'node:fs'
const path=new URL('./candidate/packages/harness/src/kernel/controls.ts',import.meta.url)
let text=readFileSync(path,'utf8');const src=ts.createSourceFile('controls.ts',text,ts.ScriptTarget.Latest,true);const changes=[]
function visit(n){if(ts.isCallExpression(n)&&n.expression.getText(src)==='ctx.on'){const [point,fn]=n.arguments;if(point&&fn&&n.getStart(src)<text.indexOf('export function telemetryCapability'))changes.push({start:fn.getStart(src),end:fn.end,point:point.getText(src)})}ts.forEachChild(n,visit)}visit(src);if(changes.length!==8)throw Error('Unexpected core adapter set:'+changes.length)
for(const x of changes.sort((a,b)=>b.start-a.start))text=text.slice(0,x.start)+`coreHook(${x.point}, `+text.slice(x.start,x.end)+')'+text.slice(x.end)
text="import { coreHook } from './hook-authority.ts'\n"+text;writeFileSync(path,text)
