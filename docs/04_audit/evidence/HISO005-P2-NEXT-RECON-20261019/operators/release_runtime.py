"""Release the private runtime of HISO005-P2-NEXT-RECON-20261019 after recording hashes of what is removed.
Removes only paths under RUNTIME; the eval-228e worktree is removed with `git worktree remove` (its own
worktree registration), never with reset/clean on the shared repository.

usage: release_runtime.py
"""
import json, os, shutil, subprocess, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

assert str(RUNTIME).startswith('/mnt/dados/cvg-work/cvg-hiso005-next-recon-runtime-20261019')
rec = {'task': TASK, 'observedAt': now(), 'runtime': str(RUNTIME), 'recordedBeforeRemoval': [], 'removed': [], 'kept': []}
for rel in ['installed-reference-ref/reference.json', 'installed-reference-excl/reference.json', 'compiled-reference-ref/reference.json',
            'compiled-reference-excl/reference.json', 'engine-input.json', 'pipeline-caps-256-250k/normal-report.json.gz',
            'pipeline-caps-256-250k/strict-report.json.gz', 'pipeline-q2-excl/normal-report.json.gz', 'pipeline-q2-excl/strict-report.json.gz',
            'probe-P1-official/report.json.gz', 'probe-P2-caps256-250k/report.json.gz', 'probe-P3-caps256-250k-240s-cmp300s/report.json.gz']:
    f = RUNTIME / rel
    if f.exists():
        rec['recordedBeforeRemoval'].append({'path': rel, 'bytes': f.stat().st_size, 'sha256': sha(f)})
procs = subprocess.run(['pgrep', '-af', str(RUNTIME)], capture_output=True, text=True).stdout.strip().splitlines()
procs = [p for p in procs if 'release_runtime.py' not in p and 'pgrep' not in p]
assert not procs, procs
rec['liveProcessesBefore'] = procs
wt = RUNTIME / 'eval-228e'
if wt.exists():
    p = subprocess.run(['git', '-C', str(PROJECT), 'worktree', 'remove', str(wt)], capture_output=True, text=True)
    rec['worktreeRemove'] = {'exitCode': p.returncode, 'stderr': p.stderr[-500:]}
    assert p.returncode == 0, p.stderr
size = int(subprocess.check_output(['du', '-sb', str(RUNTIME)], text=True).split()[0])
for child in sorted(RUNTIME.iterdir()):
    if child.is_dir() and not child.is_symlink():
        shutil.rmtree(child)
    else:
        child.unlink()
    rec['removed'].append(child.name)
RUNTIME.rmdir()
rec['bytesReleased'] = size
rec['runtimeExists'] = RUNTIME.exists()
rec['worktreeListed'] = str(wt) in subprocess.check_output(['git', '-C', str(PROJECT), 'worktree', 'list'], text=True)
rec['postgres'] = 'nenhum PG foi criado nesta unidade'
rec['ports'] = 'nenhuma porta foi aberta nesta unidade'
save('runtime-release-receipt.json', rec)
print(json.dumps({k: rec[k] for k in ('bytesReleased', 'runtimeExists', 'worktreeListed', 'removed')}, indent=1))
