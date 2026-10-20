"""Private runtime: lock-required npm payloads (byte copy, sha512-verified), clean 228e7918 worktree for the
installed recipe, scripts of the PR #8 head (git archive) with a hard-linked node_modules, and the diagnostic copy."""
import base64, hashlib, json, os, shutil, subprocess, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

CAND = Path('/mnt/dados/cvg-work/cvg-hiso005-build0243-0242-20261019')
log = {'observedAt': now()}
# npm payloads
source = Path(os.path.realpath(os.path.expanduser('~/.npm/_cacache')))
dest = RUNTIME / 'npm-cache-source/_cacache/content-v2/sha512'
lock = json.loads((EVAL_ROOT / 'package-lock.json').read_text())
seen, copied, missing = set(), 0, []
for key, value in sorted(lock['packages'].items()):
    if 'node_modules/' not in key or value.get('link'):
        continue
    integrity = value['integrity']
    if integrity in seen:
        continue
    seen.add(integrity)
    digest = base64.b64decode(integrity[7:]); hexd = digest.hex()
    src = source / 'content-v2/sha512' / hexd[:2] / hexd[2:4] / hexd[4:]
    if not src.is_file():
        missing.append({'key': key, 'optional': value.get('optional') is True}); continue
    data = src.read_bytes(); assert hashlib.sha512(data).digest() == digest
    out = dest / hexd[:2] / hexd[2:4] / hexd[4:]; out.parent.mkdir(parents=True, exist_ok=True); out.write_bytes(data); copied += 1
assert not [m for m in missing if not m['optional']]
log['npmPayloads'] = {'copied': copied, 'missingOptional': len(missing), 'lockSha256': sha(EVAL_ROOT / 'package-lock.json')}
# clean worktree of the evaluated commit (installed recipe needs a clean checkout)
subprocess.run(['git', '-C', str(PROJECT), 'worktree', 'add', '--detach', str(RUNTIME / 'eval-228e'), EVAL_COMMIT], check=True, capture_output=True)
log['evalWorktree'] = str(RUNTIME / 'eval-228e')
# scripts of the PR #8 head
tools = RUNTIME / 'tools'
tools.mkdir()
archive = subprocess.run(['git', '-C', str(PROJECT), 'archive', '--format=tar', PR8_HEAD, 'scripts'], capture_output=True, check=True).stdout
subprocess.run(['/usr/bin/tar', '-x', '-C', str(tools)], input=archive, check=True)
subprocess.run(['/usr/bin/cp', '-al', str(CAND / 'node_modules'), str(tools / 'node_modules')], check=True)
diag = RUNTIME / 'tools-diag'
subprocess.run(['/usr/bin/cp', '-a', str(tools / 'scripts'), str(diag / 'scripts')] if diag.mkdir() is None else [], check=True)
subprocess.run(['/usr/bin/cp', '-al', str(CAND / 'node_modules'), str(diag / 'node_modules')], check=True)
p = subprocess.run([sys.executable, '-I', '-B', str(EV / 'operators/diag_patch.py'), str(diag / 'scripts')], capture_output=True, text=True)
assert p.returncode == 0, p.stderr
log['tools'] = {f.name: sha(f) for f in sorted((tools / 'scripts').glob('boundary-*.mjs'))} | {'check-product-boundary.mjs': sha(tools / 'scripts/check-product-boundary.mjs')}
log['diagEngineSha256'] = sha(diag / 'scripts/boundary-semantic-engine.mjs')
log['pr8Head'] = PR8_HEAD
save('runtime-setup.json', log)
print(json.dumps(log, indent=1)[:1500])
