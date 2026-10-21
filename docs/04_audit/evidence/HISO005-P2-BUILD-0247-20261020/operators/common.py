"""Shared constants/helpers for HISO005-P2-BUILD-0247 (SPEC0247: CJS export value — C0 handles, C1 opaque initial
exports object, C2 join, C3 coverage; version semantic-kernel-v7-cjs-export-value).
Model: HISO005-P2-BUILD-0245 operators (one candidate, one delta commit)."""
from pathlib import Path
import datetime, hashlib, json, os, subprocess

OPS = Path(__file__).resolve().parent
EV = OPS.parent
PROJECT = EV.parents[3]
TASK = 'HISO005-P2-BUILD-0247'
CANDIDATE = Path('/mnt/dados/cvg-work/cvg-hiso005-build0247-20261020')
RUNTIME = Path('/mnt/dados/cvg-work/cvg-hiso005-build0247-runtime-20261020')
DEPS_SOURCE = Path('/mnt/dados/cvg-work/cvg-hiso005-build0245-20261020')  # só leitura: cópia de node_modules (mesmo lock)
EVAL_ROOT = Path('/mnt/dados/cvg-work/cvg-hiso005-eval-228e')  # raiz avaliada 228e7918 reconstituída pelo BUILD0245; só leitura
EVAL_COMMIT = '228e79180d6d635ae1013e5069fc10f2f79a1cf6'
BASE = '1d40fe5194396f8d62b13809b438fdd2f378d300'  # commit do BUILD0245 (kernel v6 semantic-kernel-v6-tsx-parse)
BASE_PARENT = '6c9fc6517f272e884a4adc5d7b8c71d1e1a552e9'  # main com BUILD0244 (kernel v5)
NODE = '/home/ricardo/.nvm/versions/node/v22.23.2/bin/node'
NODEBIN = str(Path(NODE).parent)
NODE_SHA = '3517c2df0b2f8cd7f422b4b8450ef81c6889f08eb03e281d6de9079b15e6a327'
PARSER_SHA = '569177652966bd528c319171c7dd22860dbf72bde116cbc4f644f1d02bb12e39'
LOCK_SHA = '1022b677acb5c4ed57bd11ecad17d8b67883eb4bd64f261f2f9190322d2fdbac'
SPEC_DIR = PROJECT / 'docs/04_audit/evidence/HISO005-P2-CJS-SOUNDNESS-SPEC-20261020'
SPEC = ('docs/04_audit/evidence/HISO005-P2-CJS-SOUNDNESS-SPEC-20261020/materialized/0247_b6_cjs_export_soundness.md.txt',
        '082ad2f4985bb2e663b3f8882fe3902f6b00bcb352a45ab2f5122f94169f037f')
SPEC_TARGET = 'docs/02_spec/0247_b6_cjs_export_soundness.md'
DECISION = 'docs/04_audit/evidence/HISO005-P2-CJS-SOUNDNESS-SPEC-20261020/user-decision-20261020.json'
V6_ENGINE_SHA = 'bcbb49ab158958e48188c9a2ea9d18b083b70bbd895d7da5bb8fe1d1a6dca3cf'
V5_ENGINE_SHA = 'c724567f82eb4beeab37904ae194366e18c64fb88c73db7fb575f17b31e0130c'
OLD_VERSION = 'semantic-kernel-v6-tsx-parse'
NEW_VERSION = 'semantic-kernel-v7-cjs-export-value'
SEALED_V5 = PROJECT / 'docs/04_audit/evidence/HISO005-P2-BUILD-0244-20261019/real-v5r3-normal-report.json.gz'  # 12.283, 1.410 inputs
SEALED_V6 = PROJECT / 'docs/04_audit/evidence/HISO005-P2-BUILD-0245-20261020/real-v6r2-normal-report.json.gz'  # 11.723
PG_NAME = 'cvg-hiso005-build0247-pg'
PG_LABEL = 'cvg.task=HISO005-P2-BUILD-0247'
PG_PORT = 56263
API_PORT = 3449
WEB_PORT = 4449
FORBIDDEN_WORKTREES = ['/mnt/dados/cvg-work/cvg-d9ef-pr10-20261020', '/mnt/dados/cvg-work/cvg-d9ef-pr9-20261020',
                       '/mnt/dados/cvg-work/cvg-hiso005-build0245-20261020']
# npm/npx sem rede (SPEC0247 incidents.json): todo npx/npm leva estas variáveis.
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


def record_npx(entry):
    """Append one npx/npm execution to npx-runs.json (argv, env keys, exit, npm log 'http fetch' lines)."""
    path = EV / 'npx-runs.json'
    rec = json.loads(path.read_text()) if path.exists() else {'task': TASK, 'rule': 'todo npx/npm com NO_UPDATE_NOTIFIER=1 e npm_config_update_notifier=false; nenhuma linha http fetch', 'noNetEnv': NO_NET_NPM, 'runs': []}
    rec['runs'].append(entry)
    path.write_text(json.dumps(rec, indent=2, ensure_ascii=False) + '\n')
