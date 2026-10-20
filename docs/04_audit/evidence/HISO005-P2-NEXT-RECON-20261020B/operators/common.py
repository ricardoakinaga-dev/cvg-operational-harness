"""Shared constants/helpers for HISO005-P2-NEXT-RECON-20261020B (T1: SPEC0245 TSX and SPEC0246 proof by scope).
Diagnostic copies only; nothing here is promotable. Model: BUILD0244 operators."""
from pathlib import Path
import datetime, hashlib, json, os, subprocess

OPS = Path(__file__).resolve().parent
EV = OPS.parent
PROJECT = EV.parents[3]
TASK = 'HISO005-P2-NEXT-RECON-20261020B'
RUNTIME = Path('/mnt/dados/cvg-work/cvg-hiso005-next-recon-20261020b-runtime')
CANDIDATE = Path('/mnt/dados/cvg-work/cvg-hiso005-build0244-20261019')  # âncora BUILD0244: só o node_modules (cp -al) e o git
EVAL_ROOT = Path('/mnt/dados/cvg-work/cvg-hiso005-build0241-20261018')  # raiz avaliada 228e7918, só leitura
EVAL_COMMIT = '228e79180d6d635ae1013e5069fc10f2f79a1cf6'
BASE = '16dd0ce66a31b40061c58be5bcab1ff085201db5'  # cabeça do PR #9 (main 24b1bbc8 + BUILD0244), engine v5 c724567f…
MAIN = '24b1bbc895397abaefaab7b8583d6506e146495d'
V5_ENGINE_SHA = 'c724567f82eb4beeab37904ae194366e18c64fb88c73db7fb575f17b31e0130c'
NODE = '/home/ricardo/.nvm/versions/node/v22.23.2/bin/node'
NODEBIN = str(Path(NODE).parent)
EV44 = PROJECT / 'docs/04_audit/evidence/HISO005-P2-BUILD-0244-20261019'  # real-v5r3-{normal,strict}-report.json.gz (12.283)


def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def sha(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def shab(b):
    return hashlib.sha256(b).hexdigest()


def load(name):
    return json.loads((EV / name).read_text())


def save(name, obj):
    p = EV / name
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(obj, indent=2, ensure_ascii=False) + '\n')
    return p


def git(*args, cwd=PROJECT):
    return subprocess.check_output(['git', *args], cwd=cwd, text=True).strip()


def head(root=CANDIDATE):
    return git('rev-parse', 'HEAD', cwd=root)


def minimal_env(tmp):
    return {'PATH': NODEBIN + ':/usr/bin:/bin', 'LANG': 'C', 'LC_ALL': 'C', 'TZ': 'UTC', 'TMPDIR': str(tmp)}


def run(argv, cwd, env, log, timeout=900, text=True, keep=None):
    start = now()
    p = subprocess.run([str(a) for a in argv], cwd=str(cwd), env=env, capture_output=True, text=text, timeout=timeout)
    rec = {'argv': [str(a) for a in argv], 'cwd': str(cwd), 'startedAt': start, 'finishedAt': now(), 'exitCode': p.returncode,
           'stdout': (p.stdout if keep is None else p.stdout[-keep:]) if text else None,
           'stderr': (p.stderr if keep is None else p.stderr[-keep:]) if text else p.stderr.decode(errors='replace')}
    log.append(rec)
    return p, rec


def wait_load(limit=12.0):
    import time
    while os.getloadavg()[0] > limit:
        time.sleep(30)
