"""Writes tests/b6-0247-cjs-export-value.test.js in the candidate from fixtures-0247.json (71 SPEC fixtures + T1, T2,
T2b, T3, Q3) and probe-ref.json (base v6 = tools-v6 at 1d40fe51; expected vN = the SPEC reference variant t3 rebuilt
over v6, tools-v6t3ref). Per fixture: base status/tuples/violations, the tuples that disappear (gone), the C0 roots
(cjs), the new tuples of the §3.6 closed list (added), the new tuples of code reached by a cause (reached), and the
vN status/violations. Causes and violation classes are declared here by hand (SPEC0247 §1.2, §3.6 and R2 review).
usage: gen_test.py"""
import json, sys
from collections import Counter
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

FX = load('fixtures-0247.json')['fixtures']
PR = load('probe-ref.json')['results']
CLOSED = ['UNKNOWN_CJS_EXPORTS', 'UNKNOWN_BINDING_VALUE', 'UNKNOWN_CALL', 'UNKNOWN_PROPERTY', 'UNKNOWN_OPERATOR', 'UNKNOWN_TEMPLATE',
          'UNKNOWN_RESOLUTION', 'UNKNOWN_REFLECTION', 'UNKNOWN_OBJECT', 'UNKNOWN_EXPORT']
REACHED = {'S10': 'C2', 'S10-no-else': 'C2', 'S10-nested': 'C2', 'J-two-functions': 'C2', 'X18-nested-decided-inner': 'C2', 'Y01-else-if': 'C2',
           'Y05-cts': 'C2', 'T1-function-file-tuple': 'C2', 'T3-new-true-violation-join': 'C2',
           'INIT-conditional': 'C1', 'INIT-not': 'C1', 'INIT-if': 'C1', 'INIT-equality': 'C1', 'X06-two-opaque-equal': 'C1', 'Y04-same-module-equal': 'C1',
           'X08-join-compare': 'C1+C2', 'H-top-return': 'C0'}
LOST = {'X01-true-violation-call': 'TRUE_CARRIED_BY_C0_U', 'X02-true-violation-specifier': 'TRUE_CARRIED_BY_C0_U',
        'X03-false-violation-void': 'FALSE_IN_RUNTIME', 'V-S10-last-branch': 'FALSE_IN_RUNTIME', 'V-F3-late-require': 'FALSE_IN_RUNTIME',
        'T2-true-violation-opaque': 'TRUE_CARRIED_BY_C1_OPAQUE', 'T2b-true-violation-union': 'TRUE_CARRIED_BY_C2_UNION'}
NEWV = {'T3-new-true-violation-join': 'C2'}
F3 = ['F3', 'F3-arrow', 'F3-declaration', 'F3-returned', 'X10-escaped-identifier', 'X11-ts-cjs-function-write']
S10 = ['S10', 'S10-no-else', 'S10-nested', 'J-two-functions', 'X18-nested-decided-inner', 'Y01-else-if', 'Y05-cts']
INIT = ['INIT-conditional', 'INIT-not', 'INIT-if', 'INIT-equality', 'X06-two-opaque-equal']
ms = lambda xs: Counter(tuple(x) for x in xs)
rows = []
for f in FX:
    b, t = PR[f['id']]['v6']['normal'], PR[f['id']]['v6t3ref']['normal']
    assert b['validation'] == t['validation'] == {'valid': True} and b['phases']['body'] == t['phases']['body'] == 'COMPLETED'
    for o in (b, t):
        assert (o['status'] == 'PROVEN') == bool(o['proofs'])
    gone, new = ms(b['unknowns']) - ms(t['unknowns']), ms(t['unknowns']) - ms(b['unknowns'])
    cjs = sorted([x[1], x[2]] for x in new.elements() if x[0] == 'UNKNOWN_CJS_EXPORTS')
    added = sorted(list(x) for x in new.elements() if x[0] != 'UNKNOWN_CJS_EXPORTS' and x[0] in CLOSED)
    reached = sorted(list(x) for x in new.elements() if x[0] not in CLOSED)
    assert bool(reached) == (f['id'] in REACHED), f['id']
    vb, vt = ms(b['violations']), ms(t['violations'])
    assert bool(vb - vt) == (f['id'] in LOST) and bool(vt - vb) == (f['id'] in NEWV), f['id']
    files = {k: v for k, v in f['files'].items() if not (k == 'package.json' and v == '{}')}
    rows.append({'id': f['id'], 'group': f['group'], 'files': files, 'origins': [[o['file'], o['text']] for o in f['origins']],
                 'base': {'status': b['status'], 'unknowns': [[u[0], u[1], u[2]] for u in b['unknowns']], 'violations': b['violations']},
                 'gone': sorted(list(x) for x in gone.elements()), 'cjs': cjs, 'added': added,
                 'reached': {'cause': REACHED[f['id']], 'tuples': reached} if reached else None,
                 'status': t['status'], 'violations': t['violations']})
    assert all(o['reason'] == 'NON_LITERAL_MODULE_REFERENCE' for o in f['origins'])
census = PR['F3']['v6t3ref']['census']
assert ['UNKNOWN_CJS_EXPORTS', 'm.js', 'FUNCTION_BODY_WRITE'] in census['unknowns']
LIMITS = {"maxFileBytes": 16777216, "maxTotalBytes": 268435456, "maxFiles": 12000, "maxNodes": 2000000, "maxUnionValues": 128,
          "maxContexts": 256, "maxCallDepth": 64, "maxStates": 250000, "timeoutMs": 300000}
J = lambda x: json.dumps(x, ensure_ascii=False)
fixtures_js = 'const FIXTURES = [\n' + ',\n'.join('  ' + J(r) for r in rows) + '\n]\n'
src = r'''// SPEC0247 — CJS export value in the B6 kernel. C0: closed syntactic
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
const KERNEL = 'semantic-kernel-v7-cjs-export-value'
const TIMEOUT = 60000
// SPEC0242 limits, unchanged (MC07).
const LIMITS = __LIMITS__
// §3.6 rule 2: closed list of the new roots at the point of use.
const CLOSED = new Set(__CLOSED__)
const CAUSES = new Set(['C0', 'C1', 'C2', 'C1+C2'])
// §3.6 rule 3: every violation of the base that vN loses, with its class.
const LOST = __LOST__
// §3.6 rule 3: a new violation only from code that a cause reaches (R2 T3).
const NEW_VIOLATIONS = __NEWV__
const F3_FAMILY = __F3__
const S10_FAMILY = __S10__
const INIT_FAMILY = __INIT__

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
  if (!results.has(fx.id)) results.set(fx.id, cleanCall({ input: physical(fx) }))
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

__FIXTURES__
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
      expect(fx.reached.cause, id).toBe(
        S10_FAMILY.includes(id) ? 'C2' : 'C1'
      )
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
    expect(
      keys(tuples(out).filter((t) => t[1] === 'entry.js'))
    ).toEqual(
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
            fx.reached?.tuples.some((r) => JSON.stringify(r) === JSON.stringify(t)),
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
  it('the refusal census classifies the handles too', () => {
    const out = census(byId('F3'))
    expect(has(out, 'm.js', 'UNKNOWN_CJS_EXPORTS', 'FUNCTION_BODY_WRITE')).toBe(
      true
    )
  }, TIMEOUT)
  it('names in the positions of the closed list do not count (X17)', () => {
    const out = result(byId('X17-property-positions'))
    expect(out.status).toBe('PROVEN')
    expect(out.unknowns).toEqual([])
  }, TIMEOUT)
  it('the second require of a module with a handle gets U from the cache (V-F3-late-require)', () => {
    const out = result(byId('V-F3-late-require'))
    expect(has(out, 'entry.js', 'UNKNOWN_BINDING_VALUE', 'b')).toBe(true)
    expect(has(out, 'entry.js', 'UNKNOWN_CALL')).toBe(true)
    expect(out.violations).toEqual([])
  }, TIMEOUT)
})

describe('SPEC0247 MC07 — version and limits', () => {
  it('publishes the new kernel version', () => {
    expect(cleanCall({ version: true })).toBe(KERNEL)
    expect(result(byId('P-sequence')).kernelVersion).toBe(KERNEL)
  }, TIMEOUT)
  it('keeps the SPEC0242 limits', () => {
    expect(result(byId('P-sequence')).limits).toEqual(LIMITS)
  }, TIMEOUT)
})
'''
src = (src.replace('__LIMITS__', J(LIMITS)).replace('__CLOSED__', J(CLOSED)).replace('__LOST__', J(LOST)).replace('__NEWV__', J(NEWV))
       .replace('__F3__', J(F3)).replace('__S10__', J(S10)).replace('__INIT__', J(INIT)).replace('__FIXTURES__', fixtures_js))
out = CANDIDATE / 'tests/b6-0247-cjs-export-value.test.js'
assert not out.exists() or '--overwrite' in sys.argv
out.write_text(src)
save('test-generation.json', {'task': TASK, 'observedAt': now(), 'output': 'tests/b6-0247-cjs-export-value.test.js', 'rawSha256': sha(out),
     'inputs': {'fixtures-0247.json': sha(EV / 'fixtures-0247.json'), 'probe-ref.json': sha(EV / 'probe-ref.json')},
     'expectedFrom': 'tools-v6t3ref (variante t3 da SPEC sobre a v6; paridade 71/71 com probe-final3 da SPEC)', 'baseFrom': 'tools-v6 (1d40fe51)',
     'declaredByHand': {'reachedCause': REACHED, 'lostViolationClass': LOST, 'newViolationCause': NEWV, 'families': {'F3': F3, 'S10': S10, 'INIT': INIT}},
     'fixtures': len(rows)})
print('written', out, len(src.splitlines()))
