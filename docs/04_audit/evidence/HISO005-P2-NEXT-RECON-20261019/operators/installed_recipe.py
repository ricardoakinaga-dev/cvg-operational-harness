"""Run the installed-reference recipe from <scripts-root> over <source-root> at its HEAD; record outcome.

usage: installed_recipe.py <label> <scripts-root> <source-root>
"""
import json, shutil, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

label, scripts_root, source_root = sys.argv[1], Path(sys.argv[2]), Path(sys.argv[3])
out_root = RUNTIME / ('installed-reference-' + label)
assert not out_root.exists()
assert shutil.disk_usage(RUNTIME).free > 30 * 1024 ** 3
tmp = RUNTIME / 'references-tmp'
tmp.mkdir(exist_ok=True)
env = dict(minimal_env(tmp), HOME='/home/ricardo')
log = []
commit = head(source_root)
script = scripts_root / 'scripts/build-installed-reference.mjs'
p = run([NODE, script, '--source-root=' + str(source_root), '--commit=' + commit, '--output-root=' + str(out_root),
         '--cache-source=' + str(RUNTIME / 'npm-cache-source')], scripts_root, env, log, timeout=3600)
failure = json.loads((out_root / 'failure.json').read_text()) if (out_root / 'failure.json').exists() else None
result = json.loads(p.stdout) if p.returncode == 0 and p.stdout.strip() else None
rec = {'task': TASK, 'label': label, 'observedAt': now(), 'scriptsRoot': str(scripts_root), 'scriptSha256': sha(script),
       'processHelperSha256': sha(scripts_root / 'scripts/boundary-reference-process.mjs'), 'sourceRoot': str(source_root),
       'sourceCommit': commit[:12], 'status': 'BUILT' if result else 'FAILED', 'failure': failure, 'installedReference': result, 'commands': log}
if result:
    assert sha(result['manifestPath']) == result['expectedSha256']
    receipt = json.loads(Path(result['manifestPath']).read_text())
    rec['receiptSummary'] = {'packages': len(receipt['packages']), 'entries': sum(len(p['entries']) for p in receipt['packages']),
                             'files': sum(1 for p in receipt['packages'] for e in p['entries'] if e['type'] == 'file'),
                             'usage': receipt['usage'], 'commitAbbrev': receipt['commit'][:12], 'lockAbbrev': receipt['lockSha256'][:12]}
save('installed-recipe-' + label + '.json', rec)
print(json.dumps({k: v for k, v in rec.items() if k != 'commands'}, indent=1)[:2500])
