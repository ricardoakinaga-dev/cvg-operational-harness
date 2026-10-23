"""Shared constants/helpers for HISO005-P2-BUILD-0252 (SPEC0252 b1: UNKNOWN_ANNEXB_FUNCTION for every block-level
function declaration in sloppy code of a `require` module; version semantic-kernel-v8-annexb-block-function).
Model: HISO005-P2-BUILD-0247 operators (common.py, tools_copy.py, references.py, measure*.py, b6_final.py)."""
from pathlib import Path
import datetime, hashlib, json, os, subprocess

OPS = Path(__file__).resolve().parent
EV = OPS.parent
TASK = 'HISO005-P2-BUILD-0252'
CANDIDATE = Path('/mnt/dados/cvg-work/cvg-d9ef-annexb-recon-20261021')  # worktree detached; base 24cdb463
PROJECT = CANDIDATE  # the repo whose evidence holds the sealed reports
MAIN_REPO = Path('/home/ricardo/Área de trabalho/cvg-operational-harness')  # only for `git worktree add` of 228e7918
RUNTIME = Path('/mnt/dados/cvg-work/annexb-build0252-runtime')
RECON_RUNTIME = Path('/mnt/dados/cvg-work/annexb-recon-runtime')  # read only: hook.mjs, tools-wide (b1 reference)
EVAL_ROOT = Path('/mnt/dados/cvg-work/cvg-hiso005-eval-228e')  # raiz avaliada 228e7918 (BUILD0245); só leitura
EVAL_COMMIT = '228e79180d6d635ae1013e5069fc10f2f79a1cf6'
BASE = '24cdb463faa1010da5fd78b6d923950ac2741713'  # main com BUILD0247 + AUD0621 (kernel v7)
NODE = '/home/ricardo/.nvm/versions/node/v22.23.2/bin/node'
NODEBIN = str(Path(NODE).parent)
NODE_SHA = '3517c2df0b2f8cd7f422b4b8450ef81c6889f08eb03e281d6de9079b15e6a327'
PARSER_SHA = '569177652966bd528c319171c7dd22860dbf72bde116cbc4f644f1d02bb12e39'
SPEC = 'docs/02_spec/0252_b6_annexb_block_function.md'
SPEC_SHA = 'd1e202691984cd824e2203e40cb99d90298c53ca0d8820ea312d1e63afaa7f59'
V7_ENGINE_SHA = '7f25da7d988628a34b87fe47418c88f2b607ae105a382b247fd5a6b5550a3be7'
B1_ENGINE_SHA = '47ec764fa146111e8aab22d515d9751a3b7e48f9e8dcddf6cba78a21eafc0eb7'  # tools-wide da recon
OLD_VERSION = 'semantic-kernel-v7-cjs-export-value'
NEW_VERSION = 'semantic-kernel-v8-annexb-block-function'
ENGINE = 'scripts/boundary-semantic-engine.mjs'
TEST = 'tests/b6-0252-annexb-block-function.test.js'
SEALED_V5 = PROJECT / 'docs/04_audit/evidence/HISO005-P2-BUILD-0244-20261019/real-v5r3-normal-report.json.gz'  # 1.410 inputs
SEALED_V7 = {m: PROJECT / f'docs/04_audit/evidence/HISO005-P2-BUILD-0247-20261020/real-v7r1-{m}-report.json.gz' for m in ('normal', 'strict')}
NO_NET_NPM = {'NO_UPDATE_NOTIFIER': '1', 'npm_config_update_notifier': 'false', 'NPM_CONFIG_UPDATE_NOTIFIER': 'false',
              'npm_config_audit': 'false', 'npm_config_fund': 'false'}


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
