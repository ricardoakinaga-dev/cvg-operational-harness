"""Compiled reference from <scripts-root>'s recipe over the evaluated root, then the reader of the same scripts.

usage: compiled_recipe.py <label> <scripts-root> <evaluated-root> <installed-label>
"""
import json, shutil, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

label, scripts_root, root, inst_label = sys.argv[1], Path(sys.argv[2]), Path(sys.argv[3]), sys.argv[4]
inst = load('installed-recipe-' + inst_label + '.json')['installedReference']
assert inst and sha(inst['manifestPath']) == inst['expectedSha256']
out_root = RUNTIME / ('compiled-reference-' + label)
assert not out_root.exists()
tmp = RUNTIME / 'references-tmp'
tmp.mkdir(exist_ok=True)
env = dict(minimal_env(tmp), HOME='/home/ricardo')
log = []
commit = head(root)
script = scripts_root / 'scripts/boundary-semantic-compiled.mjs'
p = run([NODE, script, '--source-root=' + str(root), '--commit=' + commit, '--output-root=' + str(out_root), '--dependencies-root=' + str(root),
         '--installed-reference=' + inst['manifestPath'], '--installed-reference-sha256=' + inst['expectedSha256']], scripts_root, env, log, timeout=3600)
compiled = json.loads(p.stdout) if p.returncode == 0 and p.stdout.strip() else None
reader = None
if compiled:
    code = ("import {loadCompiledBuildReference} from " + json.dumps((scripts_root / 'scripts/boundary-semantic-compiled.mjs').as_uri()) + ";"
            "const r=loadCompiledBuildReference(process.argv[1],JSON.parse(process.argv[2]),{installedReference:JSON.parse(process.argv[3])});"
            "console.log(JSON.stringify({status:r.status,recipeVersion:r.recipeVersion,files:r.files?.length,reason:r.reason}))")
    q = run([NODE, '--input-type=module', '-e', code, str(root), json.dumps(compiled), json.dumps(inst)], scripts_root, minimal_env(tmp), log)
    reader = json.loads(q.stdout) if q.returncode == 0 and q.stdout.strip() else {'exit': q.returncode, 'stderr': q.stderr[-500:]}
failure = None
if (out_root / 'failure.json').exists():
    f = json.loads((out_root / 'failure.json').read_text())
    failure = {'code': f.get('code'), 'lastCommands': [{k: c.get(k) for k in ('argv', 'exitCode', 'errorCode', 'stdoutDiscardedBytes')} for c in f.get('commands', [])[-3:]]}
cmdsize = (out_root / 'commands.json').stat().st_size if (out_root / 'commands.json').exists() else None
rec = {'task': TASK, 'label': label, 'observedAt': now(), 'scriptsRoot': str(scripts_root), 'scriptSha256': sha(script), 'evaluatedRoot': str(root),
       'sourceCommit': commit[:12], 'installedLabel': inst_label, 'status': 'BUILT' if compiled else 'FAILED', 'compiledReference': compiled,
       'reader': reader, 'commandsJsonBytes': cmdsize, 'failure': failure, 'commands': log}
save('compiled-recipe-' + label + '.json', rec)
print(json.dumps({k: v for k, v in rec.items() if k != 'commands'}, indent=1)[:2500])
