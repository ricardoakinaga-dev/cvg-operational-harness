import ts from '../q03-candidate/node_modules/typescript/lib/typescript.js'
import {readFileSync} from 'node:fs'
const printer=ts.createPrinter({removeComments:false})
function inspect(text){const sf=ts.createSourceFile('x.ts',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS),asserts=[],cases=[];function visit(node){if(ts.isCallExpression(node)){if(node.expression.getText(sf)==='expect')asserts.push(printer.printNode(ts.EmitHint.Unspecified,node,sf));if(node.expression.getText(sf)==='it')cases.push(printer.printNode(ts.EmitHint.Unspecified,node,sf))}ts.forEachChild(node,visit)}visit(sf);return {asserts,cases}}
const results=[]
for(const path of ['tests/conformance/harness-runtimes.conformance.test.ts','tests/consumers-sdk-session.test.ts']){
 const base=inspect(readFileSync(new URL('base/'+path,import.meta.url),'utf8')),candidate=inspect(readFileSync(new URL('../q03-candidate/'+path,import.meta.url),'utf8'))
 for(const kind of ['asserts','cases']){const remaining=[...candidate[kind]],missing=[];for(const value of base[kind]){const i=remaining.indexOf(value);if(i<0)missing.push(value);else remaining.splice(i,1)}results.push({path,kind,original:base[kind].length,candidate:candidate[kind].length,missing,added:remaining.length})}
}
console.log(JSON.stringify({method:'TypeScript AST printer; original expect calls and full it() bodies must survive unchanged with multiplicity',results},null,2))
if(results.some(x=>x.missing.length))process.exitCode=1
