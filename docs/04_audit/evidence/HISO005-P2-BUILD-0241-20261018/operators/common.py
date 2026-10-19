"""Shared constants/helpers for HISO005-P2-BUILD-0241 operators (model: BUILD0240 operators)."""
from pathlib import Path
import datetime, hashlib, json, os, subprocess

EV = Path(__file__).resolve().parent.parent
PROJECT = EV.parents[3]
CANDIDATE = Path('/mnt/dados/cvg-work/cvg-hiso005-build0241-20261018')
RUNTIME = Path('/mnt/dados/cvg-work/cvg-hiso005-build0241-runtime-20261018')
BASE = 'af63ba6072c6b60c6d5d45e5986f882ce54c1dbd'
NODE = '/home/ricardo/.nvm/versions/node/v22.23.2/bin/node'
NODEBIN = str(Path(NODE).parent)
NODE_SHA = '3517c2df0b2f8cd7f422b4b8450ef81c6889f08eb03e281d6de9079b15e6a327'
PARSER_SHA = '569177652966bd528c319171c7dd22860dbf72bde116cbc4f644f1d02bb12e39'
TASK = 'HISO005-P2-BUILD-0241'
PG_NAME = 'cvg-hiso005-build0241-pg'
PG_LABEL = 'cvg.task=HISO005-P2-BUILD-0241'
PG_PORT = 56260
API_PORT = 3446
WEB_PORT = 4446
SPEC = 'docs/02_spec/0241_b6_integral_body_installed_provenance.md'
SPEC_SHA = 'e09f635a8d2385fd0f412655ece8be104776ba599a748cc0cf61c3abbd62a00b'
ERRATA = 'docs/04_audit/evidence/HISO005-P2-NEXT-RECON-20261018/spec-errata-r2.json'
ERRATA_SHA = 'b03582454e7a744e54eab928404d2993eaddf60b72c093fee4c0ce4f41daf568'


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


def head():
    return subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=CANDIDATE, text=True).strip()


def minimal_env(tmp):
    return {'PATH': NODEBIN + ':/usr/bin:/bin', 'LANG': 'C', 'LC_ALL': 'C', 'TZ': 'UTC', 'TMPDIR': str(tmp)}


def assert_frozen(require_review=True, allow_cert_dirty=False):
    """Freeze/HEAD/source hashes/node pin and (optionally) accepted review."""
    state = load('state.json')
    freeze = load(state['sourceFreeze'])
    h = head()
    assert h == freeze['commit'], (h, freeze['commit'])
    for row in freeze['files']:
        assert sha(CANDIDATE / row['path']) == row['sha256'], row['path']
    for row in freeze['unchangedFrozenSource']:
        assert sha(CANDIDATE / row['path']) == row['sha256'], row['path']
    assert sha(NODE) == NODE_SHA
    assert sha(CANDIDATE / 'node_modules/typescript/lib/typescript.js') == PARSER_SHA
    dirty = subprocess.check_output(['git', 'status', '--porcelain', '--untracked-files=no'], cwd=CANDIDATE, text=True).splitlines()
    if allow_cert_dirty:
        assert all(line[3:].startswith('certification/') for line in dirty), dirty
    else:
        assert dirty == [], dirty
    review = None
    if require_review:
        review = load(state['acceptedCodeReview'])
        assert review['verdict'] == 'APPROVE' and not review['requiredFindings']
        assert review['sourceCommit'] == h
    return state, freeze, review, h


def run(argv, cwd, env, log, timeout=900, text=True):
    start = now()
    p = subprocess.run(argv, cwd=str(cwd), env=env, capture_output=True, text=text, timeout=timeout)
    rec = {'argv': [str(a) for a in argv], 'cwd': str(cwd), 'startedAt': start, 'finishedAt': now(),
           'exitCode': p.returncode,
           'stdout': p.stdout if text else None, 'stderr': p.stderr if text else p.stderr.decode(errors='replace')}
    log.append(rec)
    return p, rec
