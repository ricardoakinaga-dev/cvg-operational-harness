import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const ts=createRequire(import.meta.url)('typescript');
const proposal=JSON.parse(fs.readFileSync('docs/04_audit/evidence/PARE100-EXEC-20261014/spec0215/revision-r4/proposed-exceptions.json'));
const source=fs.readFileSync('scripts/check-product-boundary.mjs','utf8');
function parse(text){return ts.createSourceFile('checker.mjs',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS)}
function declaration(tree,name){let found;function walk(n){if(ts.isVariableDeclaration(n)&&n.name.getText(tree)===name)found=n.initializer;ts.forEachChild(n,walk)}walk(tree);assert(found,name);return found}
function literal(n){if(ts.isStringLiteral(n))return n.text;if(ts.isNumericLiteral(n))return Number(n.text);if(ts.isArrayLiteralExpression(n))return n.elements.map(literal);if(ts.isObjectLiteralExpression(n)){const o={};for(const p of n.properties){assert(ts.isPropertyAssignment(p));const key=p.name.text;assert(!Object.hasOwn(o,key),'duplicate property '+key);o[key]=literal(p.initializer)}return o}throw Error('unexpected table literal '+ts.SyntaxKind[n.kind])}
const tree=parse(source),table=literal(declaration(tree,'capabilityExceptions'));
let total=0;const rows=[];
const norm=s=>s.trim().replace(/\s+/g,' '), hash=s=>createHash('sha256').update(s).digest('hex');
for(const g of proposal.groups){
 const a=table.find(x=>x.id===g.id);assert(a,g.id);
 for(const field of ['reason','pins','sites'])assert.deepEqual(a[field],g[field],g.id+' '+field);
 let count=0,keys=0;
 for(const [file,digest]of Object.entries(g.pins))assert.equal(hash(fs.readFileSync(file)),digest,file);
 for(const [file,lines]of Object.entries(g.sites)){
  const text=fs.readFileSync(file,'utf8'),ast=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true),matches=[];
  function walk(n){if(n.pos>=0&&n.end>n.pos&&n.kind!==ts.SyntaxKind.SourceFile){const line=text.split('\n')[ast.getLineAndCharacterOfPosition(n.getStart(ast)).line];const expr=hash(norm(n.getText(ast))).slice(0,16);if(lines[norm(line)]&&Object.hasOwn(lines[norm(line)],expr))matches.push({line:norm(line),expression:expr,kind:ts.SyntaxKind[n.kind],text:n.getText(ast)})}ts.forEachChild(n,walk)}walk(ast);
  for(const [line,exprs]of Object.entries(lines))for(const [expr,max]of Object.entries(exprs)){assert(matches.some(m=>m.line===line&&m.expression===expr),file+' '+line+' '+expr);count+=max;keys++}
  rows.push({id:g.id,file,keys,capacity:count,matchingASTNodes:matches});
 }
 total+=count;
}
assert.equal(total,46);
function tokens(text){const ast=ts.createSourceFile('mirror.js',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),a=[];function walk(n){a.push(ts.SyntaxKind[n.kind]);if(ts.isIdentifier(n)||ts.isLiteralExpression(n))a.push(n.text);ts.forEachChild(n,walk)}walk(ast);return a}
const mirrors=[];
for(const f of ['packages/contracts/src/canonical-json.ts','packages/harness/src/session/events.ts']){
 const d=f.replace('/src/','/dist/').replace(/\.ts$/,'.js');const out=ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
 assert.deepEqual(tokens(out),tokens(fs.readFileSync(d,'utf8')),d+' AST mismatch');mirrors.push({source:f,compiled:d,ASTEqual:true,compiledSHA256:hash(fs.readFileSync(d))});
}
assert.deepEqual(literal(declaration(tree,'exceptableReasons').arguments[0]),['UNVERIFIED_DYNAMIC_CODE_EXECUTION','UNVERIFIED_MODULE_LOADER_ESCAPE','UNVERIFIED_MODULE_LOADER_PROPERTY']);
console.log(JSON.stringify({status:'PASS',proposalSHA256:hash(fs.readFileSync('docs/04_audit/evidence/PARE100-EXEC-20261014/spec0215/revision-r4/proposed-exceptions.json')),reviewedGroups:proposal.groups.map(g=>g.id),capacity:total,canonicalCapacity:3,mirrors,ASTSites:rows},null,2));
