"""Conservation between two measurement labels (same evaluated root): multiset of diagnostics and of UNKNOWN
tuples, violations, envelope tuples; for 0243 also the closed list of SPEC0243 §3.6 between the two reference sets.
usage: compare.py <task> <out-name> <labelA> <labelB> [--receipts <refsA> <refsB>]"""
import gzip, json, sys
from collections import Counter
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

task, outname, a, b = sys.argv[1:5]
ENVELOPE = {'UNKNOWN_ANALYSIS_LIMIT', 'UNKNOWN_REVALIDATION', 'UNKNOWN_WORKER_ERROR', 'UNKNOWN_INVALID_WORKER_RESULT', 'UNKNOWN_INPUT_REVALIDATION', 'UNKNOWN_INSTALLED_REFERENCE'}


def report(label, mode):
    folder = EVS[task] if (EVS[task] / ('real-' + label + '-' + mode + '-report.json.gz')).exists() else EV43
    return json.loads(gzip.decompress((folder / ('real-' + label + '-' + mode + '-report.json.gz')).read_bytes()))


def tuples(r):
    return Counter((u.get('file') or '', u['reason'], u.get('detail') or '') for u in r['semanticBoundary']['unknowns'])


out = {'task': TASKS[task], 'observedAt': now(), 'A': a, 'B': b, 'modes': {}}
for mode in ['normal', 'strict']:
    ra, rb = report(a, mode), report(b, mode)
    da = Counter(json.dumps(d, sort_keys=True) for d in ra['diagnostics'])
    db = Counter(json.dumps(d, sort_keys=True) for d in rb['diagnostics'])
    ta, tb = tuples(ra), tuples(rb)
    missing = ta - tb
    va = Counter(json.dumps(v, sort_keys=True) for v in ra['semanticBoundary']['violations'] + ra['violations'])
    vb = Counter(json.dumps(v, sort_keys=True) for v in rb['semanticBoundary']['violations'] + rb['violations'])
    out['modes'][mode] = {'diagnostics': [sum(da.values()), sum(db.values())], 'diagnosticsMultisetEqual': da == db,
                          'tuples': [sum(ta.values()), sum(tb.values())], 'tuplesMultisetEqual': ta == tb,
                          'tuplesOfAMissingInB': [list(k) + [n] for k, n in missing.items()][:20],
                          'missingOnlyEnvelope': all(k[1] in ENVELOPE for k in missing),
                          'newTuplesInB': sum((tb - ta).values()), 'violationsAContainedInB': not (va - vb),
                          'violations': [sum(va.values()), sum(vb.values())],
                          'validation': [ra['semanticBoundary']['validation'], rb['semanticBoundary']['validation']],
                          'proofs': [len(ra['semanticBoundary']['proofs']), len(rb['semanticBoundary']['proofs'])]}
if '--receipts' in sys.argv:
    i = sys.argv.index('--receipts')
    ra_, rb_ = load('0243', 'references-' + sys.argv[i + 1] + '.json'), load('0243', 'references-' + sys.argv[i + 2] + '.json')
    allowed = {'installed': {'.recipe.sourceSha256', '.recipe.sourceExclusions', '.usage.regularBytes', '.usage.entries', '.usage.maxDepth',
                             '.usage.npmElapsedMs', '.usage.maxProcesses', '.recipe.observation.elapsedMs', '.recipe.observation.maxProcesses',
                             '.recipe.observation.traceSha256'},
               'compiled': {'.recipeVersion', '.recipeSha256', '.commandsSha256', '.installedReferenceDigest', '.sourceExclusions'}}
    diffs = {}
    for kind, key in (('installed', 'installedReference'), ('compiled', 'compiledReference')):
        pa, pb = Path(ra_[key]['manifestPath']), Path(rb_[key]['manifestPath'])
        xa = json.loads(pa.read_text().replace(str(pa.parent), '<OUT>'))
        xb = json.loads(pb.read_text().replace(str(pb.parent), '<OUT>'))
        found = []
        def walk(x, y, p=''):
            if isinstance(x, dict) and isinstance(y, dict):
                for k in sorted(set(x) | set(y)): walk(x.get(k), y.get(k), p + '.' + k)
            elif x != y: found.append(p)
        walk(xa, xb)
        diffs[kind] = {'differing': found, 'outsideClosedList': [f for f in found if f not in allowed[kind]]}
    out['receipts'] = diffs
    out['receiptsWithinClosedList'] = all(not d['outsideClosedList'] for d in diffs.values())
save(task, outname, out)
print(json.dumps(out, indent=1)[:3500])
