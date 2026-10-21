"""Static gates on the frozen candidate, with node directly (no npm/npx, no network; env with NO_UPDATE_NOTIFIER=1 and
npm_config_update_notifier=false anyway): prettier --check (delta paths and whole repo, as format:check), eslint .
(npm run lint), tsc -p tsconfig.typecheck.json --noEmit (npm run typecheck), docs:check-links (check-doc-links.mjs
README.md AGENTS.md docs products && check-evidence-hygiene.mjs). usage: gates.py <label> <freeze-round>"""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

label, rnd = sys.argv[1], sys.argv[2]
fz = load('source-freeze-' + rnd + '.json')
assert all(sha(CANDIDATE / f['path']) == f['sha256'] for f in fz['files'])
wait_load()
tmp = RUNTIME / ('gates-' + label)
tmp.mkdir(parents=True, exist_ok=True)
env = dict(minimal_env(tmp), HOME=str(tmp), **NO_NET_NPM)
log = []
G = [('prettier-delta', [NODE, 'node_modules/prettier/bin/prettier.cjs', '--check', *[f['path'] for f in fz['files']]]),
     ('prettier-repo (format:check)', [NODE, 'node_modules/prettier/bin/prettier.cjs', '--check', '.']),
     ('lint (eslint .)', [NODE, 'node_modules/eslint/bin/eslint.js', '.']),
     ('typecheck', [NODE, 'node_modules/typescript/bin/tsc', '-p', 'tsconfig.typecheck.json', '--noEmit']),
     ('docs:check-links', [NODE, 'scripts/check-doc-links.mjs', 'README.md', 'AGENTS.md', 'docs', 'products']),
     ('docs:check-links (evidence hygiene)', [NODE, 'scripts/check-evidence-hygiene.mjs'])]
rows = []
for name, argv in G:
    p, rec = run(argv, CANDIDATE, env, log, timeout=3600, keep=3000)
    rows.append({'gate': name, 'exitCode': p.returncode, 'pass': p.returncode == 0, 'argv': rec['argv'], 'startedAt': rec['startedAt'], 'finishedAt': rec['finishedAt'],
                 'stdoutTail': rec['stdout'][-1500:], 'stderrTail': rec['stderr'][-1500:]})
    if name.startswith('prettier'):
        record_npx({'at': now(), 'tool': 'prettier 3.8.3', 'via': 'node direto (não npx)', 'argv': [str(a) for a in argv], 'cwd': str(CANDIDATE),
                    'envKeys': sorted(env), 'exitCode': p.returncode, 'network': 'nenhuma (sem npm)'})
out = {'task': TASK, 'label': label, 'observedAt': now(), 'freeze': 'source-freeze-' + rnd + '.json', 'head': head(), 'dirty': git('status', '--porcelain').splitlines(),
       'gates': rows, 'allPass': all(r['pass'] for r in rows)}
save('gates-' + label + '.json', out)
print(json.dumps([(r['gate'], r['exitCode']) for r in rows]), out['allPass'])
for r in rows:
    if not r['pass']: print(r['gate'], r['stdoutTail'][-800:], r['stderrTail'][-800:])
