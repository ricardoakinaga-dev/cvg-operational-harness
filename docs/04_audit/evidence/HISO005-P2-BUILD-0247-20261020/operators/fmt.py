"""Prettier 3.8.3 of the candidate's node_modules (copied from the BUILD0245 candidate, same lock), run with node
directly (no npx, no network), env with NO_UPDATE_NOTIFIER=1 and npm_config_update_notifier=false. Each run is
recorded in npx-runs.json. usage: fmt.py <--write|--check> <path-in-candidate>..."""
import json, sys, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

mode, paths = sys.argv[1], sys.argv[2:]
assert mode in ('--write', '--check') and paths
tmp = RUNTIME / 'fmt-tmp'
tmp.mkdir(parents=True, exist_ok=True)
env = dict(minimal_env(tmp), HOME=str(tmp), **NO_NET_NPM)
before = {p: sha(CANDIDATE / p) for p in paths}
argv = [NODE, 'node_modules/prettier/bin/prettier.cjs', mode, *paths]
log = []
p, rec = run(argv, CANDIDATE, env, log, timeout=600)
after = {p: sha(CANDIDATE / p) for p in paths}
record_npx({'at': now(), 'tool': 'prettier ' + json.loads((CANDIDATE / 'node_modules/prettier/package.json').read_text())['version'], 'via': 'node direto (não npx)',
            'argv': argv, 'cwd': str(CANDIDATE), 'envKeys': sorted(env), 'exitCode': p.returncode, 'before': before, 'after': after,
            'stdoutTail': p.stdout[-600:], 'stderrTail': p.stderr[-600:], 'network': 'nenhuma (prettier não acessa rede; sem npm)'})
print(p.returncode, p.stdout[-400:], p.stderr[-400:])
sys.exit(p.returncode)
