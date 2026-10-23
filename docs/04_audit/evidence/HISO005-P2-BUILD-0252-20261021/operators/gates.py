"""(adapted from HISO005-P2-BUILD-0247 gates.py) Static gates on the candidate worktree with pinned Node22 directly
(no npm/npx, no network): prettier --check (touched paths), eslint . (npm run lint), tsc -p tsconfig.typecheck.json
--noEmit (npm run typecheck), skip-inventory --verify (npm run skip:governance), docs:check-links (check-doc-links.mjs
README.md AGENTS.md docs products && check-evidence-hygiene.mjs). usage: gates.py <label> <path> [...]"""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

label, touched = sys.argv[1], sys.argv[2:]
wait_load()
tmp = RUNTIME / ('gates-' + label)
tmp.mkdir(parents=True, exist_ok=True)
env = dict(minimal_env(tmp), HOME=str(tmp), **NO_NET_NPM)
log = []
G = [('prettier --check (tocados)', [NODE, 'node_modules/prettier/bin/prettier.cjs', '--check', *touched]),
     ('lint (eslint .)', [NODE, 'node_modules/eslint/bin/eslint.js', '.']),
     ('typecheck', [NODE, 'node_modules/typescript/bin/tsc', '-p', 'tsconfig.typecheck.json', '--noEmit']),
     ('skip:governance', [NODE, 'scripts/skip-inventory.mjs', '--verify']),
     ('docs:check-links', [NODE, 'scripts/check-doc-links.mjs', 'README.md', 'AGENTS.md', 'docs', 'products']),
     ('docs:check-links (evidence hygiene)', [NODE, 'scripts/check-evidence-hygiene.mjs'])]
rows = []
for name, argv in G:
    p, rec = run(argv, CANDIDATE, env, log, timeout=3600, keep=3000)
    rows.append({'gate': name, 'exitCode': p.returncode, 'pass': p.returncode == 0, 'argv': rec['argv'], 'startedAt': rec['startedAt'],
                 'finishedAt': rec['finishedAt'], 'stdoutTail': rec['stdout'][-1500:], 'stderrTail': rec['stderr'][-1500:]})
out = {'task': TASK, 'label': label, 'observedAt': now(), 'head': head(), 'dirtyTracked': git('status', '--porcelain', '--untracked-files=no').splitlines(),
       'touched': {t: sha(CANDIDATE / t) for t in touched}, 'gates': rows, 'allPass': all(r['pass'] for r in rows)}
save('gates-' + label + '.json', out)
print(json.dumps([(r['gate'], r['exitCode']) for r in rows]), out['allPass'])
for r in rows:
    if not r['pass']: print(r['gate'], r['stdoutTail'][-800:], r['stderrTail'][-800:])
