"""Run every fixture of fixtures-0247.json through the engines named on the command line (tools-<label> in the
runtime) with runSemanticBoundary (census + worker), as the SPEC unit probe did; with --census also the refusal census
alone; with --diag (diagnostic copies only) the graph and CJS rows dumped by the copy (CVG_DIAG_GRAPH).
Writes probe-<out>.json. usage: [PROBE_CATALOG=<catalog.json>] [PROBE_ONLY=id,id] probe.py <out> [--census] [--diag] <label> [<label> ...]"""
import json, shutil, subprocess, sys, tempfile
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

args = sys.argv[1:]
out = args.pop(0)
census = '--census' in args
diag = '--diag' in args
labels = [a for a in args if a not in ('--census', '--diag')]
FX = load(os.environ.get('PROBE_CATALOG', 'fixtures-0247.json'))['fixtures']
ONLY = [x for x in os.environ.get('PROBE_ONLY', '').split(',') if x]
if ONLY:
    FX = [f for f in FX if f['id'] in ONLY]
ENV = {'PATH': NODEBIN + ':/usr/bin:/bin', 'LANG': 'C', 'LC_ALL': 'C', 'TZ': 'UTC'}
code = ('const fs=require("node:fs"); const e=require(process.argv[1]); const r=JSON.parse(fs.readFileSync(0,"utf8"));'
        'for (const o of r.input.origins) o.id=e.semanticOriginId(o);'
        'process.stdout.write(JSON.stringify(r.census ? e.analyzeSemanticBoundary(r.input,{refusalCensus:true}) : e.runSemanticBoundary(r.input)));')
tmpbase = RUNTIME / 'probe' / 'tmp'
tmpbase.mkdir(parents=True, exist_ok=True)
res = {'task': TASK, 'observedAt': now(), 'census': census, 'engines': {}, 'results': {}}
def row(o):
    return {'status': o.get('status'),
            'unknowns': sorted([[x['reason'], x['file'], x['detail']] for x in o.get('unknowns') or []]),
            'violations': sorted([[x['reason'], x['file'], x.get('target')] for x in o.get('violations') or []]),
            'proofs': sorted([[x['rule'], x['file'], x.get('kind')] for x in o.get('proofs') or []]),
            'validation': o.get('validation'), 'phases': o.get('phases'), 'error': o.get('error')}
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
            origins.append({'file': o['file'], 'fileSha256': shab(src.encode()), 'kind': 'CallExpression', 'start': start,
                            'end': start + len(o['text']), 'reason': o['reason'], 'ordinal': 0, 'expression': o['text']})
        inp = {'root': str(root), 'starts': ['entry.js'], 'origins': origins, 'installed': [], 'compiled': {'status': 'UNAVAILABLE', 'files': []}}
        r = {}
        for mode in (['normal', 'census'] if census else ['normal']):
            env = dict(ENV)
            dump = root.parent / (root.name + '-diag.json')
            if diag and mode == 'normal':
                env['CVG_DIAG_GRAPH'] = str(dump)
            p = subprocess.run([NODE, '-e', code, str(eng)], input=json.dumps({'input': inp, 'census': mode == 'census'}), capture_output=True, text=True, env=env)
            o = json.loads(p.stdout) if p.returncode == 0 else {'error': p.stderr[-800:]}
            r[mode] = row(o)
            if diag and mode == 'normal':
                d = json.loads(dump.read_text())
                pre = d['root'] + '/'
                rl = lambda x: x[len(pre):] if x.startswith(pre) else x
                r[mode]['diag'] = {'edges': {rl(k): sorted(rl(t) for t in v) for k, v in d['edges'].items()},
                                   'modes': {rl(k): v for k, v in d['modes'].items()},
                                   'cjs': [dict(x, file=rl(x['file'])) for x in d['cjs']]}
                dump.unlink()
        shutil.rmtree(root)
        res['results'].setdefault(f['id'], {})[label] = r['normal'] if not census else r
save('probe-' + out + '.json', res)
for fid, r in res['results'].items():
    print(fid.ljust(30), ' | '.join(lab + ':' + str((r[lab] if not census else r[lab]['normal'])['status']) for lab in labels))
