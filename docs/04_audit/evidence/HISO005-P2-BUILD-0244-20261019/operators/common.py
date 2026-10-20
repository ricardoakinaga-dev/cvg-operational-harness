"""Shared constants/helpers for HISO005-P2-BUILD-0244 (SPEC0244, E1 estrela ESM + E2 classe recusada).
Model: BUILD0243/0242 operators (one candidate, one delta commit)."""
from pathlib import Path
import datetime, hashlib, json, os, subprocess

OPS = Path(__file__).resolve().parent
EV = OPS.parent
PROJECT = EV.parents[3]
TASK = 'HISO005-P2-BUILD-0244'
CANDIDATE = Path('/mnt/dados/cvg-work/cvg-hiso005-build0244-20261019')
RUNTIME = Path('/mnt/dados/cvg-work/cvg-hiso005-build0244-runtime-20261019')
DEPS_SOURCE = Path('/mnt/dados/cvg-work/cvg-hiso005-0243-0242-pr-20261019')
EVAL_ROOT = Path('/mnt/dados/cvg-work/cvg-hiso005-build0241-20261018')  # raiz avaliada 228e7918, só leitura
EVAL_COMMIT = '228e79180d6d635ae1013e5069fc10f2f79a1cf6'
BASE = '1073a9ddf85e601b472c9ade1e437311fd41862d'  # cabeça do PR #8 (main ba9492b0 + BUILD0243/0242), PR ainda aberto
NODE = '/home/ricardo/.nvm/versions/node/v22.23.2/bin/node'
NODEBIN = str(Path(NODE).parent)
NODE_SHA = '3517c2df0b2f8cd7f422b4b8450ef81c6889f08eb03e281d6de9079b15e6a327'
PARSER_SHA = '569177652966bd528c319171c7dd22860dbf72bde116cbc4f644f1d02bb12e39'
SPEC = ('docs/02_spec/0244_b6_esm_module_shape.md', '50463db7af125993d1cbcd966a5977efa9bafc7d0ffd57bdbe6ce10c8c6ec79c')
DECISION = 'docs/04_audit/evidence/HISO005-P2-NEXT-RECON-20261020/user-decision-20261019.json'
FORMAT_RECEIPT = 'docs/04_audit/evidence/HISO005-P2-NEXT-RECON-20261020/materialized/lead-format-receipt.json'
PREIMAGES = {  # bytes da cabeça do PR #8 (SPEC0244 §5)
    'scripts/boundary-semantic-engine.mjs': 'a2598fb2c56d333c0b8bc00f652511924222d0be591075f101021b9bd657e88f',
    'scripts/check-product-boundary.mjs': '0c7f859d5acee3e2fdda14a6d191b0a827fdbe46d051a76b67e760af2ad171e1',
    'scripts/boundary-semantic-resolution.mjs': 'd4eeca021c5d00689c190790a960f1314ba4fe5768d2e700d7d610b66120615c',
    'scripts/boundary-semantic-compiled.mjs': 'a79656719e00603a28c1f6112ecea81c7e90a7df846be9ac0aa0a9cc58b6ecaf',
    'scripts/boundary-installed-identity.mjs': 'f00c56fcd1d1084f6051bdb81fa20da0ead7de66bdac82738e59fbcdb46ac83c',
    'scripts/boundary-code-execution.mjs': '4c750071ac1347ffa68e6c62e3082e5507cc94571e83089eb7bd21eb7435540a',
    'scripts/boundary-lexical.mjs': '6aed88995d5509aa7b2bd8814f66363f42e287bc5081d75b4c27dbf9ac9e71e9',
    'scripts/boundary-manifests.mjs': '40cd1375d45e3059e797e0fc41795b71a07dbc529e257ef77572958dc40880e5',
    'scripts/boundary-reference-process.mjs': 'e5c5cd31404ba865227ae747b0d8e8491138916951a6a1a5287f896837f22ab8',
    'scripts/build-installed-reference.mjs': 'd8681aa37bad10a0270b03ecab63633843d920417de9969f81203674d0014bcc',
}
OFFICIAL_V4 = PROJECT / 'docs/04_audit/evidence/HISO005-P2-BUILD-0242-20261019'  # real-final-0242-{normal,strict}-report.json.gz (13.521)
PG_NAME = 'cvg-hiso005-build0244-pg'
PG_LABEL = 'cvg.task=HISO005-P2-BUILD-0244'
PG_PORT = 56262
API_PORT = 3448
WEB_PORT = 4448


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
