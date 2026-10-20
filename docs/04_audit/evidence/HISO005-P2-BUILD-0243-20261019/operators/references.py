"""Build the installed and compiled references with the recipe scripts of one tools copy, over one source root,
then run that copy's compiled reader. usage: references.py <task> <label> <tools-name> <source-root> <commit> [<installed-source-root>]
The installed recipe snapshots tracked files from a clean checkout of the same commit when the evaluated root
has unrelated tracked modifications (BUILD0241 certification outputs); the compiled one reads the evaluated root.
Writes references-<label>.json in the task's evidence folder; references live in RUNTIME/refs-<label>/."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

task, label, tools_name, source_root, commit = sys.argv[1:6]
installed_source = sys.argv[6] if len(sys.argv) > 6 else source_root
wait_load()
tools = RUNTIME / ('tools-' + tools_name)
out = RUNTIME / ('refs-' + label)
out.mkdir()
tmp = out / 'tmp'
tmp.mkdir()
env = dict(minimal_env(tmp), HOME=str(tmp))
log = []
p, rec = run([NODE, tools / 'scripts/build-installed-reference.mjs', '--source-root=' + installed_source, '--commit=' + commit,
              '--output-root=' + str(out / 'installed'), '--cache-source=' + str(RUNTIME / 'npm-cache-source')], tools, env, log, timeout=3600, keep=4000)
installed = json.loads(p.stdout) if p.returncode == 0 else None
compiled = reader = None
if installed:
    assert sha(installed['manifestPath']) == installed['expectedSha256']
    p, rec = run([NODE, tools / 'scripts/boundary-semantic-compiled.mjs', '--source-root=' + source_root, '--commit=' + commit,
                  '--output-root=' + str(out / 'compiled'), '--dependencies-root=' + source_root,
                  '--installed-reference=' + installed['manifestPath'], '--installed-reference-sha256=' + installed['expectedSha256']],
                 tools, env, log, timeout=3600, keep=4000)
    compiled = json.loads(p.stdout) if p.returncode == 0 else None
if compiled:
    code = ("import {loadCompiledBuildReference} from " + json.dumps((tools / 'scripts/boundary-semantic-compiled.mjs').as_uri()) + ";"
            "const r=loadCompiledBuildReference(process.argv[1],JSON.parse(process.argv[2]),{installedReference:JSON.parse(process.argv[3])});"
            "console.log(JSON.stringify({status:r.status,recipeVersion:r.recipeVersion,files:r.files?.length,reason:r.reason}))")
    p, rec = run([NODE, '--input-type=module', '-e', code, source_root, json.dumps(compiled), json.dumps(installed)], tools, env, log, keep=4000)
    reader = json.loads(p.stdout) if p.returncode == 0 else {'exit': p.returncode, 'stderr': p.stderr[-500:]}
def receipt(path):
    return json.loads(Path(path).read_text()) if path else None
ri = receipt(installed and installed['manifestPath'])
rc = receipt(compiled and compiled['manifestPath'])
failure = None
for name in ('installed', 'compiled'):
    f = out / name / 'failure.json'
    if f.exists():
        failure = {'step': name, 'code': json.loads(f.read_text()).get('code')}
rec = {'task': TASKS[task], 'label': label, 'observedAt': now(), 'tools': tools_name, 'toolsScripts': {
           'build-installed-reference.mjs': sha(tools / 'scripts/build-installed-reference.mjs'),
           'boundary-semantic-compiled.mjs': sha(tools / 'scripts/boundary-semantic-compiled.mjs'),
           'boundary-installed-identity.mjs': sha(tools / 'scripts/boundary-installed-identity.mjs')},
       'sourceRoot': source_root, 'installedSourceRoot': installed_source, 'commit': commit, 'installedReference': installed, 'compiledReference': compiled, 'reader': reader,
       'failure': failure,
       'installedSummary': ri and {'packages': len(ri['packages']), 'usage': ri['usage'], 'sourceExclusions': ri['recipe'].get('sourceExclusions'),
                                   'limitsEqualConstant': ri['limits'] == load('0243', 'candidate-preflight.json') and None or ri['limits']},
       'compiledSummary': rc and {'recipeVersion': rc['recipeVersion'], 'sourceExclusions': rc.get('sourceExclusions'), 'outputs': len(rc['outputs']),
                                  'inputs': len(rc['inputs'])},
       'commands': log}
save(task, 'references-' + label + '.json', rec)
print(json.dumps({k: v for k, v in rec.items() if k != 'commands'}, indent=1)[:3000])
