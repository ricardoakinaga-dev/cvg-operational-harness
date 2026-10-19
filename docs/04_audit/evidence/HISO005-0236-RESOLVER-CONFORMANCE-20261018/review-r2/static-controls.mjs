import fs from 'node:fs';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const ts=createRequire(import.meta.url)('/home/ricardo/cvg-candidates/hiso005-resolver-fix-20261018/node_modules/typescript/lib/typescript.js');
const request=JSON.parse(fs.readFileSync(0,'utf8'));
const hash=x=>createHash('sha256').update(x).digest('hex');
function tests(source){const sf=ts.createSourceFile('tests.js',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);const items=[];function visit(n){if(ts.isCallExpression(n)){let e=n.expression;const isIt=ts.isIdentifier(e)&&e.text==='it';const isEach=ts.isCallExpression(e)&&ts.isPropertyAccessExpression(e.expression)&&e.expression.expression.getText(sf)==='it'&&e.expression.name.text==='each';if((isIt||isEach)&&ts.isStringLiteral(n.arguments[0]))items.push({title:n.arguments[0].text,sha256:hash(n.getText(sf))})}ts.forEachChild(n,visit)}visit(sf);return items}
const current=tests(request.current);const result={currentDeclarations:current.length,checks:[]};
for(const x of request.prior){const old=tests(x.source);const missing=old.filter(x=>!current.some(y=>x.title===y.title&&x.sha256===y.sha256));result.checks.push({commit:x.commit,priorDeclarations:old.length,unchanged:missing.length===0,missing})}
process.stdout.write(JSON.stringify(result,null,2)+'\n');
