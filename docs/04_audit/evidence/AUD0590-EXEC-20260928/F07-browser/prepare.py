from pathlib import Path
import hashlib
import json
import socket
import subprocess
import tarfile

source = Path('/home/ricardo/Área de trabalho/cvg-operational-harness')
work = Path('/tmp/cvg-aud0590-f07-20260929')
checkout = work / 'checkout'
assert not checkout.exists(), 'Snapshot already exists; inspect before retrying.'
for port in (3267, 4267):
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', port))
sha = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=source, text=True).strip()
assert sha == '4ae40d69b77c5b422a6302efac5cfcee005d6f1b', 'Source HEAD changed.'
archive = work / 'source.tar'
subprocess.run(['git', 'archive', '--format=tar', '--output=' + str(archive), sha], cwd=source, check=True)
checkout.mkdir()
with tarfile.open(archive) as packed:
    packed.extractall(checkout, filter='data')
subprocess.run(['cp', '-a', '--reflink=auto', str(source / 'node_modules'), str(checkout / 'node_modules')], check=True)
files = subprocess.check_output(['git', 'ls-tree', '-r', '--name-only', sha], cwd=source, text=True).splitlines()
manifest = {}
for name in files:
    p = checkout / name
    if p.is_file():
        manifest[name] = hashlib.sha256(p.read_bytes()).hexdigest()
setup = {
    'sourceCommit': sha,
    'sourceBranch': subprocess.check_output(['git', 'branch', '--show-current'], cwd=source, text=True).strip(),
    'snapshot': str(checkout),
    'snapshotPolicy': 'Committed HEAD only; concurrent dirty and untracked root files excluded.',
    'dependencies': 'Independent reflink/copy of existing node_modules; no install or lockfile mutation.',
    'ports': [3267, 4267],
    'retries': 0,
    'plannedRuns': 1,
    'scope': 'Existing synthetic trusted-bootstrap browser matrix; not corporate OIDC, PostgreSQL, or release qualification.',
    'trackedFileHashes': manifest
}
(work / 'setup.json').write_text(json.dumps(setup, indent=2) + '\n')
print(json.dumps({'commit': sha, 'files': len(manifest), 'snapshot': str(checkout), 'setupSha256': hashlib.sha256((work / 'setup.json').read_bytes()).hexdigest()}))
