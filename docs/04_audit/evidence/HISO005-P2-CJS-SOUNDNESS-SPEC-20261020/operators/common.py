"""Shared constants/helpers for HISO005-P2-CJS-SOUNDNESS-SPEC-20261020 (T1: SPEC0247 proposal, CJS export value).
Diagnostic copies only; nothing here is promotable. Model: HISO005-P2-NEXT-RECON-20261020B operators."""
from pathlib import Path
import datetime, hashlib, json, os, subprocess

OPS = Path(__file__).resolve().parent
EV = OPS.parent
PROJECT = EV.parents[3]
TASK = 'HISO005-P2-CJS-SOUNDNESS-SPEC-20261020'
RUNTIME = Path('/mnt/dados/cvg-work/cvg-hiso005-cjs-spec-runtime-20261020')
PR9 = Path('/mnt/dados/cvg-work/cvg-d9ef-pr9-20261020')  # só leitura: node_modules/typescript e prettier
EVAL_ROOT = Path('/mnt/dados/cvg-work/cvg-hiso005-eval-228e')  # raiz avaliada 228e7918, só leitura e só se conferir
EVAL_COMMIT = '228e79180d6d635ae1013e5069fc10f2f79a1cf6'
MAIN = '6c9fc6517f272e884a4adc5d7b8c71d1e1a552e9'  # main remota com BUILD0244 (PR #9)
V5_ENGINE_SHA = 'c724567f82eb4beeab37904ae194366e18c64fb88c73db7fb575f17b31e0130c'
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


def wait_load(limit=12.0):
    import time
    while os.getloadavg()[0] > limit:
        time.sleep(30)


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


NPX_ENV = {'PATH': NODEBIN + ':/usr/bin:/bin', 'LANG': 'C.UTF-8', 'HOME': str(RUNTIME / 'npx-home'), 'npm_config_cache': str(RUNTIME / 'npx-cache'),
           'npm_config_offline': 'true', 'npm_config_update_notifier': 'false', 'npm_config_audit': 'false', 'npm_config_fund': 'false'}


def npx_prettier(data, purpose):
    """`npx --no-install prettier --stdin-filepath docs/02_spec/0247_b6_cjs_export_soundness.md` in the read-only PR9
    worktree; records every run in npx-runs.json with the 'http fetch' lines of the npm log (expected: none)."""
    (RUNTIME / 'npx-home').mkdir(parents=True, exist_ok=True)
    logs = RUNTIME / 'npx-cache' / '_logs'
    before = set(logs.glob('*.log')) if logs.exists() else set()
    p = subprocess.run([NODEBIN + '/npx', '--no-install', 'prettier', '--stdin-filepath', 'docs/02_spec/0247_b6_cjs_export_soundness.md'],
                       cwd=str(PR9), input=data, capture_output=True, env=NPX_ENV)
    new = sorted(set(logs.glob('*.log')) - before) if logs.exists() else []
    fetches = [l for f in new for l in f.read_text(errors='replace').splitlines() if 'http fetch' in l]
    path = EV / 'npx-runs.json'
    rec = json.loads(path.read_text()) if path.exists() else {'task': TASK, 'env': {k: v for k, v in NPX_ENV.items() if k.startswith('npm_config')}, 'runs': []}
    rec['runs'].append({'at': now(), 'purpose': purpose, 'exitCode': p.returncode, 'inputSha256': shab(data), 'outputSha256': shab(p.stdout),
                        'npmLogs': len(new), 'httpFetchLines': fetches})
    path.write_text(json.dumps(rec, indent=2, ensure_ascii=False) + '\n')
    assert not fetches, fetches
    return p
