// SPEC0244 — ESM module shape in the B6 kernel: E1 (`export *` and
// `export * as ns` with ECMAScript semantics from a qualified source) and E2
// (a refused class keeps its root, its name exists as U and is exported as U).
// Physical fixtures, analysed by a clean pinned Node22 caller (the real API
// declines the Vitest profile), as in the 0236 suite. Targets never execute.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { pinnedToolchainLocation } from '../scripts/boundary-installed-identity.mjs'
import { ownedRunParent } from './support/owned-run-parent.mjs'

const parent = ownedRunParent('b6-0244-esm')
const pinnedNode = pinnedToolchainLocation().node
const enginePath = path.resolve('scripts/boundary-semantic-engine.mjs')
const KERNEL = 'semantic-kernel-v8-annexb-block-function'

function cleanCall(method, args) {
  const code =
    'const fs=require("node:fs"); const engine=require(process.argv[1]); const request=JSON.parse(fs.readFileSync(0,"utf8")); process.stdout.write(JSON.stringify(request.method==="SEMANTIC_KERNEL_VERSION"?engine.SEMANTIC_KERNEL_VERSION:engine[request.method](...request.args)));'
  const out = spawnSync(pinnedNode, ['-e', code, enginePath], {
    input: JSON.stringify({ method, args }),
    encoding: 'utf8',
    timeout: 60000,
    env: {
      PATH: path.dirname(pinnedNode) + ':/usr/bin:/bin',
      LANG: 'C',
      TZ: 'UTC'
    }
  })
  if (out.status !== 0)
    throw Error('clean caller failed: ' + (out.stderr || out.error?.message))
  return JSON.parse(out.stdout)
}
function fixture(files, starts = ['entry.js']) {
  const root = fs.mkdtempSync(path.join(parent, 'physical-'))
  for (const [file, body] of Object.entries({
    'package.json': '{"type":"module"}',
    ...files
  })) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    fs.writeFileSync(path.join(root, file), body)
  }
  return {
    root,
    starts,
    origins: [],
    installed: [],
    compiled: { status: 'UNAVAILABLE', files: [] }
  }
}
const run = (files, starts) =>
  cleanCall('runSemanticBoundary', [fixture(files, starts)])
const tuples = (out) => out.unknowns.map((u) => [u.file, u.reason, u.detail])
const has = (out, file, reason, detail = '') =>
  out.unknowns.some(
    (u) => u.file === file && u.reason === reason && u.detail === detail
  )
const inherited = (out, name) =>
  out.unknowns.some(
    (u) => u.reason === 'UNKNOWN_INHERITED_PROPERTY' && u.detail === name
  )
// Value oracle: `pick[x]` is 1 only when x is the known primitive 2; any other
// known value misses the own property, and U is refused at the read.
const ORACLE = (name, from) =>
  `import {${name}} from '${from}'; const pick = {2: 1}; export const y = pick[${name}];`
function proven(files) {
  const out = run(files)
  expect(out.status, JSON.stringify(tuples(out))).toBe('PROVEN')
  expect(out.validation.valid).toBe(true)
  expect(out.kernelVersion).toBe(KERNEL)
  return out
}
function refused(files) {
  const out = run(files)
  expect(out.status, JSON.stringify(tuples(out))).toBe('UNKNOWN')
  expect(out.proofs).toEqual([])
  return out
}

describe('SPEC0244 MS01 — first failures of the v4 kernel', () => {
  it('a name re-exported by `export *` reaches the importer without UNKNOWN_INHERITED_PROPERTY', () => {
    const out = run({
      'entry.js': ORACLE('x', './barrel.js'),
      'barrel.js': "export * from './a.js';",
      'a.js': 'export const x = 2;'
    })
    expect(inherited(out, 'x'), JSON.stringify(tuples(out))).toBe(false)
    expect(has(out, 'barrel.js', 'UNKNOWN_REEXPORT')).toBe(false)
  })
  it('an exported refused class reaches the importer without UNKNOWN_INHERITED_PROPERTY', () => {
    const out = run({
      'entry.js': "import {C} from './c.js'; export const k = C;",
      'c.js': 'export class C {}'
    })
    expect(inherited(out, 'C'), JSON.stringify(tuples(out))).toBe(false)
    expect(
      has(out, 'c.js', 'UNKNOWN_UNSUPPORTED_SYNTAX', 'ClassDeclaration')
    ).toBe(true)
  })
})

describe('SPEC0244 MS02 — E1 star re-export', () => {
  it('simple star from a qualified source carries the value and the K5 edge', () => {
    const out = proven({
      'entry.js': ORACLE('x', './barrel.js'),
      'barrel.js': "export * from './a.js';",
      'a.js': 'export const x = 2;'
    })
    const id = (file) =>
      out.proofs.find((p) => p.rule === 'K5' && p.file === file).id
    expect(out.proofs.find((p) => p.file === 'barrel.js').dependencies).toEqual(
      [id('a.js')]
    )
    expect(out.proofs.find((p) => p.file === 'entry.js').dependencies).toEqual([
      id('barrel.js')
    ])
  })
  it('`export * as ns` exports the namespace of a qualified source', () => {
    proven({
      'entry.js':
        "import {ns} from './barrel.js'; const pick = {2: 1}; export const y = pick[ns.x];",
      'barrel.js': "export * as ns from './a.js';",
      'a.js': 'export const x = 2;'
    })
  })
  it('`export * as ns` of a non-qualified source is U and keeps the refusal', () => {
    const out = refused({
      'entry.js': "import {ns} from './barrel.js'; export const y = ns;",
      'barrel.js': "export * as ns from './c.cjs';",
      'c.cjs': 'module.exports = {x: 2};'
    })
    expect(has(out, 'barrel.js', 'UNKNOWN_REEXPORT')).toBe(true)
    expect(inherited(out, 'ns')).toBe(false)
    expect(has(out, 'entry.js', 'UNKNOWN_BINDING_VALUE', 'ns')).toBe(true)
  })
  // Rule 3 must decide, not statement order: "before" cases put the explicit
  // export first; "after" cases put it behind two conflicting stars, which
  // without rule 3 would leave an AMBIGUOUS_STAR root (BUILD critic R1-02).
  it.each([
    ['local before the star', "export const x = 2; export * from './a.js';"],
    [
      'indirect before the star',
      "export { x } from './b.js'; export * from './a.js';"
    ],
    [
      'local after two conflicting stars',
      "export * from './a.js'; export * from './c.js'; export const x = 2;"
    ],
    [
      'indirect after two conflicting stars',
      "export * from './a.js'; export * from './c.js'; export { x } from './b.js';"
    ],
    [
      'import then export after two conflicting stars',
      "import { x } from './b.js'; export * from './a.js'; export * from './c.js'; export { x };"
    ]
  ])('an explicit runtime export prevails over the star (%s)', (_, barrel) => {
    const out = proven({
      'entry.js': ORACLE('x', './barrel.js'),
      'barrel.js': barrel,
      'a.js': 'export const x = 1;',
      'b.js': 'export const x = 2;',
      'c.js': 'export const x = 3;'
    })
    expect(out.unknowns).toEqual([])
  })
  it.each([
    ['before the star', "export * as x from './b.js'; export * from './a.js';"],
    [
      'after two conflicting stars',
      "export * from './a.js'; export * from './c.js'; export * as x from './b.js';"
    ]
  ])('`export * as N` prevails over a star name N (%s)', (_, barrel) => {
    proven({
      'entry.js':
        "import {x} from './barrel.js'; const pick = {2: 1}; export const y = pick[x.x];",
      'barrel.js': barrel,
      'a.js': 'export const x = 1;',
      'b.js': 'export const x = 2;',
      'c.js': 'export const x = 3;'
    })
  })
  it('a type-only export never masks a star name', () => {
    proven({
      'entry.js': ORACLE('x', './barrel.ts'),
      'barrel.ts':
        "export type x = number; export interface I {} export * from './a.js';",
      'a.js': 'export const x = 2;'
    })
  })
  it('`default` is never re-exported by a star', () => {
    const out = refused({
      'entry.js': "import d from './barrel.js'; export const y = d;",
      'barrel.js': "export * from './a.js';",
      'a.js': 'export default 2; export const x = 2;'
    })
    expect(inherited(out, 'default')).toBe(true)
    expect(has(out, 'barrel.js', 'UNKNOWN_REEXPORT')).toBe(false)
  })
  it('the same resolved binding through several stars is not ambiguous', () => {
    proven({
      'entry.js': ORACLE('x', './barrel.js'),
      'barrel.js':
        "export * from './a.js'; export * from './b.js'; export * from './b2.js'; export * from './b3.js';",
      'a.js': 'export const x = 2;',
      'b.js': "export { x } from './a.js';",
      'b2.js': "import { x } from './a.js'; export { x };",
      'b3.js': "export * from './a.js';"
    })
  })
  it('different resolved bindings make the name ambiguous: U with AMBIGUOUS_STAR, sticky', () => {
    for (const barrel of [
      "export * from './a.js'; export * from './c.js';",
      "export * from './a.js'; export * from './c.js'; export * from './b.js';",
      "export * from './c.js'; export * from './a.js'; export * from './b.js';"
    ]) {
      const out = refused({
        'entry.js': ORACLE('x', './barrel.js'),
        'barrel.js': barrel,
        'a.js': 'export const x = 2;',
        'b.js': "export { x } from './a.js';",
        'c.js': 'export const x = 2;'
      })
      expect(
        has(out, 'barrel.js', 'UNKNOWN_REEXPORT', 'AMBIGUOUS_STAR:x')
      ).toBe(true)
      expect(has(out, 'entry.js', 'UNKNOWN_BINDING_VALUE', 'x')).toBe(true)
      expect(inherited(out, 'x')).toBe(false)
    }
  })
  it('a name ambiguous in a source is ambiguous in every star re-exporter (diamond)', () => {
    for (const outer of [
      "export * from './inner.js';",
      "export * from './inner.js'; export * from './a.js';",
      "export * from './a.js'; export * from './inner.js';"
    ]) {
      const out = refused({
        'entry.js': ORACLE('x', './outer.js'),
        'outer.js': outer,
        'inner.js': "export * from './a.js'; export * from './c.js';",
        'a.js': 'export const x = 2;',
        'c.js': 'export const x = 2;'
      })
      expect(has(out, 'inner.js', 'UNKNOWN_REEXPORT', 'AMBIGUOUS_STAR:x')).toBe(
        true
      )
      expect(has(out, 'outer.js', 'UNKNOWN_REEXPORT', 'AMBIGUOUS_STAR:x')).toBe(
        true
      )
      expect(has(out, 'entry.js', 'UNKNOWN_BINDING_VALUE', 'x')).toBe(true)
    }
  })
  // A re-exported namespace is a binding of the re-exporting module, as in the
  // pinned Node 22 (`'ns' in r` is false, `import { ns }` is a link error):
  // two such stars conflict (BUILD critic R1-01). The same binding reached by
  // two paths still does not.
  it.each([
    [
      'import * as ns + export { ns } and export * as ns',
      "import * as ns from './m.js'; export { ns };",
      "export * as ns from './m.js';"
    ],
    [
      'two import * as ns + export { ns }',
      "import * as ns from './m.js'; export { ns };",
      "import * as ns from './m.js'; export { ns };"
    ],
    [
      'two export * as ns (conservative: Node 22 conflicts)',
      "export * as ns from './m.js';",
      "export * as ns from './m.js';"
    ]
  ])(
    're-exported namespaces of different modules are ambiguous (%s)',
    (_, a, b) => {
      const out = refused({
        'entry.js':
          "import * as r from './r.js'; const pick = {2: 1}; export const y = pick[r.ns.x];",
        'r.js': "export * from './a.js'; export * from './b.js';",
        'a.js': a,
        'b.js': b,
        'm.js': 'export const x = 2;'
      })
      expect(has(out, 'r.js', 'UNKNOWN_REEXPORT', 'AMBIGUOUS_STAR:ns')).toBe(
        true
      )
    }
  )
  it.each([
    [
      'a local const exported under another name',
      "const ns = 1; export { ns as other }; export * as ns from './m.js';",
      "import * as r from './r.js'; const pick = {1: 7}; export const y = pick[r.ns];"
    ],
    [
      'a namespace import exported under another name',
      "import * as ns from './m.js'; export { ns as other }; export * as ns from './m2.js';",
      "import * as r from './r.js'; const pick = {1: 7}; export const y = pick[r.ns.x];"
    ]
  ])(
    '`export * as ns` never shares the identity of a local binding ns (%s)',
    (_, a, entry) => {
      const out = refused({
        'entry.js': entry,
        'r.js': "export * from './a.js'; export * from './b.js';",
        'a.js': a,
        'b.js': "export { other as ns } from './a.js';",
        'm.js': 'export const x = 1;',
        'm2.js': 'export const x = 2;'
      })
      expect(has(out, 'r.js', 'UNKNOWN_REEXPORT', 'AMBIGUOUS_STAR:ns')).toBe(
        true
      )
    }
  )
  it('the same re-exported namespace binding by several paths is not ambiguous', () => {
    proven({
      'entry.js':
        "import * as r from './r.js'; const pick = {2: 1}; export const y = pick[r.ns.x];",
      'r.js':
        "export * from './a.js'; export * from './b.js'; export * from './c.js';",
      'a.js': "export * as ns from './m.js';",
      'b.js': "export { ns } from './a.js';",
      'c.js': "import { ns } from './a.js'; export { ns };",
      'm.js': 'export const x = 2;'
    })
  })
  it.each([
    ['a non-qualified star', "export * from './c.cjs'; export const x = 2;"],
    ['a refused export form', 'export const {x} = {x: 2};'],
    [
      'a refused exported declaration',
      'export enum E { A } export const x = 2;'
    ]
  ])(
    'a source left incomplete by %s does not qualify, transitively',
    (_, inner) => {
      const out = refused({
        'entry.js': ORACLE('x', './mid.js'),
        'mid.js': "export * from './inner.ts';",
        'inner.ts': inner,
        'c.cjs': 'module.exports = {x: 2};'
      })
      expect(has(out, 'mid.js', 'UNKNOWN_REEXPORT')).toBe(true)
    }
  )
  it.each([
    ['qualified first', "export * from './a.js'; export * from './c.cjs';"],
    ['non-qualified first', "export * from './c.cjs'; export * from './a.js';"]
  ])(
    'a module with any non-qualified star makes every star name U (%s)',
    (_, barrel) => {
      const out = refused({
        'entry.js': ORACLE('x', './barrel.js'),
        'barrel.js': barrel,
        'a.js': 'export const x = 2;',
        'c.cjs': 'module.exports = {x: 2};'
      })
      expect(has(out, 'barrel.js', 'UNKNOWN_REEXPORT')).toBe(true)
      expect(has(out, 'entry.js', 'UNKNOWN_BINDING_VALUE', 'x')).toBe(true)
      expect(inherited(out, 'x')).toBe(false)
    }
  )
  it('a U value of the source stays U through the star', () => {
    const out = refused({
      'entry.js': "import {x} from './barrel.js'; export const y = x;",
      'barrel.js': "export * from './a.js';",
      'a.js': 'export const x = nope;'
    })
    expect(has(out, 'a.js', 'UNKNOWN_BINDING', 'nope')).toBe(true)
    expect(has(out, 'entry.js', 'UNKNOWN_BINDING_VALUE', 'x')).toBe(true)
    expect(inherited(out, 'x')).toBe(false)
  })
  it('a mutable binding of the source keeps its root in the closure (snapshot never proves)', () => {
    const out = refused({
      'entry.js': ORACLE('x', './barrel.js'),
      'barrel.js': "export * from './a.js';",
      'a.js': 'export let x = 2;'
    })
    expect(has(out, 'a.js', 'UNKNOWN_MUTABLE_BINDING')).toBe(true)
  })
  it.each([
    [
      'CommonJS source',
      { 'c.cjs': 'module.exports = {x: 2};' },
      "export * from './c.cjs';",
      'UNKNOWN_MODULE_INTEROP'
    ],
    [
      'contained edge',
      {},
      "export * from './missing.js';",
      'UNKNOWN_ACQUISITION_ENOENT'
    ],
    [
      'cycle',
      { 'a.js': "export * from './barrel.js'; export const x = 2;" },
      "export * from './a.js';",
      'UNKNOWN_CYCLE'
    ]
  ])('keeps the current refusal for a %s', (_, files, barrel, reason) => {
    const out = refused({
      'entry.js': ORACLE('x', './barrel.js'),
      'barrel.js': barrel,
      ...files
    })
    expect(
      out.unknowns.some((u) => u.reason === reason),
      JSON.stringify(tuples(out))
    ).toBe(true)
    expect(
      out.unknowns.some(
        (u) => u.reason === 'UNKNOWN_REEXPORT' && u.detail === ''
      )
    ).toBe(true)
  })
})

describe('SPEC0244 MS03 — E2 refused class', () => {
  it('a named class keeps its root and nothing else', () => {
    const out = refused({ 'entry.js': 'class C {} export const k = 1;' })
    expect(tuples(out)).toEqual([
      ['entry.js', 'UNKNOWN_UNSUPPORTED_SYNTAX', 'ClassDeclaration']
    ])
  })
  it.each([
    [
      'named export',
      'export class C {}',
      "import {C} from './c.js'; export const k = C;",
      'C'
    ],
    [
      'default named',
      'export default class C {}',
      "import D from './c.js'; export const k = D;",
      'D'
    ],
    [
      'default anonymous',
      'export default class {}',
      "import D from './c.js'; export const k = D;",
      'D'
    ]
  ])('an exported class is exported as U (%s)', (_, source, entry, local) => {
    const out = refused({ 'entry.js': entry, 'c.js': source })
    expect(
      has(out, 'c.js', 'UNKNOWN_UNSUPPORTED_SYNTAX', 'ClassDeclaration')
    ).toBe(true)
    expect(has(out, 'c.js', 'UNKNOWN_EXPORT')).toBe(true)
    expect(has(out, 'entry.js', 'UNKNOWN_BINDING_VALUE', local)).toBe(true)
    expect(
      out.unknowns.some((u) => u.reason === 'UNKNOWN_INHERITED_PROPERTY')
    ).toBe(false)
  })
  it('a reference before the declaration reads U, never a global (TDZ)', () => {
    const out = refused({
      'entry.js':
        'const before = C; const o = Object; class C {} class Object {} export const k = 1;'
    })
    expect(has(out, 'entry.js', 'UNKNOWN_BINDING_VALUE', 'C')).toBe(true)
    expect(has(out, 'entry.js', 'UNKNOWN_BINDING_VALUE', 'Object')).toBe(true)
    expect(has(out, 'entry.js', 'UNKNOWN_BINDING', 'C')).toBe(false)
  })
  it('`declare class` and `export declare class` are runtime declarations, exported as U', () => {
    const out = refused({
      'entry.js': "import {D} from './c.ts'; export const k = D;",
      'c.ts': 'declare class C {} export declare class D {}'
    })
    expect(has(out, 'c.ts', 'UNKNOWN_RUNTIME_DECLARATION')).toBe(true)
    expect(
      has(out, 'c.ts', 'UNKNOWN_UNSUPPORTED_SYNTAX', 'ClassDeclaration')
    ).toBe(true)
    expect(inherited(out, 'D')).toBe(false)
    expect(has(out, 'entry.js', 'UNKNOWN_BINDING_VALUE', 'D')).toBe(true)
  })
  it('`new` and calls of the class stay refused at the use', () => {
    const out = refused({
      'entry.js': 'class C {} export const i = new C(); export const j = C();'
    })
    expect(
      has(out, 'entry.js', 'UNKNOWN_UNSUPPORTED_SYNTAX', 'NewExpression')
    ).toBe(true)
    expect(has(out, 'entry.js', 'UNKNOWN_CALL')).toBe(true)
  })
})

describe('SPEC0244 MS04 — proofs', () => {
  it('a static star into products/ is still a violation', () => {
    const out = run({
      'entry.js': "export * from './products/p.js';",
      'products/p.js': 'export const x = 2;'
    })
    expect(out.status).toBe('VIOLATION')
    expect(out.proofs).toEqual([])
  })
  it('a value known through a star that reaches products/ is a violation', () => {
    const out = run({
      'entry.js':
        "import { spec } from './barrel.js'; export const z = import(spec);",
      'barrel.js': "export * from './a.js';",
      'a.js': "export const spec = './products/p.js';",
      'products/p.js': 'export const x = 2;'
    })
    expect(out.status).toBe('VIOLATION')
    expect(out.proofs).toEqual([])
  })
  it('a clean fixture with a qualified star becomes PROVEN, with the K5 dependency of the source', () => {
    const input = fixture({
      'entry.js': "export * from './a.js';",
      'a.js': 'export const answer = 42;'
    })
    const out = cleanCall('runSemanticBoundary', [input])
    expect(out.status, JSON.stringify(tuples(out))).toBe('PROVEN')
    const source = out.proofs.find((p) => p.rule === 'K5' && p.file === 'a.js')
    const star = out.proofs.find(
      (p) => p.rule === 'K5' && p.file === 'entry.js'
    )
    expect(star.dependencies).toEqual([source.id])
    expect(star.derivation.closure).toEqual(['a.js'])
    expect(out.validation.valid).toBe(true)
    expect(cleanCall('validateSemanticBoundary', [input, out]).valid).toBe(true)
  })
  it.each([
    [
      'non-qualified',
      { 'entry.js': "export * from './c.cjs';", 'c.cjs': 'module.exports = 2;' }
    ],
    [
      'ambiguous',
      {
        'entry.js': "export * from './a.js'; export * from './c.js';",
        'a.js': 'export const x = 2;',
        'c.js': 'export const x = 2;'
      }
    ],
    [
      'incomplete source',
      {
        'entry.js': "export * from './a.js';",
        'a.js': "export * from './c.cjs';",
        'c.cjs': 'module.exports = 2;'
      }
    ],
    ['module with a class', { 'entry.js': 'export class C {}' }],
    [
      'star of a module with a class',
      {
        'entry.js': "export * from './a.js';",
        'a.js': 'export class C {} export const x = 2;'
      }
    ]
  ])('stays UNKNOWN without proofs: %s', (_, files) => {
    refused(files)
  })
})

describe('SPEC0244 MS06 — version and refusal census', () => {
  it('publishes the new kernel version', () => {
    expect(cleanCall('SEMANTIC_KERNEL_VERSION', [])).toBe(KERNEL)
  })
  it('the refusal census keeps the v4 refusals (E1/E2 off in the census)', () => {
    const input = fixture({
      'entry.js':
        "import {x} from './barrel.js'; import {C} from './c.js'; export const y = [x, C];",
      'barrel.js': "export * from './a.js';",
      'a.js': 'export const x = 2;',
      'c.js': 'export class C {}'
    })
    const out = cleanCall('analyzeSemanticBoundary', [
      input,
      { refusalCensus: true }
    ])
    expect(has(out, 'barrel.js', 'UNKNOWN_REEXPORT')).toBe(true)
    expect(has(out, 'entry.js', 'UNKNOWN_INHERITED_PROPERTY', 'x')).toBe(true)
    expect(has(out, 'entry.js', 'UNKNOWN_INHERITED_PROPERTY', 'C')).toBe(true)
    expect(has(out, 'c.js', 'UNKNOWN_EXPORT')).toBe(false)
  })
})
