"""Read-only check of the evaluated root 228e7918 (reconstituted by HISO005-P2-BUILD-0245 in EVAL_ROOT) against the
1.410 input sha256 of the sealed BUILD0244 report. Nothing is written in EVAL_ROOT. usage: verify_eval_root.py <tag>"""
import gzip, json, subprocess, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

tag = sys.argv[1]
sealed = PROJECT / 'docs/04_audit/evidence/HISO005-P2-BUILD-0244-20261019/real-v5r3-normal-report.json.gz'
r = json.loads(gzip.decompress(sealed.read_bytes()))
inputs = r['semanticBoundary']['inputs']
match, mismatch, missing = 0, [], []
for x in inputs:
    p = EVAL_ROOT / x['file']
    if not p.is_file():
        missing.append(x['file']); continue
    if sha(p) == x['sha256']: match += 1
    else: mismatch.append(x['file'])
head = subprocess.run(['git', '-C', str(EVAL_ROOT), 'rev-parse', 'HEAD'], capture_output=True, text=True).stdout.strip()
tracked = subprocess.run(['git', '-C', str(EVAL_ROOT), 'status', '--porcelain', '--untracked-files=no'], capture_output=True, text=True).stdout.splitlines()
rec = {'task': TASK, 'observedAt': now(), 'evalRoot': str(EVAL_ROOT), 'head': head, 'expectedCommit': EVAL_COMMIT,
       'sealedReport': str(sealed.relative_to(PROJECT)), 'sealedReportSha256': sha(sealed), 'inputs': len(inputs),
       'matching': match, 'mismatching': mismatch, 'missing': missing, 'trackedModified': tracked,
       'packageLockSha256': sha(EVAL_ROOT / 'package-lock.json'),
       'reconstitutionReceipt': 'docs/04_audit/evidence/HISO005-P2-BUILD-0245-20261020/eval-root-reconstitution.json (PASS 1410/1410)',
       'verdict': 'PASS' if head == EVAL_COMMIT and match == len(inputs) and not mismatch and not missing else 'FAIL'}
save('eval-root-check-' + tag + '.json', rec)
print(json.dumps({k: rec[k] for k in ('head', 'inputs', 'matching', 'verdict')}, indent=1), len(mismatch), len(missing), tracked[:5])
