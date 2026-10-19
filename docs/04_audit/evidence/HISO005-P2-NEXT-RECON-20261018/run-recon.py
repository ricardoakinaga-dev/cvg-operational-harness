"""Runs the four readonly recon operators and records argv/cwd/exit/output hashes.

Usage: python3 -I run-recon.py <private-fixture-root> [output-dir]
Default output-dir is this folder. Fixtures must live outside the repository.
"""
from pathlib import Path
import datetime
import hashlib
import json
import subprocess
import sys

EV = Path(__file__).resolve().parent
ROOT = EV.parents[3]
NODE = '/home/ricardo/.nvm/versions/node/v22.23.2/bin/node'
fixtures = str(Path(sys.argv[1]).resolve())
out_dir = Path(sys.argv[2]).resolve() if len(sys.argv) > 2 else EV
assert not fixtures.startswith(str(ROOT)), 'fixtures must be private, outside the repository'
ENV = {'PATH': '/usr/bin:/bin', 'HOME': '/nonexistent', 'LANG': 'C', 'LC_ALL': 'C', 'TZ': 'UTC'}
steps = [
    ('partition', ['python3', '-I', str(EV / 'recon-partition.py'), str(out_dir)], 'cause-partition.json'),
    ('physical', [NODE, str(EV / 'recon-physical.mjs'), str(out_dir)], 'physical-recon.json'),
    ('oracle', [NODE, str(EV / 'resolve-oracle.mjs'), str(out_dir)], 'resolve-oracle.json'),
    ('controls', [NODE, str(EV / 'body-controls.mjs'), fixtures, str(out_dir)], 'body-controls.json'),
]
rows = []
for name, argv, output in steps:
    started = datetime.datetime.now(datetime.timezone.utc).isoformat()
    p = subprocess.run(argv, cwd=ROOT, env=ENV, capture_output=True, text=True, timeout=900)
    rows.append({
        'step': name, 'argv': argv, 'cwd': str(ROOT), 'env': ENV, 'startedAt': started,
        'finishedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'exitCode': p.returncode,
        'stdoutSha256': hashlib.sha256(p.stdout.encode()).hexdigest(), 'stderr': p.stderr[-4000:],
        'output': output, 'outputSha256': hashlib.sha256((out_dir / output).read_bytes()).hexdigest(),
    })
    print(name, p.returncode, flush=True)
scripts = {s: hashlib.sha256((EV / s).read_bytes()).hexdigest()
           for s in ['recon-partition.py', 'recon-physical.mjs', 'resolve-oracle.mjs', 'body-controls.mjs', 'run-recon.py']}
doc = {'task': 'HISO005-P2-NEXT-RECON-20261018', 'fixtureRoot': fixtures, 'outputDir': str(out_dir),
       'operatorSha256': scripts, 'steps': rows,
       'status': 'PASS' if all(r['exitCode'] == 0 for r in rows) else 'FAIL'}
(out_dir / 'recon-commands.json').write_text(json.dumps(doc, ensure_ascii=False, indent=2) + '\n')
raise SystemExit(0 if doc['status'] == 'PASS' else 1)
