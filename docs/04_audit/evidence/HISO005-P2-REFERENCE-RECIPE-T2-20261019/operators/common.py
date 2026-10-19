"""Shared helpers for HISO005-P2-REFERENCE-RECIPE-T2-20261019 operators."""
from pathlib import Path
import datetime, hashlib, json, subprocess

EV = Path(__file__).resolve().parent.parent
PROJECT = EV.parents[3]
CANDIDATE = Path('/mnt/dados/cvg-work/cvg-hiso005-recipe-t2-20261019')
RUNTIME = Path('/mnt/dados/cvg-work/cvg-hiso005-recipe-t2-runtime-20261019')
EVAL = RUNTIME / 'eval-228e'
BASE = '228e79180d6d635ae1013e5069fc10f2f79a1cf6'
NODE = '/home/ricardo/.nvm/versions/node/v22.23.2/bin/node'
NODEBIN = str(Path(NODE).parent)
TASK = 'HISO005-P2-REFERENCE-RECIPE-T2-20261019'


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


def head(root=CANDIDATE):
    return subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip()


def minimal_env(tmp):
    return {'PATH': NODEBIN + ':/usr/bin:/bin', 'LANG': 'C', 'LC_ALL': 'C', 'TZ': 'UTC', 'TMPDIR': str(tmp)}


def run(argv, cwd, env, log, timeout=1800, keep=4000):
    start = now()
    p = subprocess.run([str(a) for a in argv], cwd=str(cwd), env=env, capture_output=True, text=True, timeout=timeout)
    log.append({'argv': [str(a) for a in argv], 'cwd': str(cwd), 'startedAt': start, 'finishedAt': now(), 'exitCode': p.returncode,
                'stdout': p.stdout[-keep:], 'stderr': p.stderr[-keep:]})
    return p
