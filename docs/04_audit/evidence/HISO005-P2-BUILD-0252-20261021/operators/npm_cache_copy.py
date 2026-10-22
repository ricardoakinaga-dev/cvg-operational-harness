"""(copied from HISO005-P2-BUILD-0247 npm_cache_copy.py, unchanged logic) Private byte-exact copy of the npm payloads
required by the locks of the evaluated root (228e7918) and of the candidate, verified by sha512 (content-v2/sha512
only). The user cache is read only; the recipe refuses an aliased cache, so it never reads ~/.npm/_cacache directly.
Not an install; no lockfile is touched. usage: npm_cache_copy.py"""
import base64, hashlib, json, os, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

source = Path(os.path.realpath(os.path.expanduser('~/.npm/_cacache')))
dest_root = RUNTIME / 'npm-cache-source'
dest = dest_root / '_cacache' / 'content-v2' / 'sha512'
assert not dest_root.exists()
locks = {'evaluatedRoot228e': EVAL_ROOT / 'package-lock.json', 'candidate': CANDIDATE / 'package-lock.json'}
copied, missing, seen, total = [], [], set(), 0
for label, lockfile in locks.items():
    lock = json.loads(lockfile.read_text())
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
            missing.append({'lock': label, 'key': key, 'optional': value.get('optional') is True})
            continue
        data = src.read_bytes()
        assert hashlib.sha512(data).digest() == digest, key
        out = dest / rel
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_bytes(data)
        copied.append(integrity)
        total += len(data)
required_missing = [m for m in missing if not m['optional']]
rec = {'task': TASK, 'observedAt': now(), 'sourceCache': str(source), 'destination': str(dest_root),
       'locks': {k: sha(v) for k, v in locks.items()}, 'payloads': len(copied), 'bytes': total,
       'integritySetSha256': shab('\n'.join(sorted(copied)).encode()), 'missing': missing, 'requiredMissing': required_missing}
save('npm-cache-source-copy.json', rec)
print(json.dumps({k: v for k, v in rec.items() if k != 'missing'} | {'missingCount': len(missing)}))
assert not required_missing
