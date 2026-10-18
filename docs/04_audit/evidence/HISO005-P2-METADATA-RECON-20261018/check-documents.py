"""Scoped T1 checks only; never formats sealed inputs or reviewer artifacts."""
from pathlib import Path
import datetime
import hashlib
import json
import subprocess

EV = Path(__file__).resolve().parent
ROOT = EV.parents[3]
NODE = '/home/ricardo/.nvm/versions/node/v22.23.2/bin/node'
native = [
    'docs/02_spec/0240_b6_node_metadata_resolution_scope.md',
    'docs/02_spec/0190_spec_validation.md',
    'docs/03_build/0391_hiso005_semantic_proof_execution.md',
    'docs/03_build/0370_harness_product_isolation_backlog.md',
    'docs/08_runtime/agent_coordination.md',
    'docs/08_runtime/handoffs/hiso005_proof_20261017.md',
    'docs/99_runtime_state.md',
    'docs/20_master_execution_log.md',
    'docs/30_backlog_master.md'
]
coordination = ROOT / 'docs/08_runtime/agent_coordination.md'
coord_text = coordination.read_text()
claim_start = coord_text.index('### HISO005-P2-METADATA-RECON-20261018')
claim_end = coord_text.index('\n### ', claim_start + 5)
claim_text = coord_text[claim_start:claim_end]
(EV / 'coordination-owned-section.md').write_text(claim_text.rstrip() + '\n')
own = [str(x.relative_to(ROOT)) for x in sorted(EV.glob('*.md'))]
# Peer-owned historical sections are checked for links but never reformatted.
human = [n for n in native if n != 'docs/08_runtime/agent_coordination.md'] + own
rows = []
for name, argv in [
    ('format', [NODE, 'node_modules/prettier/bin/prettier.cjs', '--ignore-path', '/dev/null', '--check', *human]),
    ('links', [NODE, 'scripts/check-doc-links.mjs', *native, str(EV.relative_to(ROOT))]),
    ('hygiene', [NODE, 'scripts/check-evidence-hygiene.mjs', str(EV.relative_to(ROOT))])
]:
    p = subprocess.run(argv, cwd=ROOT, capture_output=True, text=True, timeout=60)
    rows.append({'name': name, 'argv': argv, 'cwd': str(ROOT), 'exitCode': p.returncode,
                 'stdout': p.stdout, 'stderr': p.stderr})
files = [{'path': n, 'bytes': (ROOT / n).stat().st_size,
          'sha256': hashlib.sha256((ROOT / n).read_bytes()).hexdigest()} for n in human]
out = {'status': 'PASS' if all(x['exitCode'] == 0 for x in rows) else 'FAIL',
       'observedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
       'commands': rows, 'humanInputs': files,
       'coordinationScope': {'ownedSectionSha256': hashlib.sha256(claim_text.encode()).hexdigest(),
                             'source': str(coordination.relative_to(ROOT)),
                             'formatScope': 'Owned claim snapshot only; peer tail preserved'},
       'scope': 'T1 only; no runtime/application tests or future MS acceptances granted'}
(EV / 'document-checks-final.json').write_text(json.dumps(out, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'status': out['status'], 'commands': [{k: x[k] for k in ('name', 'exitCode')} for x in rows],
                  'formatErrors': rows[0]['stderr'], 'humanFiles': len(files)}, ensure_ascii=False))
raise SystemExit(0 if out['status'] == 'PASS' else 1)
