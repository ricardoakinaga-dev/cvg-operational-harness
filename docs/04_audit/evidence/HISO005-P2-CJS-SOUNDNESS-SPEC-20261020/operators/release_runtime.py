"""Release the private runtime of HISO005-P2-CJS-SOUNDNESS-SPEC-20261020 after recording the sha256 of the references,
engine copies and reports that are removed. No PG, port or worktree was created. The PR9 worktree and the evaluated
root are only checked (git status, 1.410 inputs). usage: release_runtime.py"""
import json, shutil, subprocess, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

assert str(RUNTIME) == '/mnt/dados/cvg-work/cvg-hiso005-cjs-spec-runtime-20261020'
rec = {'task': TASK, 'observedAt': now(), 'runtime': str(RUNTIME), 'recordedBeforeRemoval': []}
files = sorted(RUNTIME.glob('refs-*/*/reference.json')) + sorted(RUNTIME.glob('tools-*/scripts/boundary-semantic-engine.mjs')) + sorted(RUNTIME.glob('reports/*.json.gz'))
for f in files:
    if f.is_symlink(): continue
    rec['recordedBeforeRemoval'].append({'path': str(f.relative_to(RUNTIME)), 'bytes': f.stat().st_size, 'sha256': sha(f)})
rec['keptInEvidence'] = [p.name for p in sorted(EV.glob('real-*-report.json.gz'))]
procs = [p for p in subprocess.run(['pgrep', '-af', str(RUNTIME)], capture_output=True, text=True).stdout.splitlines() if 'pgrep' not in p and 'release_runtime' not in p]
assert not procs, procs
pr9 = subprocess.run(['git', '-C', str(PR9), 'status', '--short'], capture_output=True, text=True).stdout.splitlines()
ev = subprocess.run(['git', '-C', str(EVAL_ROOT), 'status', '--short', '--untracked-files=no'], capture_output=True, text=True).stdout.splitlines()
size = int(subprocess.check_output(['du', '-sb', str(RUNTIME)], text=True).split()[0])
rec['removed'] = sorted(c.name for c in RUNTIME.iterdir())
for child in sorted(RUNTIME.iterdir()):
    if child.is_dir() and not child.is_symlink():
        shutil.rmtree(child)
    else:
        child.unlink()
RUNTIME.rmdir()
rec.update(bytesReleased=size, runtimeExists=RUNTIME.exists(), postgres='nenhum PG foi criado nesta unidade', ports='nenhuma porta aberta', liveProcesses=[],
           pr9Worktree={'path': str(PR9), 'gitStatusLines': len(pr9), 'note': 'só leitura: typescript e node_modules copiados, prettier via npx'},
           evaluatedRoot={'path': str(EVAL_ROOT), 'trackedChanges': len(ev), 'inputsCheck': 'eval-root-check-after.json (1.410/1.410)', 'note': 'só leitura'})
save('runtime-release-receipt.json', rec)
print(json.dumps({k: rec[k] for k in ('bytesReleased', 'runtimeExists', 'removed', 'pr9Worktree', 'evaluatedRoot')}, ensure_ascii=False)[:1500])
