// SPEC0252 — block-level function declarations in sloppy code (Annex B.3.3,
// B.3.4 and the labelled declaration of B.3.2) in the B6 kernel, option b1:
// one UNKNOWN_ANNEXB_FUNCTION root per block-level FunctionDeclaration with a
// body in sloppy code of a `require` module, detail `name@line` (1-based line
// of getStart), before the body, in the normal pass and in the census. The
// rule only adds the tuple: no U for the importers, no rule, no usage, no
// limit. The catalog is the 43 fixtures of the recon (controls.json), C01–C15
// of the SPEC reviews r1/r2 and D01–D11 of the r3 review (build notes R3-O1 to
// R3-O3), plus X01–X14 of the code review r1 (computed names, nested block
// functions). Each fixture carries the Node 22.23.2 result (positive: the product
// loads, so the kernel can never prove), the base (kernel v7) status, tuples
// and violations, and the exact UNKNOWN_ANNEXB_FUNCTION details of vN (the b1
// reference of the recon; by hand for X, where the b1 reference shares the
// defect M1 of the review). The directive-prologue helper is tested in a table
// at the file and function-body levels through the analysis (§5.2). Physical
// fixtures, analysed by a clean pinned Node22 caller, as in the 0247 suite.
// Targets never execute.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { pinnedToolchainLocation } from '../scripts/boundary-installed-identity.mjs'
import { ownedRunParent } from './support/owned-run-parent.mjs'

const parent = ownedRunParent('b6-0252-annexb')
const pinnedNode = pinnedToolchainLocation().node
const enginePath = path.resolve('scripts/boundary-semantic-engine.mjs')
const KERNEL = 'semantic-kernel-v8-annexb-block-function'
const TIMEOUT = 60000
const ANNEXB = 'UNKNOWN_ANNEXB_FUNCTION'
// SPEC0242 limits, unchanged (§5.5).
const LIMITS = {
  maxFileBytes: 16777216,
  maxTotalBytes: 268435456,
  maxFiles: 12000,
  maxNodes: 2000000,
  maxUnionValues: 128,
  maxContexts: 256,
  maxCallDepth: 64,
  maxStates: 250000,
  timeoutMs: 300000
}
// AB01: the false PROVEN of the base among the SPEC positives.
const AB01 = [
  'P01-block',
  'P02-if-true',
  'P03-if-true-no-braces',
  'P04-if-undecided',
  'P05-top-call',
  'P12-nested-in-function',
  'P13-nested-wrapper-function',
  'P14-nested-wrapper-const',
  'P16b-special-undefined-indirect',
  'P17-late-use-strict',
  'P20-escaped-use-strict',
  'P21-nested-iffalse-shadows-const',
  'P22-nested-read-before-block',
  'P23-nested-iffalse-undefined-primitive',
  'P24-object-method-sloppy',
  'P25-nested-outer-param',
  'P26-else-no-braces',
  'P27-parenthesized-directive',
  'C01-own-strict-body',
  'C02-sibling-strict-function',
  'C03-sloppy-arrow',
  'C11-cts-sloppy',
  'C12-block-leading-use-strict',
  'C13-expression-before-directive',
  'C14-template-use-strict',
  'C15-late-use-strict-in-function'
]
// Build notes R3-O1 to R3-O3: the false PROVEN of the base among the D
// positives (D03b–D03d are positives the base already refuses).
const D_FALSE_PROVEN = [
  'D01-empty-before-directive-file',
  'D02-empty-before-directive-fn',
  'D03a-string-plus',
  'D03e-string-eq',
  'D03f-string-cond',
  'D04-ts-sloppy',
  'D05-escape-in-fn',
  'D06-parens-in-fn',
  'D07-class-sibling-uncalled',
  'D08-expr-before-directive-fn',
  'D09-template-in-fn'
]
// AB02: the SPEC positives (28 of the recon and C01–C03, C10, C11–C15).
const AB02_C = [
  'C01-own-strict-body',
  'C02-sibling-strict-function',
  'C03-sloppy-arrow',
  'C10-sloppy-getter',
  'C11-cts-sloppy',
  'C12-block-leading-use-strict',
  'C13-expression-before-directive',
  'C14-template-use-strict',
  'C15-late-use-strict-in-function'
]
// AB03: strict negatives keep PROVEN without the tuple.
const STRICT = [
  'N01-strict-file',
  'N02-strict-function',
  'N03-esm',
  'N13-arrow-use-strict',
  'N14-inherited-strict',
  'N15-second-directive',
  'C07-double-quoted-strict',
  'C09-strict-own-body-only-in-strict-file',
  'D10-asi-string-then-paren',
  'D11-directive-after-comment-and-hashbang'
]
// AB04: the declared cost of b1, exactly.
// Code review r1, M1: a block function in the computed name of an object
// literal method is outer (sloppy) code even when the method body is strict.
const X_FALSE_PROVEN = [
  'X06-computed-key-call',
  'X07-computed-key-call-fnexpr',
  'X08-plain-arrow-control',
  'X10-computed-key-nested-fn',
  'X13-nested-block-functions',
  'X14-nested-in-strict-block-function'
]
const SPEC_SETS = new Set(['recon', 'C', 'D'])
const COST = [
  'N05-no-conflict',
  'N06-if-false',
  'N07-param-same-name',
  'N08-const-blocks',
  'N09-const-intermediate-block'
]

function cleanCall(request) {
  const code =
    'const fs=require("node:fs"); const e=require(process.argv[1]); const r=JSON.parse(fs.readFileSync(0,"utf8")); if (r.version) process.stdout.write(JSON.stringify(e.SEMANTIC_KERNEL_VERSION)); else process.stdout.write(JSON.stringify(r.census ? e.analyzeSemanticBoundary(r.input,{refusalCensus:true}) : e.runSemanticBoundary(r.input)));'
  const out = spawnSync(pinnedNode, ['-e', code, enginePath], {
    input: JSON.stringify(request),
    encoding: 'utf8',
    timeout: TIMEOUT,
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
// As the recon probe: the fixture start, no origins, no installed packages and
// no compiled reference.
function physical(fx) {
  const root = fs.mkdtempSync(path.join(parent, 'physical-'))
  for (const [file, body] of Object.entries(fx.files)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    fs.writeFileSync(path.join(root, file), body)
  }
  return {
    root,
    starts: [fx.start],
    origins: [],
    installed: [],
    compiled: { status: 'UNAVAILABLE', files: [] }
  }
}
const results = new Map()
function result(fx) {
  if (!results.has(fx.id))
    results.set(fx.id, cleanCall({ input: physical(fx) }))
  return results.get(fx.id)
}
const census = (fx) => cleanCall({ input: physical(fx), census: true })
const byId = (id) => {
  const fx = FIXTURES.find((f) => f.id === id)
  if (!fx) throw Error('unknown fixture ' + id)
  return fx
}
const tuples = (out) => out.unknowns.map((u) => [u.reason, u.file, u.detail])
const violations = (out) =>
  out.violations.map((v) => [v.reason, v.file, v.target ?? null])
const keys = (list) => list.map((x) => JSON.stringify(x)).sort()
const annexb = (out) =>
  out.unknowns
    .filter((u) => u.reason === ANNEXB)
    .map((u) => u.file + ':' + u.detail)
    .sort()
const expectedAnnexb = (fx) => fx.annexb.map(([f, d]) => f + ':' + d).sort()
const expectedTuples = (fx) => [
  ...fx.base.unknowns,
  ...fx.annexb.map(([f, d]) => [ANNEXB, f, d])
]
function minus(a, b) {
  const rest = keys(b)
  return a.filter((x) => {
    const i = rest.indexOf(JSON.stringify(x))
    if (i < 0) return true
    rest.splice(i, 1)
    return false
  })
}

const FIXTURES = [
  {
    id: 'P01-block',
    set: 'recon',
    positive: true,
    start: 'entry.js',
    files: {
      'package.json': '{}',
      'entry.js':
        "const m = require('./m.js')\nm('./products/x.js')\nmodule.exports = 1\n",
      'm.js':
        'function f() { return 1 }\n{ function f(s) { return require(s) } }\nmodule.exports = f\n',
      'products/x.js': 'module.exports = 1\n'
    },
    base: {
      status: 'PROVEN',
      unknowns: [],
      violations: []
    },
    annexb: [['m.js', 'f@2']],
    status: 'UNKNOWN'
  },
  {
    id: 'P02-if-true',
    set: 'recon',
    positive: true,
    start: 'entry.js',
    files: {
      'package.json': '{}',
      'entry.js':
        "const m = require('./m.js')\nm('./products/x.js')\nmodule.exports = 1\n",
      'm.js':
        'function f() { return 1 }\nif (true) { function f(s) { return require(s) } }\nmodule.exports = f\n',
      'products/x.js': 'module.exports = 1\n'
    },
    base: {
      status: 'PROVEN',
      unknowns: [],
      violations: []
    },
    annexb: [['m.js', 'f@2']],
    status: 'UNKNOWN'
  },
  {
    id: 'P03-if-true-no-braces',
    set: 'recon',
    positive: true,
    start: 'entry.js',
    files: {
      'package.json': '{}',
      'entry.js':
        "const m = require('./m.js')\nm('./products/x.js')\nmodule.exports = 1\n",
      'm.js':
        'function f() { return 1 }\nif (true) function f(s) { return require(s) }\nmodule.exports = f\n',
      'products/x.js': 'module.exports = 1\n'
    },
    base: {
      status: 'PROVEN',
      unknowns: [],
      violations: []
    },
    annexb: [['m.js', 'f@2']],
    status: 'UNKNOWN'
  },
  {
    id: 'P04-if-undecided',
    set: 'recon',
    positive: true,
    start: 'entry.js',
    files: {
      'package.json': '{}',
      'entry.js':
        "const m = require('./m.js')\nm('./products/x.js')\nmodule.exports = 1\n",
      'm.js':
        'function f() { return 1 }\nif ({}) { function f(s) { return require(s) } }\nmodule.exports = f\n',
      'products/x.js': 'module.exports = 1\n'
    },
    base: {
      status: 'PROVEN',
      unknowns: [],
      violations: []
    },
    annexb: [['m.js', 'f@2']],
    status: 'UNKNOWN'
  },
  {
    id: 'P05-top-call',
    set: 'recon',
    positive: true,
    start: 'entry.js',
    files: {
      'package.json': '{}',
      'entry.js': "require('./m.js')\nmodule.exports = 1\n",
      'm.js':
        "function f() { return 1 }\n{ function f(s) { return require(s) } }\nf('./products/x.js')\nmodule.exports = 1\n",
      'products/x.js': 'module.exports = 1\n'
    },
    base: {
      status: 'PROVEN',
      unknowns: [],
      violations: []
    },
    annexb: [['m.js', 'f@2']],
    status: 'UNKNOWN'
  },
  {
    id: 'P06-switch-case',
    set: 'recon',
    positive: true,
    start: 'entry.js',
    files: {
      'package.json': '{}',
      'entry.js':
        "const m = require('./m.js')\nm('./products/x.js')\nmodule.exports = 1\n",
      'm.js':
        'function f() { return 1 }\nswitch (1) {\n  case 1:\n    function f(s) { return require(s) }\n}\nmodule.exports = f\n',
      'products/x.js': 'module.exports = 1\n'
    },
    base: {
      status: 'UNKNOWN',
      unknowns: [['UNKNOWN_UNSUPPORTED_SYNTAX', 'm.js', 'SwitchStatement']],
      violations: []
    },
    annexb: [['m.js', 'f@4']],
    status: 'UNKNOWN'
  },
  {
    id: 'P07-labelled-block',
    set: 'recon',
    positive: true,
    start: 'entry.js',
    files: {
      'package.json': '{}',
      'entry.js':
        "const m = require('./m.js')\nm('./products/x.js')\nmodule.exports = 1\n",
      'm.js':
        'function f() { return 1 }\nL: { function f(s) { return require(s) } }\nmodule.exports = f\n',
      'products/x.js': 'module.exports = 1\n'
    },
    base: {
      status: 'UNKNOWN',
      unknowns: [['UNKNOWN_UNSUPPORTED_SYNTAX', 'm.js', 'LabeledStatement']],
      violations: []
    },
    annexb: [['m.js', 'f@2']],
    status: 'UNKNOWN'
  },
  {
    id: 'P08-labelled-function',
    set: 'recon',
    positive: true,
    start: 'entry.js',
    files: {
      'package.json': '{}',
      'entry.js':
        "const m = require('./m.js')\nm('./products/x.js')\nmodule.exports = 1\n",
      'm.js':
        'function f() { return 1 }\nL: function f(s) { return require(s) }\nmodule.exports = f\n',
      'products/x.js': 'module.exports = 1\n'
    },
    base: {
      status: 'UNKNOWN',
      unknowns: [['UNKNOWN_UNSUPPORTED_SYNTAX', 'm.js', 'LabeledStatement']],
      violations: []
    },
    annexb: [['m.js', 'f@2']],
    status: 'UNKNOWN'
  },
  {
    id: 'P09-try-block',
    set: 'recon',
    positive: true,
    start: 'entry.js',
    files: {
      'package.json': '{}',
      'entry.js':
        "const m = require('./m.js')\nm('./products/x.js')\nmodule.exports = 1\n",
      'm.js':
        'function f() { return 1 }\ntry { function f(s) { return require(s) } } finally {}\nmodule.exports = f\n',
      'products/x.js': 'module.exports = 1\n'
    },
    base: {
      status: 'UNKNOWN',
      unknowns: [['UNKNOWN_UNSUPPORTED_SYNTAX', 'm.js', 'TryStatement']],
      violations: []
    },
    annexb: [['m.js', 'f@2']],
    status: 'UNKNOWN'
  },
  {
    id: 'P10-catch-block',
    set: 'recon',
    positive: true,
    start: 'entry.js',
    files: {
      'package.json': '{}',
      'entry.js':
        "const m = require('./m.js')\nm('./products/x.js')\nmodule.exports = 1\n",
      'm.js':
        'function f() { return 1 }\ntry { throw 0 } catch (e) { function f(s) { return require(s) } }\nmodule.exports = f\n',
      'products/x.js': 'module.exports = 1\n'
    },
    base: {
      status: 'UNKNOWN',
      unknowns: [['UNKNOWN_UNSUPPORTED_SYNTAX', 'm.js', 'TryStatement']],
      violations: []
    },
    annexb: [['m.js', 'f@2']],
    status: 'UNKNOWN'
  },
  {
    id: 'P11-loop-block',
    set: 'recon',
    positive: true,
    start: 'entry.js',
    files: {
      'package.json': '{}',
      'entry.js':
        "const m = require('./m.js')\nm('./products/x.js')\nmodule.exports = 1\n",
      'm.js':
        'function f() { return 1 }\ndo { function f(s) { return require(s) } } while (false)\nmodule.exports = f\n',
      'products/x.js': 'module.exports = 1\n'
    },
    base: {
      status: 'UNKNOWN',
      unknowns: [['UNKNOWN_UNSUPPORTED_SYNTAX', 'm.js', 'DoStatement']],
      violations: []
    },
    annexb: [['m.js', 'f@2']],
    status: 'UNKNOWN'
  },
  {
    id: 'P12-nested-in-function',
    set: 'recon',
    positive: true,
    start: 'entry.js',
    files: {
      'package.json': '{}',
      'entry.js':
        "const m = require('./m.js')\nm('./products/x.js')\nmodule.exports = 1\n",
      'm.js':
        'function g() {\n  function f() { return 1 }\n  { function f(s) { return require(s) } }\n  return f\n}\nmodule.exports = g()\n',
      'products/x.js': 'module.exports = 1\n'
    },
    base: {
      status: 'PROVEN',
      unknowns: [],
      violations: []
    },
    annexb: [['m.js', 'f@3']],
    status: 'UNKNOWN'
  },
  {
    id: 'P13-nested-wrapper-function',
    set: 'recon',
    positive: true,
    start: 'entry.js',
    files: {
      'package.json': '{}',
      'entry.js':
        "const m = require('./m.js')\nm('./products/x.js')\nmodule.exports = 1\n",
      'm.js':
        'function f() { return 1 }\nfunction g() {\n  { function f(s) { return require(s) } }\n  return f\n}\nmodule.exports = g()\n',
      'products/x.js': 'module.exports = 1\n'
    },
    base: {
      status: 'PROVEN',
      unknowns: [],
      violations: []
    },
    annexb: [['m.js', 'f@3']],
    status: 'UNKNOWN'
  },
  {
    id: 'P14-nested-wrapper-const',
    set: 'recon',
    positive: true,
    start: 'entry.js',
    files: {
      'package.json': '{}',
      'entry.js':
        "const m = require('./m.js')\nm('./products/x.js')\nmodule.exports = 1\n",
      'm.js':
        'const f = () => 1\nfunction g() {\n  { function f(s) { return require(s) } }\n  return f\n}\nmodule.exports = g()\n',
      'products/x.js': 'module.exports = 1\n'
    },
    base: {
      status: 'PROVEN',
      unknowns: [],
      violations: []
    },
    annexb: [['m.js', 'f@3']],
    status: 'UNKNOWN'
  },
  {
    id: 'P15-var-same-name',
    set: 'recon',
    positive: true,
    start: 'entry.js',
    files: {
      'package.json': '{}',
      'entry.js':
        "const m = require('./m.js')\nm('./products/x.js')\nmodule.exports = 1\n",
      'm.js':
        'var f = function () { return 1 }\n{ function f(s) { return require(s) } }\nmodule.exports = f\n',
      'products/x.js': 'module.exports = 1\n'
    },
    base: {
      status: 'UNKNOWN',
      unknowns: [['UNKNOWN_MUTABLE_BINDING', 'm.js', '']],
      violations: []
    },
    annexb: [['m.js', 'f@2']],
    status: 'UNKNOWN'
  },
  {
    id: 'P16-special-undefined',
    set: 'recon',
    positive: true,
    start: 'entry.js',
    files: {
      'package.json': '{}',
      'entry.js': "require('./m.js')\nmodule.exports = 1\n",
      'm.js':
        "{ function undefined() {} }\nif (undefined) require('./products/x.js')\nmodule.exports = 1\n",
      'products/x.js': 'module.exports = 1\n'
    },
    base: {
      status: 'VIOLATION',
      unknowns: [
        [
          'UNKNOWN_PRODUCT_TARGET',
          'products/x.js',
          'UNKNOWN_PRODUCT_TARGET:products/x.js'
        ]
      ],
      violations: [['PRODUCT_DEPENDENCY', 'm.js', 'products/x.js']]
    },
    annexb: [['m.js', 'undefined@1']],
    status: 'VIOLATION'
  },
  {
    id: 'P16b-special-undefined-indirect',
    set: 'recon',
    positive: true,
    start: 'entry.js',
    files: {
      'package.json': '{}',
      'entry.js': "require('./m.js')\nmodule.exports = 1\n",
      'm.js':
        "function h(s) { return require(s) }\n{ function undefined() {} }\nif (undefined) h('./products/x.js')\nmodule.exports = 1\n",
      'products/x.js': 'module.exports = 1\n'
    },
    base: {
      status: 'PROVEN',
      unknowns: [],
      violations: []
    },
    annexb: [['m.js', 'undefined@2']],
    status: 'UNKNOWN'
  },
  {
    id: 'P17-late-use-strict',
    set: 'recon',
    positive: true,
    start: 'entry.js',
    files: {
      'package.json': '{}',
      'entry.js':
        "const m = require('./m.js')\nm('./products/x.js')\nmodule.exports = 1\n",
      'm.js':
        "function f() { return 1 }\n'use strict'\n{ function f(s) { return require(s) } }\nmodule.exports = f\n",
      'products/x.js': 'module.exports = 1\n'
    },
    base: {
      status: 'PROVEN',
      unknowns: [],
      violations: []
    },
    annexb: [['m.js', 'f@3']],
    status: 'UNKNOWN'
  },
  {
    id: 'P20-escaped-use-strict',
    set: 'recon',
    positive: true,
    start: 'entry.js',
    files: {
      'package.json': '{}',
      'entry.js':
        "const m = require('./m.js')\nm('./products/x.js')\nmodule.exports = 1\n",
      'm.js':
        "'use\\x20strict'\nfunction f() { return 1 }\n{ function f(s) { return require(s) } }\nmodule.exports = f\n",
      'products/x.js': 'module.exports = 1\n'
    },
    base: {
      status: 'PROVEN',
      unknowns: [],
      violations: []
    },
    annexb: [['m.js', 'f@3']],
    status: 'UNKNOWN'
  },
  {
    id: 'P18-escape-no-conflict',
    set: 'recon',
    positive: true,
    start: 'entry.js',
    files: {
      'package.json': '{}',
      'entry.js':
        "const m = require('./m.js')\nm('./products/x.js')\nmodule.exports = 1\n",
      'm.js': '{ function g(s) { return require(s) } }\nmodule.exports = g\n',
      'products/x.js': 'module.exports = 1\n'
    },
    base: {
      status: 'UNKNOWN',
      unknowns: [
        ['UNKNOWN_BINDING', 'm.js', 'g'],
        ['UNKNOWN_BINDING_VALUE', 'entry.js', 'm'],
        ['UNKNOWN_CALL', 'entry.js', ''],
        ['UNKNOWN_EXPORT', 'm.js', '']
      ],
      violations: []
    },
    annexb: [['m.js', 'g@1']],
    status: 'UNKNOWN'
  },
  {
    id: 'P19-wrapper-param-require',
    set: 'recon',
    positive: true,
    start: 'entry.js',
    files: {
      'package.json': '{}',
      'entry.js': "require('./m.js')\nmodule.exports = 1\n",
      'm.js':
        "{ function require(s) { return 1 } }\nrequire('./products/x.js')\nmodule.exports = 1\n",
      'products/x.js': 'module.exports = 1\n'
    },
    base: {
      status: 'VIOLATION',
      unknowns: [
        ['UNKNOWN_CJS_EXPORTS', 'm.js', 'LOADER_REFERENCE'],
        [
          'UNKNOWN_PRODUCT_TARGET',
          'products/x.js',
          'UNKNOWN_PRODUCT_TARGET:products/x.js'
        ]
      ],
      violations: [['PRODUCT_DEPENDENCY', 'm.js', 'products/x.js']]
    },
    annexb: [['m.js', 'require@1']],
    status: 'VIOLATION'
  },
  {
    id: 'P21-nested-iffalse-shadows-const',
    set: 'recon',
    positive: true,
    start: 'entry.js',
    files: {
      'package.json': '{}',
      'entry.js':
        "const m = require('./m.js')\nm('./products/x.js')\nmodule.exports = 1\n",
      'm.js':
        'const flag = true\nfunction h(s) { return require(s) }\nfunction g(s) {\n  if (flag) return 1\n  if (false) { function flag() {} }\n  return h(s)\n}\nmodule.exports = g\n',
      'products/x.js': 'module.exports = 1\n'
    },
    base: {
      status: 'PROVEN',
      unknowns: [],
      violations: []
    },
    annexb: [['m.js', 'flag@5']],
    status: 'UNKNOWN'
  },
  {
    id: 'P22-nested-read-before-block',
    set: 'recon',
    positive: true,
    start: 'entry.js',
    files: {
      'package.json': '{}',
      'entry.js':
        "const m = require('./m.js')\nm('./products/x.js')\nmodule.exports = 1\n",
      'm.js':
        'const flag = true\nfunction h(s) { return require(s) }\nfunction g(s) {\n  if (flag) return 1\n  { function flag() {} }\n  return h(s)\n}\nmodule.exports = g\n',
      'products/x.js': 'module.exports = 1\n'
    },
    base: {
      status: 'PROVEN',
      unknowns: [],
      violations: []
    },
    annexb: [['m.js', 'flag@5']],
    status: 'UNKNOWN'
  },
  {
    id: 'P23-nested-iffalse-undefined-primitive',
    set: 'recon',
    positive: true,
    start: 'entry.js',
    files: {
      'package.json': '{}',
      'entry.js':
        "const m = require('./m.js')\nm('./products/x.js')\nmodule.exports = 1\n",
      'm.js':
        "const mode = 'safe'\nfunction h(s) { return require(s) }\nfunction g(s) {\n  if (mode === 'safe') return 1\n  if (false) { function mode() {} }\n  return h(s)\n}\nmodule.exports = g\n",
      'products/x.js': 'module.exports = 1\n'
    },
    base: {
      status: 'PROVEN',
      unknowns: [],
      violations: []
    },
    annexb: [['m.js', 'mode@5']],
    status: 'UNKNOWN'
  },
  {
    id: 'P24-object-method-sloppy',
    set: 'recon',
    positive: true,
    start: 'entry.js',
    files: {
      'package.json': '{}',
      'entry.js':
        "const m = require('./m.js')\nm('./products/x.js')\nmodule.exports = 1\n",
      'm.js':
        'function f() { return 1 }\nconst o = { m() { { function f(s) { return require(s) } } return f } }\nmodule.exports = o.m()\n',
      'products/x.js': 'module.exports = 1\n'
    },
    base: {
      status: 'PROVEN',
      unknowns: [],
      violations: []
    },
    annexb: [['m.js', 'f@2']],
    status: 'UNKNOWN'
  },
  {
    id: 'P25-nested-outer-param',
    set: 'recon',
    positive: true,
    start: 'entry.js',
    files: {
      'package.json': '{}',
      'entry.js':
        "const m = require('./m.js')\nm('./products/x.js')\nmodule.exports = 1\n",
      'm.js':
        'function outer(f) {\n  function g() { { function f(s) { return require(s) } } return f }\n  return g()\n}\nmodule.exports = outer(() => 1)\n',
      'products/x.js': 'module.exports = 1\n'
    },
    base: {
      status: 'PROVEN',
      unknowns: [],
      violations: []
    },
    annexb: [['m.js', 'f@2']],
    status: 'UNKNOWN'
  },
  {
    id: 'P26-else-no-braces',
    set: 'recon',
    positive: true,
    start: 'entry.js',
    files: {
      'package.json': '{}',
      'entry.js':
        "const m = require('./m.js')\nm('./products/x.js')\nmodule.exports = 1\n",
      'm.js':
        'function f() { return 1 }\nif (false) ; else function f(s) { return require(s) }\nmodule.exports = f\n',
      'products/x.js': 'module.exports = 1\n'
    },
    base: {
      status: 'PROVEN',
      unknowns: [],
      violations: []
    },
    annexb: [['m.js', 'f@2']],
    status: 'UNKNOWN'
  },
  {
    id: 'P27-parenthesized-directive',
    set: 'recon',
    positive: true,
    start: 'entry.js',
    files: {
      'package.json': '{}',
      'entry.js':
        "const m = require('./m.js')\nm('./products/x.js')\nmodule.exports = 1\n",
      'm.js':
        "('use strict')\nfunction f() { return 1 }\n{ function f(s) { return require(s) } }\nmodule.exports = f\n",
      'products/x.js': 'module.exports = 1\n'
    },
    base: {
      status: 'PROVEN',
      unknowns: [],
      violations: []
    },
    annexb: [['m.js', 'f@3']],
    status: 'UNKNOWN'
  },
  {
    id: 'N01-strict-file',
    set: 'recon',
    positive: false,
    start: 'entry.js',
    files: {
      'package.json': '{}',
      'entry.js':
        "const m = require('./m.js')\nm('./products/x.js')\nmodule.exports = 1\n",
      'm.js':
        "'use strict'\nfunction f() { return 1 }\n{ function f(s) { return require(s) } }\nmodule.exports = f\n",
      'products/x.js': 'module.exports = 1\n'
    },
    base: {
      status: 'PROVEN',
      unknowns: [],
      violations: []
    },
    annexb: [],
    status: 'PROVEN'
  },
  {
    id: 'N02-strict-function',
    set: 'recon',
    positive: false,
    start: 'entry.js',
    files: {
      'package.json': '{}',
      'entry.js':
        "const m = require('./m.js')\nm('./products/x.js')\nmodule.exports = 1\n",
      'm.js':
        "function g() {\n  'use strict'\n  function f() { return 1 }\n  { function f(s) { return require(s) } }\n  return f\n}\nmodule.exports = g()\n",
      'products/x.js': 'module.exports = 1\n'
    },
    base: {
      status: 'PROVEN',
      unknowns: [],
      violations: []
    },
    annexb: [],
    status: 'PROVEN'
  },
  {
    id: 'N03-esm',
    set: 'recon',
    positive: false,
    start: 'entry.mjs',
    files: {
      'package.json': '{}',
      'entry.mjs': "import m from './m.mjs'\nm('./products/x.mjs')\n",
      'm.mjs':
        'function f() { return 1 }\n{ function f(s) { return import(s) } }\nexport default f\n',
      'products/x.mjs': 'export default 1\n'
    },
    base: {
      status: 'PROVEN',
      unknowns: [],
      violations: []
    },
    annexb: [],
    status: 'PROVEN'
  },
  {
    id: 'N04-class',
    set: 'recon',
    positive: false,
    start: 'entry.js',
    files: {
      'package.json': '{}',
      'entry.js':
        "const m = require('./m.js')\nm('./products/x.js')\nmodule.exports = 1\n",
      'm.js':
        'class C {\n  static g() {\n    function f() { return 1 }\n    { function f(s) { return require(s) } }\n    return f\n  }\n}\nmodule.exports = C.g()\n',
      'products/x.js': 'module.exports = 1\n'
    },
    base: {
      status: 'UNKNOWN',
      unknowns: [
        ['UNKNOWN_BINDING_VALUE', 'entry.js', 'm'],
        ['UNKNOWN_BINDING_VALUE', 'm.js', 'C'],
        ['UNKNOWN_CALL', 'entry.js', ''],
        ['UNKNOWN_CALL', 'm.js', ''],
        ['UNKNOWN_EXPORT', 'm.js', ''],
        ['UNKNOWN_PROPERTY', 'm.js', ''],
        ['UNKNOWN_UNSUPPORTED_SYNTAX', 'm.js', 'ClassDeclaration']
      ],
      violations: []
    },
    annexb: [],
    status: 'UNKNOWN'
  },
  {
    id: 'N05-no-conflict',
    set: 'recon',
    positive: false,
    start: 'entry.js',
    files: {
      'package.json': '{}',
      'entry.js':
        "const m = require('./m.js')\nm('./products/x.js')\nmodule.exports = 1\n",
      'm.js':
        'function f() { return 1 }\n{ function g(s) { return require(s) } }\nmodule.exports = f\n',
      'products/x.js': 'module.exports = 1\n'
    },
    base: {
      status: 'PROVEN',
      unknowns: [],
      violations: []
    },
    annexb: [['m.js', 'g@2']],
    status: 'UNKNOWN'
  },
  {
    id: 'N06-if-false',
    set: 'recon',
    positive: false,
    start: 'entry.js',
    files: {
      'package.json': '{}',
      'entry.js':
        "const m = require('./m.js')\nm('./products/x.js')\nmodule.exports = 1\n",
      'm.js':
        'function f() { return 1 }\nif (false) { function f(s) { return require(s) } }\nmodule.exports = f\n',
      'products/x.js': 'module.exports = 1\n'
    },
    base: {
      status: 'PROVEN',
      unknowns: [],
      violations: []
    },
    annexb: [['m.js', 'f@2']],
    status: 'UNKNOWN'
  },
  {
    id: 'N07-param-same-name',
    set: 'recon',
    positive: false,
    start: 'entry.js',
    files: {
      'package.json': '{}',
      'entry.js':
        "const m = require('./m.js')\nm('./products/x.js')\nmodule.exports = 1\n",
      'm.js':
        'function g(f) {\n  { function f(s) { return require(s) } }\n  return f\n}\nmodule.exports = g(function () { return 1 })\n',
      'products/x.js': 'module.exports = 1\n'
    },
    base: {
      status: 'PROVEN',
      unknowns: [],
      violations: []
    },
    annexb: [['m.js', 'f@2']],
    status: 'UNKNOWN'
  },
  {
    id: 'N08-const-blocks',
    set: 'recon',
    positive: false,
    start: 'entry.js',
    files: {
      'package.json': '{}',
      'entry.js':
        "const m = require('./m.js')\nm('./products/x.js')\nmodule.exports = 1\n",
      'm.js':
        'const f = () => 1\n{ function f(s) { return require(s) } }\nmodule.exports = f\n',
      'products/x.js': 'module.exports = 1\n'
    },
    base: {
      status: 'PROVEN',
      unknowns: [],
      violations: []
    },
    annexb: [['m.js', 'f@2']],
    status: 'UNKNOWN'
  },
  {
    id: 'N09-const-intermediate-block',
    set: 'recon',
    positive: false,
    start: 'entry.js',
    files: {
      'package.json': '{}',
      'entry.js':
        "const m = require('./m.js')\nm('./products/x.js')\nmodule.exports = 1\n",
      'm.js':
        'function f() { return 1 }\n{\n  const f = () => 2\n  { function f(s) { return require(s) } }\n}\nmodule.exports = f\n',
      'products/x.js': 'module.exports = 1\n'
    },
    base: {
      status: 'PROVEN',
      unknowns: [],
      violations: []
    },
    annexb: [['m.js', 'f@4']],
    status: 'UNKNOWN'
  },
  {
    id: 'N10-require-nested-fn',
    set: 'recon',
    positive: false,
    start: 'entry.js',
    files: {
      'package.json': '{}',
      'entry.js': "require('./m.js')\nmodule.exports = 1\n",
      'm.js':
        "function g(s) {\n  { function require(x) { return 1 } }\n  return require(s)\n}\ng('./products/x.js')\nmodule.exports = 1\n",
      'products/x.js': 'module.exports = 1\n'
    },
    base: {
      status: 'VIOLATION',
      unknowns: [
        ['UNKNOWN_CJS_EXPORTS', 'm.js', 'LOADER_REFERENCE'],
        [
          'UNKNOWN_PRODUCT_TARGET',
          'products/x.js',
          'UNKNOWN_PRODUCT_TARGET:products/x.js'
        ]
      ],
      violations: [['PRODUCT_DEPENDENCY', 'm.js', 'products/x.js']]
    },
    annexb: [['m.js', 'require@2']],
    status: 'VIOLATION'
  },
  {
    id: 'N11-require-nested-literal-nocall',
    set: 'recon',
    positive: false,
    start: 'entry.js',
    files: {
      'package.json': '{}',
      'entry.js': "require('./m.js')\nmodule.exports = 1\n",
      'm.js':
        "function g() {\n  { function require(x) { return 1 } }\n  return require('./products/x.js')\n}\nmodule.exports = 1\n",
      'products/x.js': 'module.exports = 1\n'
    },
    base: {
      status: 'VIOLATION',
      unknowns: [
        ['UNKNOWN_CJS_EXPORTS', 'm.js', 'LOADER_REFERENCE'],
        [
          'UNKNOWN_PRODUCT_TARGET',
          'products/x.js',
          'UNKNOWN_PRODUCT_TARGET:products/x.js'
        ]
      ],
      violations: [['PRODUCT_DEPENDENCY', 'm.js', 'products/x.js']]
    },
    annexb: [['m.js', 'require@2']],
    status: 'VIOLATION'
  },
  {
    id: 'N12-require-nested-param-nocall',
    set: 'recon',
    positive: false,
    start: 'entry.js',
    files: {
      'package.json': '{}',
      'entry.js': "require('./m.js')\nmodule.exports = 1\n",
      'm.js':
        'function g(s) {\n  { function require(x) { return 1 } }\n  return require(s)\n}\nmodule.exports = 1\n',
      'products/x.js': 'module.exports = 1\n'
    },
    base: {
      status: 'UNKNOWN',
      unknowns: [['UNKNOWN_CJS_EXPORTS', 'm.js', 'LOADER_REFERENCE']],
      violations: []
    },
    annexb: [['m.js', 'require@2']],
    status: 'UNKNOWN'
  },
  {
    id: 'N13-arrow-use-strict',
    set: 'recon',
    positive: false,
    start: 'entry.js',
    files: {
      'package.json': '{}',
      'entry.js':
        "const m = require('./m.js')\nm('./products/x.js')\nmodule.exports = 1\n",
      'm.js':
        "const g = () => {\n  'use strict'\n  function f() { return 1 }\n  { function f(s) { return require(s) } }\n  return f\n}\nmodule.exports = g()\n",
      'products/x.js': 'module.exports = 1\n'
    },
    base: {
      status: 'PROVEN',
      unknowns: [],
      violations: []
    },
    annexb: [],
    status: 'PROVEN'
  },
  {
    id: 'N14-inherited-strict',
    set: 'recon',
    positive: false,
    start: 'entry.js',
    files: {
      'package.json': '{}',
      'entry.js':
        "const m = require('./m.js')\nm('./products/x.js')\nmodule.exports = 1\n",
      'm.js':
        "function outer() {\n  'use strict'\n  function g() {\n    function f() { return 1 }\n    { function f(s) { return require(s) } }\n    return f\n  }\n  return g()\n}\nmodule.exports = outer()\n",
      'products/x.js': 'module.exports = 1\n'
    },
    base: {
      status: 'PROVEN',
      unknowns: [],
      violations: []
    },
    annexb: [],
    status: 'PROVEN'
  },
  {
    id: 'N15-second-directive',
    set: 'recon',
    positive: false,
    start: 'entry.js',
    files: {
      'package.json': '{}',
      'entry.js':
        "const m = require('./m.js')\nm('./products/x.js')\nmodule.exports = 1\n",
      'm.js':
        "'use foo'\n'use strict'\nfunction f() { return 1 }\n{ function f(s) { return require(s) } }\nmodule.exports = f\n",
      'products/x.js': 'module.exports = 1\n'
    },
    base: {
      status: 'PROVEN',
      unknowns: [],
      violations: []
    },
    annexb: [],
    status: 'PROVEN'
  },
  {
    id: 'C01-own-strict-body',
    set: 'C',
    positive: true,
    start: 'entry.js',
    files: {
      'entry.js':
        "const m = require('./m.js')\nm('./products/x.js')\nmodule.exports = 1\n",
      'm.js':
        "function f() { return 1 }\n{ function f(s) { 'use strict'; return require(s) } }\nmodule.exports = f\n",
      'package.json': '{}',
      'products/x.js': 'module.exports = 1\n'
    },
    base: {
      status: 'PROVEN',
      unknowns: [],
      violations: []
    },
    annexb: [['m.js', 'f@2']],
    status: 'UNKNOWN'
  },
  {
    id: 'C02-sibling-strict-function',
    set: 'C',
    positive: true,
    start: 'entry.js',
    files: {
      'entry.js':
        "const m = require('./m.js')\nm('./products/x.js')\nmodule.exports = 1\n",
      'm.js':
        "function a() { 'use strict'; return 1 }\nfunction f() { return 1 }\n{ function f(s) { return require(s) } }\nmodule.exports = f\n",
      'package.json': '{}',
      'products/x.js': 'module.exports = 1\n'
    },
    base: {
      status: 'PROVEN',
      unknowns: [],
      violations: []
    },
    annexb: [['m.js', 'f@3']],
    status: 'UNKNOWN'
  },
  {
    id: 'C03-sloppy-arrow',
    set: 'C',
    positive: true,
    start: 'entry.js',
    files: {
      'entry.js':
        "const m = require('./m.js')\nm('./products/x.js')\nmodule.exports = 1\n",
      'm.js':
        'const g = () => {\n  function f() { return 1 }\n  { function f(s) { return require(s) } }\n  return f\n}\nmodule.exports = g()\n',
      'package.json': '{}',
      'products/x.js': 'module.exports = 1\n'
    },
    base: {
      status: 'PROVEN',
      unknowns: [],
      violations: []
    },
    annexb: [['m.js', 'f@3']],
    status: 'UNKNOWN'
  },
  {
    id: 'C04-generator-in-block',
    set: 'C',
    positive: false,
    start: 'entry.js',
    files: {
      'entry.js':
        "const m = require('./m.js')\nm('./products/x.js')\nmodule.exports = 1\n",
      'm.js':
        'function f() { return 1 }\n{ function* f(s) { yield require(s) } }\nmodule.exports = f\n',
      'package.json': '{}',
      'products/x.js': 'module.exports = 1\n'
    },
    base: {
      status: 'UNKNOWN',
      unknowns: [['UNKNOWN_FUNCTION', 'm.js', 'GENERATOR']],
      violations: []
    },
    annexb: [['m.js', 'f@2']],
    status: 'UNKNOWN'
  },
  {
    id: 'C05-async-in-block',
    set: 'C',
    positive: false,
    start: 'entry.js',
    files: {
      'entry.js':
        "const m = require('./m.js')\nm('./products/x.js')\nmodule.exports = 1\n",
      'm.js':
        'function f() { return 1 }\n{ async function f(s) { return require(s) } }\nmodule.exports = f\n',
      'package.json': '{}',
      'products/x.js': 'module.exports = 1\n'
    },
    base: {
      status: 'UNKNOWN',
      unknowns: [['UNKNOWN_FUNCTION', 'm.js', 'ASYNC']],
      violations: []
    },
    annexb: [['m.js', 'f@2']],
    status: 'UNKNOWN'
  },
  {
    id: 'C06-class-heritage',
    set: 'C',
    positive: false,
    start: 'entry.js',
    files: {
      'entry.js':
        "const m = require('./m.js')\nm('./products/x.js')\nmodule.exports = 1\n",
      'm.js':
        'function f() { return 1 }\nclass A extends (function () { { function f(s) { return require(s) } } return Object })() {}\nmodule.exports = f\n',
      'package.json': '{}',
      'products/x.js': 'module.exports = 1\n'
    },
    base: {
      status: 'UNKNOWN',
      unknowns: [['UNKNOWN_UNSUPPORTED_SYNTAX', 'm.js', 'ClassDeclaration']],
      violations: []
    },
    annexb: [],
    status: 'UNKNOWN'
  },
  {
    id: 'C07-double-quoted-strict',
    set: 'C',
    positive: false,
    start: 'entry.js',
    files: {
      'entry.js':
        "const m = require('./m.js')\nm('./products/x.js')\nmodule.exports = 1\n",
      'm.js':
        '"use strict"\nfunction f() { return 1 }\n{ function f(s) { return require(s) } }\nmodule.exports = f\n',
      'package.json': '{}',
      'products/x.js': 'module.exports = 1\n'
    },
    base: {
      status: 'PROVEN',
      unknowns: [],
      violations: []
    },
    annexb: [],
    status: 'PROVEN'
  },
  {
    id: 'C08-sloppy-no-block-function',
    set: 'C',
    positive: false,
    start: 'entry.js',
    files: {
      'entry.js':
        "const m = require('./m.js')\nm('./products/x.js')\nmodule.exports = 1\n",
      'm.js':
        'function f() { return 1 }\nfunction g() { function h() { return 2 } return h() }\nmodule.exports = f\n',
      'package.json': '{}',
      'products/x.js': 'module.exports = 1\n'
    },
    base: {
      status: 'PROVEN',
      unknowns: [],
      violations: []
    },
    annexb: [],
    status: 'PROVEN'
  },
  {
    id: 'C09-strict-own-body-only-in-strict-file',
    set: 'C',
    positive: false,
    start: 'entry.js',
    files: {
      'entry.js':
        "const m = require('./m.js')\nm('./products/x.js')\nmodule.exports = 1\n",
      'm.js':
        "'use strict'\nfunction f() { return 1 }\n{ function f(s) { 'use strict'; return require(s) } }\nmodule.exports = f\n",
      'package.json': '{}',
      'products/x.js': 'module.exports = 1\n'
    },
    base: {
      status: 'PROVEN',
      unknowns: [],
      violations: []
    },
    annexb: [],
    status: 'PROVEN'
  },
  {
    id: 'C10-sloppy-getter',
    set: 'C',
    positive: true,
    start: 'entry.js',
    files: {
      'entry.js':
        "const m = require('./m.js')\nm('./products/x.js')\nmodule.exports = 1\n",
      'm.js':
        'function f() { return 1 }\nconst o = { get m() { { function f(s) { return require(s) } } return f } }\nmodule.exports = o.m\n',
      'package.json': '{}',
      'products/x.js': 'module.exports = 1\n'
    },
    base: {
      status: 'UNKNOWN',
      unknowns: [
        ['UNKNOWN_BINDING_VALUE', 'entry.js', 'm'],
        ['UNKNOWN_CALL', 'entry.js', ''],
        ['UNKNOWN_EXPORT', 'm.js', ''],
        ['UNKNOWN_INHERITED_PROPERTY', 'm.js', 'm'],
        ['UNKNOWN_OBJECT', 'm.js', '']
      ],
      violations: []
    },
    annexb: [['m.js', 'f@2']],
    status: 'UNKNOWN'
  },
  {
    id: 'C11-cts-sloppy',
    set: 'C',
    positive: true,
    start: 'entry.js',
    files: {
      'entry.js':
        "const m = require('./m.cts')\nm('./products/x.js')\nmodule.exports = 1\n",
      'm.cts':
        'function f(): number { return 1 }\n{ function f(s: string) { return require(s) } }\nmodule.exports = f\n',
      'package.json': '{}',
      'products/x.js': 'module.exports = 1\n'
    },
    base: {
      status: 'PROVEN',
      unknowns: [],
      violations: []
    },
    annexb: [['m.cts', 'f@2']],
    status: 'UNKNOWN'
  },
  {
    id: 'C12-block-leading-use-strict',
    set: 'C',
    positive: true,
    start: 'entry.js',
    files: {
      'entry.js':
        "const m = require('./m.js')\nm('./products/x.js')\nmodule.exports = 1\n",
      'm.js':
        "function f() { return 1 }\n{ 'use strict'; function f(s) { return require(s) } }\nmodule.exports = f\n",
      'package.json': '{}',
      'products/x.js': 'module.exports = 1\n'
    },
    base: {
      status: 'PROVEN',
      unknowns: [],
      violations: []
    },
    annexb: [['m.js', 'f@2']],
    status: 'UNKNOWN'
  },
  {
    id: 'C13-expression-before-directive',
    set: 'C',
    positive: true,
    start: 'entry.js',
    files: {
      'entry.js':
        "const m = require('./m.js')\nm('./products/x.js')\nmodule.exports = 1\n",
      'm.js':
        "0\n'use strict'\nfunction f() { return 1 }\n{ function f(s) { return require(s) } }\nmodule.exports = f\n",
      'package.json': '{}',
      'products/x.js': 'module.exports = 1\n'
    },
    base: {
      status: 'PROVEN',
      unknowns: [],
      violations: []
    },
    annexb: [['m.js', 'f@4']],
    status: 'UNKNOWN'
  },
  {
    id: 'C14-template-use-strict',
    set: 'C',
    positive: true,
    start: 'entry.js',
    files: {
      'entry.js':
        "const m = require('./m.js')\nm('./products/x.js')\nmodule.exports = 1\n",
      'm.js':
        '`use strict`\nfunction f() { return 1 }\n{ function f(s) { return require(s) } }\nmodule.exports = f\n',
      'package.json': '{}',
      'products/x.js': 'module.exports = 1\n'
    },
    base: {
      status: 'PROVEN',
      unknowns: [],
      violations: []
    },
    annexb: [['m.js', 'f@3']],
    status: 'UNKNOWN'
  },
  {
    id: 'C15-late-use-strict-in-function',
    set: 'C',
    positive: true,
    start: 'entry.js',
    files: {
      'entry.js':
        "const m = require('./m.js')\nm('./products/x.js')\nmodule.exports = 1\n",
      'm.js':
        "function g() {\n  function f() { return 1 }\n  'use strict'\n  { function f(s) { return require(s) } }\n  return f\n}\nmodule.exports = g()\n",
      'package.json': '{}',
      'products/x.js': 'module.exports = 1\n'
    },
    base: {
      status: 'PROVEN',
      unknowns: [],
      violations: []
    },
    annexb: [['m.js', 'f@4']],
    status: 'UNKNOWN'
  },
  {
    id: 'D01-empty-before-directive-file',
    set: 'D',
    positive: true,
    start: 'entry.js',
    files: {
      'entry.js':
        "const m = require('./m.js')\nm('./products/x.js')\nmodule.exports = 1\n",
      'm.js':
        ";\n'use strict'\nfunction f() { return 1 }\n{ function f(s) { return require(s) } }\nmodule.exports = f\n",
      'package.json': '{}',
      'products/x.js': 'module.exports = 1\n'
    },
    base: {
      status: 'PROVEN',
      unknowns: [],
      violations: []
    },
    annexb: [['m.js', 'f@4']],
    status: 'UNKNOWN'
  },
  {
    id: 'D02-empty-before-directive-fn',
    set: 'D',
    positive: true,
    start: 'entry.js',
    files: {
      'entry.js':
        "const m = require('./m.js')\nm('./products/x.js')\nmodule.exports = 1\n",
      'm.js':
        "function g() {\n  ;\n  'use strict'\n  function f() { return 1 }\n  { function f(s) { return require(s) } }\n  return f\n}\nmodule.exports = g()\n",
      'package.json': '{}',
      'products/x.js': 'module.exports = 1\n'
    },
    base: {
      status: 'PROVEN',
      unknowns: [],
      violations: []
    },
    annexb: [['m.js', 'f@5']],
    status: 'UNKNOWN'
  },
  {
    id: 'D03a-string-plus',
    set: 'D',
    positive: true,
    start: 'entry.js',
    files: {
      'entry.js':
        "const m = require('./m.js')\nm('./products/x.js')\nmodule.exports = 1\n",
      'm.js':
        "'use strict' + ''\nfunction f() { return 1 }\n{ function f(s) { return require(s) } }\nmodule.exports = f\n",
      'package.json': '{}',
      'products/x.js': 'module.exports = 1\n'
    },
    base: {
      status: 'PROVEN',
      unknowns: [],
      violations: []
    },
    annexb: [['m.js', 'f@3']],
    status: 'UNKNOWN'
  },
  {
    id: 'D03b-string-length',
    set: 'D',
    positive: true,
    start: 'entry.js',
    files: {
      'entry.js':
        "const m = require('./m.js')\nm('./products/x.js')\nmodule.exports = 1\n",
      'm.js':
        "'use strict'.length\nfunction f() { return 1 }\n{ function f(s) { return require(s) } }\nmodule.exports = f\n",
      'package.json': '{}',
      'products/x.js': 'module.exports = 1\n'
    },
    base: {
      status: 'UNKNOWN',
      unknowns: [['UNKNOWN_PROPERTY', 'm.js', '']],
      violations: []
    },
    annexb: [['m.js', 'f@3']],
    status: 'UNKNOWN'
  },
  {
    id: 'D03c-string-comma',
    set: 'D',
    positive: true,
    start: 'entry.js',
    files: {
      'entry.js':
        "const m = require('./m.js')\nm('./products/x.js')\nmodule.exports = 1\n",
      'm.js':
        "'use strict', 0\nfunction f() { return 1 }\n{ function f(s) { return require(s) } }\nmodule.exports = f\n",
      'package.json': '{}',
      'products/x.js': 'module.exports = 1\n'
    },
    base: {
      status: 'UNKNOWN',
      unknowns: [['UNKNOWN_OPERATOR', 'm.js', '']],
      violations: []
    },
    annexb: [['m.js', 'f@3']],
    status: 'UNKNOWN'
  },
  {
    id: 'D03d-string-or',
    set: 'D',
    positive: true,
    start: 'entry.js',
    files: {
      'entry.js':
        "const m = require('./m.js')\nm('./products/x.js')\nmodule.exports = 1\n",
      'm.js':
        "'use strict' || 0\nfunction f() { return 1 }\n{ function f(s) { return require(s) } }\nmodule.exports = f\n",
      'package.json': '{}',
      'products/x.js': 'module.exports = 1\n'
    },
    base: {
      status: 'UNKNOWN',
      unknowns: [['UNKNOWN_OPERATOR', 'm.js', '']],
      violations: []
    },
    annexb: [['m.js', 'f@3']],
    status: 'UNKNOWN'
  },
  {
    id: 'D03e-string-eq',
    set: 'D',
    positive: true,
    start: 'entry.js',
    files: {
      'entry.js':
        "const m = require('./m.js')\nm('./products/x.js')\nmodule.exports = 1\n",
      'm.js':
        "'use strict' === 0\nfunction f() { return 1 }\n{ function f(s) { return require(s) } }\nmodule.exports = f\n",
      'package.json': '{}',
      'products/x.js': 'module.exports = 1\n'
    },
    base: {
      status: 'PROVEN',
      unknowns: [],
      violations: []
    },
    annexb: [['m.js', 'f@3']],
    status: 'UNKNOWN'
  },
  {
    id: 'D03f-string-cond',
    set: 'D',
    positive: true,
    start: 'entry.js',
    files: {
      'entry.js':
        "const m = require('./m.js')\nm('./products/x.js')\nmodule.exports = 1\n",
      'm.js':
        "'use strict' ? 0 : 1\nfunction f() { return 1 }\n{ function f(s) { return require(s) } }\nmodule.exports = f\n",
      'package.json': '{}',
      'products/x.js': 'module.exports = 1\n'
    },
    base: {
      status: 'PROVEN',
      unknowns: [],
      violations: []
    },
    annexb: [['m.js', 'f@3']],
    status: 'UNKNOWN'
  },
  {
    id: 'D04-ts-sloppy',
    set: 'D',
    positive: true,
    start: 'entry.js',
    files: {
      'entry.js':
        "const m = require('./m.ts')\nm('./products/x.js')\nmodule.exports = 1\n",
      'm.ts':
        'function f(): number { return 1 }\n{ function f(s: string) { return require(s) } }\nmodule.exports = f\n',
      'package.json': '{}',
      'products/x.js': 'module.exports = 1\n'
    },
    base: {
      status: 'PROVEN',
      unknowns: [],
      violations: []
    },
    annexb: [['m.ts', 'f@2']],
    status: 'UNKNOWN'
  },
  {
    id: 'D05-escape-in-fn',
    set: 'D',
    positive: true,
    start: 'entry.js',
    files: {
      'entry.js':
        "const m = require('./m.js')\nm('./products/x.js')\nmodule.exports = 1\n",
      'm.js':
        "function g() {\n  'use\\x20strict'\n  function f() { return 1 }\n  { function f(s) { return require(s) } }\n  return f\n}\nmodule.exports = g()\n",
      'package.json': '{}',
      'products/x.js': 'module.exports = 1\n'
    },
    base: {
      status: 'PROVEN',
      unknowns: [],
      violations: []
    },
    annexb: [['m.js', 'f@4']],
    status: 'UNKNOWN'
  },
  {
    id: 'D06-parens-in-fn',
    set: 'D',
    positive: true,
    start: 'entry.js',
    files: {
      'entry.js':
        "const m = require('./m.js')\nm('./products/x.js')\nmodule.exports = 1\n",
      'm.js':
        "function g() {\n  ('use strict')\n  function f() { return 1 }\n  { function f(s) { return require(s) } }\n  return f\n}\nmodule.exports = g()\n",
      'package.json': '{}',
      'products/x.js': 'module.exports = 1\n'
    },
    base: {
      status: 'PROVEN',
      unknowns: [],
      violations: []
    },
    annexb: [['m.js', 'f@4']],
    status: 'UNKNOWN'
  },
  {
    id: 'D07-class-sibling-uncalled',
    set: 'D',
    positive: true,
    start: 'entry.js',
    files: {
      'entry.js':
        "const m = require('./m.js')\nm('./products/x.js')\nmodule.exports = 1\n",
      'm.js':
        'function h() { return class {} }\nfunction f() { return 1 }\n{ function f(s) { return require(s) } }\nmodule.exports = f\n',
      'package.json': '{}',
      'products/x.js': 'module.exports = 1\n'
    },
    base: {
      status: 'PROVEN',
      unknowns: [],
      violations: []
    },
    annexb: [['m.js', 'f@3']],
    status: 'UNKNOWN'
  },
  {
    id: 'D08-expr-before-directive-fn',
    set: 'D',
    positive: true,
    start: 'entry.js',
    files: {
      'entry.js':
        "const m = require('./m.js')\nm('./products/x.js')\nmodule.exports = 1\n",
      'm.js':
        "function g() {\n  0\n  'use strict'\n  function f() { return 1 }\n  { function f(s) { return require(s) } }\n  return f\n}\nmodule.exports = g()\n",
      'package.json': '{}',
      'products/x.js': 'module.exports = 1\n'
    },
    base: {
      status: 'PROVEN',
      unknowns: [],
      violations: []
    },
    annexb: [['m.js', 'f@5']],
    status: 'UNKNOWN'
  },
  {
    id: 'D09-template-in-fn',
    set: 'D',
    positive: true,
    start: 'entry.js',
    files: {
      'entry.js':
        "const m = require('./m.js')\nm('./products/x.js')\nmodule.exports = 1\n",
      'm.js':
        'function g() {\n  `use strict`\n  function f() { return 1 }\n  { function f(s) { return require(s) } }\n  return f\n}\nmodule.exports = g()\n',
      'package.json': '{}',
      'products/x.js': 'module.exports = 1\n'
    },
    base: {
      status: 'PROVEN',
      unknowns: [],
      violations: []
    },
    annexb: [['m.js', 'f@4']],
    status: 'UNKNOWN'
  },
  {
    id: 'D10-asi-string-then-paren',
    set: 'D',
    positive: false,
    start: 'entry.js',
    files: {
      'entry.js':
        "const m = require('./m.js')\nm('./products/x.js')\nmodule.exports = 1\n",
      'm.js':
        "'use strict'\n;(0)\nfunction f() { return 1 }\n{ function f(s) { return require(s) } }\nmodule.exports = f\n",
      'package.json': '{}',
      'products/x.js': 'module.exports = 1\n'
    },
    base: {
      status: 'PROVEN',
      unknowns: [],
      violations: []
    },
    annexb: [],
    status: 'PROVEN'
  },
  {
    id: 'D11-directive-after-comment-and-hashbang',
    set: 'D',
    positive: false,
    start: 'entry.js',
    files: {
      'entry.js':
        "const m = require('./m.js')\nm('./products/x.js')\nmodule.exports = 1\n",
      'm.js':
        "#!/usr/bin/env node\n/* c */ 'use strict'\nfunction f() { return 1 }\n{ function f(s) { return require(s) } }\nmodule.exports = f\n",
      'package.json': '{}',
      'products/x.js': 'module.exports = 1\n'
    },
    base: {
      status: 'PROVEN',
      unknowns: [],
      violations: []
    },
    annexb: [],
    status: 'PROVEN'
  },
  {
    id: 'X01-computed-key-arrow',
    set: 'X',
    positive: true,
    start: 'entry.js',
    files: {
      'entry.js':
        "const m = require('./m.js')\nm('./products/x.js')\nmodule.exports = 1\n",
      'm.js':
        "function f() { return 1 }\nconst box = {}\nconst o = { [(() => { { function f(s) { return require(s) } } box.v = f; return 'k' })()]() { 'use strict' } }\nmodule.exports = box.v\n",
      'package.json': '{}',
      'products/x.js': 'module.exports = 1\n'
    },
    base: {
      status: 'UNKNOWN',
      unknowns: [
        ['UNKNOWN_BINDING_VALUE', 'entry.js', 'm'],
        ['UNKNOWN_CALL', 'entry.js', ''],
        ['UNKNOWN_EXPORT', 'm.js', ''],
        ['UNKNOWN_INHERITED_PROPERTY', 'm.js', 'v'],
        ['UNKNOWN_MUTATION', 'm.js', '']
      ],
      violations: []
    },
    annexb: [['m.js', 'f@3']],
    status: 'UNKNOWN'
  },
  {
    id: 'X02-computed-key-fnexpr',
    set: 'X',
    positive: true,
    start: 'entry.js',
    files: {
      'entry.js':
        "const m = require('./m.js')\nm('./products/x.js')\nmodule.exports = 1\n",
      'm.js':
        "function f() { return 1 }\nconst box = {}\nconst o = { [function () { { function f(s) { return require(s) } } box.v = f; return 'k' }()]() { 'use strict' } }\nmodule.exports = box.v\n",
      'package.json': '{}',
      'products/x.js': 'module.exports = 1\n'
    },
    base: {
      status: 'UNKNOWN',
      unknowns: [
        ['UNKNOWN_BINDING_VALUE', 'entry.js', 'm'],
        ['UNKNOWN_CALL', 'entry.js', ''],
        ['UNKNOWN_EXPORT', 'm.js', ''],
        ['UNKNOWN_INHERITED_PROPERTY', 'm.js', 'v'],
        ['UNKNOWN_MUTATION', 'm.js', '']
      ],
      violations: []
    },
    annexb: [['m.js', 'f@3']],
    status: 'UNKNOWN'
  },
  {
    id: 'X03-computed-key-getter',
    set: 'X',
    positive: true,
    start: 'entry.js',
    files: {
      'entry.js':
        "const m = require('./m.js')\nm('./products/x.js')\nmodule.exports = 1\n",
      'm.js':
        "function f() { return 1 }\nconst box = {}\nconst o = { get [(() => { { function f(s) { return require(s) } } box.v = f; return 'k' })()]() { 'use strict'; return 1 } }\nmodule.exports = box.v\n",
      'package.json': '{}',
      'products/x.js': 'module.exports = 1\n'
    },
    base: {
      status: 'UNKNOWN',
      unknowns: [
        ['UNKNOWN_BINDING_VALUE', 'entry.js', 'm'],
        ['UNKNOWN_CALL', 'entry.js', ''],
        ['UNKNOWN_EXPORT', 'm.js', ''],
        ['UNKNOWN_INHERITED_PROPERTY', 'm.js', 'v'],
        ['UNKNOWN_OBJECT', 'm.js', '']
      ],
      violations: []
    },
    annexb: [['m.js', 'f@3']],
    status: 'UNKNOWN'
  },
  {
    id: 'X04-computed-key-return',
    set: 'X',
    positive: false,
    start: 'entry.js',
    files: {
      'entry.js':
        "const m = require('./m.js')\nm('./products/x.js')\nmodule.exports = 1\n",
      'm.js':
        "function f() { return 1 }\nfunction g() {\n  let r = 0\n  const o = { [(() => { { function f(s) { return require(s) } } return 'k' })()]() { 'use strict' } }\n  return f\n}\nmodule.exports = g()\n",
      'package.json': '{}',
      'products/x.js': 'module.exports = 1\n'
    },
    base: {
      status: 'UNKNOWN',
      unknowns: [['UNKNOWN_MUTABLE_BINDING', 'm.js', '']],
      violations: []
    },
    annexb: [['m.js', 'f@4']],
    status: 'UNKNOWN'
  },
  {
    id: 'X05-computed-key-direct',
    set: 'X',
    positive: false,
    start: 'entry.js',
    files: {
      'entry.js':
        "const m = require('./m.js')\nm('./products/x.js')\nmodule.exports = 1\n",
      'm.js':
        'function f() { return 1 }\nconst o = { [(() => { { function f(s) { return require(s) } } return f })()]: 1 }\nmodule.exports = f\n',
      'package.json': '{}',
      'products/x.js': 'module.exports = 1\n'
    },
    base: {
      status: 'UNKNOWN',
      unknowns: [['UNKNOWN_OBJECT', 'm.js', '']],
      violations: []
    },
    annexb: [['m.js', 'f@2']],
    status: 'UNKNOWN'
  },
  {
    id: 'X06-computed-key-call',
    set: 'X',
    positive: true,
    start: 'entry.js',
    files: {
      'entry.js': "require('./m.js')\nmodule.exports = 1\n",
      'm.js':
        "function f() { return 'k' }\nconst o = { [(() => { { function f(s) { return require(s) } } f('./products/x.js'); return 'k' })()]() { 'use strict' } }\nmodule.exports = 1\n",
      'package.json': '{}',
      'products/x.js': 'module.exports = 1\n'
    },
    base: {
      status: 'PROVEN',
      unknowns: [],
      violations: []
    },
    annexb: [['m.js', 'f@2']],
    status: 'UNKNOWN'
  },
  {
    id: 'X07-computed-key-call-fnexpr',
    set: 'X',
    positive: true,
    start: 'entry.js',
    files: {
      'entry.js': "require('./m.js')\nmodule.exports = 1\n",
      'm.js':
        "function f() { return 'k' }\nconst o = { [function () { { function f(s) { return require(s) } } return f('./products/x.js') }()]() { 'use strict' } }\nmodule.exports = 1\n",
      'package.json': '{}',
      'products/x.js': 'module.exports = 1\n'
    },
    base: {
      status: 'PROVEN',
      unknowns: [],
      violations: []
    },
    annexb: [['m.js', 'f@2']],
    status: 'UNKNOWN'
  },
  {
    id: 'X08-plain-arrow-control',
    set: 'X',
    positive: true,
    start: 'entry.js',
    files: {
      'entry.js': "require('./m.js')\nmodule.exports = 1\n",
      'm.js':
        "function f() { return 'k' }\nconst o = { [(() => { { function f(s) { return require(s) } } f('./products/x.js'); return 'k' })()]() { } }\nmodule.exports = 1\n",
      'package.json': '{}',
      'products/x.js': 'module.exports = 1\n'
    },
    base: {
      status: 'PROVEN',
      unknowns: [],
      violations: []
    },
    annexb: [['m.js', 'f@2']],
    status: 'UNKNOWN'
  },
  {
    id: 'X09-computed-key-getter-call',
    set: 'X',
    positive: true,
    start: 'entry.js',
    files: {
      'entry.js': "require('./m.js')\nmodule.exports = 1\n",
      'm.js':
        "function f() { return 'k' }\nconst o = { get [(() => { { function f(s) { return require(s) } } f('./products/x.js'); return 'k' })()]() { 'use strict'; return 1 } }\nmodule.exports = 1\n",
      'package.json': '{}',
      'products/x.js': 'module.exports = 1\n'
    },
    base: {
      status: 'UNKNOWN',
      unknowns: [['UNKNOWN_OBJECT', 'm.js', '']],
      violations: []
    },
    annexb: [['m.js', 'f@2']],
    status: 'UNKNOWN'
  },
  {
    id: 'X10-computed-key-nested-fn',
    set: 'X',
    positive: true,
    start: 'entry.js',
    files: {
      'entry.js': "require('./m.js')\nmodule.exports = 1\n",
      'm.js':
        "function f() { return 'k' }\nfunction g() {\n  const o = { [(() => { { function f(s) { return require(s) } } f('./products/x.js'); return 'k' })()]() { 'use strict' } }\n  return 1\n}\nmodule.exports = g()\n",
      'package.json': '{}',
      'products/x.js': 'module.exports = 1\n'
    },
    base: {
      status: 'PROVEN',
      unknowns: [],
      violations: []
    },
    annexb: [['m.js', 'f@3']],
    status: 'UNKNOWN'
  },
  {
    id: 'X11-computed-key-async-method',
    set: 'X',
    positive: true,
    start: 'entry.js',
    files: {
      'entry.js': "require('./m.js')\nmodule.exports = 1\n",
      'm.js':
        "function f() { return 'k' }\nconst o = { async [(() => { { function f(s) { return require(s) } } f('./products/x.js'); return 'k' })()]() { 'use strict' } }\nmodule.exports = 1\n",
      'package.json': '{}',
      'products/x.js': 'module.exports = 1\n'
    },
    base: {
      status: 'UNKNOWN',
      unknowns: [['UNKNOWN_FUNCTION', 'm.js', 'ASYNC']],
      violations: []
    },
    annexb: [['m.js', 'f@2']],
    status: 'UNKNOWN'
  },
  {
    id: 'X12-class-computed-key-control',
    set: 'X',
    positive: false,
    start: 'entry.js',
    files: {
      'entry.js': "require('./m.js')\nmodule.exports = 1\n",
      'm.js':
        "function f() { return 'k' }\nclass K { [(() => { { function f(s) { return require(s) } } f('./products/x.js'); return 'k' })()]() { } }\nmodule.exports = 1\n",
      'package.json': '{}',
      'products/x.js': 'module.exports = 1\n'
    },
    base: {
      status: 'UNKNOWN',
      unknowns: [['UNKNOWN_UNSUPPORTED_SYNTAX', 'm.js', 'ClassDeclaration']],
      violations: []
    },
    annexb: [],
    status: 'UNKNOWN'
  },
  {
    id: 'X13-nested-block-functions',
    set: 'X',
    positive: true,
    start: 'entry.js',
    files: {
      'entry.js':
        "const m = require('./m.js')\nm('./products/x.js')\nmodule.exports = 1\n",
      'm.js':
        'function f() { return 1 }\n{\n  function f(s) {\n    { function g() { return 1 } }\n    return require(s)\n  }\n}\nmodule.exports = f\n',
      'package.json': '{}',
      'products/x.js': 'module.exports = 1\n'
    },
    base: {
      status: 'PROVEN',
      unknowns: [],
      violations: []
    },
    annexb: [
      ['m.js', 'f@3'],
      ['m.js', 'g@4']
    ],
    status: 'UNKNOWN'
  },
  {
    id: 'X14-nested-in-strict-block-function',
    set: 'X',
    positive: true,
    start: 'entry.js',
    files: {
      'entry.js':
        "const m = require('./m.js')\nm('./products/x.js')\nmodule.exports = 1\n",
      'm.js':
        "function f() { return 1 }\n{\n  function f(s) {\n    'use strict'\n    { function g() { return 1 } }\n    return require(s)\n  }\n}\nmodule.exports = f\n",
      'package.json': '{}',
      'products/x.js': 'module.exports = 1\n'
    },
    base: {
      status: 'PROVEN',
      unknowns: [],
      violations: []
    },
    annexb: [['m.js', 'f@3']],
    status: 'UNKNOWN'
  }
]

describe('SPEC0252 catalog — vN against the base, fixture by fixture (AB02, AB05)', () => {
  it('has the 43 recon fixtures, C01–C15 and the 16 D fixtures, with the Node 22 groups', () => {
    const count = (s, p) =>
      FIXTURES.filter(
        (f) => f.set === s && (p === undefined || f.positive === p)
      ).length
    expect(FIXTURES).toHaveLength(88)
    expect([count('X'), count('X', true)]).toEqual([14, 11])
    expect([
      count('recon'),
      count('recon', true),
      count('C'),
      count('C', true)
    ]).toEqual([43, 28, 15, 9])
    expect([count('D'), count('D', true)]).toEqual([16, 14])
    expect(new Set(FIXTURES.map((f) => f.id)).size).toBe(88)
  })
  it.each(FIXTURES.map((fx) => [fx.id, fx]))(
    '%s',
    (_, fx) => {
      const out = result(fx)
      expect(keys(tuples(out)), fx.id).toEqual(keys(expectedTuples(fx)))
      expect(annexb(out), fx.id).toEqual(expectedAnnexb(fx))
      expect(out.status, fx.id).toBe(fx.status)
      expect(keys(violations(out)), fx.id).toEqual(keys(fx.base.violations))
      expect(out.validation).toEqual({ valid: true })
      expect(out.phases.body).toBe('COMPLETED')
      if (fx.status !== 'PROVEN') expect(out.proofs).toEqual([])
    },
    TIMEOUT
  )
})

describe('SPEC0252 AB01/AB02 — no false PROVEN', () => {
  it('the base proved the 26 fixtures of AB01 and the 11 D false PROVEN; vN proves none and roots each in the declaration file', () => {
    expect(AB01).toHaveLength(26)
    expect(D_FALSE_PROVEN).toHaveLength(11)
    for (const id of [...AB01, ...D_FALSE_PROVEN]) {
      const fx = byId(id)
      expect(fx.positive, id).toBe(true)
      expect(fx.base.status, id).toBe('PROVEN')
      const out = result(fx)
      expect(out.status, id).toBe('UNKNOWN')
      const file = Object.keys(fx.files).find((f) => /^m\.[cm]?[jt]s$/.test(f))
      expect(
        out.unknowns.some((u) => u.reason === ANNEXB && u.file === file),
        id
      ).toBe(true)
    }
  }, 600000)
  it('no positive is PROVEN in vN (the 37 of AB02, the 14 D and the 11 X positives)', () => {
    const positives = FIXTURES.filter((f) => f.positive)
    expect(positives.map((f) => f.id).sort()).toEqual(
      FIXTURES.filter(
        (f) =>
          (f.set === 'recon' && f.id.startsWith('P')) ||
          AB02_C.includes(f.id) ||
          (f.set === 'D' &&
            ![
              'D10-asi-string-then-paren',
              'D11-directive-after-comment-and-hashbang'
            ].includes(f.id)) ||
          (f.set === 'X' &&
            ![
              'X04-computed-key-return',
              'X05-computed-key-direct',
              'X12-class-computed-key-control'
            ].includes(f.id))
      )
        .map((f) => f.id)
        .sort()
    )
    expect(positives).toHaveLength(62)
    for (const fx of positives) {
      expect(result(fx).status, fx.id).not.toBe('PROVEN')
      expect(annexb(result(fx)).length, fx.id).toBeGreaterThan(0)
    }
  }, 600000)
  it('the exact details named by the SPEC (AB02)', () => {
    const named = {
      'P06-switch-case': ['m.js:f@4'],
      'P16-special-undefined': ['m.js:undefined@1'],
      'P16b-special-undefined-indirect': ['m.js:undefined@2'],
      'P18-escape-no-conflict': ['m.js:g@1'],
      'P19-wrapper-param-require': ['m.js:require@1'],
      'P21-nested-iffalse-shadows-const': ['m.js:flag@5'],
      'P22-nested-read-before-block': ['m.js:flag@5'],
      'P23-nested-iffalse-undefined-primitive': ['m.js:mode@5'],
      'N05-no-conflict': ['m.js:g@2'],
      'N09-const-intermediate-block': ['m.js:f@4'],
      'N10-require-nested-fn': ['m.js:require@2'],
      'N11-require-nested-literal-nocall': ['m.js:require@2'],
      'N12-require-nested-param-nocall': ['m.js:require@2'],
      'C01-own-strict-body': ['m.js:f@2'],
      'C02-sibling-strict-function': ['m.js:f@3'],
      'C03-sloppy-arrow': ['m.js:f@3'],
      'C11-cts-sloppy': ['m.cts:f@2'],
      'C12-block-leading-use-strict': ['m.js:f@2'],
      'C13-expression-before-directive': ['m.js:f@4'],
      'C14-template-use-strict': ['m.js:f@3'],
      'C15-late-use-strict-in-function': ['m.js:f@4'],
      'D04-ts-sloppy': ['m.ts:f@2']
    }
    for (const [id, details] of Object.entries(named)) {
      expect(expectedAnnexb(byId(id)), id).toEqual(details)
      expect(annexb(result(byId(id))), id).toEqual(details)
    }
  }, 600000)
})

describe('SPEC0252 code review r1 — computed names and nested block functions (M1, O2)', () => {
  it('a block function in the computed name of a strict object-literal method is sloppy outer code', () => {
    for (const id of X_FALSE_PROVEN) {
      const fx = byId(id)
      expect(fx.positive, id).toBe(true)
      expect(fx.base.status, id).toBe('PROVEN')
      expect(result(fx).status, id).toBe('UNKNOWN')
    }
    for (const id of [
      'X01-computed-key-arrow',
      'X02-computed-key-fnexpr',
      'X03-computed-key-getter',
      'X06-computed-key-call',
      'X07-computed-key-call-fnexpr',
      'X09-computed-key-getter-call',
      'X10-computed-key-nested-fn',
      'X11-computed-key-async-method'
    ])
      expect(annexb(result(byId(id))).length, id).toBe(1)
  }, 600000)
  it('a class computed name is strict (all parts of a class); a nested block function counts by its own enclosing function body', () => {
    expect(byId('X12-class-computed-key-control').positive).toBe(false)
    expect(annexb(result(byId('X12-class-computed-key-control')))).toEqual([])
    expect(annexb(result(byId('X13-nested-block-functions')))).toEqual([
      'm.js:f@3',
      'm.js:g@4'
    ])
    expect(annexb(result(byId('X14-nested-in-strict-block-function')))).toEqual(
      ['m.js:f@3']
    )
  }, 600000)
})

describe('SPEC0252 AB03 — strict code and the other negatives', () => {
  it('strict negatives keep PROVEN without the tuple', () => {
    for (const id of STRICT) {
      const fx = byId(id)
      expect(fx.positive, id).toBe(false)
      expect(fx.base.status, id).toBe('PROVEN')
      expect(result(fx).status, id).toBe('PROVEN')
      expect(annexb(result(fx)), id).toEqual([])
    }
  }, 600000)
  it('a class (body or extends) gives no tuple; C08 stays PROVEN; generator and async in a block get the tuple', () => {
    for (const id of ['N04-class', 'C06-class-heritage'])
      expect(annexb(result(byId(id))), id).toEqual([])
    expect(result(byId('C08-sloppy-no-block-function')).status).toBe('PROVEN')
    expect(annexb(result(byId('C08-sloppy-no-block-function')))).toEqual([])
    for (const id of ['C04-generator-in-block', 'C05-async-in-block']) {
      expect(byId(id).base.status, id).toBe('UNKNOWN')
      expect(result(byId(id)).status, id).toBe('UNKNOWN')
      expect(annexb(result(byId(id))), id).toEqual(['m.js:f@2'])
    }
  }, 600000)
})

describe('SPEC0252 AB04 — the declared cost, exactly', () => {
  it('only N05–N09 lose a correct PROVEN; no fixture gains PROVEN', () => {
    const lost = FIXTURES.filter(
      (f) => f.base.status === 'PROVEN' && result(f).status !== 'PROVEN'
    ).map((f) => f.id)
    expect(lost.filter((id) => SPEC_SETS.has(byId(id).set)).sort()).toEqual(
      [...AB01, ...D_FALSE_PROVEN, ...COST].sort()
    )
    expect(lost.filter((id) => byId(id).set === 'X').sort()).toEqual(
      X_FALSE_PROVEN
    )
    expect(lost.filter((id) => !byId(id).positive).sort()).toEqual(COST)
    for (const fx of FIXTURES)
      if (result(fx).status === 'PROVEN')
        expect(fx.base.status, fx.id).toBe('PROVEN')
  }, 600000)
})

describe('SPEC0252 AB05 — only the new tuple is added', () => {
  it('without the new tuple, every fixture keeps the base tuples and violations (multiset)', () => {
    for (const fx of FIXTURES) {
      const out = result(fx)
      const rest = tuples(out).filter((t) => t[0] !== ANNEXB)
      expect(keys(rest), fx.id).toEqual(keys(fx.base.unknowns))
      expect(minus(tuples(out), rest).every((t) => t[0] === ANNEXB)).toBe(true)
      expect(keys(violations(out)), fx.id).toEqual(keys(fx.base.violations))
    }
  }, 600000)
  it('P16, P19, N10 and N11 keep their violation', () => {
    for (const id of [
      'P16-special-undefined',
      'P19-wrapper-param-require',
      'N10-require-nested-fn',
      'N11-require-nested-literal-nocall'
    ]) {
      expect(byId(id).base.status, id).toBe('VIOLATION')
      expect(result(byId(id)).status, id).toBe('VIOLATION')
      expect(violations(result(byId(id))), id).toEqual(byId(id).base.violations)
    }
  }, 600000)
})

describe('SPEC0252 AB06 — controls of the predicate itself', () => {
  it('braceless if/else, case, labelled, catch, loop, object method, late, escaped and parenthesized directive are caught', () => {
    const caught = {
      'P03-if-true-no-braces': ['m.js:f@2'],
      'P26-else-no-braces': ['m.js:f@2'],
      'P06-switch-case': ['m.js:f@4'],
      'P07-labelled-block': ['m.js:f@2'],
      'P08-labelled-function': ['m.js:f@2'],
      'P10-catch-block': ['m.js:f@2'],
      'P11-loop-block': ['m.js:f@2'],
      'P24-object-method-sloppy': ['m.js:f@2'],
      'P17-late-use-strict': ['m.js:f@3'],
      'P20-escaped-use-strict': ['m.js:f@3'],
      'P27-parenthesized-directive': ['m.js:f@3']
    }
    for (const [id, details] of Object.entries(caught))
      expect(annexb(result(byId(id))), id).toEqual(details)
  }, 600000)
  it('a function at the top of the file or of a function body is not caught', () => {
    const fx = byId('C08-sloppy-no-block-function')
    expect(fx.files['m.js']).toMatch(/^function /)
    expect(annexb(result(fx))).toEqual([])
  }, 600000)
  it('the refusal census emits the same tuples', () => {
    for (const fx of FIXTURES)
      expect(annexb(census(fx)), fx.id).toEqual(expectedAnnexb(fx))
  }, 1200000)
})

// §5.2 and build note R3-O2: one directive-prologue helper for the file and
// for a function body, tested in a table through the analysis. Each row is
// placed at the file level, at the function-body level, in the block of the
// declaration (never a prologue) and in the declaration's own body (never
// counts). Expected strictness is the ECMAScript directive prologue; every row
// was run in Node 22.23.2 real (evidence prologue-table.json of the BUILD).
const ENTRY =
  "const m = require('./m.js')\nm('./products/x.js')\nmodule.exports = 1\n"
const PROLOGUE = [
  ['single quotes', ["'use strict'"], true],
  ['double quotes', ['"use strict"'], true],
  ['second directive', ["'a'", "'use strict'"], true],
  ['explicit semicolon', ["'use strict';"], true],
  ['comment before', ["/* c */ 'use strict'"], true],
  ['followed by ;(0)', ["'use strict'", ';(0)'], true],
  ['empty statement before', [';', "'use strict'"], false],
  ['expression before', ['0', "'use strict'"], false],
  ['declaration before', ['var z = 0', "'use strict'"], false],
  ['escape', ["'use\\x20strict'"], false],
  ['parentheses', ["('use strict')"], false],
  ['template', ['`use strict`'], false],
  ['string plus', ["'use strict' + ''"], false],
  ['string equality', ["'use strict' === 0"], false],
  ['string conditional', ["'use strict' ? 0 : 1"], false],
  ['string property', ["'use strict'.length"], false],
  ['string comma', ["'use strict', 0"], false],
  ['string or', ["'use strict' || 0"], false],
  ['other case', ["'Use strict'"], false],
  ['extra space', ["'use  strict'"], false],
  ['trailing space', ["'use strict '"], false],
  ['leading space', ["' use strict'"], false],
  ['semicolon inside the quotes', ["'use strict;'"], false],
  ['prefix', ["'not use strict'"], false]
]
const LEVELS = {
  file: (p) =>
    [
      ...p,
      'function f() { return 1 }',
      '{ function f(s) { return require(s) } }',
      'module.exports = f'
    ].join('\n') + '\n',
  function: (p) =>
    [
      'function g() {',
      ...p,
      'function f() { return 1 }',
      '{ function f(s) { return require(s) } }',
      'return f',
      '}',
      'module.exports = g()'
    ].join('\n') + '\n',
  block: (p) =>
    [
      'function f() { return 1 }',
      '{',
      ...p,
      'function f(s) { return require(s) }',
      '}',
      'module.exports = f'
    ].join('\n') + '\n',
  own: (p) =>
    [
      'function f() { return 1 }',
      '{ function f(s) {',
      ...p,
      'return require(s) } }',
      'module.exports = f'
    ].join('\n') + '\n'
}
const prologueRows = Object.entries(LEVELS).flatMap(([level, text]) =>
  PROLOGUE.filter(
    ([, , strict]) => strict || level === 'file' || level === 'function'
  ).map(([name, lines, strict]) => {
    const m = text(lines)
    const line = m.split('\n').findIndex((l) => l.includes('function f(s)')) + 1
    return [
      level + ': ' + name,
      { m, strict: strict && (level === 'file' || level === 'function'), line }
    ]
  })
)

describe('SPEC0252 §5.2 — directive prologue table, file and function-body levels', () => {
  it('has the rows of the table', () => {
    expect(prologueRows).toHaveLength(24 * 2 + 6 * 2)
  })
  it.each(prologueRows)(
    '%s',
    (name, row) => {
      const out = cleanCall({
        input: physical({
          files: {
            'package.json': '{}',
            'entry.js': ENTRY,
            'm.js': row.m,
            'products/x.js': 'module.exports = 1\n'
          },
          start: 'entry.js'
        })
      })
      expect(out.validation, name).toEqual({ valid: true })
      if (row.strict) {
        expect(annexb(out), name).toEqual([])
        expect(out.status, name).toBe('PROVEN')
      } else {
        expect(annexb(out), name).toEqual(['m.js:f@' + row.line])
        expect(out.status, name).not.toBe('PROVEN')
      }
    },
    TIMEOUT
  )
})

describe('SPEC0252 §5.5 — version and limits', () => {
  it(
    'publishes the new kernel version',
    () => {
      expect(cleanCall({ version: true })).toBe(KERNEL)
      expect(result(byId('P01-block')).kernelVersion).toBe(KERNEL)
    },
    TIMEOUT
  )
  it(
    'keeps the SPEC0242 limits',
    () => {
      expect(result(byId('P01-block')).limits).toEqual(LIMITS)
    },
    TIMEOUT
  )
})
