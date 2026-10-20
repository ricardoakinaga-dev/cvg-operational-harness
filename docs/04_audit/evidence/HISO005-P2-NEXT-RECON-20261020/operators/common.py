"""Shared helpers for HISO005-P2-NEXT-RECON-20261020 (T1, read-only diagnosis of the integral B6 measurement)."""
from pathlib import Path
import datetime, hashlib, json, os, subprocess

EV = Path(__file__).resolve().parent.parent
PROJECT = EV.parents[3]
TASK = 'HISO005-P2-NEXT-RECON-20261020'
RUNTIME = Path('/mnt/dados/cvg-work/cvg-hiso005-next-recon-20261020-runtime')
EV42 = PROJECT / 'docs/04_audit/evidence/HISO005-P2-BUILD-0242-20261019'
EV43 = PROJECT / 'docs/04_audit/evidence/HISO005-P2-BUILD-0243-20261019'
REPORTS = {m: EV42 / ('real-final-0242-' + m + '-report.json.gz') for m in ('normal', 'strict')}
PR8_HEAD = '1073a9ddf85e601b472c9ade1e437311fd41862d'
EVAL_ROOT = Path('/mnt/dados/cvg-work/cvg-hiso005-build0241-20261018')
EVAL_COMMIT = '228e79180d6d635ae1013e5069fc10f2f79a1cf6'
NODE = '/home/ricardo/.nvm/versions/node/v22.23.2/bin/node'
NODEBIN = str(Path(NODE).parent)


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


def report(mode='normal'):
    import gzip
    return json.loads(gzip.decompress(REPORTS[mode].read_bytes()))


def minimal_env(tmp):
    return {'PATH': NODEBIN + ':/usr/bin:/bin', 'LANG': 'C', 'LC_ALL': 'C', 'TZ': 'UTC', 'TMPDIR': str(tmp)}


def wait_load(limit=12.0):
    import time
    while os.getloadavg()[0] > limit:
        time.sleep(30)
