import fs from 'node:fs'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
const ts=createRequire(import.meta.url)('typescript')
const read=f=>fs.readFileSync(f,'utf8')
const parse=f=>ts.createSourceFile(f,read(f),ts.ScriptTarget.Latest,true)
const walk=(n,fn)=>{fn(n);ts.forEachChild(n,c=>walk(c,fn))}
const sdk=['client','composition','index','protocol','server','stdio','validators'].map(n=>`packages/sdk/src/${n}.ts`)
const imports={}
for(const f of sdk){const ast=parse(f),list=[];walk(ast,n=>{if(ts.isImportDeclaration(n)&&ts.isStringLiteral(n.moduleSpecifier)){const spec=n.moduleSpecifier.text;list.push(spec);assert(!/child_process|worker_threads|node:vm/.test(spec))}if(ts.isCallExpression(n)&&ts.isIdentifier(n.expression))assert(!['eval','Function','spawn','exec','execFile'].includes(n.expression.text))});imports[f]=list}
const child=parse('examples/consumers/sdk-stdio/child.mts');let composed
walk(child,n=>{if(ts.isCallExpression(n)&&n.expression.getText(child)==='createSdk')composed=n.arguments[0]})
assert(composed&&ts.isObjectLiteralExpression(composed));const keys=composed.properties.map(p=>p.name?.getText(child));assert.deepEqual(keys,['tenantId','modelGateway','policy','approvals','clock','newEventId','newCorrelationId','newTraceId']);assert(!keys.includes('sessions'));assert(!keys.includes('tools'))
const composition=read('packages/sdk/src/composition.ts');assert(composition.includes('sessions: options.sessions ?? new InMemorySessionEventStore()'));assert(composition.includes('...options,'));assert(composition.includes('const server = createSdkServer({'))
assert(read('packages/sdk/src/server.ts').includes('const tools = options.tools ?? EMPTY_TOOLS'));assert(read('packages/sdk/src/server.ts').includes('modelGateway: options.modelGateway'));assert(read('packages/sdk/src/server.ts').includes('policy: options.policy'));assert(read('packages/sdk/src/server.ts').includes('approvals: options.approvals'))
const memory=read('packages/harness/src/session/memory.ts');assert(memory.includes('readonly #streams = new Map<'));assert(!/node:fs|node:net|fetch\(/.test(memory))
assert(read('packages/sdk/src/index.ts').includes("export * from './composition.ts'"));assert(read('packages/harness/src/index.ts').includes("export * from './session/index.ts'"));assert(read('packages/harness/src/session/index.ts').includes("export * from './memory.ts'"))
const checker=read('scripts/check-product-boundary.mjs'),normal=s=>s.replace(/\s+/g,' ').trim();const ast=parse('scripts/check-product-boundary.mjs');const predicates={};walk(ast,n=>{if(ts.isVariableDeclaration(n)&&['firstPartyFile','pinnableFirstPartyFile','sdkExampleSite'].includes(n.name.getText(ast)))predicates[n.name.getText(ast)]=normal(n.initializer.getText(ast))})
assert.equal(predicates.sdkExampleSite,"'examples/consumers/sdk-stdio/index.mts'")
assert.equal(predicates.firstPartyFile,"(file) => (/^(?:packages|apps|legacy)\\//.test(file) || file === sdkExampleSite) && !file .split('/') .some((part) => ['node_modules', '..', '.', ''].includes(part))")
assert.equal(predicates.pinnableFirstPartyFile,"(file) => firstPartyFile(file) || file === 'examples/consumers/sdk-stdio/child.mts' || (/^scripts\\//.test(file) && !file .split('/') .some((part) => ['node_modules', '..', '.', ''].includes(part)))")
assert(checker.includes('fs.lstatSync(target).isFile()'));assert(checker.includes('fs.realpathSync(target) === target'));assert(checker.includes('used < site.max && pinsHold(site.pins)'))
console.log(JSON.stringify({status:'PASS',SDKImports:imports,fixedChildCompositionKeys:keys,defaultStore:'sessions ?? new InMemorySessionEventStore()',publicStoreChain:['packages/sdk/src/composition.ts','packages/harness/src/index.ts','packages/harness/src/session/index.ts','packages/harness/src/session/memory.ts'],RPCSelectedProcessInputs:false,predicates,pinIdentityChecks:['lstat.isFile','realpath===literal target','full SHA256','every group pin'],scope:'Static composition qualification only; no SDK modules imported or applications executed'},null,2))
