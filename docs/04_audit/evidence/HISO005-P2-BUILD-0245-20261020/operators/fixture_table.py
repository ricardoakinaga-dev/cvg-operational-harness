"""Fixture table for SPEC0245 §3.3.4 and MT04 (evidence): each fixture analysed by an engine copy in the normal pass
(runSemanticBoundary) and in the refusal census (analyzeSemanticBoundary with refusalCensus), via a clean pinned Node
caller. usage: fixture_table.py <out-name> <label>=<engine.mjs>..."""
import json, os, shutil, subprocess, sys, tempfile
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

TS_ONLY = 'export const k = 1;\nexport const id = <T,>(x: T): T => x;\nexport const gen = <T>(x: T) => x;\nexport const n = <number>(k as unknown);\nexport function f(x: number) { return x > k ? x : k }\n'
FIX = {
  'MT03-attribute': ({'entry.tsx': "export const el = <div onClick={() => import('./products/p.js')} />;\n", 'products/p.js': 'export const p = 1;\n'}, ['entry.tsx']),
  'MT03-child': ({'entry.tsx': "export const el = <div>{import('./products/p.js')}</div>;\n", 'products/p.js': 'export const p = 1;\n'}, ['entry.tsx']),
  'F9-target-only-via-tsx-ast': ({'entry.tsx': "export const el = <div>{import('./dep.js')}</div>;\n", 'dep.js': "const o = { p: './products/p.js' };\nexport const q = import(o.p);\n", 'products/p.js': 'export const p = 1;\n'}, ['entry.tsx']),
  'F13-jsx-text': ({'entry.tsx': "export const el = <p>call import('./products/p.js') here</p>;\n", 'products/p.js': 'export const p = 1;\n'}, ['entry.tsx']),
  'F13-attribute-string': ({'entry.tsx': "export const el = <p title=\"import('./products/p.js')\" />;\n", 'products/p.js': 'export const p = 1;\n'}, ['entry.tsx']),
  'F13-comment': ({'entry.tsx': "export const el = <p>{/* import('./products/p.js') */}</p>;\n", 'products/p.js': 'export const p = 1;\n'}, ['entry.tsx']),
  'F7xF13-generic-arrow-import': ({'entry.tsx': "export const g = <T>(x: T) => import('./products/p.js');\n", 'products/p.js': 'export const p = 1;\n'}, ['entry.tsx']),
  'cjs-require-in-jsx': ({'package.json': '{}', 'entry.tsx': "const el = <div>{require('./products/p.cjs')}</div>;\nmodule.exports = el;\n", 'products/p.cjs': 'module.exports = 1;\n'}, ['entry.tsx']),
  'MT04-ts-only-syntax': ({'entry.ts': "import { f } from './a.ts';\nimport { m } from './b.mts';\nexport const v = f(2) + m;\n", 'a.ts': TS_ONLY,
                           'b.mts': 'export const m = 1;\nexport const g2 = <T,>(x: T): T => x;\nexport const c2 = <number>(m as unknown);\n',
                           'c.cts': 'const one = 1;\nconst g3 = <T,>(x: T): T => x;\nconst c3 = <number>(one as unknown);\nmodule.exports = { one, g3, c3 };\n'}, ['entry.ts', 'c.cts']),
  'mtsx-extension': ({'entry.mtsx': 'export const el = <div>{1}</div>;\n'}, ['entry.mtsx'])}
code = ('const fs=require("node:fs"); const e=require(process.argv[1]); const r=JSON.parse(fs.readFileSync(0,"utf8"));'
        'const o=r.census?e.analyzeSemanticBoundary(r.input,{refusalCensus:true}):e.runSemanticBoundary(r.input); process.stdout.write(JSON.stringify(o));')
out_name, specs = sys.argv[1], sys.argv[2:]
engines = dict(s.split('=', 1) for s in specs)
tmpbase = RUNTIME / 'fixture-table'; tmpbase.mkdir(parents=True, exist_ok=True)
res = {'task': TASK, 'observedAt': now(), 'engines': {k: sha(v) for k, v in engines.items()}, 'fixtures': {n: {'files': f, 'starts': s} for n, (f, s) in FIX.items()}, 'results': {}}
for name, (files, starts) in FIX.items():
    for label, eng in engines.items():
        for census in (False, True):
            root = Path(os.path.realpath(tempfile.mkdtemp(dir=tmpbase)))
            for f, b in {'package.json': '{"type":"module"}', **files}.items():
                (root / f).parent.mkdir(parents=True, exist_ok=True); (root / f).write_text(b)
            inp = {'root': str(root), 'starts': starts, 'origins': [], 'installed': [], 'compiled': {'status': 'UNAVAILABLE', 'files': []}}
            p = subprocess.run([NODE, '-e', code, eng], input=json.dumps({'input': inp, 'census': census}), capture_output=True, text=True,
                               env={'PATH': NODEBIN + ':/usr/bin:/bin', 'LANG': 'C', 'TZ': 'UTC'}, cwd=str(tmpbase))
            shutil.rmtree(root)
            o = json.loads(p.stdout) if p.returncode == 0 else {'error': p.stderr[-500:]}
            res['results'].setdefault(name, {})[label + (':census' if census else ':normal')] = {
                'status': o.get('status'), 'violations': [[v.get('from') or v.get('file'), v.get('to') or v.get('target')] for v in o.get('violations', [])],
                'unknowns': sorted([u['file'], u['reason'], u['detail']] for u in o.get('unknowns', [])), 'error': o.get('error')}
save(out_name, res)
for n, r in res['results'].items():
    print(n, {k: (v['status'], len(v['violations'])) for k, v in r.items()})
