"""Run every fixture of fixtures.json through the engines named on the command line (tools-<label> in the runtime),
with runSemanticBoundary (census + worker, as the recon probe). Writes probe-<out>.json.
usage: [PROBE_ONLY=id,id] probe.py <out> <label> [<label> ...]"""
import json, shutil, subprocess, sys, tempfile
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

out, labels = sys.argv[1], sys.argv[2:]
FX = load('fixtures.json')['fixtures']
ONLY = [x for x in os.environ.get('PROBE_ONLY', '').split(',') if x]
if ONLY:
    FX = [f for f in FX if f['id'] in ONLY]
ENV = {'PATH': NODEBIN + ':/usr/bin:/bin', 'LANG': 'C', 'LC_ALL': 'C', 'TZ': 'UTC'}
code = ('const fs=require("node:fs"); const e=require(process.argv[1]); const r=JSON.parse(fs.readFileSync(0,"utf8"));'
        'process.stdout.write(JSON.stringify(e.runSemanticBoundary(...r.args)));')
oid = 'const e=require(process.argv[1]); process.stdout.write(e.semanticOriginId(JSON.parse(process.argv[2])))'
tmpbase = RUNTIME / 'probe' / 'tmp'
tmpbase.mkdir(parents=True, exist_ok=True)
res = {'task': TASK, 'observedAt': now(), 'engines': {}, 'results': {}}
for label in labels:
    eng = RUNTIME / ('tools-' + label) / 'scripts/boundary-semantic-engine.mjs'
    res['engines'][label] = {'path': str(eng), 'sha256': sha(eng)}
    for f in FX:
        wait_load()
        root = Path(os.path.realpath(tempfile.mkdtemp(dir=tmpbase)))
        for name, body in f['files'].items():
            (root / name).parent.mkdir(parents=True, exist_ok=True)
            (root / name).write_text(body)
        origins = []
        for o in f['origins']:
            src = f['files'][o['file']]
            start = src.index(o['text'])
            origin = {'file': o['file'], 'fileSha256': shab(src.encode()), 'kind': 'CallExpression', 'start': start,
                      'end': start + len(o['text']), 'reason': o['reason'], 'ordinal': 0, 'expression': o['text']}
            origin['id'] = subprocess.run([NODE, '-e', oid, str(eng), json.dumps(origin)], capture_output=True, text=True, env=ENV).stdout
            origins.append(origin)
        inp = {'root': str(root), 'starts': ['entry.js'], 'origins': origins, 'installed': [],
               'compiled': {'status': 'UNAVAILABLE', 'files': []}}
        p = subprocess.run([NODE, '-e', code, str(eng)], input=json.dumps({'args': [inp]}), capture_output=True, text=True, env=ENV)
        shutil.rmtree(root)
        o = json.loads(p.stdout) if p.returncode == 0 else {'error': p.stderr[-800:]}
        res['results'].setdefault(f['id'], {})[label] = {
            'status': o.get('status'),
            'unknowns': sorted([[x['reason'], x['file'], x['detail']] for x in o.get('unknowns') or []]),
            'violations': sorted([[x['reason'], x['file'], x.get('target')] for x in o.get('violations') or []]),
            'proofs': sorted([[x['rule'], x['file'], x.get('kind')] for x in o.get('proofs') or []]),
            'validation': o.get('validation'), 'error': o.get('error')}
save('probe-' + out + '.json', res)
for fid, r in res['results'].items():
    print(fid.ljust(24), ' | '.join(lab + ':' + str(r[lab]['status']) + ('/' + ','.join(sorted({u[0] for u in r[lab]['unknowns']})) if r[lab]['unknowns'] else '') for lab in labels))
