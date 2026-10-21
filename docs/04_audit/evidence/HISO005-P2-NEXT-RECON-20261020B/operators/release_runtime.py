"""Release the private runtime of HISO005-P2-NEXT-RECON-20261020B after recording the hashes of what is removed; the
eval-228e worktree goes with `git worktree remove` (own). No PG was created. The BUILD0244 candidate is not touched."""
import json, shutil, socket, subprocess, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

assert str(RUNTIME) == '/mnt/dados/cvg-work/cvg-hiso005-next-recon-20261020b-runtime'
rec = {'task': TASK, 'observedAt': now(), 'runtime': str(RUNTIME), 'recordedBeforeRemoval': []}
for f in sorted(RUNTIME.glob('refs-*/*/reference.json')) + sorted(RUNTIME.glob('tools-*/scripts/boundary-semantic-engine.mjs')) + sorted(RUNTIME.glob('census/engine-input.json')):
    rec['recordedBeforeRemoval'].append({'path': str(f.relative_to(RUNTIME)), 'bytes': f.stat().st_size, 'sha256': sha(f)})
procs = [p for p in subprocess.run(['pgrep', '-af', str(RUNTIME)], capture_output=True, text=True).stdout.splitlines() if 'pgrep' not in p and 'release_runtime' not in p]
assert not procs, procs
wt = RUNTIME / 'eval-228e'
if wt.exists():
    p = subprocess.run(['git', '-C', str(PROJECT), 'worktree', 'remove', str(wt)], capture_output=True, text=True)
    rec['worktreeRemove'] = {'exitCode': p.returncode, 'stderr': p.stderr[-300:]}
    assert p.returncode == 0, p.stderr
size = int(subprocess.check_output(['du', '-sb', str(RUNTIME)], text=True).split()[0])
rec['removed'] = sorted(c.name for c in RUNTIME.iterdir())
for child in sorted(RUNTIME.iterdir()):
    if child.is_dir() and not child.is_symlink():
        shutil.rmtree(child)
    else:
        child.unlink()
RUNTIME.rmdir()
rec.update(bytesReleased=size, runtimeExists=RUNTIME.exists(),
           worktreeListed=str(wt) in subprocess.check_output(['git', '-C', str(PROJECT), 'worktree', 'list'], text=True),
           postgres='nenhum PG foi criado nesta unidade', liveProcesses=[],
           candidateUntouched={'path': str(CANDIDATE), 'head': head(), 'note': 'âncora do BUILD0244; só o node_modules foi lido por cp -al'})
save('runtime-release-receipt.json', rec)
print(json.dumps({k: rec[k] for k in ('bytesReleased', 'runtimeExists', 'worktreeListed', 'removed')})[:1500])
