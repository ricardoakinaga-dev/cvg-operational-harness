"""The 88 fixtures of the BUILD (43 of the recon controls.json, C01-C15 of fixtures-c/, D01-D11 of fixtures-d/ and
X01-X14 of fixtures-x/: X01-X12 from the code review r1, M1, and X13/X14 for its O2), written
to RUNTIME/fixtures/<id>/ and measured with: Node 22.23.2 real (recon hook.mjs: is products/x.js loaded?), the base
engine v7 (tools-v7, normal and census) and the recon b1 reference (tools-wide, normal pass only). With --engine
<label>=<engine.mjs> more engines are measured (e.g. the vN of the worktree). Writes fixture-catalog[-<suffix>].json.
usage: catalog.py [--suffix <s>] [--engine <label>=<path> ...]"""
import json, subprocess, sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

args = sys.argv[1:]
suffix = ''
extra = {}
while args:
    a = args.pop(0)
    if a == '--suffix':
        suffix = '-' + args.pop(0)
    elif a == '--engine':
        k, v = args.pop(0).split('=', 1)
        extra[k] = v
ENGINES = {'v7': str(RUNTIME / 'tools-v7' / ENGINE), 'b1': str(RECON_RUNTIME / 'tools-wide' / ENGINE), **extra}
assert sha(ENGINES['v7']) == V7_ENGINE_SHA and sha(ENGINES['b1']) == B1_ENGINE_SHA
HOOK = RECON_RUNTIME / 'hook.mjs'
ENV = {'PATH': NODEBIN + ':/usr/bin:/bin', 'LANG': 'C', 'LC_ALL': 'C', 'TZ': 'UTC'}


def read_dir(d):
    return {str(f.relative_to(d)): f.read_text() for f in sorted(d.rglob('*')) if f.is_file()}


fixtures = []
controls = json.loads((PROJECT / 'docs/04_audit/evidence/HISO005-P2-ANNEXB-RECON-20261021/controls.json').read_text())
for c in controls['controls']:
    fixtures.append({'id': c['id'], 'set': 'recon', 'files': c['files'], 'start': c['start'],
                     'reconGroup': c['group'], 'reconKernelMain': c['kernelMain']})
for s, folder in (('C', 'fixtures-c'), ('D', 'fixtures-d'), ('X', 'fixtures-x')):
    lines = (EV / (folder + '-sha256.txt')).read_text().split('\n')
    hashes = {l.split('  ', 1)[1][2:]: l.split('  ', 1)[0] for l in lines if l.strip()}
    for d in sorted((EV / folder).iterdir()):
        files = read_dir(d)
        for f in files:
            assert shab((d / f).read_bytes()) == hashes[d.name + '/' + f], (d.name, f)
        start = 'entry.mjs' if 'entry.mjs' in files else 'entry.js'
        fixtures.append({'id': d.name, 'set': s, 'files': files, 'start': start})
assert len(fixtures) == 88, len(fixtures)

root = RUNTIME / ('fixtures' + suffix)
root.mkdir(exist_ok=True)


def write(fx):
    d = root / fx['id']
    if d.exists():
        for f in sorted(d.rglob('*'), reverse=True):
            f.unlink() if f.is_file() else f.rmdir()
    for f, body in fx['files'].items():
        (d / f).parent.mkdir(parents=True, exist_ok=True)
        (d / f).write_text(body)
    return d


def probe(engine, d, start, census=False):
    p = subprocess.run([NODE, str(OPS / 'probe.mjs'), engine, str(d), start] + (['--census'] if census else []),
                       env=ENV, capture_output=True, text=True, timeout=300)
    assert p.returncode == 0, p.stderr[-800:]
    return json.loads(p.stdout)


def node22(d, start):
    p = subprocess.run([NODE, '--import', HOOK.as_uri(), start], cwd=str(d), env=ENV, capture_output=True, text=True, timeout=60)
    marker = next((l for l in p.stdout.split('\n') if l.startswith('@@LOADED@@')), None)
    loaded = json.loads(marker[10:])['loaded'] if marker else []
    return {'exitCode': p.returncode, 'productLoaded': any('/products/' in u for u in loaded)}


def measure(fx):
    d = write(fx)
    row = {'node22': node22(d, fx['start'])}
    for k, e in ENGINES.items():
        row[k] = probe(e, d, fx['start'])
        if k != 'b1':
            row[k + 'Census'] = probe(e, d, fx['start'], census=True)
    return row


wait_load()
with ThreadPoolExecutor(max_workers=6) as ex:
    rows = list(ex.map(measure, fixtures))
for fx, row in zip(fixtures, rows):
    fx.update(row)
    fx['positive'] = row['node22']['productLoaded']
    if fx['set'] == 'recon':
        km = fx['reconKernelMain']
        fx['v7EqualsRecon'] = (fx['v7']['status'] == km['status'] and fx['v7']['unknowns'] == km['unknowns']
                               and [v[:2] + [v[2]] for v in fx['v7']['violations']] == km['violations']
                               and fx['positive'] == (fx['reconGroup'] == 'positive'))
out = {'task': TASK, 'observedAt': now(), 'node': subprocess.check_output([NODE, '--version'], text=True).strip(),
       'engines': {k: {'path': v, 'sha256': sha(v)} for k, v in ENGINES.items()}, 'fixturesRoot': str(root),
       'method': 'probe.mjs: runSemanticBoundary (census: analyzeSemanticBoundary refusalCensus) with origins [], installed [], compiled UNAVAILABLE; Node 22 real with the recon hook.mjs (observation only)',
       'fixtures': fixtures}
save('fixture-catalog' + suffix + '.json', out)
bad = [fx['id'] for fx in fixtures if fx['set'] == 'recon' and not fx['v7EqualsRecon']]
print('fixtures', len(fixtures), 'positives', sum(fx['positive'] for fx in fixtures), 'recon v7 mismatches', bad)
for fx in fixtures:
    ab = lambda r: [u[1] + ':' + u[2] for u in r['unknowns'] if u[0] == 'UNKNOWN_ANNEXB_FUNCTION']
    print(fx['id'].ljust(44), 'pos' if fx['positive'] else 'neg', *[k + '=' + fx[k]['status'] + str(ab(fx[k])) for k in ENGINES])
