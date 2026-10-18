import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { spawn, spawnSync } from 'node:child_process'
import {
  runSemanticBoundary as directRunSemanticBoundary,
  analyzeSemanticBoundary,
  semanticOriginId,
  SEMANTIC_LIMITS
} from '../scripts/boundary-semantic-engine.mjs'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const parent = '/tmp/cvg-hiso005-integration-20261018/engine'
const hash = (x) => createHash('sha256').update(x).digest('hex')
const pinnedNode = '/home/ricardo/.nvm/versions/node/v22.23.2/bin/node'
const enginePath = path.resolve('scripts/boundary-semantic-engine.mjs')
// Vitest itself uses a --require warning hook and resolution conditions. The
// real API must decline that profile. Exercise positives in a physical clean
// Node22 caller, which then supervises its own analysis/recomputation worker.
function cleanCall(
  method,
  args,
  { node = pinnedNode, flags = [], nodeOptions } = {}
) {
  const code =
    'const fs=require("node:fs"); const engine=require(process.argv[1]); const request=JSON.parse(fs.readFileSync(0,"utf8")); process.stdout.write(JSON.stringify(engine[request.method](...request.args)));'
  const out = spawnSync(node, [...flags, '-e', code, enginePath], {
    input: JSON.stringify({ method, args }),
    encoding: 'utf8',
    timeout: 30000,
    env: {
      PATH: path.dirname(pinnedNode) + ':/usr/bin:/bin',
      LANG: 'C',
      TZ: 'UTC',
      ...(nodeOptions ? { NODE_OPTIONS: nodeOptions } : {})
    }
  })
  if (out.status !== 0)
    throw Error('clean caller failed: ' + (out.stderr || out.error?.message))
  return JSON.parse(out.stdout)
}
const runSemanticBoundary = (input) => cleanCall('runSemanticBoundary', [input])
const validateSemanticBoundary = (input, output) =>
  cleanCall('validateSemanticBoundary', [input, output])
function fixture(source = 'export const answer = 42;', files = {}) {
  fs.mkdirSync(parent, { recursive: true })
  const root = fs.mkdtempSync(path.join(parent, 'physical-'))
  for (const [file, body] of Object.entries({
    'package.json': '{"type":"module"}',
    'entry.js': source,
    ...files
  })) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    fs.writeFileSync(path.join(root, file), body)
  }
  return {
    root,
    starts: ['entry.js'],
    origins: [],
    installed: [],
    compiled: { status: 'UNAVAILABLE', files: [] }
  }
}
function origin(
  input,
  text = 'Object.getOwnPropertyDescriptor(data, "x")',
  ordinal = 0
) {
  const source = fs.readFileSync(path.join(input.root, 'entry.js'), 'utf8')
  const sf = ts.createSourceFile(
    'entry.js',
    source,
    ts.ScriptTarget.Latest,
    true
  )
  let found
  function visit(n) {
    if (n.getText(sf) === text) found = n
    ts.forEachChild(n, visit)
  }
  visit(sf)
  if (!found) throw Error('fixture node missing: ' + text)
  const record = {
    file: 'entry.js',
    fileSha256: hash(source),
    kind: ts.SyntaxKind[found.kind],
    start: found.getStart(sf),
    end: found.end,
    reason: 'UNKNOWN_REFLECTION',
    ordinal,
    expression: text
  }
  return { ...record, id: semanticOriginId(record) }
}
const reflect =
  'const data = {x: 3}; const descriptor = Object.getOwnPropertyDescriptor(data, "x"); export const answer = descriptor.value;'
function depFixture() {
  const input = fixture(
    'import {answer} from "closed"; export const result = answer;',
    {
      'node_modules/closed/package.json':
        '{"name":"closed","type":"module","exports":"./index.js"}',
      'node_modules/closed/index.js':
        'const data={x:42}; export const answer=Object.getOwnPropertyDescriptor(data,"x").value;'
    }
  )
  input.installed = [
    {
      key: 'node_modules/closed',
      manifest: 'node_modules/closed/package.json',
      identityStatus: 'MATCH',
      referenceDigest: 'a'.repeat(64)
    }
  ]
  return input
}

describe('BUILD0236 semantic kernel: physical proofs, never execute targets', () => {
  it('proves a minimal JS module with an actually installed closed MATCH dependency', () => {
    const input = depFixture()
    const out = runSemanticBoundary(input)
    expect(out.status).toBe('PROVEN')
    expect(out.installed[0].status).toBe('PROVEN')
    expect(out.inputs.map((x) => x.file)).toContain(
      'node_modules/closed/index.js'
    )
    expect(out.validation.valid).toBe(true)
    expect(validateSemanticBoundary(input, out).valid).toBe(true)
  })
  it('proves local reflection and keeps duplicate emitter occurrences separate', () => {
    const input = fixture(reflect)
    input.origins = [origin(input), origin(input, undefined, 1)]
    const out = runSemanticBoundary(input)
    expect(out.status).toBe('PROVEN')
    expect(
      new Set(out.proofs.filter((x) => x.originId).map((x) => x.originId)).size
    ).toBe(2)
  })
  it('has deterministic payload excluding telemetry', () => {
    const input = fixture(reflect)
    const a = runSemanticBoundary(input),
      b = runSemanticBoundary(input)
    delete a.telemetry
    delete b.telemetry
    expect(a).toEqual(b)
  })
  it('propagates the actual receiver into a local method; extraction loses this', () => {
    expect(
      runSemanticBoundary(
        fixture(
          'const o={x:3, get(){ return this.x; }}; export const answer=o.get();'
        )
      ).status
    ).toBe('PROVEN')
    expect(
      runSemanticBoundary(
        fixture(
          'const o={x:3, get(){ return this.x; }}; const get=o.get; export const answer=get();'
        )
      ).status
    ).toBe('UNKNOWN')
  })
  it.each([
    [
      'export const f=(input)=>Object.getPrototypeOf(input);',
      'external parameter'
    ],
    [
      'const data={get x(){return 3}}; Object.getOwnPropertyDescriptor(data,"x");',
      'getter'
    ],
    ['const data=new Proxy({},{}); Object.getPrototypeOf(data);', 'Proxy'],
    [
      'Object.getPrototypeOf = (x)=>x; const data={}; Object.getPrototypeOf(data);',
      'intrinsic mutation'
    ],
    [
      'const data={x:3}; data.x=4; Object.getOwnPropertyDescriptor(data,"x");',
      'alias mutation'
    ],
    [
      'const data={}; unknown(data); Object.getPrototypeOf(data);',
      'opaque escape'
    ],
    [
      'const Object={getPrototypeOf: external}; Object.getPrototypeOf({});',
      'shadow intrinsic'
    ],
    ['export async function f(){ return 1; }', 'async'],
    ['const f=()=>f(); f();', 'recursive'],
    ['for(;;){}', 'loop'],
    ['export const f = () => arguments;', 'arguments'],
    ['export const f=Function("return 1");', 'generated code'],
    ['export const f=Reflect.get({},"x");', 'unsupported reflection'],
    [
      'globalThis.__CVG_OPERATOR_BOOTSTRAP_TOKEN_PROVIDER__();',
      'ambient bootstrap'
    ],
    [
      'import {spawn} from "node:child_process"; spawn("bwrap",[]);',
      'external executable'
    ],
    ['import "./addon.node";', 'native'],
    ['export const x = ;', 'parse'],
    [
      'const data={__proto__:null}; Object.getPrototypeOf(data);',
      'prototype setter'
    ],
    ['const data={...{x:3}}; Object.getPrototypeOf(data);', 'spread'],
    ['const o={m(){return 3}}; o.m.call(o);', 'call']
  ])('refuses %s (%s)', (source) => {
    const out = runSemanticBoundary(fixture(source))
    expect(out.status).toBe('UNKNOWN')
    expect(out.proofs).toHaveLength(0)
  })
  it('does not execute hostile target code', () => {
    const input = fixture()
    const marker = path.join(input.root, 'target-was-executed')
    fs.writeFileSync(
      path.join(input.root, 'entry.js'),
      'import fs from "node:fs"; fs.writeFileSync(' +
        JSON.stringify(marker) +
        ', "executed");'
    )
    expect(runSemanticBoundary(input).status).toBe('UNKNOWN')
    expect(fs.existsSync(marker)).toBe(false)
  })
  it('requires identity and actual implementation, never trusts package names', () => {
    for (const status of ['MISMATCH', 'UNAVAILABLE', 'UNSUPPORTED']) {
      const input = depFixture()
      input.installed[0].identityStatus = status
      expect(runSemanticBoundary(input).status).toBe('UNKNOWN')
    }
    const input = depFixture()
    fs.writeFileSync(
      path.join(input.root, 'node_modules/closed/index.js'),
      'export const answer=external();'
    )
    expect(runSemanticBoundary(input).status).toBe('UNKNOWN')
  })
  it('refuses module cycles instead of closing a visited node', () => {
    const input = fixture('import "./b.js";', {
      'b.js': 'import "./entry.js";'
    })
    const out = runSemanticBoundary(input)
    expect(out.status).toBe('UNKNOWN')
    expect(out.unknowns.some((x) => x.reason === 'UNKNOWN_CYCLE')).toBe(true)
  })
  it.each([
    ['import "./products/shift-assistant/index.js";', {}],
    [
      'const prefix="./products/"; const suffix="shift-assistant/index.js"; import(prefix+suffix);',
      {}
    ],
    [
      'import "closed";',
      {
        'node_modules/closed/package.json':
          '{"type":"module","exports":"./index.js"}',
        'node_modules/closed/index.js':
          'import "../../products/shift-assistant/index.js";'
      }
    ]
  ])(
    'retains known product violations before semantic refusals',
    (source, files) => {
      const input = fixture(source, files)
      input.limits = { maxNodes: 1 }
      expect(runSemanticBoundary(input).status).toBe('VIOLATION')
    }
  )
  it('resolves require to real CJS implementation without importing it', () => {
    const input = fixture(
      'const data=require("./dep.cjs"); module.exports=data;',
      {
        'entry.js': 'const data=require("./dep.cjs"); module.exports=data;',
        'package.json': '{"type":"commonjs"}',
        'dep.cjs': 'module.exports=42;'
      }
    )
    expect(runSemanticBoundary(input).status).toBe('PROVEN')
  })
  it('skips type-only imports and refuses missing runtime imports', () => {
    expect(
      runSemanticBoundary(
        fixture('import type {X} from "missing"; export const x=1;', {
          'entry.js': 'export const x=1;'
        })
      ).status
    ).toBe('PROVEN')
    const input = fixture('import type {X} from "missing"; export const x=1;')
    fs.renameSync(
      path.join(input.root, 'entry.js'),
      path.join(input.root, 'entry.ts')
    )
    input.starts = ['entry.ts']
    expect(runSemanticBoundary(input).status).toBe('PROVEN')
    expect(runSemanticBoundary(fixture('import "missing";')).status).toBe(
      'UNKNOWN'
    )
  })
  it('unknown conditional resolution and external symlinks never become proof', () => {
    const input = depFixture()
    fs.writeFileSync(
      path.join(input.root, 'node_modules/closed/package.json'),
      '{"exports":{"browser":"./browser.js","default":"./index.js"}}'
    )
    expect(runSemanticBoundary(input).status).toBe('UNKNOWN')
    const other = fixture('export const x=1;'),
      linked = fixture('import "./alias.js";')
    fs.symlinkSync(
      path.join(other.root, 'entry.js'),
      path.join(linked.root, 'alias.js')
    )
    expect(runSemanticBoundary(linked).status).toBe('UNKNOWN')
  })
  it.each([
    'originId',
    'fileSha256',
    'start',
    'end',
    'kind',
    'ordinal',
    'derivation',
    'dependencies',
    'id'
  ])('rejects tampered proof %s by full recomputation', (field) => {
    const input = fixture(reflect)
    input.origins = [origin(input)]
    const out = runSemanticBoundary(input)
    const proof = out.proofs.find((x) => x.originId)
    expect(proof).toBeTruthy()
    proof[field] = field === 'dependencies' ? [proof.id] : 'forged'
    expect(validateSemanticBoundary(input, out).valid).toBe(false)
  })
  it('rejects forged origins, changed bytes, omitted proofs and forged conclusion', () => {
    const input = fixture(reflect)
    input.origins = [origin(input)]
    const out = runSemanticBoundary(input)
    const bad = structuredClone(input)
    bad.origins[0].start++
    expect(runSemanticBoundary(bad).status).toBe('UNKNOWN')
    const forged = structuredClone(out)
    forged.proofs = []
    expect(validateSemanticBoundary(input, forged).valid).toBe(false)
    fs.appendFileSync(path.join(input.root, 'entry.js'), '\nexternal();')
    expect(validateSemanticBoundary(input, out).valid).toBe(false)
    const unknown = runSemanticBoundary(input)
    unknown.status = 'PROVEN'
    expect(validateSemanticBoundary(input, unknown).valid).toBe(false)
  })
  it.each(Object.keys(SEMANTIC_LIMITS).filter((x) => x !== 'timeoutMs'))(
    'enforces reduced %s without partial proofs and disallows raising it',
    (name) => {
      const input = fixture('const f=(a)=>a; export const x=f(1);')
      const positive = runSemanticBoundary(input)
      expect(positive.status).toBe('PROVEN')
      const usageName = {
        maxFileBytes: 'fileBytes',
        maxTotalBytes: 'totalBytes',
        maxFiles: 'files',
        maxNodes: 'nodes',
        maxUnionValues: 'unionValues',
        maxContexts: 'contexts',
        maxCallDepth: 'callDepth',
        maxStates: 'states'
      }[name]
      const used = positive.usage[usageName]
      input.limits = { [name]: used }
      expect(runSemanticBoundary(input).status).toBe('PROVEN')
      input.limits = { [name]: used - 1 }
      const negative = runSemanticBoundary(input)
      expect(negative.status).toBe('UNKNOWN')
      expect(negative.proofs).toHaveLength(0)
      expect(
        negative.unknowns.some((x) => x.reason === 'UNKNOWN_ANALYSIS_LIMIT')
      ).toBe(true)
      input.limits = { [name]: SEMANTIC_LIMITS[name] + 1 }
      expect(runSemanticBoundary(input).status).toBe('UNKNOWN')
    }
  )
  it('supervisor deadline invalidates all partial output', () => {
    const input = fixture(reflect)
    input.limits = { timeoutMs: 1 }
    const out = runSemanticBoundary(input)
    expect(out.status).toBe('UNKNOWN')
    expect(out.proofs).toHaveLength(0)
    expect(
      out.unknowns.some((x) => x.reason === 'UNKNOWN_ANALYSIS_LIMIT')
    ).toBe(true)
  })
  it('internal analysis alone never claims validated output', () => {
    expect(analyzeSemanticBoundary(fixture()).validation.valid).toBe(false)
  })
  it.each([
    'export const identity=(input)=>input;',
    'export const cap=({}).constructor;',
    'export const o={x:1,get(){return this.x;}};',
    'export const f=()=>()=>external();',
    'export const value;',
    'const o={}; const f=o.toString; export const value=f;',
    'const o={x:1}; const alias=o; if(true){alias.x=2;} Object.getPrototypeOf(o);'
  ])(
    'does not turn public or inherited capabilities into data: %s',
    (source) => {
      expect(runSemanticBoundary(fixture(source)).status).toBe('UNKNOWN')
    }
  )
  it('does not replace a runtime implementation with a declaration', () => {
    for (const file of ['entry.ts', 'entry.d.ts']) {
      const input = fixture('', {
        [file]: 'export declare const value: string;'
      })
      input.starts = [file]
      expect(runSemanticBoundary(input).status).toBe('UNKNOWN')
    }
  })
  it('refuses ESM/CJS interop rather than inventing a namespace', () => {
    expect(
      runSemanticBoundary(
        fixture('import {x} from "./dep.cjs"; export const answer=x;', {
          'dep.cjs': 'module.exports={x:3};'
        })
      ).status
    ).toBe('UNKNOWN')
  })
  it('preserves local function contexts, data destructuring and returned descriptors', () => {
    const input = fixture(
      'const make=(x)=>({x}); const a=make(1); const b=make(2); const {value}=Object.getOwnPropertyDescriptor(b,"x"); export const result=value;'
    )
    expect(runSemanticBoundary(input).status).toBe('PROVEN')
  })
  it('K4 descriptor flags include real array length attributes', () => {
    const source =
      'const data=[3]; const d=Object.getOwnPropertyDescriptor(data,"length"); if(d.enumerable){external();} export const value=d.value;'
    expect(runSemanticBoundary(fixture(source)).status).toBe('PROVEN')
    const changed = source.replace('if(d.enumerable)', 'if(d.writable)')
    expect(runSemanticBoundary(fixture(changed)).status).toBe('UNKNOWN')
  })
  it('known local descriptor.value calls require a body and receiver', () => {
    expect(
      runSemanticBoundary(
        fixture(
          'const data={x:()=>42}; export const answer=Object.getOwnPropertyDescriptor(data,"x").value();'
        )
      ).status
    ).toBe('PROVEN')
    expect(
      runSemanticBoundary(
        fixture(
          'const data={x(){return this.value;},value:42}; export const answer=Object.getOwnPropertyDescriptor(data,"x").value();'
        )
      ).status
    ).toBe('UNKNOWN')
  })
  it('revalidates actual resolution and absent nearer package paths', () => {
    const input = fixture(
      'import {answer} from "closed"; export const x=answer;',
      {
        'node_modules/closed/package.json':
          '{"type":"module","exports":"./index.js"}',
        'node_modules/closed/index.js': 'export const answer=42;'
      }
    )
    input.installed = [
      {
        key: 'node_modules/closed',
        manifest: 'node_modules/closed/package.json',
        identityStatus: 'MATCH',
        referenceDigest: 'a'.repeat(64)
      }
    ]
    const out = runSemanticBoundary(input)
    expect(out.status).toBe('PROVEN')
    fs.writeFileSync(
      path.join(input.root, 'node_modules/closed/package.json'),
      '{"type":"module","exports":{"import":"./index.js","require":"./evil.cjs"}}'
    )
    expect(validateSemanticBoundary(input, out).valid).toBe(false)
  })
  it('does not guess runtime entries for an installed record by name', () => {
    const input = depFixture()
    fs.writeFileSync(path.join(input.root, 'entry.js'), 'export const x=1;')
    const out = runSemanticBoundary(input)
    expect(out.status).toBe('UNKNOWN')
    expect(out.installed[0].proofIds).toHaveLength(0)
    expect(out.inputs.map((x) => x.file)).not.toContain(
      'node_modules/closed/index.js'
    )
  })
  it('known resolved product targets prevail behind opaque effects and local aliases', () => {
    const input = fixture(
      'external(); const base="./products/"; require(base+"shift-assistant/index.js");',
      { 'package.json': '{"type":"commonjs"}' }
    )
    expect(runSemanticBoundary(input).status).toBe('VIOLATION')
  })
  it('records finite union alternatives without dropping the unsafe one', () => {
    const input = fixture(
      'const data={}; const target=data ? "./safe.cjs" : "./products/shift-assistant/index.js"; require(target);',
      {
        'package.json': '{"type":"commonjs"}',
        'safe.cjs': 'module.exports=42;'
      }
    )
    expect(runSemanticBoundary(input).status).toBe('VIOLATION')
  })
  it('validates UTF16 spans and BindingElement origins using real nodes', () => {
    const input = fixture(
      'const label="😀"; const data={x:3}; const {x}=data; export const result=x;'
    )
    const o = origin(input, 'x')
    // Select BindingElement explicitly: an Identifier shares its text/span.
    o.kind = 'BindingElement'
    o.synthetic = {
      originalKind: 'BindingElement',
      originalStart: o.start,
      originalEnd: o.end,
      property: 'x'
    }
    o.id = semanticOriginId(o)
    input.origins = [o]
    expect(runSemanticBoundary(input).status).toBe('UNKNOWN')
    // Find the actual binding span instead of selecting a same-text identifier.
    const text = fs.readFileSync(path.join(input.root, 'entry.js'), 'utf8')
    const sf = ts.createSourceFile(
      'entry.js',
      text,
      ts.ScriptTarget.Latest,
      true
    )
    let binding
    function visit(n) {
      if (ts.isBindingElement(n)) binding = n
      ts.forEachChild(n, visit)
    }
    visit(sf)
    o.start = binding.getStart(sf)
    o.end = binding.end
    o.synthetic.originalStart = o.start
    o.synthetic.originalEnd = o.end
    o.id = semanticOriginId(o)
    expect(runSemanticBoundary(input).status).toBe('PROVEN')
    o.synthetic.property = 'forged'
    o.id = semanticOriginId(o)
    expect(runSemanticBoundary(input).status).toBe('UNKNOWN')
  })
  it('sync requireESM is supported by the pinned Node22 without top-level await', () => {
    // The actual checker uses this Node22 createRequire surface.
    expect(
      require('../scripts/boundary-semantic-engine.mjs').runSemanticBoundary
    ).toBeTypeOf('function')
  })
  it('requires physical identity for relative imports into node_modules too', () => {
    const input = depFixture()
    fs.writeFileSync(
      path.join(input.root, 'entry.js'),
      'import {answer} from "./node_modules/closed/index.js"; export const x=answer;'
    )
    expect(runSemanticBoundary(input).status).toBe('PROVEN')
    input.installed = []
    expect(runSemanticBoundary(input).status).toBe('UNKNOWN')
  })
  it('does not classify a package named products as the actual product tree', () => {
    const input = fixture('import {x} from "products"; export const value=x;', {
      'node_modules/products/package.json':
        '{"type":"module","exports":"./index.js"}',
      'node_modules/products/index.js': 'export const x=42;'
    })
    input.installed = [
      {
        key: 'node_modules/products',
        manifest: 'node_modules/products/package.json',
        identityStatus: 'MATCH',
        referenceDigest: 'a'.repeat(64)
      }
    ]
    expect(runSemanticBoundary(input).status).toBe('PROVEN')
  })
  it('requires MATCH independently for the actual nested runtime dependency', () => {
    const input = depFixture()
    fs.writeFileSync(
      path.join(input.root, 'node_modules/closed/index.js'),
      'import {x} from "inner"; export const answer=x;'
    )
    const key = 'node_modules/closed/node_modules/inner'
    fs.mkdirSync(path.join(input.root, key), { recursive: true })
    fs.writeFileSync(
      path.join(input.root, key, 'package.json'),
      '{"type":"module","exports":"./index.js"}'
    )
    fs.writeFileSync(
      path.join(input.root, key, 'index.js'),
      'export const x=42;'
    )
    expect(runSemanticBoundary(input).status).toBe('UNKNOWN')
    input.installed.push({
      key,
      manifest: key + '/package.json',
      identityStatus: 'MATCH',
      referenceDigest: 'b'.repeat(64)
    })
    const out = runSemanticBoundary(input)
    expect(out.status).toBe('PROVEN')
    expect(out.installed.every((x) => x.proofIds.length > 0)).toBe(true)
  })
  it('keeps the real CJS main path after extension resolution', () => {
    const input = fixture(
      'const data=require("closed"); module.exports=data;',
      {
        'package.json': '{"type":"commonjs"}',
        'node_modules/closed/package.json': '{"main":"./index"}',
        'node_modules/closed/index.js': 'module.exports=42;'
      }
    )
    input.installed = [
      {
        key: 'node_modules/closed',
        manifest: 'node_modules/closed/package.json',
        identityStatus: 'MATCH',
        referenceDigest: 'a'.repeat(64)
      }
    ]
    const out = runSemanticBoundary(input)
    expect(out.status).toBe('PROVEN')
    expect(out.installed[0].proofIds.length).toBeGreaterThan(0)
  })
  it('checks all finite require alternatives and caps distinct union members', () => {
    const input = fixture(
      'const c={}; const s=c?"./a.cjs":"./b.cjs"; module.exports=require(s);',
      {
        'package.json': '{"type":"commonjs"}',
        'a.cjs': 'module.exports=1;',
        'b.cjs': 'module.exports=2;'
      }
    )
    input.limits = { maxUnionValues: 2 }
    const out = runSemanticBoundary(input)
    expect(out.status).toBe('PROVEN')
    expect(out.inputs.map((x) => x.file)).toEqual(
      expect.arrayContaining(['a.cjs', 'b.cjs'])
    )
    input.limits = { maxUnionValues: 1 }
    expect(runSemanticBoundary(input).status).toBe('UNKNOWN')
    fs.writeFileSync(path.join(input.root, 'b.cjs'), 'external();')
    delete input.limits
    expect(runSemanticBoundary(input).status).toBe('UNKNOWN')
  })
  it('rejects a forged current origin kind even with a freshly recomputed id', () => {
    const input = fixture(reflect)
    const o = origin(input)
    o.kind = 'NewExpression'
    o.id = semanticOriginId(o)
    input.origins = [o]
    expect(runSemanticBoundary(input).status).toBe('UNKNOWN')
  })
  it('rejects the actual caller runtime and hooks, not just a nominal Node path', () => {
    const input = fixture()
    const underHook = directRunSemanticBoundary(input)
    expect(underHook.status).toBe('UNKNOWN')
    expect(
      underHook.unknowns.some((x) => x.reason === 'UNKNOWN_RUNTIME_PROFILE')
    ).toBe(true)
    const other = cleanCall('runSemanticBoundary', [input], {
      node: '/home/ricardo/.nvm/versions/node/v24.20.0/bin/node'
    })
    expect(other.status).toBe('UNKNOWN')
    expect(
      other.unknowns.some((x) => x.reason === 'UNKNOWN_TOOLCHAIN_RUNTIME')
    ).toBe(true)
    for (const options of [
      { flags: ['--conditions=adversarial'] },
      { flags: ['--frozen-intrinsics'] },
      { nodeOptions: '--conditions=adversarial' }
    ]) {
      const out = cleanCall('runSemanticBoundary', [input], options)
      expect(out.status).toBe('UNKNOWN')
      expect(
        out.unknowns.some((x) => x.reason === 'UNKNOWN_RUNTIME_PROFILE')
      ).toBe(true)
    }
  })
  it('requires host validated compiled provenance for the exact emitted bytes', () => {
    const input = fixture(
      'import {x} from "./dist/emit.js"; export const value=x;',
      { 'dist/emit.js': 'export const x=42;' }
    )
    expect(runSemanticBoundary(input).status).toBe('UNKNOWN')
    input.compiled = {
      status: 'PROVEN',
      files: [{ file: 'dist/emit.js', sha256: hash('export const x=42;') }]
    }
    expect(runSemanticBoundary(input).status).toBe('PROVEN')
    fs.writeFileSync(
      path.join(input.root, 'dist/emit.js'),
      'export const x=43;'
    )
    expect(runSemanticBoundary(input).status).toBe('UNKNOWN')
  })
  it('charges canonical resolver metadata as well as implementations to byte/file budgets', () => {
    const input = fixture('export const x=1;', {
      'package.json': JSON.stringify({
        type: 'module',
        description: 'x'.repeat(1024)
      })
    })
    const out = runSemanticBoundary(input)
    expect(out.status).toBe('PROVEN')
    const total = out.inputs.reduce(
      (sum, x) => sum + fs.statSync(path.join(input.root, x.file)).size,
      0
    )
    expect(out.usage.totalBytes).toBe(total)
    expect(out.usage.files).toBe(out.inputs.length)
    input.limits = { maxTotalBytes: 64 }
    const refused = runSemanticBoundary(input)
    expect(refused.status).toBe('UNKNOWN')
    expect(
      refused.unknowns.some((x) => x.reason === 'UNKNOWN_ANALYSIS_LIMIT')
    ).toBe(true)
    expect(refused.proofs).toHaveLength(0)
  })
  it.each([
    'const state={x:()=>1}; export {state}; export const f=()=>state.x();',
    'const state={x:()=>1}; export const f=()=>state.x(); export {state};',
    'const state={x:()=>1}; export const expose=()=>state; export const f=()=>state.x();',
    'const state={x:()=>1}; export default {state}; export const f=()=>state.x();',
    'const state={x:()=>1}; export const list=[state]; export const f=()=>state.x();',
    'export const prototype=Object.getPrototypeOf({});'
  ])(
    'K2 refuses public mutable aliases and dependent public contexts: %s',
    (source) => {
      const out = runSemanticBoundary(fixture(source))
      expect(out.status).toBe('UNKNOWN')
      expect(out.proofs).toHaveLength(0)
      expect(
        out.unknowns.some((x) => x.reason === 'UNKNOWN_EXPORTED_MUTABLE_STATE')
      ).toBe(true)
    }
  )
  it('still proves a public function using a private non-escaping allocation', () => {
    expect(
      runSemanticBoundary(
        fixture('const state={x:()=>1}; export const f=()=>state.x();')
      ).status
    ).toBe('PROVEN')
  })
  it.each(['module.exports={answer:42};', 'module.exports={x:42};'])(
    'retains original mutable CJS-export controls as K2 refusals: %s',
    (body) => {
      const input = fixture(
        'const data=require("./dep.cjs"); module.exports=data;',
        { 'package.json': '{"type":"commonjs"}', 'dep.cjs': body }
      )
      expect(runSemanticBoundary(input).status).toBe('UNKNOWN')
    }
  )
})

describe('R1 regressions for witnessed semantic omissions', () => {
  it('evaluates computed destructuring key effects and refuses the binding', () => {
    const input = fixture(
      'const run=(s)=>import(s); const {[run("./"+"pro"+"ducts/shift/index.js")]: value}={value:1}; export const answer=1;',
      { 'products/shift/index.js': 'export const value=1;' }
    )
    const result = runSemanticBoundary(input)
    expect(result.status).toBe('VIOLATION')
    expect(result.proofs).toEqual([])
    expect(
      result.violations.some((v) => v.target === 'products/shift/index.js')
    ).toBe(true)
    const neutral = runSemanticBoundary(
      fixture('const {["x"]: value}={x:1}; export const answer=1;')
    )
    expect(neutral.status).toBe('UNKNOWN')
    expect(
      neutral.unknowns.some((u) => u.reason === 'UNKNOWN_COMPUTED_BINDING')
    ).toBe(true)
  })
  it.each([
    'export default function(specifier){return import(specifier)}',
    'export default function named(specifier){return import(specifier)}'
  ])('analyzes the public default function body under K0: %s', (source) => {
    const result = runSemanticBoundary(fixture(source))
    expect(result.status).toBe('UNKNOWN')
    expect(result.proofs).toEqual([])
  })
  it.each([
    'export default function(){return 1}',
    'export default function named(){return 1}'
  ])(
    'resolves a legitimate pure default function through the actual default export: %s',
    (body) => {
      const result = runSemanticBoundary(
        fixture("import f from './dep.js'; export const answer=f();", {
          'dep.js': body
        })
      )
      expect(result.status).toBe('PROVEN')
      expect(result.validation.valid).toBe(true)
    }
  )
  it('keeps the runtime edge of inline type imports and distinguishes erased import type', () => {
    const input = fixture(
      'import {type T} from "./products/shift/index.ts"; export const answer=1;',
      {
        'products/shift/index.ts':
          'export type T=number; export const effect=1;'
      }
    )
    fs.renameSync(
      path.join(input.root, 'entry.js'),
      path.join(input.root, 'entry.ts')
    )
    input.starts = ['entry.ts']
    const result = runSemanticBoundary(input)
    expect(result.status).toBe('VIOLATION')
    expect(result.proofs).toEqual([])
    expect(
      runSemanticBoundary({ ...input, limits: { maxFiles: 1 } }).status
    ).toBe('VIOLATION')
    const erased = fixture(
      'import type {T} from "missing"; export const answer=1;'
    )
    fs.renameSync(
      path.join(erased.root, 'entry.js'),
      path.join(erased.root, 'entry.ts')
    )
    erased.starts = ['entry.ts']
    expect(runSemanticBoundary(erased).status).toBe('PROVEN')
    const neutral = fixture(
      'import {type T} from "./neutral.js"; export const answer=1;',
      { 'neutral.js': 'export const value=1;' }
    )
    fs.renameSync(
      path.join(neutral.root, 'entry.js'),
      path.join(neutral.root, 'entry.ts')
    )
    neutral.starts = ['entry.ts']
    const closed = runSemanticBoundary(neutral)
    expect(closed.status).toBe('PROVEN')
    expect(closed.inputs.some((x) => x.file === 'neutral.js')).toBe(true)
  })
  it.each([
    'export const value: number=1;',
    'const value=1; const value=2; export const answer=value;'
  ])(
    'does not prove a permissive TS AST rejected by the real pinned Node grammar: %s',
    (source) => {
      const input = fixture(source)
      const syntax = spawnSync(
        pinnedNode,
        ['--check', path.join(input.root, 'entry.js')],
        {
          encoding: 'utf8',
          env: { PATH: path.dirname(pinnedNode) + ':/usr/bin:/bin' }
        }
      )
      expect(syntax.status).toBe(1)
      const result = runSemanticBoundary(input)
      expect(result.status).toBe('UNKNOWN')
      expect(result.proofs).toEqual([])
      expect(
        result.unknowns.some((u) => u.reason === 'UNKNOWN_RUNTIME_SYNTAX')
      ).toBe(true)
    }
  )
})

function ownProcess(pid) {
  try {
    const text = fs.readFileSync('/proc/' + pid + '/stat', 'utf8')
    const born = text.slice(text.lastIndexOf(')') + 2).split(' ')[19]
    const children = new Set()
    for (const task of fs.readdirSync('/proc/' + pid + '/task')) {
      try {
        for (const child of fs
          .readFileSync('/proc/' + pid + '/task/' + task + '/children', 'utf8')
          .trim()
          .split(/\s+/)
          .filter(Boolean))
          children.add(Number(child))
      } catch {}
    }
    return {
      pid,
      born,
      children: [...children],
      cmdline: fs
        .readFileSync('/proc/' + pid + '/cmdline', 'utf8')
        .replaceAll('\0', ' ')
    }
  } catch {
    return null
  }
}
async function supervisedObservation(input, { stopWorker = false } = {}) {
  const code =
    'const fs=require("node:fs");const engine=require(process.argv[1]);process.stdout.write(JSON.stringify(engine.runSemanticBoundary(JSON.parse(fs.readFileSync(0,"utf8")))));'
  const caller = spawn(pinnedNode, ['-e', code, enginePath], {
    cwd: path.dirname(enginePath),
    env: {
      PATH: path.dirname(pinnedNode) + ':/usr/bin:/bin',
      LANG: 'C',
      TZ: 'UTC'
    }
  })
  let stdout = '',
    stderr = '',
    closed = false,
    exitCode = null,
    maxDepth = 0,
    stopped = null
  caller.stdout.setEncoding('utf8')
  caller.stderr.setEncoding('utf8')
  caller.stdout.on('data', (x) => (stdout += x))
  caller.stderr.on('data', (x) => (stderr += x))
  caller.on('close', (code) => {
    closed = true
    exitCode = code
  })
  caller.stdin.end(JSON.stringify(input))
  const owned = new Map(),
    start = Date.now()
  try {
    while (!closed) {
      const pending = [{ pid: caller.pid, depth: 0 }]
      while (pending.length) {
        const { pid, depth } = pending.shift(),
          record = ownProcess(pid)
        if (!record) continue
        if (depth > 0) {
          owned.set(pid, record)
          maxDepth = Math.max(maxDepth, depth)
        }
        if (
          stopWorker &&
          !stopped &&
          depth === 1 &&
          record.cmdline.includes(enginePath) &&
          record.cmdline.includes('--semantic-worker')
        ) {
          const current = ownProcess(pid)
          if (current?.born === record.born) {
            process.kill(pid, 'SIGSTOP')
            stopped = { pid, born: record.born }
          }
        }
        for (const child of record.children)
          pending.push({ pid: child, depth: depth + 1 })
      }
      if (Date.now() - start > 9000)
        throw Error('own parser observation deadline exceeded')
      await new Promise((resolve) => setTimeout(resolve, 3))
    }
    expect(exitCode, stderr).toBe(0)
    return {
      result: JSON.parse(stdout),
      maxDepth,
      stopped,
      elapsedMs: Date.now() - start,
      remaining: [...owned.values()]
        .filter((x) => ownProcess(x.pid)?.born === x.born)
        .map((x) => ({ pid: x.pid, born: x.born }))
    }
  } finally {
    for (const record of [...owned.values()].reverse())
      if (ownProcess(record.pid)?.born === record.born) {
        try {
          process.kill(record.pid, 'SIGKILL')
        } catch {}
      }
    if (!closed) caller.kill('SIGKILL')
  }
}
describe('Recovery controls for lifecycle and native grammar', () => {
  it('owns parsing inside its one supervised worker without grammar grandchildren', async () => {
    const observed = await supervisedObservation(
      fixture('export const answer=42;')
    )
    expect(observed.result.status).toBe('PROVEN')
    expect(observed.maxDepth).toBe(1)
    expect(observed.remaining).toEqual([])
    expect(observed.result.proofs[0].derivation.profile.grammarValidator).toBe(
      'pinned-node-native-vm-parse-only'
    )
  })
  it('kills and reaps an exactly identified stalled parser worker by the overall deadline', async () => {
    const observed = await supervisedObservation(
      { ...fixture('export const answer=42;'), limits: { timeoutMs: 1200 } },
      { stopWorker: true }
    )
    expect(observed.stopped).not.toBeNull()
    expect(observed.result.status).toBe('UNKNOWN')
    expect(observed.result.proofs).toEqual([])
    expect(observed.remaining).toEqual([])
    expect(observed.elapsedMs).toBeLessThan(2500)
  })
  it('keeps the internal VM grammar launch flag private to the worker', () => {
    const observed = cleanCall('runSemanticBoundary', [fixture()], {
      flags: ['--experimental-vm-modules']
    })
    expect(observed.status).toBe('UNKNOWN')
    expect(observed.proofs).toEqual([])
    expect(
      observed.unknowns.some((x) => x.reason === 'UNKNOWN_RUNTIME_PROFILE')
    ).toBe(true)
  })
})
