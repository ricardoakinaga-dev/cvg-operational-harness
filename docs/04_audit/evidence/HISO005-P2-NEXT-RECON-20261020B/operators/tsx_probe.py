"""Fixture probe for SPEC0245 (diagnostic): the same .tsx fixtures analysed by the v5 copy and by variant A, via a
clean pinned Node caller. usage: tsx_probe.py"""
import json, os, shutil, subprocess, sys, tempfile
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

FIX = {
  'jsx-attribute-dynamic-import-into-products': {'entry.tsx': "import { x } from './a.js';\nexport const el = <div title=\"t\" onClick={() => import('./products/p.js')}>{x}</div>;\n",
                                                  'a.js': 'export const x = 1;', 'products/p.js': 'export const p = 1;'},
  'valid-tsx-with-types': {'entry.tsx': "import { x } from './a.js';\nexport const el = <div title=\"t\">{x}</div>;\nexport const n: number = 2;\n", 'a.js': 'export const x = 1;'},
  'tsx-with-real-syntax-error': {'entry.tsx': 'export const el = <div>;\n'}}
code = 'const fs=require("node:fs"); const engine=require(process.argv[1]); const r=JSON.parse(fs.readFileSync(0,"utf8")); process.stdout.write(JSON.stringify(engine.runSemanticBoundary(...r.args)));'
tmpbase = RUNTIME / 'probe' / 'tmp'; tmpbase.mkdir(parents=True, exist_ok=True)
out = {'task': TASK, 'observedAt': now(), 'fixtures': FIX, 'results': {}}
for label in ('v5', 'v5tsxA'):
    eng = RUNTIME / ('tools-' + label) / 'scripts/boundary-semantic-engine.mjs'
    for name, files in FIX.items():
        root = Path(os.path.realpath(tempfile.mkdtemp(dir=tmpbase)))
        for f, b in {'package.json': '{"type":"module"}', **files}.items():
            (root / f).parent.mkdir(parents=True, exist_ok=True); (root / f).write_text(b)
        inp = {'root': str(root), 'starts': ['entry.tsx'], 'origins': [], 'installed': [], 'compiled': {'status': 'UNAVAILABLE', 'files': []}}
        p = subprocess.run([NODE, '-e', code, str(eng)], input=json.dumps({'args': [inp]}), capture_output=True, text=True, env={'PATH': NODEBIN + ':/usr/bin:/bin', 'LANG': 'C', 'TZ': 'UTC'})
        shutil.rmtree(root)
        o = json.loads(p.stdout)
        out['results'].setdefault(name, {})[label] = {'engineSha256': sha(eng), 'status': o['status'], 'violations': len(o['violations']),
                                                    'unknowns': sorted([u['file'], u['reason'], u['detail'][:80]] for u in o['unknowns'])}
save('tsx-probe.json', out)
for n, r in out['results'].items():
    for l, x in r.items(): print(n, l, x['status'], x['violations'], [u[1] + ':' + u[2][:30] for u in x['unknowns']])
