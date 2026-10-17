import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import {createHash} from 'node:crypto'
import {spawnSync} from 'node:child_process'
import {afterEach,it,expect} from 'vitest'
import {auditProductBoundary} from '../scripts/check-product-boundary.mjs'
const proposal=JSON.parse(fs.readFileSync('docs/04_audit/evidence/PARE100-EXEC-20261014/spec0215/revision-r4/proposed-exceptions.json'))
const ids=new Set(proposal.groups.map(g=>g.id))
const pinned=[...new Set(proposal.groups.flatMap(g=>Object.keys(g.pins)))]
const example='examples/consumers/sdk-stdio/index.mts'
const child='examples/consumers/sdk-stdio/child.mts'
const directories=[]
const hash=b=>createHash('sha256').update(b).digest('hex')
const norm=t=>t.trim().replace(/\s+/g,' ')
const reviewed=a=>a.exceptions.filter(e=>ids.has(e.exception))
const capacities=a=>Object.fromEntries(proposal.groups.map(g=>[g.id,a.exceptions.filter(e=>e.exception===g.id).length]))
function fixture(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'i1-b215-'));directories.push(root)
 function write(f,v){const dest=path.join(root,f);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,v)}
 const packages={sdk:'@cvg/sdk',harness:'@cvg/harness',contracts:'@cvg/harness-contracts',vitest:'vitest'}
 const paths={}
 for(const [dir,name]of Object.entries(packages)){write(`packages/${dir}/package.json`,JSON.stringify({name,main:'src/index.ts'}));paths[name]=[`packages/${dir}/src/index.ts`]}
 write('package.json',JSON.stringify({workspaces:['packages/*','products/*']}))
 write('tsconfig.base.json',JSON.stringify({compilerOptions:{baseUrl:'.',paths}}))
 for(const f of pinned)write(f,fs.readFileSync(f))
 write('packages/contracts/src/index.ts','export const Synthetic=1\n')
 write('packages/vitest/src/index.ts','export const Synthetic=1\n')
 // Complete only absent local export targets with inert parser data. None is imported as runtime code.
 for(const f of pinned.filter(f=>/\.(ts|mts)$/.test(f))){
  const text=fs.readFileSync(f,'utf8');for(const m of text.matchAll(/(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g)){
   const target=path.posix.normalize(path.posix.join(path.posix.dirname(f),m[1]));if(!fs.existsSync(path.join(root,target)))write(target,'export const Synthetic=1\n')
  }
 }
 write('packages/sdk/src/mirrors.ts',"import '../../contracts/dist/canonical-json.js'\nimport '../../harness/dist/session/events.js'\n")
 write('products/shift/package.json',JSON.stringify({name:'@private/product',main:'src/index.ts'}))
 write('products/shift/src/index.ts','export const product=1\n')
 return {root,write,read:f=>fs.readFileSync(path.join(root,f),'utf8'),audit:o=>auditProductBoundary(root,o)}
}
function checkerProcess(f,{rehash=[],reason}={}){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'i1-b215-checker-'));directories.push(directory)
 let source=fs.readFileSync('scripts/check-product-boundary.mjs','utf8')
 for(const file of rehash){const prior=proposal.groups.find(g=>g.pins[file]).pins[file];const fresh=hash(fs.readFileSync(path.join(f.root,file)));expect(source.includes(prior)).toBe(true);source=source.replaceAll(prior,fresh)}
 if(reason){const marker="id: 'pare100-sdk-owned-example-child'",start=source.indexOf(marker),position=source.indexOf("reason: 'UNVERIFIED_DYNAMIC_CODE_EXECUTION'",start);expect(start).toBeGreaterThan(0);expect(position-start).toBeLessThan(100);source=source.slice(0,position)+source.slice(position).replace("reason: 'UNVERIFIED_DYNAMIC_CODE_EXECUTION'",`reason: '${reason}'`)}
 for(const name of ['boundary-manifests.mjs','boundary-lexical.mjs','boundary-code-execution.mjs','tsconfig-path-grammar.mjs'])fs.copyFileSync('scripts/'+name,path.join(directory,name))
 fs.writeFileSync(path.join(directory,'check-product-boundary.mjs'),source)
 fs.symlinkSync(path.resolve('node_modules'),path.join(directory,'node_modules'),'dir')
 return spawnSync(process.execPath,[path.join(directory,'check-product-boundary.mjs'),f.root],{encoding:'utf8',timeout:30000,maxBuffer:4*1024*1024})
}
function parsed(run){expect(run.error).toBeUndefined();expect(run.signal).toBeNull();expect(run.stderr).toBe('');expect([0,1]).toContain(run.status);return JSON.parse(run.stdout)}
function rawFor(a,file=example){return a.diagnostics.filter(d=>d.file.startsWith(file+':')&&d.reason==='UNVERIFIED_DYNAMIC_CODE_EXECUTION')}
afterEach(()=>{for(const d of directories.splice(0))fs.rmSync(d,{recursive:true,force:true})})

it('I1 complete local known-good fixture passes with exactly the proposed site multiset, not merely counts',()=>{
 const f=fixture(),a=f.audit();expect(a.status,JSON.stringify(a.diagnostics)).toBe('PASS');expect(a.violations).toEqual([]);expect(a.diagnostics).toEqual([]);expect(reviewed(a)).toHaveLength(46)
 const actual={};for(const d of reviewed(a)){const file=d.file.replace(/:\d+$/,''),line=norm(f.read(file).split('\n')[Number(d.file.match(/:(\d+)$/)[1])-1]);const key=JSON.stringify([d.exception,d.reason,file,line,d.expression]);actual[key]=(actual[key]??0)+1}
 const expected={};for(const g of proposal.groups)for(const [file,lines]of Object.entries(g.sites))for(const [line,expressions]of Object.entries(lines))for(const [expression,count]of Object.entries(expressions))expected[JSON.stringify([g.id,g.reason,file,line,expression])]=count
 expect(actual).toEqual(expected);expect(a.unusedExceptions.filter(d=>ids.has(d.exception))).toEqual([])
 console.log('I1_KNOWN_GOOD',JSON.stringify({status:a.status,capacities:capacities(a),exactKeys:Object.keys(actual).length}))
})
it('I1 default and strict actual CLI discriminate PASS from all raw expressions',()=>{
 const f=fixture(),checker=path.resolve('scripts/check-product-boundary.mjs')
 const good=spawnSync(process.execPath,[checker,f.root],{encoding:'utf8',timeout:30000,maxBuffer:4*1024*1024});const a=parsed(good);expect(good.status).toBe(0);expect(a.status).toBe('PASS');expect(reviewed(a)).toHaveLength(46)
 const strict=spawnSync(process.execPath,[checker,f.root,'--strict'],{encoding:'utf8',timeout:30000,maxBuffer:4*1024*1024});const b=parsed(strict);expect(strict.status).toBe(1);expect(b.status).toBe('INCOMPLETE');expect(b.exceptionsApplied).toBe(false);expect(b.exceptions).toEqual([]);expect(b.unusedExceptions).toEqual([])
 const targetFiles=new Set(proposal.groups.flatMap(g=>Object.keys(g.sites)));expect(b.diagnostics.filter(d=>targetFiles.has(d.file.replace(/:\d+$/,''))&&d.reason==='UNVERIFIED_DYNAMIC_CODE_EXECUTION')).toHaveLength(46)
 console.log('I1_CLI',JSON.stringify({defaultExit:good.status,strictExit:strict.status,strictDiagnostics:b.diagnostics.length,strictQualifiedRaw:46}))
})
it.each([
 ['import',"import '../../../products/shift/src/index.ts'\n"],
 ['require',"import {createRequire as loaderFactory} from 'node:module'\nconst trustedLoader=loaderFactory(import.meta.url);trustedLoader('../../../products/shift/src/index.ts')\n"],
 ['dynamic',"void import('../../../products/shift/src/index.ts')\n"]
])('I1 qualified example %s product edge still has a concrete witness',(kind,addition)=>{
 const f=fixture();f.write(example,f.read(example)+'\n'+addition);const a=f.audit();expect(a.status).toBe('FAIL');expect(a.violations.some(v=>v.reason==='CORE_DEPENDS_ON_PRODUCT'&&v.trail.includes(example)&&v.trail.includes('products/shift/src/index.ts'))).toBe(true);expect(rawFor(a)).toHaveLength(14);expect(reviewed(a)).toHaveLength(13)
})
it.each([
 ['SHIFT',"export const injected=process.env.SHIFT_TEST_SYNTHETIC\n",'CONSUMER_ENV_IN_CORE','FAIL'],
 ['unresolved',"import '@i1/unresolved-synthetic'\n",'UNRESOLVED_MODULE_REFERENCE','INCOMPLETE']
])('I1 qualified example %s retains the specific blocking diagnostic',(_kind,addition,reason,status)=>{
 const f=fixture();f.write(example,f.read(example)+'\n'+addition);const a=f.audit();expect(a.status).toBe(status);expect(a.diagnostics.some(d=>d.file.startsWith(example)&&d.reason===reason)).toBe(true);expect(rawFor(a)).toHaveLength(14);expect(reviewed(a)).toHaveLength(13)
})
it.each(['examples/unapproved/index.mts','scripts/unapproved.mjs','products/shift/src/unapproved.mts'])('I1 same reviewed line in %s receives no exemption',(file)=>{
 const f=fixture();f.write(file,"import {spawn} from 'node:child_process'\nconst child=spawn(process.execPath,[])\nchild.on('error', () => {})\n");f.write('packages/sdk/src/foreign-path.ts',`import ${JSON.stringify(path.posix.relative('packages/sdk/src',file).replace(/^(?!\.)/,'./'))}\n`);const a=f.audit();expect(a.passed).toBe(false);expect(a.exceptions.some(d=>d.file.startsWith(file+':'))).toBe(false);expect(reviewed(a)).toHaveLength(46)
 if(file.startsWith('products/'))expect(a.violations.some(v=>v.trail.includes(file))).toBe(true);else expect(a.diagnostics.some(d=>d.file.startsWith(file+':')&&d.reason==='UNVERIFIED_DYNAMIC_CODE_EXECUTION')).toBe(true)
})
it('I1 absent child byte-pin invalidates both owned SDK groups while compiled groups still match',()=>{
 const f=fixture();fs.unlinkSync(path.join(f.root,child));const a=f.audit();expect(rawFor(a)).toHaveLength(14);expect(rawFor(a,'packages/sdk/src/__tests__/stdio.test.ts')).toHaveLength(19);expect(reviewed(a)).toHaveLength(13);expect(a.status).toBe('INCOMPLETE');expect(a.unusedExceptions.filter(e=>e.exception.startsWith('pare100-sdk-owned-')).every(e=>e.pinsHold===false)).toBe(true)
})
it('I1 byte-identical child through a symlinked ancestor is rejected by identity',()=>{
 const f=fixture(),owned=path.join(f.root,'examples/consumers/sdk-stdio'),moved=path.join(f.root,'owned-original');fs.renameSync(owned,moved);fs.symlinkSync(moved,owned,'dir');expect(()=>f.audit()).toThrow(/physical_file_required|identity|symlink/)
})
it('I1 traversal through a symlink cannot alias the finite example exception',()=>{
 const f=fixture();f.write('examples/sibling/marker.mts','export const marker=1\n');fs.symlinkSync(path.join(f.root,'examples/sibling'),path.join(f.root,'examples/link'),'dir');f.write('packages/sdk/src/traversal.ts',"import '../../../examples/link/../consumers/sdk-stdio/index.mts'\n");expect(()=>f.audit()).toThrow(/physical_file_required|identity|symlink/)
})
it('I1 installed unknown finding survives with all 46 reviewed exemptions still active',()=>{
 const f=fixture();f.write('node_modules/i1-vendor/package.json',JSON.stringify({name:'i1-vendor',version:'1.0.0',main:'index.js'}));f.write('node_modules/i1-vendor/index.js','module.exports=1\n');f.write('packages/sdk/src/vendor.cjs',"require('i1-vendor')\n");const a=f.audit();expect(a.status).toBe('INCOMPLETE');expect(reviewed(a)).toHaveLength(46);expect(a.diagnostics).toContainEqual({file:'node_modules/i1-vendor/package.json',reason:'UNVERIFIED_INSTALLED_PACKAGE',detail:'NOT_IN_LOCKFILE'})
})
it('I1 whitespace-only spelling remains normalized after fixture-only pin refresh',()=>{
 const f=fixture();const original=f.read(example);f.write(example,original.replace("    child.on('error', () => {})","\t child.on('error', () => {})"));expect(f.read(example)).not.toBe(original);const run=checkerProcess(f,{rehash:[example]}),a=parsed(run);expect(run.status).toBe(0);expect(a.status).toBe('PASS');expect(reviewed(a)).toHaveLength(46)
})
it('I1 same spawn first line with changed later sibling is rejected despite valid fixture-only pins',()=>{
 const f=fixture();const original=f.read(example);f.write(example,original.replace("'./child.mjs'","'./other.mjs'"));expect(f.read(example)).not.toBe(original);const run=checkerProcess(f,{rehash:[example]}),a=parsed(run);expect(run.status).toBe(1);expect(a.status).toBe('INCOMPLETE');expect(rawFor(a)).toHaveLength(1);expect(reviewed(a)).toHaveLength(45);expect(a.unusedExceptions.filter(e=>ids.has(e.exception)).every(e=>e.pinsHold===true)).toBe(true)
})
it('I1 third occurrence exceeds the reviewed two-occurrence allowance despite valid fixture-only pins',()=>{
 const f=fixture();const original=f.read(example);const line='if (child) await shutdownSdkChild(child)';expect(original.split(line)).toHaveLength(3);f.write(example,original.replace(line,line+'\n        '+line));const run=checkerProcess(f,{rehash:[example]}),a=parsed(run);expect(run.status).toBe(1);expect(a.status).toBe('INCOMPLETE');expect(rawFor(a)).toHaveLength(1);expect(rawFor(a)[0].expression).toBe(hash('child').slice(0,16));expect(reviewed(a)).toHaveLength(46);expect(a.exceptions.filter(e=>e.exception==='pare100-sdk-owned-example-child')).toHaveLength(14)
})
it.each(['CONSUMER_ENV_IN_CORE','UNRESOLVED_MODULE_REFERENCE','INSTALLED_PACKAGE_REFERENCES_PRODUCT'])('I1 table cannot exempt forbidden reason %s even in copied-checker reason injection',(reason)=>{
 const f=fixture(),run=checkerProcess(f,{reason});expect(run.status).toBe(1);expect(run.stdout).toBe('');expect(run.stderr).toContain('invalid_boundary_exception:pare100-sdk-owned-example-child:'+reason)
})
