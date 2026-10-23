"""(copied from HISO005-P2-BUILD-0247 references.py, unchanged logic) Scoped references (SPEC0243 recipe of one tools
copy) over the evaluated root 228e7918: installed from a clean worktree of the evaluated commit (the root has unrelated
tracked modifications), compiled from the root; then the copy's compiled reader. usage: references.py <label>
<tools-name>. Writes references-<label>.json."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

label, tools_name = sys.argv[1:3]
wait_load()
tools = RUNTIME / ('tools-' + tools_name)
out = RUNTIME / ('refs-' + label)
out.mkdir()
tmp = out / 'tmp'
tmp.mkdir()
env = dict(minimal_env(tmp), HOME=str(tmp))
log = []
wt = RUNTIME / 'eval-228e'
if not wt.exists():
    p, rec = run(['git', '-C', str(MAIN_REPO), 'worktree', 'add', '--detach', str(wt), EVAL_COMMIT], MAIN_REPO, {'PATH': '/usr/bin:/bin'}, log, timeout=600, keep=2000)
    assert p.returncode == 0, rec
p, rec = run([NODE, tools / 'scripts/build-installed-reference.mjs', '--source-root=' + str(wt), '--commit=' + EVAL_COMMIT,
              '--output-root=' + str(out / 'installed'), '--cache-source=' + str(RUNTIME / 'npm-cache-source')], tools, env, log, timeout=3600, keep=4000)
installed = json.loads(p.stdout) if p.returncode == 0 else None
assert installed and sha(installed['manifestPath']) == installed['expectedSha256'], rec
p, rec = run([NODE, tools / 'scripts/boundary-semantic-compiled.mjs', '--source-root=' + str(EVAL_ROOT), '--commit=' + EVAL_COMMIT,
              '--output-root=' + str(out / 'compiled'), '--dependencies-root=' + str(EVAL_ROOT),
              '--installed-reference=' + installed['manifestPath'], '--installed-reference-sha256=' + installed['expectedSha256']],
             tools, env, log, timeout=3600, keep=4000)
compiled = json.loads(p.stdout) if p.returncode == 0 else None
assert compiled, rec
code = ("import {loadCompiledBuildReference} from " + json.dumps((tools / 'scripts/boundary-semantic-compiled.mjs').as_uri()) + ";"
        "const r=loadCompiledBuildReference(process.argv[1],JSON.parse(process.argv[2]),{installedReference:JSON.parse(process.argv[3])});"
        "console.log(JSON.stringify({status:r.status,recipeVersion:r.recipeVersion,files:r.files?.length,reason:r.reason}))")
p, rec = run([NODE, '--input-type=module', '-e', code, str(EVAL_ROOT), json.dumps(compiled), json.dumps(installed)], tools, env, log, keep=4000)
reader = json.loads(p.stdout) if p.returncode == 0 else {'exit': p.returncode, 'stderr': p.stderr[-500:]}
ri = json.loads(Path(installed['manifestPath']).read_text())
rc = json.loads(Path(compiled['manifestPath']).read_text())
rec = {'task': TASK, 'label': label, 'observedAt': now(), 'tools': tools_name,
       'toolsScripts': {f: sha(tools / 'scripts' / f) for f in ('build-installed-reference.mjs', 'boundary-semantic-compiled.mjs', 'boundary-installed-identity.mjs')},
       'installedSourceRoot': str(wt), 'compiledSourceRoot': str(EVAL_ROOT), 'commit': EVAL_COMMIT, 'installedReference': installed, 'compiledReference': compiled, 'reader': reader,
       'installedSummary': {'packages': len(ri['packages']), 'sourceExclusions': ri['recipe'].get('sourceExclusions'), 'limits': ri['limits']},
       'compiledSummary': {'recipeVersion': rc['recipeVersion'], 'sourceExclusions': rc.get('sourceExclusions'), 'outputs': len(rc['outputs']), 'inputs': len(rc['inputs'])},
       'commands': log}
save('references-' + label + '.json', rec)
print(json.dumps({k: v for k, v in rec.items() if k not in ('commands',)}, indent=1)[:2500])
