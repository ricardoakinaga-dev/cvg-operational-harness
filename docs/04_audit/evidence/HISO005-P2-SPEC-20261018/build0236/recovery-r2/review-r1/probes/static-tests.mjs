import fs from 'node:fs';import {createHash} from 'node:crypto';import {createRequire} from 'node:module';
const parser='/home/ricardo/cvg-candidates/hiso005-integrated-20261018/node_modules/typescript/lib/typescript.js';
const hash=x=>createHash('sha256').update(x).digest('hex');
if(hash(fs.readFileSync(parser))!=='569177652966bd528c319171c7dd22860dbf72bde116cbc4f644f1d02bb12e39')throw Error('parser pin');
const ts=createRequire(import.meta.url)(parser),root='/home/ricardo/cvg-candidates/hiso005-integrated-20261018';
const request=JSON.parse(fs.readFileSync(0,'utf8'));
const results=[];
for(const {name,source} of request){
 const sf=ts.createSourceFile(name,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),tests=[],suppression=[];
 function visit(n){
  if(ts.isCallExpression(n)){
   const e=n.expression;let test=false,variants=1,data=null;
   if(ts.isIdentifier(e)&&['it','test'].includes(e.text))test=true;
   else if(ts.isCallExpression(e)&&ts.isPropertyAccessExpression(e.expression)&&e.expression.name.text==='each'&&['it','test'].includes(e.expression.expression.getText(sf))){
    test=true;data=e.arguments[0]?.getText(sf);variants=ts.isArrayLiteralExpression(e.arguments[0])?e.arguments[0].elements.length:null;
   }
   if(test) tests.push({line:sf.getLineAndCharacterOfPosition(n.getStart(sf)).line+1,title:n.arguments[0]?.getText(sf),variants,data,bodySha256:hash(n.arguments[1]?.getText(sf)||'')});
   if(/^(?:it|test|describe)\.(?:skip|todo|only|fails|skipIf|runIf)\b/.test(e.getText(sf)))suppression.push(e.getText(sf));
  }
  ts.forEachChild(n,visit);
 }
 visit(sf);results.push({name,sha256:hash(source),parseErrors:sf.parseDiagnostics.length,tests,suppression,literalVariantCount:tests.every(t=>t.variants!==null)?tests.reduce((a,b)=>a+b.variants,0):null});
}
process.stdout.write(JSON.stringify(results,null,2));
