"""Scoped T1 checks for HISO005-P2-NEXT-RECON-20261018.

Formats are only checked (never written). Links cover the SPEC and this
evidence folder; hygiene covers this folder. Reviewer artifacts are checked for
links/hygiene but not reformatted. Usage: python3 -I check-documents.py
"""
from pathlib import Path
import datetime
import hashlib
import json
import subprocess

EV = Path(__file__).resolve().parent
ROOT = EV.parents[3]
NODE = '/home/ricardo/.nvm/versions/node/v22.23.2/bin/node'
SPEC = 'docs/02_spec/0241_b6_integral_body_installed_provenance.md'
own_md = [str(p.relative_to(ROOT)) for p in sorted(EV.glob('*.md'))]
human = [SPEC] + own_md
rows = []
for name, argv in [
    ('format', [NODE, 'node_modules/prettier/bin/prettier.cjs', '--ignore-path', '/dev/null', '--check', *human]),
    ('links', [NODE, 'scripts/check-doc-links.mjs', SPEC, str(EV.relative_to(ROOT))]),
    ('hygiene', [NODE, 'scripts/check-evidence-hygiene.mjs', str(EV.relative_to(ROOT))]),
]:
    p = subprocess.run(argv, cwd=ROOT, capture_output=True, text=True, timeout=120)
    rows.append({'name': name, 'argv': argv, 'cwd': str(ROOT), 'exitCode': p.returncode,
                 'stdout': p.stdout[-6000:], 'stderr': p.stderr[-4000:]})
files = [{'path': n, 'bytes': (ROOT / n).stat().st_size,
          'sha256': hashlib.sha256((ROOT / n).read_bytes()).hexdigest()} for n in human]
out = {'status': 'PASS' if all(x['exitCode'] == 0 for x in rows) else 'FAIL',
       'observedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
       'commands': rows, 'humanInputs': files,
       'scope': 'T1 somente: formato/links/higiene dos documentos próprios; nenhum teste de aplicação ou aceite IB concedido'}
(EV / 'document-checks-final.json').write_text(json.dumps(out, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'status': out['status'], 'commands': [{k: x[k] for k in ('name', 'exitCode')} for x in rows],
                  'humanFiles': len(files)}, ensure_ascii=False))
raise SystemExit(0 if out['status'] == 'PASS' else 1)
