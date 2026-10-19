"""Private byte-exact copy of the lock-required npm payloads (content-v2/sha512 only), verified by sha512.

~/.npm/_cacache is a symlink after the 18/10 migration and the reference recipe refuses CACHE_ALIAS; the
source cache is read only. Optional payloads absent from the source stay absent (npm decides selection).
"""
import base64, hashlib, json, os, shutil, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

source = Path(os.path.realpath(os.path.expanduser('~/.npm/_cacache')))
dest = RUNTIME / 'npm-cache-source' / '_cacache' / 'content-v2' / 'sha512'
assert not (RUNTIME / 'npm-cache-source').exists()
lock = json.loads((CANDIDATE / 'package-lock.json').read_text())
copied, missing, seen, total = [], [], set(), 0
for key, value in sorted(lock['packages'].items()):
    if 'node_modules/' not in key or value.get('link'):
        continue
    integrity = value.get('integrity', '')
    assert integrity.startswith('sha512-'), key
    if integrity in seen:
        continue
    seen.add(integrity)
    digest = base64.b64decode(integrity[7:])
    hexd = digest.hex()
    rel = Path(hexd[:2]) / hexd[2:4] / hexd[4:]
    src = source / 'content-v2' / 'sha512' / rel
    if not src.is_file():
        missing.append({'key': key, 'optional': value.get('optional') is True})
        continue
    data = src.read_bytes()
    assert hashlib.sha512(data).digest() == digest, key
    out = dest / rel
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(data)
    copied.append(integrity)
    total += len(data)
required_missing = [m for m in missing if not m['optional']]
rec = {'task': TASK, 'observedAt': now(), 'sourceCache': str(source), 'destination': str(RUNTIME / 'npm-cache-source'),
       'payloads': len(copied), 'bytes': total, 'integritySetSha256': shab('\n'.join(sorted(copied)).encode()),
       'missing': missing, 'requiredMissing': required_missing, 'lockSha256': sha(CANDIDATE / 'package-lock.json'),
       'reason': 'Recipe refuses CACHE_ALIAS (~/.npm/_cacache is a symlink); only lock-required sha512 payloads copied byte-exact and verified; source cache read only; not a candidate install, lockfile untouched.'}
save('npm-cache-source-copy.json', rec)
print(json.dumps({k: v for k, v in rec.items() if k != 'missing'} | {'missingCount': len(missing)}))
assert not required_missing
