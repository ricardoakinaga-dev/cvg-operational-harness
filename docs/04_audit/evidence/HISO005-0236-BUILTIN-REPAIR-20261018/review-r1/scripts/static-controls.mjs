import fs from 'node:fs';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const C='/home/ricardo/cvg-candidates/hiso005-resolver-fix-20261018';
const O='/home/ricardo/Área de trabalho/cvg-operational-harness/docs/04_audit/evidence/HISO005-0236-BUILTIN-REPAIR-20261018/review-r1';
const ts=createRequire(import.meta.url)(C+'/node_modules/typescript/lib/typescript.js');
const H=x=>createHash('sha256').update(x).digest('hex');
function calls(bytes){
 const sf=ts.createSourceFile('controls.js',bytes,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),out=[];
 function visit(n){
  if(ts.isCallExpression(n)&&(/^(?:it|test)$/.test(n.expression.getText(sf))||ts.isCallExpression(n.expression)&&/^(?:it|test)\.each$/.test(n.expression.expression.getText(sf)))){
   const source=n.getText(sf);out.push({source,sha256:H(source),callbackSha256:n.arguments[1]?H(n.arguments[1].getText(sf)):null,line:sf.getLineAndCharacterOfPosition(n.getStart(sf)).line+1,parameterized:ts.isCallExpression(n.expression),caseSource:ts.isCallExpression(n.expression)?n.expression.arguments.map(x=>x.getText(sf)):null});
  }ts.forEachChild(n,visit);
 }visit(sf);return {parseDiagnostics:sf.parseDiagnostics.map(x=>x.messageText),calls:out};
}
const old=calls(fs.readFileSync(O+'/inputs/base-cli-test.js','utf8'));
const current=calls(fs.readFileSync(C+'/tests/b6-0236-boundary-integration.test.js','utf8'));
const preserved=old.calls.map((x,i)=>({baseIndex:i,baseLine:x.line,sha256:x.sha256,callbackSha256:x.callbackSha256,parameterized:x.parameterized,caseSource:x.caseSource,foundCurrent:current.calls.some(y=>x.source===y.source)}));
const result={parserVersion:ts.version,parserSha256:H(fs.readFileSync(C+'/node_modules/typescript/lib/typescript.js')),baseCallDeclarations:old.calls.length,currentCallDeclarations:current.calls.length,allPriorTestCallsByteEqual:preserved.every(x=>x.foundCurrent),oldParseDiagnostics:old.parseDiagnostics,currentParseDiagnostics:current.parseDiagnostics,previousExpandedCLIControls:44,expandedCountProvenance:'Base test parameter rows and fixed two-mode each arrays; source preservation proves controls retained, not re-execution',preserved,engineCompilerInputs:['tests/b6-0236-semantic-engine.test.js','tests/b6-0236-compiled-provenance.test.js'].map(p=>({path:p,sha256:H(fs.readFileSync(C+'/'+p)),testDeclarations:calls(fs.readFileSync(C+'/'+p,'utf8')).calls.length,bytes:fs.statSync(C+'/'+p).size})),scope:'Static test-source preservation; producer173 executions are not independent verification'};
process.stdout.write(JSON.stringify(result,null,2));
