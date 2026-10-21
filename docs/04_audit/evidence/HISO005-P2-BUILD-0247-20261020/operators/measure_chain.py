"""One measurement epoch on the evaluated root: 1.410 check, guarded runs (base v6 and vN, normal and strict; the
diagnostic copies normal only), 1.410 check again and the list of root files changed since the epoch start (must be
empty for the comparisons to be in the same epoch). usage: measure_chain.py <epoch> <base-tools> <vN-tools> <base-diag> <vN-diag> <refs>"""
import json, subprocess, sys, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

epoch, bt, vt, bdt, vdt, refs = sys.argv[1:7]
t0 = int(time.time())
steps = []
def py(*a):
    p = subprocess.run(['/usr/bin/python3', '-I', '-B', *[str(x) for x in a]], cwd=str(OPS), capture_output=True, text=True)
    steps.append({'argv': [str(x) for x in a], 'exitCode': p.returncode, 'stdoutTail': p.stdout[-600:], 'stderrTail': p.stderr[-600:], 'at': now()})
    assert p.returncode == 0, p.stderr[-2000:]
py(OPS / 'verify_eval_root.py', 'epoch-' + epoch + '-start')
py(OPS / 'guarded_measure.py', bt, bt, refs)
py(OPS / 'guarded_measure.py', vt, vt, refs)
py(OPS / 'guarded_measure.py', bdt, bdt, refs, '--diag', '--normal-only')
py(OPS / 'guarded_measure.py', vdt, vdt, refs, '--diag', '--normal-only')
py(OPS / 'verify_eval_root.py', 'epoch-' + epoch + '-end')
q = subprocess.run(['find', str(EVAL_ROOT), '(', '-path', str(EVAL_ROOT / 'node_modules'), '-o', '-path', str(EVAL_ROOT / '.git'), ')', '-prune', '-o',
                    '-type', 'f', '-newermt', '@' + str(t0), '-print'], capture_output=True, text=True)
changed = [l for l in q.stdout.splitlines() if l]
save('epoch-' + epoch + '.json', {'task': TASK, 'epoch': epoch, 'startedAt': datetime.datetime.fromtimestamp(t0, datetime.timezone.utc).isoformat(), 'finishedAt': now(),
     'labels': {'base': bt, 'vN': vt, 'baseDiag': bdt, 'vNDiag': vdt}, 'references': 'references-' + refs + '.json',
     'rootFilesChangedSinceStart': len(changed), 'sample': changed[:10], 'sameEpoch': not changed, 'steps': steps})
print('epoch', epoch, 'changed', len(changed))
