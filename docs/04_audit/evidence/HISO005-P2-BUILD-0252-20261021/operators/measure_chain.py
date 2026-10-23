"""One measurement epoch on the evaluated root (AB07): 1.410 check, guarded base v7 (normal and strict), base check
against the sealed BUILD0247 v7 (the chain STOPS on mismatch), guarded vN (normal and strict), 1.410 check again and
the list of root files changed since the epoch start (must be empty for the A/B to be in the same epoch).
usage: measure_chain.py <epoch> <base-tools> <vN-tools> <refs>"""
import datetime, json, subprocess, sys, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

epoch, bt, vt, refs = sys.argv[1:5]
t0 = int(time.time())
steps = []
def py(*a, must=True):
    p = subprocess.run(['/usr/bin/python3', '-I', '-B', *[str(x) for x in a]], cwd=str(OPS), capture_output=True, text=True)
    steps.append({'argv': [str(x) for x in a], 'exitCode': p.returncode, 'stdoutTail': p.stdout[-600:], 'stderrTail': p.stderr[-600:], 'at': now()})
    if must:
        assert p.returncode == 0, p.stderr[-2000:] + p.stdout[-2000:]
    return p.returncode
def record(stopped=None):
    q = subprocess.run(['find', str(EVAL_ROOT), '(', '-path', str(EVAL_ROOT / 'node_modules'), '-o', '-path', str(EVAL_ROOT / '.git'), ')', '-prune', '-o',
                        '-type', 'f', '-newermt', '@' + str(t0), '-print'], capture_output=True, text=True)
    changed = [l for l in q.stdout.splitlines() if l]
    save('epoch-' + epoch + '.json', {'task': TASK, 'epoch': epoch, 'startedAt': datetime.datetime.fromtimestamp(t0, datetime.timezone.utc).isoformat(), 'finishedAt': now(),
         'labels': {'base': bt, 'vN': vt}, 'references': 'references-' + refs + '.json', 'stopped': stopped,
         'rootFilesChangedSinceStart': len(changed), 'sample': changed[:10], 'sameEpoch': not changed, 'steps': steps})
    return changed
py(OPS / 'verify_eval_root.py', 'epoch-' + epoch + '-start')
py(OPS / 'guarded_measure.py', bt, bt, refs)
if py(OPS / 'base_check.py', bt, must=False) != 0:
    record('base v7 não bate com o selado do BUILD0247 (base-vs-sealed.json)')
    print('STOP: base mismatch'); sys.exit(2)
py(OPS / 'guarded_measure.py', vt, vt, refs)
py(OPS / 'verify_eval_root.py', 'epoch-' + epoch + '-end')
changed = record()
print('epoch', epoch, 'changed', len(changed))
