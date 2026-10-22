// SPEC0247 — CJS export value in the B6 kernel. C0: closed syntactic
// categories of the CommonJS wrapper handles give one UNKNOWN_CJS_EXPORTS root
// per category in the module and U to every importer (first load and cache);
// C1: the tracked value starts as the opaque `exports` object of the module;
// C2: after an undecided `if` the tracked value is the union of the branches;
// C3: checkExport keeps running on the tracked value. The catalog is the 71
// fixtures of the SPEC unit plus T1, T2, T2b, T3 and Q3 of its R2 review. Each
// fixture carries the base (kernel v6) status, tuples and violations, and the
// tuples that disappear or appear in vN, by cause (§3.6). Physical fixtures,
// analysed by a clean pinned Node22 caller (the real API declines the Vitest
// profile), as in the 0236/0244/0245 suites. Targets never execute.
import { describe, it, expect } from 'vitest'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { pinnedToolchainLocation } from '../scripts/boundary-installed-identity.mjs'
import { ownedRunParent } from './support/owned-run-parent.mjs'

const parent = ownedRunParent('b6-0247-cjs')
const pinnedNode = pinnedToolchainLocation().node
const enginePath = path.resolve('scripts/boundary-semantic-engine.mjs')
const KERNEL = 'semantic-kernel-v8-annexb-block-function'
const TIMEOUT = 60000
// SPEC0242 limits, unchanged (MC07).
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
// §3.6 rule 2: closed list of the new roots at the point of use.
const CLOSED = new Set([
  'UNKNOWN_CJS_EXPORTS',
  'UNKNOWN_BINDING_VALUE',
  'UNKNOWN_CALL',
  'UNKNOWN_PROPERTY',
  'UNKNOWN_OPERATOR',
  'UNKNOWN_TEMPLATE',
  'UNKNOWN_RESOLUTION',
  'UNKNOWN_REFLECTION',
  'UNKNOWN_OBJECT',
  'UNKNOWN_EXPORT'
])
const CAUSES = new Set(['C0', 'C1', 'C2', 'C1+C2'])
// §3.6 rule 3: every violation of the base that vN loses, with its class.
const LOST = {
  'X01-true-violation-call': 'TRUE_CARRIED_BY_C0_U',
  'X02-true-violation-specifier': 'TRUE_CARRIED_BY_C0_U',
  'X03-false-violation-void': 'FALSE_IN_RUNTIME',
  'V-S10-last-branch': 'FALSE_IN_RUNTIME',
  'V-F3-late-require': 'FALSE_IN_RUNTIME',
  'T2-true-violation-opaque': 'TRUE_CARRIED_BY_C1_OPAQUE',
  'T2b-true-violation-union': 'TRUE_CARRIED_BY_C2_UNION'
}
// §3.6 rule 3: a new violation only from code that a cause reaches (R2 T3).
const NEW_VIOLATIONS = { 'T3-new-true-violation-join': 'C2' }
const F3_FAMILY = [
  'F3',
  'F3-arrow',
  'F3-declaration',
  'F3-returned',
  'X10-escaped-identifier',
  'X11-ts-cjs-function-write'
]
const S10_FAMILY = [
  'S10',
  'S10-no-else',
  'S10-nested',
  'J-two-functions',
  'X18-nested-decided-inner',
  'Y01-else-if',
  'Y05-cts'
]
const INIT_FAMILY = [
  'INIT-conditional',
  'INIT-not',
  'INIT-if',
  'INIT-equality',
  'X06-two-opaque-equal'
]

function cleanCall(request) {
  const code =
    'const fs=require("node:fs"); const e=require(process.argv[1]); const r=JSON.parse(fs.readFileSync(0,"utf8")); if (r.version) process.stdout.write(JSON.stringify(e.SEMANTIC_KERNEL_VERSION)); else { for (const o of r.input.origins) o.id=e.semanticOriginId(o); process.stdout.write(JSON.stringify(r.census ? e.analyzeSemanticBoundary(r.input,{refusalCensus:true}) : e.runSemanticBoundary(r.input))); }'
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
function physical(fx) {
  const root = fs.mkdtempSync(path.join(parent, 'physical-'))
  const files = { 'package.json': '{}', ...fx.files }
  for (const [file, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    fs.writeFileSync(path.join(root, file), body)
  }
  // Lexical origins of the fixture (K7 obligations), as the SPEC unit probe.
  const origins = fx.origins.map(([file, text]) => {
    const start = files[file].indexOf(text)
    return {
      file,
      fileSha256: crypto.createHash('sha256').update(files[file]).digest('hex'),
      kind: 'CallExpression',
      start,
      end: start + text.length,
      reason: 'NON_LITERAL_MODULE_REFERENCE',
      ordinal: 0,
      expression: text
    }
  })
  return {
    root,
    starts: ['entry.js'],
    origins,
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
const byId = (id) => FIXTURES.find((f) => f.id === id)
const group = (g) => FIXTURES.filter((f) => f.group === g)
const tuples = (out) => out.unknowns.map((u) => [u.reason, u.file, u.detail])
const violations = (out) =>
  out.violations.map((v) => [v.reason, v.file, v.target ?? null])
const keys = (list) => list.map((x) => JSON.stringify(x)).sort()
function minus(a, b) {
  const rest = keys(b)
  return a.filter((x) => {
    const i = rest.indexOf(JSON.stringify(x))
    if (i < 0) return true
    rest.splice(i, 1)
    return false
  })
}
const has = (out, file, reason, detail = '') =>
  out.unknowns.some(
    (u) => u.file === file && u.reason === reason && u.detail === detail
  )
const cjsTuples = (fx) =>
  fx.cjs.map(([file, category]) => ['UNKNOWN_CJS_EXPORTS', file, category])
const expectedTuples = (fx) => [
  ...minus(fx.base.unknowns, fx.gone),
  ...cjsTuples(fx),
  ...fx.added,
  ...(fx.reached?.tuples ?? [])
]

const FIXTURES = [
  {
    id: 'F3',
    group: 'A',
    files: {
      'entry.js': "const m = require('./m.js')\nmodule.exports = 1\n",
      'm.js':
        'module.exports = function f() { module.exports = function g(x) { return import(x) } }\n'
    },
    origins: [['m.js', 'import(x)']],
    base: { status: 'PROVEN', unknowns: [], violations: [] },
    gone: [],
    cjs: [['m.js', 'FUNCTION_BODY_WRITE']],
    added: [],
    reached: null,
    status: 'UNKNOWN',
    violations: []
  },
  {
    id: 'S10',
    group: 'A',
    files: {
      'entry.js': "const m = require('./m.js')\nmodule.exports = 1\n",
      'm.js':
        'if ({}) module.exports = function g(x) { return import(x) }\nelse module.exports = 1'
    },
    origins: [['m.js', 'import(x)']],
    base: { status: 'PROVEN', unknowns: [], violations: [] },
    gone: [],
    cjs: [],
    added: [
      ['UNKNOWN_BINDING_VALUE', 'm.js', 'x'],
      ['UNKNOWN_EXPORT', 'm.js', ''],
      ['UNKNOWN_RESOLUTION', 'm.js', '']
    ],
    reached: {
      cause: 'C2',
      tuples: [['UNKNOWN_DYNAMIC_IMPORT_PROMISE', 'm.js', '']]
    },
    status: 'UNKNOWN',
    violations: []
  },
  {
    id: 'S10-no-else',
    group: 'A',
    files: {
      'entry.js': "const m = require('./m.js')\nmodule.exports = 1\n",
      'm.js':
        'module.exports = function g(x) { return import(x) }\nif ({}) module.exports = 1\n'
    },
    origins: [['m.js', 'import(x)']],
    base: { status: 'PROVEN', unknowns: [], violations: [] },
    gone: [],
    cjs: [],
    added: [
      ['UNKNOWN_BINDING_VALUE', 'm.js', 'x'],
      ['UNKNOWN_EXPORT', 'm.js', ''],
      ['UNKNOWN_RESOLUTION', 'm.js', '']
    ],
    reached: {
      cause: 'C2',
      tuples: [['UNKNOWN_DYNAMIC_IMPORT_PROMISE', 'm.js', '']]
    },
    status: 'UNKNOWN',
    violations: []
  },
  {
    id: 'S10-nested',
    group: 'A',
    files: {
      'entry.js': "const m = require('./m.js')\nmodule.exports = 1\n",
      'm.js':
        'if ({}) {\n  if ({}) module.exports = function g(x) { return import(x) }\n  else module.exports = 2\n} else module.exports = 1\n'
    },
    origins: [['m.js', 'import(x)']],
    base: { status: 'PROVEN', unknowns: [], violations: [] },
    gone: [],
    cjs: [],
    added: [
      ['UNKNOWN_BINDING_VALUE', 'm.js', 'x'],
      ['UNKNOWN_EXPORT', 'm.js', ''],
      ['UNKNOWN_RESOLUTION', 'm.js', '']
    ],
    reached: {
      cause: 'C2',
      tuples: [['UNKNOWN_DYNAMIC_IMPORT_PROMISE', 'm.js', '']]
    },
    status: 'UNKNOWN',
    violations: []
  },
  {
    id: 'F3-arrow',
    group: 'A',
    files: {
      'entry.js': "const m = require('./m.js')\nmodule.exports = 1\n",
      'm.js':
        'module.exports = () => {\n  module.exports = function g(x) { return import(x) }\n}\n'
    },
    origins: [['m.js', 'import(x)']],
    base: { status: 'PROVEN', unknowns: [], violations: [] },
    gone: [],
    cjs: [['m.js', 'FUNCTION_BODY_WRITE']],
    added: [],
    reached: null,
    status: 'UNKNOWN',
    violations: []
  },
  {
    id: 'F3-declaration',
    group: 'A',
    files: {
      'entry.js': "const m = require('./m.js')\nmodule.exports = 1\n",
      'm.js':
        'function f() {\n  module.exports = function g(x) { return import(x) }\n}\nmodule.exports = f\n'
    },
    origins: [['m.js', 'import(x)']],
    base: { status: 'PROVEN', unknowns: [], violations: [] },
    gone: [],
    cjs: [['m.js', 'FUNCTION_BODY_WRITE']],
    added: [],
    reached: null,
    status: 'UNKNOWN',
    violations: []
  },
  {
    id: 'F3-returned',
    group: 'A',
    files: {
      'entry.js': "const m = require('./m.js')\nmodule.exports = 1\n",
      'm.js':
        'module.exports = function f() {\n  return function h() {\n    module.exports = function g(x) { return import(x) }\n  }\n}\n'
    },
    origins: [['m.js', 'import(x)']],
    base: { status: 'PROVEN', unknowns: [], violations: [] },
    gone: [],
    cjs: [['m.js', 'FUNCTION_BODY_WRITE']],
    added: [],
    reached: null,
    status: 'UNKNOWN',
    violations: []
  },
  {
    id: 'INIT-conditional',
    group: 'A',
    files: {
      'entry.js':
        "const m = require('./m.js')\nmodule.exports = m ? function g(x) { return import(x) } : 1\n",
      'm.js': "'use strict'\n"
    },
    origins: [['entry.js', 'import(x)']],
    base: { status: 'PROVEN', unknowns: [], violations: [] },
    gone: [],
    cjs: [],
    added: [
      ['UNKNOWN_BINDING_VALUE', 'entry.js', 'x'],
      ['UNKNOWN_EXPORT', 'entry.js', ''],
      ['UNKNOWN_RESOLUTION', 'entry.js', '']
    ],
    reached: {
      cause: 'C1',
      tuples: [['UNKNOWN_DYNAMIC_IMPORT_PROMISE', 'entry.js', '']]
    },
    status: 'UNKNOWN',
    violations: []
  },
  {
    id: 'INIT-not',
    group: 'A',
    files: {
      'entry.js':
        "const m = require('./m.js')\nmodule.exports = !m ? 1 : function g(x) { return import(x) }\n",
      'm.js': "'use strict'\n"
    },
    origins: [['entry.js', 'import(x)']],
    base: { status: 'PROVEN', unknowns: [], violations: [] },
    gone: [],
    cjs: [],
    added: [
      ['UNKNOWN_BINDING_VALUE', 'entry.js', 'x'],
      ['UNKNOWN_EXPORT', 'entry.js', ''],
      ['UNKNOWN_OPERATOR', 'entry.js', ''],
      ['UNKNOWN_RESOLUTION', 'entry.js', '']
    ],
    reached: {
      cause: 'C1',
      tuples: [['UNKNOWN_DYNAMIC_IMPORT_PROMISE', 'entry.js', '']]
    },
    status: 'UNKNOWN',
    violations: []
  },
  {
    id: 'INIT-if',
    group: 'A',
    files: {
      'entry.js':
        "const m = require('./m.js')\nif (m) module.exports = function g(x) { return import(x) }\nelse module.exports = 1\n",
      'm.js': "'use strict'\n"
    },
    origins: [['entry.js', 'import(x)']],
    base: { status: 'PROVEN', unknowns: [], violations: [] },
    gone: [],
    cjs: [],
    added: [
      ['UNKNOWN_BINDING_VALUE', 'entry.js', 'x'],
      ['UNKNOWN_EXPORT', 'entry.js', ''],
      ['UNKNOWN_RESOLUTION', 'entry.js', '']
    ],
    reached: {
      cause: 'C1',
      tuples: [['UNKNOWN_DYNAMIC_IMPORT_PROMISE', 'entry.js', '']]
    },
    status: 'UNKNOWN',
    violations: []
  },
  {
    id: 'INIT-equality',
    group: 'A',
    files: {
      'entry.js':
        "const m = require('./m.js')\nmodule.exports = m === undefined ? 1 : function g(x) { return import(x) }\n",
      'm.js': "'use strict'\n"
    },
    origins: [['entry.js', 'import(x)']],
    base: { status: 'PROVEN', unknowns: [], violations: [] },
    gone: [],
    cjs: [],
    added: [
      ['UNKNOWN_BINDING_VALUE', 'entry.js', 'x'],
      ['UNKNOWN_EXPORT', 'entry.js', ''],
      ['UNKNOWN_OPERATOR', 'entry.js', ''],
      ['UNKNOWN_RESOLUTION', 'entry.js', '']
    ],
    reached: {
      cause: 'C1',
      tuples: [['UNKNOWN_DYNAMIC_IMPORT_PROMISE', 'entry.js', '']]
    },
    status: 'UNKNOWN',
    violations: []
  },
  {
    id: 'E-function',
    group: 'B',
    files: {
      'entry.js': "const m = require('./m.js')\nmodule.exports = 1\n",
      'm.js':
        'module.exports = function f() {\n  exports.y = function g(x) { return import(x) }\n}\n'
    },
    origins: [['m.js', 'import(x)']],
    base: {
      status: 'UNKNOWN',
      unknowns: [['UNKNOWN_MUTATION', 'm.js', '']],
      violations: []
    },
    gone: [],
    cjs: [['m.js', 'EXPORTS_REFERENCE']],
    added: [],
    reached: null,
    status: 'UNKNOWN',
    violations: []
  },
  {
    id: 'E-top',
    group: 'B',
    files: {
      'entry.js': "const m = require('./m.js')\nmodule.exports = 1\n",
      'm.js': 'exports.y = function g(x) { return import(x) }\n'
    },
    origins: [['m.js', 'import(x)']],
    base: {
      status: 'UNKNOWN',
      unknowns: [['UNKNOWN_MUTATION', 'm.js', '']],
      violations: []
    },
    gone: [],
    cjs: [['m.js', 'EXPORTS_REFERENCE']],
    added: [],
    reached: null,
    status: 'UNKNOWN',
    violations: []
  },
  {
    id: 'E-rebind',
    group: 'B',
    files: {
      'entry.js': "const m = require('./m.js')\nmodule.exports = 1\n",
      'm.js': 'exports = function g(x) { return import(x) }\n'
    },
    origins: [['m.js', 'import(x)']],
    base: {
      status: 'UNKNOWN',
      unknowns: [['UNKNOWN_MUTATION', 'm.js', '']],
      violations: []
    },
    gone: [],
    cjs: [['m.js', 'EXPORTS_REFERENCE']],
    added: [],
    reached: null,
    status: 'UNKNOWN',
    violations: []
  },
  {
    id: 'MX-property',
    group: 'B',
    files: {
      'entry.js': "const m = require('./m.js')\nmodule.exports = 1\n",
      'm.js': 'module.exports.y = function g(x) { return import(x) }\n'
    },
    origins: [['m.js', 'import(x)']],
    base: {
      status: 'UNKNOWN',
      unknowns: [['UNKNOWN_MUTATION', 'm.js', '']],
      violations: []
    },
    gone: [],
    cjs: [['m.js', 'MODULE_REFERENCE']],
    added: [],
    reached: null,
    status: 'UNKNOWN',
    violations: []
  },
  {
    id: 'MX-element',
    group: 'B',
    files: {
      'entry.js': "const m = require('./m.js')\nmodule.exports = 1\n",
      'm.js': "module['exports'] = function g(x) { return import(x) }\n"
    },
    origins: [['m.js', 'import(x)']],
    base: {
      status: 'UNKNOWN',
      unknowns: [['UNKNOWN_MUTATION', 'm.js', '']],
      violations: []
    },
    gone: [],
    cjs: [['m.js', 'MODULE_REFERENCE']],
    added: [],
    reached: null,
    status: 'UNKNOWN',
    violations: []
  },
  {
    id: 'MX-nested-expression',
    group: 'B',
    files: {
      'entry.js': "const m = require('./m.js')\nmodule.exports = 1\n",
      'm.js':
        'const a = (module.exports = function g(x) { return import(x) })\n'
    },
    origins: [['m.js', 'import(x)']],
    base: {
      status: 'UNKNOWN',
      unknowns: [['UNKNOWN_MUTATION', 'm.js', '']],
      violations: []
    },
    gone: [],
    cjs: [['m.js', 'MODULE_REFERENCE']],
    added: [],
    reached: null,
    status: 'UNKNOWN',
    violations: []
  },
  {
    id: 'THIS-top',
    group: 'B',
    files: {
      'entry.js': "const m = require('./m.js')\nmodule.exports = 1\n",
      'm.js': 'this.y = function g(x) { return import(x) }\n'
    },
    origins: [['m.js', 'import(x)']],
    base: {
      status: 'UNKNOWN',
      unknowns: [['UNKNOWN_MUTATION', 'm.js', '']],
      violations: []
    },
    gone: [],
    cjs: [['m.js', 'TOP_LEVEL_THIS']],
    added: [],
    reached: null,
    status: 'UNKNOWN',
    violations: []
  },
  {
    id: 'DP-top',
    group: 'B',
    files: {
      'entry.js': "const m = require('./m.js')\nmodule.exports = 1\n",
      'm.js':
        "Object.defineProperty(module, 'exports', { value: function g(x) { return import(x) } })\n"
    },
    origins: [['m.js', 'import(x)']],
    base: {
      status: 'UNKNOWN',
      unknowns: [
        ['UNKNOWN_BINDING', 'm.js', 'module'],
        ['UNKNOWN_CALL', 'm.js', ''],
        ['UNKNOWN_PROPERTY', 'm.js', '']
      ],
      violations: []
    },
    gone: [],
    cjs: [['m.js', 'MODULE_REFERENCE']],
    added: [],
    reached: null,
    status: 'UNKNOWN',
    violations: []
  },
  {
    id: 'DP-function',
    group: 'B',
    files: {
      'entry.js': "const m = require('./m.js')\nmodule.exports = 1\n",
      'm.js':
        "module.exports = function f() {\n  Object.defineProperty(module, 'exports', { value: function g(x) { return import(x) } })\n}\n"
    },
    origins: [['m.js', 'import(x)']],
    base: {
      status: 'UNKNOWN',
      unknowns: [
        ['UNKNOWN_BINDING', 'm.js', 'module'],
        ['UNKNOWN_CALL', 'm.js', ''],
        ['UNKNOWN_PROPERTY', 'm.js', '']
      ],
      violations: []
    },
    gone: [],
    cjs: [['m.js', 'MODULE_REFERENCE']],
    added: [],
    reached: null,
    status: 'UNKNOWN',
    violations: []
  },
  {
    id: 'RD-before',
    group: 'B',
    files: {
      'entry.js': "const m = require('./m.js')\nmodule.exports = 1\n",
      'm.js': 'const before = module.exports\nmodule.exports = 1\n'
    },
    origins: [],
    base: {
      status: 'UNKNOWN',
      unknowns: [
        ['UNKNOWN_BINDING', 'm.js', 'module'],
        ['UNKNOWN_PROPERTY', 'm.js', '']
      ],
      violations: []
    },
    gone: [],
    cjs: [['m.js', 'MODULE_REFERENCE']],
    added: [],
    reached: null,
    status: 'UNKNOWN',
    violations: []
  },
  {
    id: 'RD-function',
    group: 'B',
    files: {
      'entry.js': "const m = require('./m.js')\nmodule.exports = 1\n",
      'm.js': 'module.exports = function f() { return module.exports }\n'
    },
    origins: [],
    base: {
      status: 'UNKNOWN',
      unknowns: [
        ['UNKNOWN_BINDING', 'm.js', 'module'],
        ['UNKNOWN_EXPORT', 'm.js', ''],
        ['UNKNOWN_PROPERTY', 'm.js', '']
      ],
      violations: []
    },
    gone: [],
    cjs: [['m.js', 'MODULE_REFERENCE']],
    added: [],
    reached: null,
    status: 'UNKNOWN',
    violations: []
  },
  {
    id: 'TERNARY',
    group: 'B',
    files: {
      'entry.js': "const m = require('./m.js')\nmodule.exports = 1\n",
      'm.js': 'module.exports = {} ? function g(x) { return import(x) } : 1\n'
    },
    origins: [['m.js', 'import(x)']],
    base: {
      status: 'UNKNOWN',
      unknowns: [
        ['UNKNOWN_BINDING_VALUE', 'm.js', 'x'],
        ['UNKNOWN_DYNAMIC_IMPORT_PROMISE', 'm.js', ''],
        ['UNKNOWN_EXPORT', 'm.js', ''],
        ['UNKNOWN_RESOLUTION', 'm.js', '']
      ],
      violations: []
    },
    gone: [],
    cjs: [],
    added: [],
    reached: null,
    status: 'UNKNOWN',
    violations: []
  },
  {
    id: 'INIT-CALL',
    group: 'B',
    files: {
      'entry.js': "const m = require('./m.js')\nmodule.exports = 1\n",
      'm.js':
        'function init() {\n  module.exports = function g(x) { return import(x) }\n}\ninit()\n'
    },
    origins: [['m.js', 'import(x)']],
    base: {
      status: 'UNKNOWN',
      unknowns: [
        ['UNKNOWN_BINDING_VALUE', 'm.js', 'x'],
        ['UNKNOWN_DYNAMIC_IMPORT_PROMISE', 'm.js', ''],
        ['UNKNOWN_EXPORT', 'm.js', ''],
        ['UNKNOWN_RESOLUTION', 'm.js', '']
      ],
      violations: []
    },
    gone: [],
    cjs: [['m.js', 'FUNCTION_BODY_WRITE']],
    added: [],
    reached: null,
    status: 'UNKNOWN',
    violations: []
  },
  {
    id: 'P-sequence',
    group: 'C',
    files: {
      'entry.js': "const m = require('./m.js')\nmodule.exports = 1\n",
      'm.js':
        'module.exports = function g(x) { return import(x) }\nmodule.exports = 1\n'
    },
    origins: [['m.js', 'import(x)']],
    base: { status: 'PROVEN', unknowns: [], violations: [] },
    gone: [],
    cjs: [],
    added: [],
    reached: null,
    status: 'PROVEN',
    violations: []
  },
  {
    id: 'P-block',
    group: 'C',
    files: {
      'entry.js': "const m = require('./m.js')\nmodule.exports = 1\n",
      'm.js': '{\n  module.exports = 1\n}\n'
    },
    origins: [],
    base: { status: 'PROVEN', unknowns: [], violations: [] },
    gone: [],
    cjs: [],
    added: [],
    reached: null,
    status: 'PROVEN',
    violations: []
  },
  {
    id: 'P-decided',
    group: 'C',
    files: {
      'entry.js': "const m = require('./m.js')\nmodule.exports = 1\n",
      'm.js':
        'if (true) module.exports = 1\nelse module.exports = function g(x) { return import(x) }\n'
    },
    origins: [['m.js', 'import(x)']],
    base: { status: 'PROVEN', unknowns: [], violations: [] },
    gone: [],
    cjs: [],
    added: [],
    reached: null,
    status: 'PROVEN',
    violations: []
  },
  {
    id: 'P-join-benign',
    group: 'C',
    files: {
      'entry.js': "const m = require('./m.js')\nmodule.exports = 1\n",
      'm.js': 'if ({}) module.exports = 1\nelse module.exports = 2\n'
    },
    origins: [],
    base: { status: 'PROVEN', unknowns: [], violations: [] },
    gone: [],
    cjs: [],
    added: [],
    reached: null,
    status: 'PROVEN',
    violations: []
  },
  {
    id: 'P-dead-function',
    group: 'D',
    files: {
      'entry.js': "const m = require('./m.js')\nmodule.exports = 1\n",
      'm.js':
        'function never() {\n  module.exports = function g(x) { return import(x) }\n}\nmodule.exports = 1\n'
    },
    origins: [['m.js', 'import(x)']],
    base: { status: 'PROVEN', unknowns: [], violations: [] },
    gone: [],
    cjs: [['m.js', 'FUNCTION_BODY_WRITE']],
    added: [],
    reached: null,
    status: 'UNKNOWN',
    violations: []
  },
  {
    id: 'P-function-export',
    group: 'C',
    files: {
      'entry.js': "const m = require('./m.js')\nmodule.exports = 1\n",
      'm.js': 'module.exports = function f() { return 1 }\n'
    },
    origins: [],
    base: { status: 'PROVEN', unknowns: [], violations: [] },
    gone: [],
    cjs: [],
    added: [],
    reached: null,
    status: 'PROVEN',
    violations: []
  },
  {
    id: 'P-twice',
    group: 'C',
    files: {
      'entry.js':
        "const a = require('./m.js')\nconst b = require('./m.js')\nmodule.exports = 1\n",
      'm.js': 'module.exports = 1\n'
    },
    origins: [],
    base: { status: 'PROVEN', unknowns: [], violations: [] },
    gone: [],
    cjs: [],
    added: [],
    reached: null,
    status: 'PROVEN',
    violations: []
  },
  {
    id: 'C-function-benign',
    group: 'D',
    files: {
      'entry.js': "const m = require('./m.js')\nmodule.exports = 1\n",
      'm.js': 'module.exports = function f() { module.exports = 2 }\n'
    },
    origins: [],
    base: { status: 'PROVEN', unknowns: [], violations: [] },
    gone: [],
    cjs: [['m.js', 'FUNCTION_BODY_WRITE']],
    added: [],
    reached: null,
    status: 'UNKNOWN',
    violations: []
  },
  {
    id: 'C-init-call-benign',
    group: 'D',
    files: {
      'entry.js': "const m = require('./m.js')\nmodule.exports = 1\n",
      'm.js': 'function init() { module.exports = 1 }\ninit()\n'
    },
    origins: [],
    base: { status: 'PROVEN', unknowns: [], violations: [] },
    gone: [],
    cjs: [['m.js', 'FUNCTION_BODY_WRITE']],
    added: [],
    reached: null,
    status: 'UNKNOWN',
    violations: []
  },
  {
    id: 'C-side-effect-module',
    group: 'C',
    files: {
      'entry.js': "require('./m.js')\nmodule.exports = 1\n",
      'm.js': "'use strict'\n"
    },
    origins: [],
    base: { status: 'PROVEN', unknowns: [], violations: [] },
    gone: [],
    cjs: [],
    added: [],
    reached: null,
    status: 'PROVEN',
    violations: []
  },
  {
    id: 'D-shadowed-parameter',
    group: 'D',
    files: {
      'entry.js': "const m = require('./m.js')\nmodule.exports = 1\n",
      'm.js': 'function f(module) { module.exports = 1 }\nmodule.exports = 2\n'
    },
    origins: [],
    base: { status: 'PROVEN', unknowns: [], violations: [] },
    gone: [],
    cjs: [
      ['m.js', 'FUNCTION_BODY_WRITE'],
      ['m.js', 'MODULE_REFERENCE']
    ],
    added: [],
    reached: null,
    status: 'UNKNOWN',
    violations: []
  },
  {
    id: 'H-try',
    group: 'B',
    files: {
      'entry.js': "const m = require('./m.js')\nmodule.exports = 1\n",
      'm.js':
        'try {\n  module.exports = function g(x) { return import(x) }\n} catch (e) {}\n'
    },
    origins: [['m.js', 'import(x)']],
    base: {
      status: 'UNKNOWN',
      unknowns: [['UNKNOWN_UNSUPPORTED_SYNTAX', 'm.js', 'TryStatement']],
      violations: []
    },
    gone: [],
    cjs: [['m.js', 'REFUSED_CONTEXT_WRITE']],
    added: [],
    reached: null,
    status: 'UNKNOWN',
    violations: []
  },
  {
    id: 'H-arguments',
    group: 'B',
    files: {
      'entry.js': "const m = require('./m.js')\nmodule.exports = 1\n",
      'm.js': 'arguments[2].exports = function g(x) { return import(x) }\n'
    },
    origins: [['m.js', 'import(x)']],
    base: {
      status: 'UNKNOWN',
      unknowns: [['UNKNOWN_MUTATION', 'm.js', '']],
      violations: []
    },
    gone: [],
    cjs: [['m.js', 'TOP_LEVEL_ARGUMENTS']],
    added: [],
    reached: null,
    status: 'UNKNOWN',
    violations: []
  },
  {
    id: 'H-require-cache',
    group: 'B',
    files: {
      'entry.js': "const m = require('./m.js')\nmodule.exports = 1\n",
      'm.js':
        'require.cache[__filename].exports = function g(x) { return import(x) }\n'
    },
    origins: [['m.js', 'import(x)']],
    base: {
      status: 'UNKNOWN',
      unknowns: [['UNKNOWN_MUTATION', 'm.js', '']],
      violations: []
    },
    gone: [],
    cjs: [['m.js', 'LOADER_REFERENCE']],
    added: [],
    reached: null,
    status: 'UNKNOWN',
    violations: []
  },
  {
    id: 'H-eval',
    group: 'B',
    files: {
      'entry.js': "const m = require('./m.js')\nmodule.exports = 1\n",
      'm.js': "eval('module.exports = 1')\nmodule.exports = 2\n"
    },
    origins: [],
    base: {
      status: 'UNKNOWN',
      unknowns: [
        ['UNKNOWN_BINDING', 'm.js', 'eval'],
        ['UNKNOWN_CALL', 'm.js', '']
      ],
      violations: []
    },
    gone: [],
    cjs: [['m.js', 'EVAL_REFERENCE']],
    added: [],
    reached: null,
    status: 'UNKNOWN',
    violations: []
  },
  {
    id: 'H-escaped-callback',
    group: 'B',
    files: {
      'entry.js': "const m = require('./m.js')\nmodule.exports = 1\n",
      'm.js':
        'setTimeout(function () {\n  module.exports = function g(x) { return import(x) }\n}, 0)\nmodule.exports = 1\n'
    },
    origins: [['m.js', 'import(x)']],
    base: {
      status: 'UNKNOWN',
      unknowns: [
        ['UNKNOWN_BINDING', 'm.js', 'setTimeout'],
        ['UNKNOWN_CALL', 'm.js', '']
      ],
      violations: []
    },
    gone: [],
    cjs: [['m.js', 'FUNCTION_BODY_WRITE']],
    added: [],
    reached: null,
    status: 'UNKNOWN',
    violations: []
  },
  {
    id: 'H-top-return',
    group: 'B',
    files: {
      'entry.js':
        "const m = require('./m.js')\nmodule.exports = m ? function g(x) { return import(x) } : 1\n",
      'm.js': 'if ({}) return\nmodule.exports = 0\n'
    },
    origins: [['entry.js', 'import(x)']],
    base: {
      status: 'UNKNOWN',
      unknowns: [['UNKNOWN_PARTIAL_RETURN', 'm.js', '']],
      violations: []
    },
    gone: [],
    cjs: [['m.js', 'TOP_LEVEL_RETURN']],
    added: [
      ['UNKNOWN_BINDING_VALUE', 'entry.js', 'm'],
      ['UNKNOWN_BINDING_VALUE', 'entry.js', 'x'],
      ['UNKNOWN_EXPORT', 'entry.js', ''],
      ['UNKNOWN_RESOLUTION', 'entry.js', '']
    ],
    reached: {
      cause: 'C0',
      tuples: [['UNKNOWN_DYNAMIC_IMPORT_PROMISE', 'entry.js', '']]
    },
    status: 'UNKNOWN',
    violations: []
  },
  {
    id: 'J-two-functions',
    group: 'A',
    files: {
      'entry.js': "const m = require('./m.js')\nmodule.exports = 1\n",
      'm.js':
        'if ({}) module.exports = function g(x) { return import(x) }\nelse module.exports = function h() { return 1 }\n'
    },
    origins: [['m.js', 'import(x)']],
    base: { status: 'PROVEN', unknowns: [], violations: [] },
    gone: [],
    cjs: [],
    added: [
      ['UNKNOWN_BINDING_VALUE', 'm.js', 'x'],
      ['UNKNOWN_EXPORT', 'm.js', ''],
      ['UNKNOWN_RESOLUTION', 'm.js', '']
    ],
    reached: {
      cause: 'C2',
      tuples: [['UNKNOWN_DYNAMIC_IMPORT_PROMISE', 'm.js', '']]
    },
    status: 'UNKNOWN',
    violations: []
  },
  {
    id: 'ESM-unaffected',
    group: 'B',
    files: {
      'package.json': '{"type":"module"}',
      'entry.js': "import './m.js'\nexport const v = 1\n",
      'm.js': 'module.exports = 1\n'
    },
    origins: [],
    base: {
      status: 'UNKNOWN',
      unknowns: [['UNKNOWN_MUTATION', 'm.js', '']],
      violations: []
    },
    gone: [],
    cjs: [],
    added: [],
    reached: null,
    status: 'UNKNOWN',
    violations: []
  },
  {
    id: 'X04-computed-arguments',
    group: 'B',
    files: {
      'entry.js': "const m = require('./m.js')\nmodule.exports = 1\n",
      'm.js':
        'module.exports = () => ({ [arguments[2].exports = 1]() { return 1 } })\n'
    },
    origins: [],
    base: {
      status: 'UNKNOWN',
      unknowns: [
        ['UNKNOWN_EXPORTED_MUTABLE_STATE', 'm.js', ''],
        ['UNKNOWN_MUTATION', 'm.js', ''],
        ['UNKNOWN_OBJECT', 'm.js', '']
      ],
      violations: []
    },
    gone: [],
    cjs: [['m.js', 'TOP_LEVEL_ARGUMENTS']],
    added: [],
    reached: null,
    status: 'UNKNOWN',
    violations: []
  },
  {
    id: 'X05-computed-this',
    group: 'B',
    files: {
      'entry.js': "const m = require('./m.js')\nmodule.exports = 1\n",
      'm.js': 'module.exports = () => ({ [this.k = 1]() { return 1 } })\n'
    },
    origins: [],
    base: {
      status: 'UNKNOWN',
      unknowns: [
        ['UNKNOWN_EXPORTED_MUTABLE_STATE', 'm.js', ''],
        ['UNKNOWN_MUTATION', 'm.js', ''],
        ['UNKNOWN_OBJECT', 'm.js', '']
      ],
      violations: []
    },
    gone: [],
    cjs: [['m.js', 'TOP_LEVEL_THIS']],
    added: [],
    reached: null,
    status: 'UNKNOWN',
    violations: []
  },
  {
    id: 'X06-two-opaque-equal',
    group: 'A',
    files: {
      'entry.js':
        'const a = require("./a.js")\nconst b = require("./b.js")\nmodule.exports = a === b ? 1 : function g(x) { return import(x) }\n',
      'a.js': '"use strict"\n',
      'b.js': '"use strict"\n'
    },
    origins: [['entry.js', 'import(x)']],
    base: { status: 'PROVEN', unknowns: [], violations: [] },
    gone: [],
    cjs: [],
    added: [
      ['UNKNOWN_BINDING_VALUE', 'entry.js', 'x'],
      ['UNKNOWN_EXPORT', 'entry.js', ''],
      ['UNKNOWN_OPERATOR', 'entry.js', ''],
      ['UNKNOWN_RESOLUTION', 'entry.js', '']
    ],
    reached: {
      cause: 'C1',
      tuples: [['UNKNOWN_DYNAMIC_IMPORT_PROMISE', 'entry.js', '']]
    },
    status: 'UNKNOWN',
    violations: []
  },
  {
    id: 'X07-join-then-sequence',
    group: 'C',
    files: {
      'entry.js': "const m = require('./m.js')\nmodule.exports = 1\n",
      'm.js':
        'if ({}) module.exports = function g(x) { return import(x) }\nmodule.exports = 1\n'
    },
    origins: [['m.js', 'import(x)']],
    base: { status: 'PROVEN', unknowns: [], violations: [] },
    gone: [],
    cjs: [],
    added: [],
    reached: null,
    status: 'PROVEN',
    violations: []
  },
  {
    id: 'X08-join-compare',
    group: 'D',
    files: {
      'entry.js':
        'const m = require("./m.js")\nmodule.exports = m === 1 ? 1 : function g(x) { return import(x) }\n',
      'm.js': 'if ({}) module.exports = 1\n'
    },
    origins: [['entry.js', 'import(x)']],
    base: { status: 'PROVEN', unknowns: [], violations: [] },
    gone: [],
    cjs: [],
    added: [
      ['UNKNOWN_BINDING_VALUE', 'entry.js', 'x'],
      ['UNKNOWN_EXPORT', 'entry.js', ''],
      ['UNKNOWN_OPERATOR', 'entry.js', ''],
      ['UNKNOWN_RESOLUTION', 'entry.js', '']
    ],
    reached: {
      cause: 'C1+C2',
      tuples: [['UNKNOWN_DYNAMIC_IMPORT_PROMISE', 'entry.js', '']]
    },
    status: 'UNKNOWN',
    violations: []
  },
  {
    id: 'X09-opaque-not',
    group: 'D',
    files: {
      'entry.js': 'const m = require("./m.js")\nmodule.exports = !m ? 1 : 2\n',
      'm.js': '"use strict"\n'
    },
    origins: [],
    base: { status: 'PROVEN', unknowns: [], violations: [] },
    gone: [],
    cjs: [],
    added: [['UNKNOWN_OPERATOR', 'entry.js', '']],
    reached: null,
    status: 'UNKNOWN',
    violations: []
  },
  {
    id: 'X10-escaped-identifier',
    group: 'A',
    files: {
      'entry.js': "const m = require('./m.js')\nmodule.exports = 1\n",
      'm.js':
        'module.exports = function f() { \\u006dodule.exports = function g(x) { return import(x) } }\n'
    },
    origins: [['m.js', 'import(x)']],
    base: { status: 'PROVEN', unknowns: [], violations: [] },
    gone: [],
    cjs: [['m.js', 'FUNCTION_BODY_WRITE']],
    added: [],
    reached: null,
    status: 'UNKNOWN',
    violations: []
  },
  {
    id: 'X11-ts-cjs-function-write',
    group: 'A',
    files: {
      'entry.js': 'const m = require("./m.ts")\nmodule.exports = 1\n',
      'm.ts':
        'module.exports = function f(): void { module.exports = function g(x: string) { return import(x) } }\n'
    },
    origins: [['m.ts', 'import(x)']],
    base: { status: 'PROVEN', unknowns: [], violations: [] },
    gone: [],
    cjs: [['m.ts', 'FUNCTION_BODY_WRITE']],
    added: [],
    reached: null,
    status: 'UNKNOWN',
    violations: []
  },
  {
    id: 'X12-self-require',
    group: 'B',
    files: {
      'entry.js': "const m = require('./m.js')\nmodule.exports = 1\n",
      'm.js': 'module.exports = function f() { return require("./m.js") }\n'
    },
    origins: [],
    base: {
      status: 'UNKNOWN',
      unknowns: [['UNKNOWN_CYCLE', '', 'Maximum call stack size exceeded']],
      violations: []
    },
    gone: [],
    cjs: [],
    added: [],
    reached: null,
    status: 'UNKNOWN',
    violations: []
  },
  {
    id: 'X13-reexport-opaque',
    group: 'C',
    files: {
      'entry.js': 'module.exports = require("./m.js")\n',
      'm.js': '"use strict"\n'
    },
    origins: [],
    base: { status: 'PROVEN', unknowns: [], violations: [] },
    gone: [],
    cjs: [],
    added: [],
    reached: null,
    status: 'PROVEN',
    violations: []
  },
  {
    id: 'X14-importer-mutates',
    group: 'B',
    files: {
      'entry.js':
        'const m = require("./m.js")\nm.y = function g(x) { return import(x) }\nmodule.exports = 1\n',
      'm.js': '"use strict"\n'
    },
    origins: [['entry.js', 'import(x)']],
    base: {
      status: 'UNKNOWN',
      unknowns: [['UNKNOWN_MUTATION', 'entry.js', '']],
      violations: []
    },
    gone: [],
    cjs: [],
    added: [],
    reached: null,
    status: 'UNKNOWN',
    violations: []
  },
  {
    id: 'X15-require-cache-other',
    group: 'B',
    files: {
      'entry.js':
        'const m = require("./m.js")\nrequire.cache[require.resolve("./m.js")].exports = function g(x) { return import(x) }\nmodule.exports = 1\n',
      'm.js': 'module.exports = 1\n'
    },
    origins: [['entry.js', 'import(x)']],
    base: {
      status: 'UNKNOWN',
      unknowns: [['UNKNOWN_MUTATION', 'entry.js', '']],
      violations: []
    },
    gone: [],
    cjs: [['entry.js', 'LOADER_REFERENCE']],
    added: [],
    reached: null,
    status: 'UNKNOWN',
    violations: []
  },
  {
    id: 'X16-cycle',
    group: 'B',
    files: {
      'entry.js': 'require("./a.js")\nmodule.exports = 1\n',
      'a.js':
        'const b = require("./b.js")\nmodule.exports = function g(x) { return import(x) }\n',
      'b.js': 'const a = require("./a.js")\nmodule.exports = a ? 1 : 2\n'
    },
    origins: [['a.js', 'import(x)']],
    base: {
      status: 'UNKNOWN',
      unknowns: [
        ['UNKNOWN_BINDING_VALUE', 'a.js', 'x'],
        ['UNKNOWN_BINDING_VALUE', 'b.js', 'a'],
        ['UNKNOWN_CYCLE', 'a.js', ''],
        ['UNKNOWN_DYNAMIC_IMPORT_PROMISE', 'a.js', ''],
        ['UNKNOWN_EXPORT', 'a.js', ''],
        ['UNKNOWN_RESOLUTION', 'a.js', '']
      ],
      violations: []
    },
    gone: [],
    cjs: [],
    added: [],
    reached: null,
    status: 'UNKNOWN',
    violations: []
  },
  {
    id: 'X17-property-positions',
    group: 'C',
    files: {
      'entry.js': "const m = require('./m.js')\nmodule.exports = 1\n",
      'm.js':
        'const o = { exports: 1, module: 2, require: 3 }\nconst v = o.exports\nmodule.exports = v\n'
    },
    origins: [],
    base: { status: 'PROVEN', unknowns: [], violations: [] },
    gone: [],
    cjs: [],
    added: [],
    reached: null,
    status: 'PROVEN',
    violations: []
  },
  {
    id: 'X18-nested-decided-inner',
    group: 'A',
    files: {
      'entry.js': "const m = require('./m.js')\nmodule.exports = 1\n",
      'm.js':
        'if ({}) { if (true) module.exports = function g(x) { return import(x) } } else module.exports = 1\n'
    },
    origins: [['m.js', 'import(x)']],
    base: { status: 'PROVEN', unknowns: [], violations: [] },
    gone: [],
    cjs: [],
    added: [
      ['UNKNOWN_BINDING_VALUE', 'm.js', 'x'],
      ['UNKNOWN_EXPORT', 'm.js', ''],
      ['UNKNOWN_RESOLUTION', 'm.js', '']
    ],
    reached: {
      cause: 'C2',
      tuples: [['UNKNOWN_DYNAMIC_IMPORT_PROMISE', 'm.js', '']]
    },
    status: 'UNKNOWN',
    violations: []
  },
  {
    id: 'X19-union-closure',
    group: 'B',
    files: {
      'entry.js': "const m = require('./m.js')\nmodule.exports = 1\n",
      'm.js':
        'const v = {} ? function g(x) { return import(x) } : 1\nmodule.exports = function f() { return v }\n'
    },
    origins: [['m.js', 'import(x)']],
    base: {
      status: 'UNKNOWN',
      unknowns: [
        ['UNKNOWN_BINDING_VALUE', 'm.js', 'x'],
        ['UNKNOWN_DYNAMIC_IMPORT_PROMISE', 'm.js', ''],
        ['UNKNOWN_EXPORT', 'm.js', ''],
        ['UNKNOWN_RESOLUTION', 'm.js', '']
      ],
      violations: []
    },
    gone: [],
    cjs: [],
    added: [],
    reached: null,
    status: 'UNKNOWN',
    violations: []
  },
  {
    id: 'X20-module-parameter',
    group: 'D',
    files: {
      'entry.js': "const m = require('./m.js')\nmodule.exports = 1\n",
      'm.js': 'function h(module) { return 1 }\nmodule.exports = 2\n'
    },
    origins: [],
    base: { status: 'PROVEN', unknowns: [], violations: [] },
    gone: [],
    cjs: [['m.js', 'MODULE_REFERENCE']],
    added: [],
    reached: null,
    status: 'UNKNOWN',
    violations: []
  },
  {
    id: 'Y01-else-if',
    group: 'A',
    files: {
      'entry.js': "const m = require('./m.js')\nmodule.exports = 1\n",
      'm.js':
        'if ({}) module.exports = 1\nelse if ({}) module.exports = function g(x) { return import(x) }\nelse module.exports = 2\n'
    },
    origins: [['m.js', 'import(x)']],
    base: { status: 'PROVEN', unknowns: [], violations: [] },
    gone: [],
    cjs: [],
    added: [
      ['UNKNOWN_BINDING_VALUE', 'm.js', 'x'],
      ['UNKNOWN_EXPORT', 'm.js', ''],
      ['UNKNOWN_RESOLUTION', 'm.js', '']
    ],
    reached: {
      cause: 'C2',
      tuples: [['UNKNOWN_DYNAMIC_IMPORT_PROMISE', 'm.js', '']]
    },
    status: 'UNKNOWN',
    violations: []
  },
  {
    id: 'Y02-join-then-full-replace',
    group: 'C',
    files: {
      'entry.js': "const m = require('./m.js')\nmodule.exports = 1\n",
      'm.js':
        'if ({}) module.exports = function g(x) { return import(x) }\nif ({}) module.exports = 1\nelse module.exports = 2\n'
    },
    origins: [['m.js', 'import(x)']],
    base: { status: 'PROVEN', unknowns: [], violations: [] },
    gone: [],
    cjs: [],
    added: [],
    reached: null,
    status: 'PROVEN',
    violations: []
  },
  {
    id: 'Y03-join-call',
    group: 'D',
    files: {
      'entry.js': 'const m = require("./m.js")\nmodule.exports = m()\n',
      'm.js': 'if ({}) module.exports = function f() { return 1 }\n'
    },
    origins: [],
    base: { status: 'PROVEN', unknowns: [], violations: [] },
    gone: [],
    cjs: [],
    added: [
      ['UNKNOWN_CALL', 'entry.js', ''],
      ['UNKNOWN_EXPORT', 'entry.js', '']
    ],
    reached: null,
    status: 'UNKNOWN',
    violations: []
  },
  {
    id: 'Y04-same-module-equal',
    group: 'D',
    files: {
      'entry.js':
        'const a = require("./m.js")\nconst b = require("./m.js")\nmodule.exports = a === b ? 1 : function g(x) { return import(x) }\n',
      'm.js': '"use strict"\n'
    },
    origins: [['entry.js', 'import(x)']],
    base: { status: 'PROVEN', unknowns: [], violations: [] },
    gone: [],
    cjs: [],
    added: [
      ['UNKNOWN_BINDING_VALUE', 'entry.js', 'x'],
      ['UNKNOWN_EXPORT', 'entry.js', ''],
      ['UNKNOWN_OPERATOR', 'entry.js', ''],
      ['UNKNOWN_RESOLUTION', 'entry.js', '']
    ],
    reached: {
      cause: 'C1',
      tuples: [['UNKNOWN_DYNAMIC_IMPORT_PROMISE', 'entry.js', '']]
    },
    status: 'UNKNOWN',
    violations: []
  },
  {
    id: 'Y05-cts',
    group: 'A',
    files: {
      'entry.js': 'const m = require("./m.cts")\nmodule.exports = 1\n',
      'm.cts':
        'if ({}) module.exports = function g(x: string) { return import(x) }\nelse module.exports = 1\n'
    },
    origins: [['m.cts', 'import(x)']],
    base: { status: 'PROVEN', unknowns: [], violations: [] },
    gone: [],
    cjs: [],
    added: [
      ['UNKNOWN_BINDING_VALUE', 'm.cts', 'x'],
      ['UNKNOWN_EXPORT', 'm.cts', ''],
      ['UNKNOWN_RESOLUTION', 'm.cts', '']
    ],
    reached: {
      cause: 'C2',
      tuples: [['UNKNOWN_DYNAMIC_IMPORT_PROMISE', 'm.cts', '']]
    },
    status: 'UNKNOWN',
    violations: []
  },
  {
    id: 'X01-true-violation-call',
    group: 'V',
    files: {
      'entry.js':
        'const m = require("./m.js")\nm("./products/x.js")\nmodule.exports = 1\n',
      'm.js':
        'module.exports = function g(s) { return require(s) }\nfunction never() { module.exports = 1 }\n',
      'products/x.js': 'module.exports = 1\n'
    },
    origins: [],
    base: {
      status: 'VIOLATION',
      unknowns: [
        ['UNKNOWN_BINDING_VALUE', 'm.js', 's'],
        ['UNKNOWN_EXPORT', 'm.js', ''],
        [
          'UNKNOWN_PRODUCT_TARGET',
          'products/x.js',
          'UNKNOWN_PRODUCT_TARGET:products/x.js'
        ],
        ['UNKNOWN_RESOLUTION', 'm.js', '']
      ],
      violations: [['PRODUCT_DEPENDENCY', 'm.js', 'products/x.js']]
    },
    gone: [
      [
        'UNKNOWN_PRODUCT_TARGET',
        'products/x.js',
        'UNKNOWN_PRODUCT_TARGET:products/x.js'
      ]
    ],
    cjs: [['m.js', 'FUNCTION_BODY_WRITE']],
    added: [
      ['UNKNOWN_BINDING_VALUE', 'entry.js', 'm'],
      ['UNKNOWN_CALL', 'entry.js', '']
    ],
    reached: null,
    status: 'UNKNOWN',
    violations: []
  },
  {
    id: 'X02-true-violation-specifier',
    group: 'V',
    files: {
      'entry.js':
        'const m = require("./m.js")\nrequire(m)\nmodule.exports = 1\n',
      'm.js':
        'module.exports = "./products/x.js"\nfunction never() { module.exports = 1 }\n',
      'products/x.js': 'module.exports = 1\n'
    },
    origins: [],
    base: {
      status: 'VIOLATION',
      unknowns: [
        [
          'UNKNOWN_PRODUCT_TARGET',
          'products/x.js',
          'UNKNOWN_PRODUCT_TARGET:products/x.js'
        ]
      ],
      violations: [['PRODUCT_DEPENDENCY', 'entry.js', 'products/x.js']]
    },
    gone: [
      [
        'UNKNOWN_PRODUCT_TARGET',
        'products/x.js',
        'UNKNOWN_PRODUCT_TARGET:products/x.js'
      ]
    ],
    cjs: [['m.js', 'FUNCTION_BODY_WRITE']],
    added: [
      ['UNKNOWN_BINDING_VALUE', 'entry.js', 'm'],
      ['UNKNOWN_RESOLUTION', 'entry.js', '']
    ],
    reached: null,
    status: 'UNKNOWN',
    violations: []
  },
  {
    id: 'X03-false-violation-void',
    group: 'V',
    files: {
      'entry.js':
        'const m = require("./m.js")\nconst k = "./products/" + m + ".js"\nrequire(k)\nmodule.exports = 1\n',
      'm.js': '"use strict"\n',
      'products/undefined.js': 'module.exports = 1\n'
    },
    origins: [],
    base: {
      status: 'VIOLATION',
      unknowns: [
        [
          'UNKNOWN_PRODUCT_TARGET',
          'products/undefined.js',
          'UNKNOWN_PRODUCT_TARGET:products/undefined.js'
        ]
      ],
      violations: [['PRODUCT_DEPENDENCY', 'entry.js', 'products/undefined.js']]
    },
    gone: [
      [
        'UNKNOWN_PRODUCT_TARGET',
        'products/undefined.js',
        'UNKNOWN_PRODUCT_TARGET:products/undefined.js'
      ]
    ],
    cjs: [],
    added: [
      ['UNKNOWN_BINDING_VALUE', 'entry.js', 'k'],
      ['UNKNOWN_OPERATOR', 'entry.js', ''],
      ['UNKNOWN_RESOLUTION', 'entry.js', '']
    ],
    reached: null,
    status: 'UNKNOWN',
    violations: []
  },
  {
    id: 'V-S10-last-branch',
    group: 'V',
    files: {
      'entry.js':
        "const m = require('./m.js')\nm('./products/x.js')\nmodule.exports = 1\n",
      'm.js':
        'if ({}) module.exports = 1\nelse module.exports = function g(s) { return require(s) }\n',
      'products/x.js': 'module.exports = 1\n'
    },
    origins: [],
    base: {
      status: 'VIOLATION',
      unknowns: [
        ['UNKNOWN_BINDING_VALUE', 'm.js', 's'],
        ['UNKNOWN_EXPORT', 'm.js', ''],
        [
          'UNKNOWN_PRODUCT_TARGET',
          'products/x.js',
          'UNKNOWN_PRODUCT_TARGET:products/x.js'
        ],
        ['UNKNOWN_RESOLUTION', 'm.js', '']
      ],
      violations: [['PRODUCT_DEPENDENCY', 'm.js', 'products/x.js']]
    },
    gone: [
      [
        'UNKNOWN_PRODUCT_TARGET',
        'products/x.js',
        'UNKNOWN_PRODUCT_TARGET:products/x.js'
      ]
    ],
    cjs: [],
    added: [['UNKNOWN_CALL', 'entry.js', '']],
    reached: null,
    status: 'UNKNOWN',
    violations: []
  },
  {
    id: 'V-F3-late-require',
    group: 'V',
    files: {
      'entry.js':
        "const a = require('./m.js')\nconst b = require('./m.js')\nb('./products/x.js')\nmodule.exports = 1\n",
      'm.js':
        'module.exports = function f() { module.exports = function g(s) { return require(s) } }\n',
      'products/x.js': 'module.exports = 1\n'
    },
    origins: [],
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
    gone: [
      [
        'UNKNOWN_PRODUCT_TARGET',
        'products/x.js',
        'UNKNOWN_PRODUCT_TARGET:products/x.js'
      ]
    ],
    cjs: [['m.js', 'FUNCTION_BODY_WRITE']],
    added: [
      ['UNKNOWN_BINDING_VALUE', 'entry.js', 'b'],
      ['UNKNOWN_CALL', 'entry.js', '']
    ],
    reached: null,
    status: 'UNKNOWN',
    violations: []
  },
  {
    id: 'V-literal',
    group: 'V',
    files: {
      'entry.js': "const m = require('./m.js')\nmodule.exports = 1\n",
      'm.js':
        "if ({}) module.exports = function g() { return require('./products/x.js') }\nelse module.exports = 1\n",
      'products/x.js': 'module.exports = 1\n'
    },
    origins: [],
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
    gone: [],
    cjs: [],
    added: [['UNKNOWN_EXPORT', 'm.js', '']],
    reached: null,
    status: 'VIOLATION',
    violations: [['PRODUCT_DEPENDENCY', 'm.js', 'products/x.js']]
  },
  {
    id: 'T1-function-file-tuple',
    group: 'R2',
    files: {
      'entry.js': "const m = require('./m.js')\nmodule.exports = 1\n",
      'm.js':
        "const h = require('./n.js')\nif ({}) module.exports = function g() { return h({}) }\nelse module.exports = 1\n",
      'n.js': 'module.exports = function h(o) { return o.k }\n'
    },
    origins: [],
    base: {
      status: 'UNKNOWN',
      unknowns: [
        ['UNKNOWN_BINDING_VALUE', 'n.js', 'o'],
        ['UNKNOWN_EXPORT', 'n.js', ''],
        ['UNKNOWN_PROPERTY', 'n.js', '']
      ],
      violations: []
    },
    gone: [],
    cjs: [],
    added: [['UNKNOWN_EXPORT', 'm.js', '']],
    reached: {
      cause: 'C2',
      tuples: [['UNKNOWN_INHERITED_PROPERTY', 'n.js', 'k']]
    },
    status: 'UNKNOWN',
    violations: []
  },
  {
    id: 'T2-true-violation-opaque',
    group: 'R2',
    files: {
      'entry.js':
        "const m = require('./m.js')\nconst f = m ? function g1(s) { return require(s) } : function g2(s) { return require(s) }\nf('./products/x.js')\nmodule.exports = 1\n",
      'm.js': "'use strict'\n",
      'products/x.js': 'module.exports = 1\n'
    },
    origins: [],
    base: {
      status: 'VIOLATION',
      unknowns: [
        [
          'UNKNOWN_PRODUCT_TARGET',
          'products/x.js',
          'UNKNOWN_PRODUCT_TARGET:products/x.js'
        ]
      ],
      violations: [['PRODUCT_DEPENDENCY', 'entry.js', 'products/x.js']]
    },
    gone: [
      [
        'UNKNOWN_PRODUCT_TARGET',
        'products/x.js',
        'UNKNOWN_PRODUCT_TARGET:products/x.js'
      ]
    ],
    cjs: [],
    added: [['UNKNOWN_CALL', 'entry.js', '']],
    reached: null,
    status: 'UNKNOWN',
    violations: []
  },
  {
    id: 'T2b-true-violation-union',
    group: 'R2',
    files: {
      'entry.js':
        "const m = require('./m.js')\nm('./products/x.js')\nmodule.exports = 1\n",
      'm.js':
        'if ({}) module.exports = function g1(s) { return require(s) }\nelse module.exports = function g2(s) { return require(s) }\n',
      'products/x.js': 'module.exports = 1\n'
    },
    origins: [],
    base: {
      status: 'VIOLATION',
      unknowns: [
        ['UNKNOWN_BINDING_VALUE', 'm.js', 's'],
        ['UNKNOWN_EXPORT', 'm.js', ''],
        [
          'UNKNOWN_PRODUCT_TARGET',
          'products/x.js',
          'UNKNOWN_PRODUCT_TARGET:products/x.js'
        ],
        ['UNKNOWN_RESOLUTION', 'm.js', '']
      ],
      violations: [['PRODUCT_DEPENDENCY', 'm.js', 'products/x.js']]
    },
    gone: [
      [
        'UNKNOWN_PRODUCT_TARGET',
        'products/x.js',
        'UNKNOWN_PRODUCT_TARGET:products/x.js'
      ]
    ],
    cjs: [],
    added: [['UNKNOWN_CALL', 'entry.js', '']],
    reached: null,
    status: 'UNKNOWN',
    violations: []
  },
  {
    id: 'T3-new-true-violation-join',
    group: 'R2',
    files: {
      'entry.js':
        "const m = require('./m.js')\nrequire(m)\nmodule.exports = 1\n",
      'm.js':
        "if ({}) module.exports = './products/x.js'\nelse module.exports = './ok.js'\n",
      'ok.js': 'module.exports = 1\n',
      'products/x.js': 'module.exports = 1\n'
    },
    origins: [],
    base: {
      status: 'UNKNOWN',
      unknowns: [['UNKNOWN_MODULE', 'ok.js', '']],
      violations: []
    },
    gone: [],
    cjs: [],
    added: [],
    reached: {
      cause: 'C2',
      tuples: [
        [
          'UNKNOWN_PRODUCT_TARGET',
          'products/x.js',
          'UNKNOWN_PRODUCT_TARGET:products/x.js'
        ]
      ]
    },
    status: 'VIOLATION',
    violations: [['PRODUCT_DEPENDENCY', 'entry.js', 'products/x.js']]
  },
  {
    id: 'Q3-computed-key-opaque',
    group: 'R2',
    files: {
      'entry.js':
        "const m = require('./m.js')\nconst o = { [m]: 1 }\nmodule.exports = 1\n",
      'm.js': "'use strict'\n"
    },
    origins: [],
    base: { status: 'PROVEN', unknowns: [], violations: [] },
    gone: [],
    cjs: [],
    added: [['UNKNOWN_OBJECT', 'entry.js', '']],
    reached: null,
    status: 'UNKNOWN',
    violations: []
  }
]

describe('SPEC0247 catalog — vN against the base, fixture by fixture', () => {
  it('has the 71 fixtures of the SPEC catalog and the five R2 cases', () => {
    expect(FIXTURES).toHaveLength(76)
    expect(
      Object.fromEntries(
        ['A', 'B', 'C', 'D', 'V', 'R2'].map((g) => [g, group(g).length])
      )
    ).toEqual({ A: 18, B: 27, C: 11, D: 9, V: 6, R2: 5 })
  })
  it.each(FIXTURES.map((fx) => [fx.id, fx]))(
    '%s',
    (_, fx) => {
      const out = result(fx)
      expect(keys(tuples(out)), fx.id).toEqual(keys(expectedTuples(fx)))
      expect(out.status, fx.id).toBe(fx.status)
      expect(keys(violations(out))).toEqual(keys(fx.violations))
      expect(out.validation).toEqual({ valid: true })
      expect(out.phases.body).toBe('COMPLETED')
      if (fx.status === 'PROVEN')
        for (const [file] of fx.origins)
          expect(
            out.proofs.some((p) => p.rule === 'K7' && p.file === file),
            file
          ).toBe(true)
      else expect(out.proofs).toEqual([])
    },
    TIMEOUT
  )
})

describe('SPEC0247 MC01/MC02 — group A: no false PROVEN', () => {
  it('the base proved the 18 fixtures of group A; vN proves none', () => {
    const a = group('A')
    expect(a).toHaveLength(18)
    for (const fx of a) {
      expect(fx.base.status, fx.id).toBe('PROVEN')
      expect(result(fx).status, fx.id).toBe('UNKNOWN')
    }
  }, 600000)
  it('F3 family: UNKNOWN_CJS_EXPORTS FUNCTION_BODY_WRITE in the written module', () => {
    for (const id of F3_FAMILY) {
      const fx = byId(id)
      const file = fx.origins[0][0]
      expect(
        has(result(fx), file, 'UNKNOWN_CJS_EXPORTS', 'FUNCTION_BODY_WRITE'),
        id
      ).toBe(true)
    }
  }, 600000)
  it('S10 and INIT families: the tuples of the code that the join or the initial object reach', () => {
    for (const id of [...S10_FAMILY, ...INIT_FAMILY]) {
      const fx = byId(id)
      const out = result(fx)
      const file = fx.origins[0][0]
      expect(has(out, file, 'UNKNOWN_DYNAMIC_IMPORT_PROMISE'), id).toBe(true)
      expect(has(out, file, 'UNKNOWN_RESOLUTION'), id).toBe(true)
      expect(
        out.unknowns.some((u) => u.reason === 'UNKNOWN_CJS_EXPORTS'),
        id
      ).toBe(false)
      expect(fx.reached.cause, id).toBe(S10_FAMILY.includes(id) ? 'C2' : 'C1')
    }
  }, 600000)
})

describe('SPEC0247 MC03 — group B keeps the base tuples', () => {
  it('no base tuple disappears; each handle has its closed category', () => {
    for (const fx of group('B')) {
      const out = result(fx)
      expect(minus(fx.base.unknowns, tuples(out)), fx.id).toEqual([])
      expect(
        keys(tuples(out).filter((t) => t[0] === 'UNKNOWN_CJS_EXPORTS')),
        fx.id
      ).toEqual(keys(cjsTuples(fx)))
    }
    const categories = new Set(
      FIXTURES.flatMap((fx) => fx.cjs.map(([, c]) => c))
    )
    expect([...categories].sort()).toEqual([
      'EVAL_REFERENCE',
      'EXPORTS_REFERENCE',
      'FUNCTION_BODY_WRITE',
      'LOADER_REFERENCE',
      'MODULE_REFERENCE',
      'REFUSED_CONTEXT_WRITE',
      'TOP_LEVEL_ARGUMENTS',
      'TOP_LEVEL_RETURN',
      'TOP_LEVEL_THIS'
    ])
  }, 600000)
  it('this and arguments in a computed name inside a top-level arrow are those of the wrapper (X04, X05)', () => {
    expect(
      has(
        result(byId('X04-computed-arguments')),
        'm.js',
        'UNKNOWN_CJS_EXPORTS',
        'TOP_LEVEL_ARGUMENTS'
      )
    ).toBe(true)
    expect(
      has(
        result(byId('X05-computed-this')),
        'm.js',
        'UNKNOWN_CJS_EXPORTS',
        'TOP_LEVEL_THIS'
      )
    ).toBe(true)
  }, 600000)
  it('the importer that reads the U value of H-top-return gets the §3.6 rule 2 tuples', () => {
    const fx = byId('H-top-return')
    const out = result(fx)
    expect(keys(tuples(out).filter((t) => t[1] === 'entry.js'))).toEqual(
      keys([
        ['UNKNOWN_BINDING_VALUE', 'entry.js', 'm'],
        ['UNKNOWN_BINDING_VALUE', 'entry.js', 'x'],
        ['UNKNOWN_DYNAMIC_IMPORT_PROMISE', 'entry.js', ''],
        ['UNKNOWN_EXPORT', 'entry.js', ''],
        ['UNKNOWN_RESOLUTION', 'entry.js', '']
      ])
    )
    expect(has(out, 'm.js', 'UNKNOWN_CJS_EXPORTS', 'TOP_LEVEL_RETURN')).toBe(
      true
    )
    expect(fx.reached.cause).toBe('C0')
  }, 600000)
  it('an ESM module is unchanged (ESM-unaffected)', () => {
    const fx = byId('ESM-unaffected')
    expect(fx.files['package.json']).toBe('{"type":"module"}')
    expect(keys(tuples(result(fx)))).toEqual(keys(fx.base.unknowns))
  }, 600000)
})

describe('SPEC0247 MC04 — proofs', () => {
  it('group C stays PROVEN, group D becomes UNKNOWN and no fixture gains PROVEN', () => {
    expect(group('C')).toHaveLength(11)
    expect(group('D')).toHaveLength(9)
    for (const fx of group('C')) expect(result(fx).status, fx.id).toBe('PROVEN')
    for (const fx of group('D')) {
      expect(fx.base.status, fx.id).toBe('PROVEN')
      expect(result(fx).status, fx.id).toBe('UNKNOWN')
    }
    for (const fx of FIXTURES)
      if (result(fx).status === 'PROVEN')
        expect(fx.base.status, fx.id).toBe('PROVEN')
  }, 600000)
})

describe('SPEC0247 MC05 — violations by class (§3.6 rule 3)', () => {
  it('V-literal keeps its violation', () => {
    const fx = byId('V-literal')
    expect(fx.base.violations).toEqual([
      ['PRODUCT_DEPENDENCY', 'm.js', 'products/x.js']
    ])
    expect(violations(result(fx))).toEqual(fx.base.violations)
  }, 600000)
  it('every lost violation is listed and classified; only its edge tuple disappears', () => {
    const lost = {}
    for (const fx of FIXTURES) {
      const gone = minus(fx.base.violations, violations(result(fx)))
      if (gone.length) lost[fx.id] = gone
      // Rule 1: only the edge tuple of a lost violation disappears; the edge
      // leaves the file of the violation (the tuple carries only the target).
      expect(keys(fx.gone), fx.id).toEqual(
        keys(
          gone.map(([, , target]) => [
            'UNKNOWN_PRODUCT_TARGET',
            target,
            'UNKNOWN_PRODUCT_TARGET:' + target
          ])
        )
      )
    }
    expect(Object.keys(lost).sort()).toEqual(Object.keys(LOST).sort())
    expect(
      Object.keys(lost).filter((id) => byId(id).group === 'V').length
    ).toBe(5)
    for (const [id, cls] of Object.entries(LOST))
      expect(
        [
          'FALSE_IN_RUNTIME',
          'TRUE_CARRIED_BY_C0_U',
          'TRUE_CARRIED_BY_C1_OPAQUE',
          'TRUE_CARRIED_BY_C2_UNION'
        ],
        id
      ).toContain(cls)
  }, 600000)
  it('a new violation only comes from code that a cause reaches (R2 T3)', () => {
    const added = {}
    for (const fx of FIXTURES) {
      const extra = minus(violations(result(fx)), fx.base.violations)
      if (extra.length) added[fx.id] = extra
    }
    expect(added).toEqual({
      'T3-new-true-violation-join': [
        ['PRODUCT_DEPENDENCY', 'entry.js', 'products/x.js']
      ]
    })
    expect(NEW_VIOLATIONS).toEqual({ 'T3-new-true-violation-join': 'C2' })
  }, 600000)
})

describe('SPEC0247 §3.6 rule 2 — new tuples by cause', () => {
  it('every new tuple is a root of the closed list or code that the C0 U, the join or the opaque object reach', () => {
    for (const fx of FIXTURES) {
      const extra = minus(tuples(result(fx)), fx.base.unknowns)
      for (const t of extra)
        expect(
          CLOSED.has(t[0]) ||
            fx.reached?.tuples.some(
              (r) => JSON.stringify(r) === JSON.stringify(t)
            ),
          fx.id + ' ' + JSON.stringify(t)
        ).toBe(true)
      if (fx.reached) expect(CAUSES.has(fx.reached.cause), fx.id).toBe(true)
    }
  }, 600000)
})

describe('SPEC0247 R2 review cases', () => {
  it('T1: the join reaches g; the new tuple lands in n.js, the file of the called function', () => {
    const out = result(byId('T1-function-file-tuple'))
    expect(has(out, 'n.js', 'UNKNOWN_INHERITED_PROPERTY', 'k')).toBe(true)
    expect(has(out, 'm.js', 'UNKNOWN_EXPORT')).toBe(true)
  }, 600000)
  it('T2 and T2b: a true violation carried by the opaque object or by a union is refused at the point of use', () => {
    for (const id of ['T2-true-violation-opaque', 'T2b-true-violation-union']) {
      const out = result(byId(id))
      expect(out.violations, id).toEqual([])
      expect(has(out, 'entry.js', 'UNKNOWN_CALL'), id).toBe(true)
    }
  }, 600000)
  it('T3: the join reaches a product specifier; the new true violation is listed by cause', () => {
    const out = result(byId('T3-new-true-violation-join'))
    expect(out.status).toBe('VIOLATION')
    expect(byId('T3-new-true-violation-join').base.status).toBe('UNKNOWN')
  }, 600000)
  it('Q3: a computed key over the initial object gives UNKNOWN_OBJECT', () => {
    const out = result(byId('Q3-computed-key-opaque'))
    expect(tuples(out)).toEqual([['UNKNOWN_OBJECT', 'entry.js', '']])
    expect(byId('Q3-computed-key-opaque').base.status).toBe('PROVEN')
  }, 600000)
})

describe('SPEC0247 C0 — classification in the census and through the cache', () => {
  it(
    'the refusal census classifies the handles too',
    () => {
      const out = census(byId('F3'))
      expect(
        has(out, 'm.js', 'UNKNOWN_CJS_EXPORTS', 'FUNCTION_BODY_WRITE')
      ).toBe(true)
    },
    TIMEOUT
  )
  it(
    'names in the positions of the closed list do not count (X17)',
    () => {
      const out = result(byId('X17-property-positions'))
      expect(out.status).toBe('PROVEN')
      expect(out.unknowns).toEqual([])
    },
    TIMEOUT
  )
  it(
    'the second require of a module with a handle gets U from the cache (V-F3-late-require)',
    () => {
      const out = result(byId('V-F3-late-require'))
      expect(has(out, 'entry.js', 'UNKNOWN_BINDING_VALUE', 'b')).toBe(true)
      expect(has(out, 'entry.js', 'UNKNOWN_CALL')).toBe(true)
      expect(out.violations).toEqual([])
    },
    TIMEOUT
  )
})

describe('SPEC0247 MC07 — version and limits', () => {
  it(
    'publishes the new kernel version',
    () => {
      expect(cleanCall({ version: true })).toBe(KERNEL)
      expect(result(byId('P-sequence')).kernelVersion).toBe(KERNEL)
    },
    TIMEOUT
  )
  it(
    'keeps the SPEC0242 limits',
    () => {
      expect(result(byId('P-sequence')).limits).toEqual(LIMITS)
    },
    TIMEOUT
  )
})
