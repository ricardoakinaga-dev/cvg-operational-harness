"""Release the private runtime of HISO005-P2-BUILD-0245 after recording hashes; the runtime's own pristine worktree
(eval-228e, used by the installed recipe) goes with `git worktree remove`. PG must already be removed. The candidate
stays as the detached anchor of the commit; the reconstituted evaluated root stays for the next BUILDs."""
import json, shutil, socket, subprocess, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

assert str(RUNTIME) == '/mnt/dados/cvg-work/cvg-hiso005-build0245-runtime-20261020'
rec = {'task': TASK, 'observedAt': now(), 'runtime': str(RUNTIME), 'recordedBeforeRemoval': []}
for f in sorted(RUNTIME.glob('refs-*/*/reference.json')) + sorted(RUNTIME.glob('tools-*/scripts/boundary-semantic-engine.mjs')):
    rec['recordedBeforeRemoval'].append({'path': str(f.relative_to(RUNTIME)), 'bytes': f.stat().st_size, 'sha256': sha(f)})
procs = [p for p in subprocess.run(['pgrep', '-af', str(RUNTIME)], capture_output=True, text=True).stdout.splitlines() if 'pgrep' not in p and 'release_runtime' not in p]
assert not procs, procs
assert subprocess.run(['docker', 'ps', '-a', '--filter', 'name=^' + PG_NAME + '$', '--format', '{{.ID}}'], capture_output=True, text=True).stdout.strip() == ''
ports = {}
for port in (PG_PORT, API_PORT, WEB_PORT):
    with socket.socket() as s:
        try:
            s.bind(('127.0.0.1', port)); ports[port] = 'free'
        except OSError:
            ports[port] = 'busy'
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
rec.update(bytesReleased=size, runtimeExists=RUNTIME.exists(), ports=ports,
           worktreeListed=str(wt) in subprocess.check_output(['git', '-C', str(PROJECT), 'worktree', 'list'], text=True),
           postgres=PG_NAME + ' parado e removido antes da liberação', liveProcesses=[],
           candidateKept={'path': str(CANDIDATE), 'head': head(), 'why': 'âncora detached do commit BUILD0245 até a promoção pelo lead'},
           evalRootKept={'path': str(EVAL_ROOT), 'head': head(EVAL_ROOT), 'why': 'raiz avaliada 228e7918 reconstituída, mantida para os próximos BUILDs (pedido do lead)',
                         'trackedClean': git('status', '--porcelain', '--untracked-files=no', cwd=EVAL_ROOT) == ''})
save('runtime-release-receipt.json', rec)
print(json.dumps({k: rec[k] for k in ('bytesReleased', 'runtimeExists', 'worktreeListed', 'ports', 'removed', 'evalRootKept')})[:1800])
