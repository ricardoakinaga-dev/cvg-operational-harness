"""Readonly integrity snapshot for HISO005-P2-NEXT-RECON-20261018.

Usage: python3 -I seal-check.py before|after
Records hashes of sealed inputs, root scripts, toolchain and git HEAD/index.
Never writes outside this evidence folder.
"""
from pathlib import Path
import datetime
import hashlib
import json
import subprocess
import sys

EV = Path(__file__).resolve().parent
ROOT = EV.parents[3]
NODE = Path('/home/ricardo/.nvm/versions/node/v22.23.2/bin/node')
RUNTIME = Path('/mnt/ia/cvg-hiso005-build0240-runtime-20261018')
SEALED = [
    'docs/04_audit/evidence/HISO005-P2-BUILD-0240-20261018',
    'docs/04_audit/evidence/HISO005-P2-METADATA-RECON-20261018',
]
SCRIPTS = [
    'scripts/boundary-semantic-engine.mjs',
    'scripts/boundary-semantic-resolution.mjs',
    'scripts/boundary-semantic-compiled.mjs',
    'scripts/check-product-boundary.mjs',
    'node_modules/typescript/lib/typescript.js',
]
EXPECTED = {
    'scripts/boundary-semantic-engine.mjs': '0497362b3642f645adcd190f9de53c57736e3da5eac5a611aa9cb47c5f7d852e',
    'scripts/boundary-semantic-resolution.mjs': '6e6141381131787393f1b3506f9a16a3dfd1cca0ea4f623fddf1d86436a117e8',
    'scripts/check-product-boundary.mjs': '35cba39fcd164a8cb44d1372fa872f986c8bde8d41a1f3324bcc38e5c348a70c',
    'node_modules/typescript/lib/typescript.js': '569177652966bd528c319171c7dd22860dbf72bde116cbc4f644f1d02bb12e39',
    'node': '3517c2df0b2f8cd7f422b4b8450ef81c6889f08eb03e281d6de9079b15e6a327',
}


def sha(p):
    h = hashlib.sha256()
    with open(p, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def tree(rel):
    base = ROOT / rel
    files = sorted(p for p in base.rglob('*') if p.is_file() and not p.is_symlink())
    rows = [{'path': str(p.relative_to(ROOT)), 'bytes': p.stat().st_size, 'sha256': sha(p)} for p in files]
    digest = hashlib.sha256(json.dumps(rows, sort_keys=True).encode()).hexdigest()
    return {'root': rel, 'files': len(rows), 'bytes': sum(r['bytes'] for r in rows), 'digest': digest}


def git(*args):
    return subprocess.run(['git', *args], cwd=ROOT, capture_output=True, text=True).stdout.strip()


mode = sys.argv[1]
assert mode in ('before', 'after')
scripts = {s: sha(ROOT / s) for s in SCRIPTS}
out = {
    'task': 'HISO005-P2-NEXT-RECON-20261018',
    'mode': mode,
    'observedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'gitHead': git('rev-parse', 'HEAD'),
    'gitIndexSha256': sha(ROOT / '.git/index'),
    'sealedPackages': [tree(s) for s in SEALED],
    'rootScripts': scripts,
    'node': {'path': str(NODE), 'sha256': sha(NODE)},
    'runtimeReferences': {
        'installedReferenceJson': sha(RUNTIME / 'installed-reference-r5/reference.json'),
        'compiledReferenceJson': sha(RUNTIME / 'compiled-reference-r6/reference.json'),
    },
    'expectedMatches': {
        k: (scripts.get(k) == v if k != 'node' else sha(NODE) == v) for k, v in EXPECTED.items()
    },
}
out['status'] = 'PASS' if all(out['expectedMatches'].values()) else 'FAIL'
(EV / f'seal-check-{mode}.json').write_text(json.dumps(out, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'status': out['status'], 'sealed': [(x['root'], x['files'], x['digest'][:12]) for x in out['sealedPackages']],
                  'head': out['gitHead']}, ensure_ascii=False))
raise SystemExit(0 if out['status'] == 'PASS' else 1)
