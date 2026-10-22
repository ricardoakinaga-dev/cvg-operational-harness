"""The directive-prologue table of the test (§5.2, R3-O2), rebuilt here with the same strings, run in Node 22.23.2 real
(recon hook.mjs, observation only) and in the base v7 and vN engines. Checks that the expected strictness of each row
is the runtime one (strict: the product is not loaded; sloppy: it is), that vN never proves a sloppy row and that v7
is the first red of the sloppy rows it proves. Writes prologue-table.json. usage: prologue_node22.py"""
import json, subprocess, sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

ENTRY = "const m = require('./m.js')\nm('./products/x.js')\nmodule.exports = 1\n"
PROLOGUE = [
    ['single quotes', ["'use strict'"], True], ['double quotes', ['"use strict"'], True],
    ['second directive', ["'a'", "'use strict'"], True], ['explicit semicolon', ["'use strict';"], True],
    ['comment before', ["/* c */ 'use strict'"], True], ['followed by ;(0)', ["'use strict'", ';(0)'], True],
    ['empty statement before', [';', "'use strict'"], False], ['expression before', ['0', "'use strict'"], False],
    ['declaration before', ['var z = 0', "'use strict'"], False], ['escape', ["'use\\x20strict'"], False],
    ['parentheses', ["('use strict')"], False], ['template', ['`use strict`'], False],
    ['string plus', ["'use strict' + ''"], False], ['string equality', ["'use strict' === 0"], False],
    ['string conditional', ["'use strict' ? 0 : 1"], False], ['string property', ["'use strict'.length"], False],
    ['string comma', ["'use strict', 0"], False], ['string or', ["'use strict' || 0"], False],
    ['other case', ["'Use strict'"], False], ['extra space', ["'use  strict'"], False],
    ['trailing space', ["'use strict '"], False], ['leading space', ["' use strict'"], False],
    ['semicolon inside the quotes', ["'use strict;'"], False], ['prefix', ["'not use strict'"], False]]
LEVELS = {
    'file': lambda p: '\n'.join([*p, 'function f() { return 1 }', '{ function f(s) { return require(s) } }', 'module.exports = f']) + '\n',
    'function': lambda p: '\n'.join(['function g() {', *p, 'function f() { return 1 }', '{ function f(s) { return require(s) } }', 'return f', '}', 'module.exports = g()']) + '\n',
    'block': lambda p: '\n'.join(['function f() { return 1 }', '{', *p, 'function f(s) { return require(s) }', '}', 'module.exports = f']) + '\n',
    'own': lambda p: '\n'.join(['function f() { return 1 }', '{ function f(s) {', *p, 'return require(s) } }', 'module.exports = f']) + '\n'}
rows = []
for level, text in LEVELS.items():
    for name, lines, strict in PROLOGUE:
        if strict or level in ('file', 'function'):
            m = text(lines)
            line = next(i for i, l in enumerate(m.split('\n')) if 'function f(s)' in l) + 1
            rows.append({'row': level + ': ' + name, 'm.js': m, 'strict': strict and level in ('file', 'function'), 'line': line})
assert len(rows) == 60
ENV = {'PATH': NODEBIN + ':/usr/bin:/bin', 'LANG': 'C', 'LC_ALL': 'C', 'TZ': 'UTC'}
ENGINES = {'v7': str(RUNTIME / 'tools-v7' / ENGINE), 'vN': str(CANDIDATE / ENGINE)}
assert sha(ENGINES['v7']) == V7_ENGINE_SHA
base = RUNTIME / 'prologue-table'
base.mkdir(exist_ok=True)


def one(i_row):
    i, row = i_row
    d = base / ('row%02d' % i)
    (d / 'products').mkdir(parents=True, exist_ok=True)
    for f, body in {'package.json': '{}', 'entry.js': ENTRY, 'm.js': row['m.js'], 'products/x.js': 'module.exports = 1\n'}.items():
        (d / f).write_text(body)
    p = subprocess.run([NODE, '--import', (RECON_RUNTIME / 'hook.mjs').as_uri(), 'entry.js'], cwd=str(d), env=ENV, capture_output=True, text=True, timeout=60)
    marker = next((l for l in p.stdout.split('\n') if l.startswith('@@LOADED@@')), None)
    loaded = any('/products/' in u for u in json.loads(marker[10:])['loaded']) if marker else None
    out = {'node22': {'exitCode': p.returncode, 'productLoaded': loaded}}
    for k, e in ENGINES.items():
        q = subprocess.run([NODE, str(OPS / 'probe.mjs'), e, str(d), 'entry.js'], env=ENV, capture_output=True, text=True, timeout=300)
        r = json.loads(q.stdout)
        out[k] = {'status': r['status'], 'annexb': [u[1] + ':' + u[2] for u in r['unknowns'] if u[0] == 'UNKNOWN_ANNEXB_FUNCTION'], 'validation': r['validation']}
    return {**row, **out}


wait_load()
with ThreadPoolExecutor(max_workers=6) as ex:
    res = list(ex.map(one, enumerate(rows)))
bad = []
for r in res:
    ok = (r['node22']['productLoaded'] is (not r['strict'])
          and (r['vN']['annexb'] == [] and r['vN']['status'] == 'PROVEN' if r['strict'] else r['vN']['annexb'] == ['m.js:f@' + str(r['line'])] and r['vN']['status'] != 'PROVEN'))
    r['ok'] = ok
    if not ok:
        bad.append(r['row'])
save('prologue-table.json', {'task': TASK, 'observedAt': now(), 'node': subprocess.check_output([NODE, '--version'], text=True).strip(),
                             'engines': {k: sha(v) for k, v in ENGINES.items()}, 'rows': len(res), 'allOk': not bad, 'bad': bad,
                             'v7FalseProven': sorted(r['row'] for r in res if not r['strict'] and r['v7']['status'] == 'PROVEN'),
                             'results': res})
print('rows', len(res), 'bad', bad, 'v7 false PROVEN', sum(1 for r in res if not r['strict'] and r['v7']['status'] == 'PROVEN'))
