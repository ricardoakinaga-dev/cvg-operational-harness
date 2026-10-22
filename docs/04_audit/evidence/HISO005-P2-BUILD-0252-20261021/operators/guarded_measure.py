"""(adapted from HISO005-P2-BUILD-0247 guarded_measure.py) Guarded measurement on the shared evaluated root: before a
run, wait for load <= 12, no foreign build process on the root (compiled/installed recipe, build-runtime, tsc, npm,
tsbuildinfo) and no file outside node_modules/.git changed in the last 120 s. After: the run is accepted only if no
such file changed during the window and every mode has validation true; otherwise it is repeated (max 3). Every
attempt is recorded in guarded-runs.json. usage: guarded_measure.py <label> <tools> <refs-label>"""
import datetime, json, os, subprocess, sys, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

label, tools, refs = sys.argv[1:4]
BUILD = ('boundary-semantic-compiled', 'build-installed-reference', 'build-runtime', '/tsc', 'npm-cli', 'tsbuildinfo')


def changed_since(t0):
    p = subprocess.run(['find', str(EVAL_ROOT), '(', '-path', str(EVAL_ROOT / 'node_modules'), '-o', '-path', str(EVAL_ROOT / '.git'), ')', '-prune', '-o',
                        '-type', 'f', '-newermt', '@' + str(int(t0)), '-print'], capture_output=True, text=True)
    return [l for l in p.stdout.splitlines() if l]


def foreign_builds():
    out = subprocess.run(['ps', '-eo', 'pid=,args='], capture_output=True, text=True).stdout.splitlines()
    return [l.strip()[:160] for l in out if str(EVAL_ROOT) in l and any(b in l for b in BUILD) and str(RUNTIME) not in l]


log_path = EV / 'guarded-runs.json'
rec = json.loads(log_path.read_text()) if log_path.exists() else {'task': TASK, 'rule': __doc__.split('usage:')[0].strip(), 'attempts': []}
for attempt in range(1, 4):
    waited = 0
    while True:
        wait_load()
        quiet = not changed_since(time.time() - 120) and not foreign_builds()
        if quiet: break
        time.sleep(30); waited += 30
    t0 = time.time() - 1
    p = subprocess.run(['/usr/bin/python3', '-I', '-B', str(OPS / 'measure.py'), label, tools, refs], cwd=str(OPS), capture_output=True, text=True)
    touched = changed_since(t0)
    summ = load('real-' + label + '-summary.json') if p.returncode == 0 else None
    valid = bool(summ) and all(r['validation'] == {'valid': True} for r in summ['runs'])
    ok = p.returncode == 0 and valid and not touched
    rec['attempts'].append({'label': label, 'tools': tools, 'refs': refs, 'attempt': attempt, 'waitedForQuietSeconds': waited,
                            'startedAt': datetime.datetime.fromtimestamp(t0, datetime.timezone.utc).isoformat(),
                            'finishedAt': now(), 'exitCode': p.returncode, 'allValid': valid, 'rootFilesChangedDuringRun': touched[:20],
                            'rootFilesChangedCount': len(touched), 'accepted': ok,
                            'diagnostics': [r['diagnostics'] for r in summ['runs']] if summ else None, 'stderrTail': p.stderr[-300:]})
    log_path.write_text(json.dumps(rec, indent=2, ensure_ascii=False) + '\n')
    print(label, 'attempt', attempt, 'accepted' if ok else 'REJECTED', len(touched), valid, flush=True)
    if ok: break
else:
    sys.exit(1)
