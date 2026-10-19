"""Shared constants/helpers for HISO005-P2-BUILD-0243 and HISO005-P2-BUILD-0242 (one candidate, one commit per delta).
Model: BUILD0241 operators. Every operator takes the task id first ('0243' or '0242') when it writes evidence."""
from pathlib import Path
import datetime, hashlib, json, os, subprocess

OPS = Path(__file__).resolve().parent
EV43 = OPS.parent
PROJECT = EV43.parents[3]
EV42 = PROJECT / 'docs/04_audit/evidence/HISO005-P2-BUILD-0242-20261019'
EVS = {'0243': EV43, '0242': EV42}
TASKS = {'0243': 'HISO005-P2-BUILD-0243', '0242': 'HISO005-P2-BUILD-0242'}
CANDIDATE = Path('/mnt/dados/cvg-work/cvg-hiso005-build0243-0242-20261019')
RUNTIME = Path('/mnt/dados/cvg-work/cvg-hiso005-build0243-0242-runtime-20261019')
DEPS_SOURCE = Path('/mnt/dados/cvg-work/cvg-hiso005-port-main-20261019')
EVAL_ROOT = Path('/mnt/dados/cvg-work/cvg-hiso005-build0241-20261018')  # raiz avaliada exigida pelas SPEC (228e7918), só leitura
EVAL_COMMIT = '228e79180d6d635ae1013e5069fc10f2f79a1cf6'
BASE = 'bcd49fa66c08cf6a92d939b0d72f523dd07bb028'  # cabeça do PR #6 (porte BUILD0241+T2 para a main 62dfba8d)
NODE = '/home/ricardo/.nvm/versions/node/v22.23.2/bin/node'
NODEBIN = str(Path(NODE).parent)
NODE_SHA = '3517c2df0b2f8cd7f422b4b8450ef81c6889f08eb03e281d6de9079b15e6a327'
PARSER_SHA = '569177652966bd528c319171c7dd22860dbf72bde116cbc4f644f1d02bb12e39'
SPECS = {'0243': ('docs/02_spec/0243_b6_reference_source_scope.md', '6db49cf51280a2f0867d45f98eaf4d0fae5b9f94b49d96bb21692df0657afd06'),
         '0242': ('docs/02_spec/0242_b6_body_caps_deadlines.md', 'fa22cf4e5d102421aec49ced674ca5d1720444de53998741d123184ef2b14677')}
DECISION = 'docs/04_audit/evidence/HISO005-P2-NEXT-RECON-20261019/user-decision-20261019.json'
PREIMAGES = {  # SPEC0242 §5 / SPEC0243 §5
    'scripts/boundary-semantic-engine.mjs': 'b9246972c4e27257af11800ba82895a5c6db52a25fa82a030c9b5c75a8c48cc8',
    'scripts/check-product-boundary.mjs': '14ab9a8b941f314f868c09e772490cc4bf302e9ec8b96478294813fd3881ca75',
    'scripts/boundary-installed-identity.mjs': '78d198c75c4d5544db58ea900b82bc1a01e1770e4cdca38ec17fe58c3b997345',
    'scripts/build-installed-reference.mjs': '70f6c43a788a892e7ce283e6e05e86eee7831b7c27bfade0e42b90522e6ff99d',
    'scripts/boundary-semantic-compiled.mjs': 'dd006347388d13bd9717786764c5de86d0858a61fee19db85f84c777197fe515',
    'scripts/boundary-manifests.mjs': '40cd1375d45e3059e797e0fc41795b71a07dbc529e257ef77572958dc40880e5',
}
PG_NAME = 'cvg-hiso005-build0242-pg'
PG_LABEL = 'cvg.task=HISO005-P2-BUILD-0243-0242'
PG_PORT = 56262
API_PORT = 3448
WEB_PORT = 4448


def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def sha(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def shab(b):
    return hashlib.sha256(b).hexdigest()


def load(task, name):
    return json.loads((EVS[task] / name).read_text())


def save(task, name, obj):
    p = EVS[task] / name
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(obj, indent=2, ensure_ascii=False) + '\n')
    return p


def git(*args, cwd=CANDIDATE):
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
