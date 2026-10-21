"""(adapted from HISO005-P2-BUILD-0245) Depois do certify: copia as saídas principais para certify-<attempt>-artifacts/ (unit gzip), resume os 16 gates do log,
restaura certification/ na própria candidata (saídas do próprio certify), para e remove o PG próprio e grava certify-summary.json.
usage: python3 -B certify_post.py <attempt> [--keep-pg]"""
import gzip, json, re, shutil, subprocess, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

attempt = sys.argv[1]
keep_pg = '--keep-pg' in sys.argv[2:]
rc = load('certify-' + attempt + '-receipt.json')
assert rc['status'] == 'FINISHED'
c = load('commit-0247.json')
log = (EV / ('certify-' + attempt + '.log')).read_text(errors='replace')
gates = re.findall(r'^\[certify\] (PASS|FAIL|SKIP)\s+(\w+) \(exit (-?\d+), (\d+)ms\)', log, re.M)
decision = re.search(r'decision=(\S+) certification=(\S+)', log)
art = EV / ('certify-' + attempt + '-artifacts')
art.mkdir(exist_ok=True)
copied = []
for name in ['phase10-result.json', 'manifest.json', 'candidate-manifest.json', 'critical-coverage.json', 'e2e-test-report.json', 'unit-test-report.json']:
    src = CANDIDATE / 'certification' / name
    if not src.exists():
        continue
    if name == 'unit-test-report.json':
        (art / (name + '.gz')).write_bytes(gzip.compress(src.read_bytes(), mtime=0)); copied.append(name + '.gz')
    else:
        shutil.copyfile(src, art / name); copied.append(name)
unit, failed = None, []
u = CANDIDATE / 'certification/unit-test-report.json'
if u.exists():
    j = json.loads(u.read_text())
    unit = '%d/%d' % (j.get('numPassedTests', -1), j.get('numTotalTests', -1))
    failed = [{'file': f['name'].split(str(CANDIDATE) + '/')[-1], 'test': a['fullName'], 'durationMs': round(a.get('duration') or 0), 'message': (a['failureMessages'] or [''])[0][:200]}
              for f in j['testResults'] for a in f['assertionResults'] if a['status'] == 'failed']
modified = [l[3:] for l in git('status', '--porcelain', '--untracked-files=all', '--', 'certification').splitlines()]
tracked_mod = [l for l in git('status', '--porcelain', '--untracked-files=no', '--', 'certification').splitlines()]
untracked = [l[3:] for l in git('status', '--porcelain', '--untracked-files=all', '--', 'certification').splitlines() if l.startswith('??')]
# saídas do próprio certify na própria candidata
subprocess.run(['git', 'checkout', '--', 'certification'], cwd=CANDIDATE, check=True)
for p in untracked:
    q = CANDIDATE / p
    assert q.resolve().is_relative_to(CANDIDATE / 'certification')
    if q.is_dir():
        shutil.rmtree(q)
    elif q.exists():
        q.unlink()
clean = git('status', '--porcelain', '--untracked-files=no') == ''
pg = load('postgres-resource.json')
if keep_pg:
    pgrec = {'container': pg['containerId'], 'kept': True, 'why': 'mantido para a tentativa seguinte do certify'}
else:
    stop = subprocess.run(['docker', 'stop', pg['containerId']], capture_output=True, text=True)
    rm = subprocess.run(['docker', 'rm', pg['containerId']], capture_output=True, text=True)
    remaining = subprocess.run(['docker', 'ps', '-a', '--filter', 'label=' + PG_LABEL, '--format', '{{.ID}}'], capture_output=True, text=True).stdout.strip()
    pgrec = {'container': pg['containerId'], 'stopExit': stop.returncode, 'rmExit': rm.returncode, 'remaining': remaining}
out = {'task': TASK, 'observedAt': now(), 'receipt': 'certify-' + attempt + '-receipt.json', 'log': 'certify-' + attempt + '.log',
       'artifacts': art.name + '/', 'artifactsCopied': copied, 'commit': c['commit'], 'head': head(), 'exitCode': rc['exitCode'],
       'elapsedSeconds': rc['elapsedSeconds'], 'gates': len(gates), 'gateResults': [{'gate': g, 'result': r, 'exit': int(e), 'ms': int(ms)} for r, g, e, ms in gates],
       'allPass': rc['exitCode'] == 0 and len(gates) == 16 and all(r == 'PASS' for r, *_ in gates),
       'decision': decision.group(1) if decision else None, 'certification': decision.group(2) if decision else None, 'unit': unit,
       'candidateCertificationOutputs': {'trackedFilesModifiedByCertify': len(tracked_mod), 'untrackedCreatedByCertify': len(untracked), 'restoredToHead': clean,
                                         'how': 'git checkout -- certification na própria candidata (saídas do próprio certify, copiadas antes para ' + art.name + '/)'},
       'failedTests': failed, 'postgres': pgrec}
save('certify-' + attempt + '-summary.json', out)
print(json.dumps({k: out[k] for k in ('exitCode', 'gates', 'allPass', 'decision', 'certification', 'unit', 'elapsedSeconds')}), out['candidateCertificationOutputs'], out['postgres'])
