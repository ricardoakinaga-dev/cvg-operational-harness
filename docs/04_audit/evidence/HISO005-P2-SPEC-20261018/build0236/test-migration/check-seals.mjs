import fs from 'node:fs'
import {createHash} from 'node:crypto'
import ts from '/home/ricardo/cvg-candidates/hiso005-integrated-20261018/node_modules/typescript/lib/typescript.js'
const digest = (s) => createHash('sha256').update(s).digest('hex')
function table(file) {
 const source=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.JS)
 const declaration=source.statements.filter(ts.isVariableStatement).flatMap(s=>[...s.declarationList.declarations]).find(d=>d.name.getText(source)==='capabilityExceptions')
 const initializer=declaration.initializer
 if(!ts.isArrayLiteralExpression(initializer))throw new Error('unexpected_historical_table_initializer:'+initializer.getText(source).slice(0,80))
 return {sha256:digest(initializer.getText(source)),bytes:Buffer.byteLength(initializer.getText(source))}
}
const root=table('/home/ricardo/Área de trabalho/cvg-operational-harness/scripts/check-product-boundary.mjs')
const candidate=table('/home/ricardo/cvg-candidates/hiso005-integrated-20261018/scripts/check-product-boundary.mjs')
console.log(JSON.stringify({root,candidate,sourceByteExact:root.sha256===candidate.sha256},null,2))
if(root.sha256!==candidate.sha256)process.exitCode=1
