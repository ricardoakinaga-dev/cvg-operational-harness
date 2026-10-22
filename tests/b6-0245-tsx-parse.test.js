// SPEC0245 — TSX in the B6 kernel: the parser ScriptKind follows the file
// extension (.tsx -> TSX, .jsx -> JSX, .[cm]ts -> TS, otherwise JS) and every
// evaluated JSX form is refused by the existing expression fallback, without
// evaluating tag, attributes or children. `.tsx` stays a non-runtime format
// (UNKNOWN_FORMAT). Physical fixtures, analysed by a clean pinned Node22 caller
// (the real API declines the Vitest profile), as in the 0236/0244 suites.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { pinnedToolchainLocation } from '../scripts/boundary-installed-identity.mjs'
import { ownedRunParent } from './support/owned-run-parent.mjs'

const parent = ownedRunParent('b6-0245-tsx')
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
function fixture(files, starts = ['entry.tsx']) {
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
// SPEC0245 §3.3.4: the refusal census is observed on its own in fixtures.
const census = (files, starts) =>
  cleanCall('analyzeSemanticBoundary', [
    fixture(files, starts),
    { refusalCensus: true }
  ])
const tuples = (out) => out.unknowns.map((u) => [u.file, u.reason, u.detail])
const has = (out, file, reason, detail = '') =>
  out.unknowns.some(
    (u) => u.file === file && u.reason === reason && u.detail === detail
  )
const inFile = (out, file) => out.unknowns.some((u) => u.file === file)
const P = { 'products/p.js': 'export const p = 1;\n' }
const VALID =
  'import { x } from \'./a.js\';\nexport const el = <div title="t">{x}</div>;\nexport const n: number = 2;\n'

describe('SPEC0245 MT01/MT02 — .tsx is parsed as TSX', () => {
  it('a valid .tsx has no UNKNOWN_PARSE and no tuple from a recovered AST', () => {
    const out = run({ 'entry.tsx': VALID, 'a.js': 'export const x = 1;' })
    expect(
      has(out, 'entry.tsx', 'UNKNOWN_PARSE'),
      JSON.stringify(tuples(out))
    ).toBe(false)
    expect(has(out, 'entry.tsx', 'UNKNOWN_BINDING', 'title')).toBe(false)
    expect(
      has(
        out,
        'entry.tsx',
        'UNKNOWN_UNSUPPORTED_SYNTAX',
        'RegularExpressionLiteral'
      )
    ).toBe(false)
  })
  it('an evaluated JSX form is refused with its SyntaxKind and .tsx keeps UNKNOWN_FORMAT', () => {
    const out = run({
      'entry.tsx':
        'export const a = <div>{1}</div>;\nexport const b = <br />;\nexport const c = <>x</>;\n'
    })
    expect(out.status).toBe('UNKNOWN')
    expect(out.proofs).toEqual([])
    for (const kind of ['JsxElement', 'JsxSelfClosingElement', 'JsxFragment'])
      expect(
        has(out, 'entry.tsx', 'UNKNOWN_UNSUPPORTED_SYNTAX', kind),
        kind
      ).toBe(true)
    expect(has(out, 'entry.tsx', 'UNKNOWN_FORMAT')).toBe(true)
    expect(has(out, 'entry.tsx', 'UNKNOWN_PARSE')).toBe(false)
  })
  it.each([
    [
      'F1: known call into products/',
      "import { load } from './m.js';\nexport const el = <div>{load('./products/p.js')}</div>;\n",
      'm.js'
    ],
    [
      'F10b: imported object read',
      "import { o } from './o.js';\nexport const el = <div>{import(o.p)}</div>;\n",
      'o.js'
    ]
  ])(
    'JSX content is never evaluated, the cost of A stays UNKNOWN (%s)',
    (_, entry, dep) => {
      const out = run({
        'entry.tsx': entry,
        'm.js': 'export function load(s) { return import(s) }\n',
        'o.js': "export const o = { p: './products/p.js' };\n",
        ...P
      })
      expect(out.status, JSON.stringify(tuples(out))).toBe('UNKNOWN')
      expect(out.violations).toEqual([])
      expect(out.phases.body).toBe('COMPLETED')
      expect(
        has(out, 'entry.tsx', 'UNKNOWN_UNSUPPORTED_SYNTAX', 'JsxElement')
      ).toBe(true)
      expect(inFile(out, dep)).toBe(true)
    }
  )
  it('a real syntax error and a TS-only `<T>x` assertion still give UNKNOWN_PARSE (F7)', () => {
    for (const source of [
      'export const el = <div>;\n',
      'export const v = <number>(1 as any);\n'
    ]) {
      const out = run({ 'entry.tsx': source })
      expect(has(out, 'entry.tsx', 'UNKNOWN_PARSE'), source).toBe(true)
      expect(out.status).toBe('UNKNOWN')
    }
  })
  it.each([
    [
      'JSX text (F13)',
      "export const el = <p>call import('./products/p.js') here</p>;\n"
    ],
    [
      'attribute string',
      'export const el = <p title="import(\'./products/p.js\')" />;\n'
    ],
    [
      'comment',
      "export const el = <p>{/* import('./products/p.js') */}</p>;\n"
    ],
    [
      'generic arrow read as JSX (F7 x F13)',
      "export const g = <T>(x: T) => import('./products/p.js');\n"
    ]
  ])(
    'a region that is not code is not a violation, in the pass and in the census (%s)',
    (_, entry) => {
      const files = { 'entry.tsx': entry, ...P }
      const out = run(files)
      expect(out.status).toBe('UNKNOWN')
      expect(out.violations).toEqual([])
      expect(out.phases.body).toBe('COMPLETED')
      expect(census(files).violations).toEqual([])
    }
  )
  it('a .jsx file keeps the JSX parse and an unknown extension parses as JS with UNKNOWN_FORMAT', () => {
    const jsx = run({ 'entry.jsx': 'export const el = <div>{1}</div>;\n' }, [
      'entry.jsx'
    ])
    expect(has(jsx, 'entry.jsx', 'UNKNOWN_PARSE')).toBe(false)
    expect(
      has(jsx, 'entry.jsx', 'UNKNOWN_UNSUPPORTED_SYNTAX', 'JsxElement')
    ).toBe(true)
    const mtsx = run({ 'entry.mtsx': 'export const el = <div>{1}</div>;\n' }, [
      'entry.mtsx'
    ])
    expect(has(mtsx, 'entry.mtsx', 'UNKNOWN_FORMAT')).toBe(true)
    expect(has(mtsx, 'entry.mtsx', 'UNKNOWN_PARSE')).toBe(false)
    expect(
      has(mtsx, 'entry.mtsx', 'UNKNOWN_UNSUPPORTED_SYNTAX', 'JsxElement')
    ).toBe(true)
  })
})

describe('SPEC0245 MT03 — acquisition visits the real JSX subtree', () => {
  it.each([
    [
      'attribute',
      "export const el = <div onClick={() => import('./products/p.js')} />;\n"
    ],
    ['child', "export const el = <div>{import('./products/p.js')}</div>;\n"]
  ])(
    'a finite import() into products/ inside a JSX %s is a VIOLATION, also in the census',
    (_, entry) => {
      const files = { 'entry.tsx': entry, ...P }
      expect(run(files).status).toBe('VIOLATION')
      expect(census(files).violations.length).toBeGreaterThan(0)
    }
  )
  it('a target acquired only through the TSX AST is analysed: its body violation is found (F9)', () => {
    const files = {
      'entry.tsx': "export const el = <div>{import('./dep.js')}</div>;\n",
      'dep.js':
        "const o = { p: './products/p.js' };\nexport const q = import(o.p);\n",
      ...P
    }
    const out = run(files)
    expect(out.status, JSON.stringify(tuples(out))).toBe('VIOLATION')
    expect(census(files).violations.length).toBeGreaterThan(0)
  })
  it('a finite require() into products/ inside JSX of a CommonJS .tsx is a VIOLATION', () => {
    const out = run({
      'package.json': '{}',
      'entry.tsx':
        "const el = <div>{require('./products/p.cjs')}</div>;\nmodule.exports = el;\n",
      'products/p.cjs': 'module.exports = 1;\n'
    })
    expect(out.status).toBe('VIOLATION')
  })
})

describe('SPEC0245 MT04 — the TS branch of the table is unchanged', () => {
  // TypeScript-only syntax that a TSX parse would reject (generic arrows and
  // `<T>x` assertions) in .ts, .mts and .cts. The expected tuples are the ones
  // the v5 kernel (6c9fc651) produced for this fixture (fixture-table evidence).
  const TS_ONLY =
    'export const k = 1;\nexport const id = <T,>(x: T): T => x;\nexport const gen = <T>(x: T) => x;\nexport const n = <number>(k as unknown);\nexport function f(x: number) { return x > k ? x : k }\n'
  it('.ts/.mts/.cts with TS-only syntax keep exactly the v5 tuples', () => {
    const out = run(
      {
        'entry.ts':
          "import { f } from './a.ts';\nimport { m } from './b.mts';\nexport const v = f(2) + m;\n",
        'a.ts': TS_ONLY,
        'b.mts':
          'export const m = 1;\nexport const g2 = <T,>(x: T): T => x;\nexport const c2 = <number>(m as unknown);\n',
        'c.cts':
          'const one = 1;\nconst g3 = <T,>(x: T): T => x;\nconst c3 = <number>(one as unknown);\nmodule.exports = { one, g3, c3 };\n'
      },
      ['entry.ts', 'c.cts']
    )
    expect(tuples(out).sort()).toEqual([
      ['a.ts', 'UNKNOWN_BINDING_VALUE', 'x'],
      ['a.ts', 'UNKNOWN_EXPORT', ''],
      ['a.ts', 'UNKNOWN_OPERATOR', ''],
      ['b.mts', 'UNKNOWN_BINDING_VALUE', 'x'],
      ['b.mts', 'UNKNOWN_EXPORT', ''],
      ['c.cts', 'UNKNOWN_EXPORTED_MUTABLE_STATE', '']
    ])
  })
  it('a .ts module has the same tuples whether a .tsx or a .ts imports it', () => {
    const a =
      'export const k = 1;\nexport function f(x: number) { return x > k ? x : k }\n'
    const fromTsx = run({
      'entry.tsx':
        "import { f } from './a.ts';\nexport const el = <div>{f(2)}</div>;\n",
      'a.ts': a
    })
    const fromTs = run(
      {
        'entry.ts': "import { f } from './a.ts';\nexport const v = f(2);\n",
        'a.ts': a
      },
      ['entry.ts']
    )
    const only = (out) =>
      tuples(out)
        .filter((t) => t[0] === 'a.ts')
        .sort()
    expect(only(fromTsx)).toEqual(only(fromTs))
  })
})

describe('SPEC0245 MT06 — version and refusal census', () => {
  it('publishes the new kernel version', () => {
    expect(cleanCall('SEMANTIC_KERNEL_VERSION', [])).toBe(KERNEL)
  })
  it('the refusal census uses the same TSX parse', () => {
    const out = census({ 'entry.tsx': VALID, 'a.js': 'export const x = 1;' })
    expect(has(out, 'entry.tsx', 'UNKNOWN_PARSE')).toBe(false)
  })
})
