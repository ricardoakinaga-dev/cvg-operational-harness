import fs from 'node:fs'
import {createRequire} from 'node:module'
const ts=createRequire(import.meta.url)('typescript')
const [before,after,out]=process.argv.slice(2)
const printer=ts.createPrinter({removeComments:false})
const testStatements=(file)=>{
 const source=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true)
 const describe=source.statements.find(n=>ts.isExpressionStatement(n)&&ts.isCallExpression(n.expression)&&n.expression.expression.getText(source)==='describe')
 const body=describe.expression.arguments[1].body
 return [...body.statements].map(n=>printer.printNode(ts.EmitHint.Unspecified,n,source))
}
const old=testStatements(before),current=testStatements(after)
const suffix=current.slice(-old.length)
const result={originalTestStatements:old.length,currentTestStatements:current.length,allOriginalStatementsPreserved:JSON.stringify(old)===JSON.stringify(suffix)}
fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n')
console.log(JSON.stringify(result))
process.exitCode=result.allOriginalStatementsPreserved?0:1
