"""Run the compiled reader of one tools copy for a references label against an evaluated root.
usage: reader.py <task> <refs-label> <tools-name> <evaluated-root>"""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

task, label, tools_name, root = sys.argv[1:5]
refs = load(task, 'references-' + label + '.json')
tools = RUNTIME / ('tools-' + tools_name)
log = []
code = ("import {loadCompiledBuildReference} from " + json.dumps((tools / 'scripts/boundary-semantic-compiled.mjs').as_uri()) + ";"
        "const r=loadCompiledBuildReference(process.argv[1],JSON.parse(process.argv[2]),{installedReference:JSON.parse(process.argv[3])});"
        "console.log(JSON.stringify({status:r.status,recipeVersion:r.recipeVersion,files:r.files?.length,reason:r.reason}))")
tmp = RUNTIME / 'reader-tmp'
tmp.mkdir(exist_ok=True)
p, rec = run([NODE, '--input-type=module', '-e', code, root, json.dumps(refs['compiledReference']), json.dumps(refs['installedReference'])], tools, minimal_env(tmp), log, keep=3000)
out = json.loads(p.stdout) if p.returncode == 0 else {'exit': p.returncode}
refs.setdefault('readerReruns', []).append({'observedAt': now(), 'evaluatedRoot': root, 'tools': tools_name, 'result': out,
                                           'note': 'releitura depois de construir packages/{contracts,shared}/dist na raiz avaliada (tsc -b), exigido pelo leitor'})
save(task, 'references-' + label + '.json', refs)
print(json.dumps(out))
