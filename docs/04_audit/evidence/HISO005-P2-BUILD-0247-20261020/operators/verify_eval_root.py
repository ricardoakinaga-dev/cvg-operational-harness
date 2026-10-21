"""Read-only check of the evaluated root 228e7918 (reconstituted by HISO005-P2-BUILD-0245) against the 1.410 input
sha256 of the sealed BUILD0244 report. Nothing is written in EVAL_ROOT. usage: verify_eval_root.py <tag>"""
import gzip, json, subprocess, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

tag = sys.argv[1]
r = json.loads(gzip.decompress(SEALED_V5.read_bytes()))
inputs = r['semanticBoundary']['inputs']
match, mismatch, missing = 0, [], []
for x in inputs:
    p = EVAL_ROOT / x['file']
    if not p.is_file():
        missing.append(x['file']); continue
    if sha(p) == x['sha256']: match += 1
    else: mismatch.append(x['file'])
hd = head(EVAL_ROOT)
tracked = git('status', '--porcelain', '--untracked-files=no', cwd=EVAL_ROOT).splitlines()
rec = {'task': TASK, 'tag': tag, 'observedAt': now(), 'evalRoot': str(EVAL_ROOT), 'head': hd, 'expectedCommit': EVAL_COMMIT,
       'sealedReport': str(SEALED_V5.relative_to(PROJECT)), 'sealedReportSha256': sha(SEALED_V5), 'inputs': len(inputs),
       'matching': match, 'mismatching': mismatch, 'missing': missing, 'trackedModified': tracked,
       'packageLockSha256': sha(EVAL_ROOT / 'package-lock.json'),
       'reconstitutionReceipt': 'docs/04_audit/evidence/HISO005-P2-BUILD-0245-20261020/eval-root-reconstitution.json (PASS 1410/1410)',
       'verdict': 'PASS' if hd == EVAL_COMMIT and match == len(inputs) and not mismatch and not missing and not tracked else 'FAIL'}
save('eval-root-check-' + tag + '.json', rec)
print(json.dumps({k: rec[k] for k in ('tag', 'head', 'inputs', 'matching', 'verdict')}), len(mismatch), len(missing), tracked[:5])
