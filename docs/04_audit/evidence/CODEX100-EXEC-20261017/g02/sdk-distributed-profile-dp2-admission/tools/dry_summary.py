"""Summary of the pre-freeze dry runs (supervisor.py dry CASE: own-code DIAG rows only, bwrap without systemd-run, no ledger, no budget;
DP1-ADM/DV2 carry-over: refused in code outside DRY_ROWS). Run: python3 -I -B tools/dry_summary.py -> dry-runs-before-freeze.json.
The dry evidence stays in the private runtime (outside docs/); this file records what ran and with what result."""
import datetime
import hashlib
import json
from pathlib import Path

UNIT = Path(__file__).resolve().parent.parent
DRY = Path('/mnt/dados/cvg-work/cvg-codex100-dp2-runtime-20261020/dry')
rows = []
for ev in sorted(DRY.glob('evidence-*')):
    r = json.loads((ev / 'result.json').read_text())
    rows.append({'folder': str(ev), 'case': r['case'], 'status': r.get('status'), 'verdict': r.get('verdict'), 'dry': r.get('dry'),
                 'failed_diag_checks': sorted(k for k, v in (r.get('diag_checks') or {}).items() if v is not True and not k.startswith('info_')),
                 'result_sha256': hashlib.sha256((ev / 'result.json').read_bytes()).hexdigest(), 'observed_at': r.get('observed_at')})
doc = {'kind': 'DRY_RUNS_BEFORE_FREEZE', 'task': 'DX100-G02:IMPLEMENT-AND-ADMIT-SDK-DISTRIBUTED-PROFILE-DP-2', 'runs': rows,
       'rule': 'own-code DIAG rows only (DRY_ROWS); never the published binary nor the SDK; not services, not slots; the admission uses only the '
               'DIAG of the service budget after the source freeze', 'recorded_at': datetime.datetime.now(datetime.timezone.utc).isoformat()}
(UNIT / 'dry-runs-before-freeze.json').write_text(json.dumps(doc, ensure_ascii=False, indent=2) + '\n')
print(json.dumps([[x['case'], x['status']] for x in rows]))
