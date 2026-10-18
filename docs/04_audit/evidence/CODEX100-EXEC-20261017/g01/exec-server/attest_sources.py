"""Bind both source lanes to Git objects; never execute the target."""
from pathlib import Path
import hashlib
import json
import subprocess

OUT = Path(__file__).resolve().parent
ROOT = next(p for p in OUT.parents if (p / 'docs/07_agents/AGENTS.md').exists())
UPSTREAM = Path('/tmp/cvg-rea-codex-20261017/upstream')
PIN = '8d9f6466ff0294785d56f55b1fe363d132fe4133'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def read(path):
    return json.loads(path.read_text())


def require(ok, message):
    if not ok:
        raise AssertionError(message)


require(subprocess.check_output(['git', '-C', str(UPSTREAM), 'rev-parse', 'HEAD'], text=True).strip() == PIN,
        'Source pin changed')
require(not subprocess.check_output(['git', '-C', str(UPSTREAM), 'status', '--porcelain'], text=True).strip(),
        'Upstream working tree changed')
sources = {}


def visit(value):
    if isinstance(value, dict):
        path = value.get('path', '')
        if path.startswith('codex-rs/') and (UPSTREAM / path).is_file():
            actual = sha((UPSTREAM / path).read_bytes())
            recorded = value.get('file_sha256')
            # Full-file source records use sha256; excerpts use a separate digest.
            if recorded is None and 'role' in value:
                recorded = value.get('sha256')
            if recorded is not None:
                require(actual == recorded, 'Full-file digest mismatch: ' + path)
            sources[path] = actual
        for child in value.values():
            visit(child)
    elif isinstance(value, list):
        for child in value:
            visit(child)


for name in ['flows.json', 'types/inventory.json']:
    visit(read(OUT / name))
objects = []
for path, digest in sorted(sources.items()):
    blob = subprocess.check_output(['git', '-C', str(UPSTREAM), 'show', PIN + ':' + path])
    require(sha(blob) == digest, 'Working source differs from pinned Git object: ' + path)
    objects.append({'path': path, 'sha256': digest, 'bytes': len(blob)})

protected = []
for name in ['entrypoints', 'pinned-variants']:
    manifest = read(OUT.parent / name / 'manifest.json')
    for row in manifest['files']:
        require(sha((ROOT / row['path']).read_bytes()) == row['sha256'],
                'Previous accepted input changed: ' + row['path'])
    protected.append({'package': name, 'files': len(manifest['files']), 'result': 'UNCHANGED'})

catalog = ROOT / 'docs/03_build/tracking/codex100_catalog_v1.json'
baseline = read(OUT.parents[1] / 'manifest.json')
catalog_row = next(r for r in baseline['files'] if r['path'] == str(catalog.relative_to(ROOT)))
require(sha(catalog.read_bytes()) == catalog_row['sha256'], 'Catalog changed during this unit')
review = read(OUT / 'review-input-r2.json')
archive = OUT / 'review-r2-inputs'
require(all(sha((archive / row['path']).read_bytes()) == row['sha256'] for row in review['files']),
        'Archived frozen review input changed')
result = {'kind': 'T1_SOURCE_GIT_OBJECT_ATTESTATION_NOT_EXECUTABLE_BINDING', 'pin': PIN,
          'source_files': objects, 'source_files_count': len(objects),
          'protected_packages': protected, 'catalog': 'UNCHANGED',
          'review_input_files': len(review['files']), 'review_inputs': 'BYTE_EXACT_R2_ARCHIVE',
          'functional_receipts': 0, 'source_executable_binding': 'OPEN_G02',
          'full_g01_closure': False}
(OUT / 'source-attestation.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({k: v for k, v in result.items() if k != 'source_files'}))
