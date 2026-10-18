"""Runbook 0803 preparation of generated runtime outputs in the frozen candidate, then compiled reader check."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

state, freeze, review, h = assert_frozen()
refs = load('references-current.json')
assert refs['status'] == 'REFERENCES_BUILT' and refs['sourceCommit'] == h
log = []
tmp = RUNTIME / 'prepare-runtime-tmp'
tmp.mkdir(exist_ok=True)
env = minimal_env(tmp)
steps = [
    [NODE, 'scripts/build-runtime.mjs'],
    [NODE, 'node_modules/typescript/bin/tsc', '-b', 'packages/shared/tsconfig.json', '--force'],
    [NODE, 'node_modules/vitest/vitest.mjs', 'run', 'tests/pare100-compiled-kernel-boundary.test.js',
     'tests/pare100-sdk-boundary-qualification.test.js', '--no-file-parallelism', '--maxWorkers=2'],
]
for argv in steps:
    p, rec = run(argv, CANDIDATE, env, log, timeout=900)
    save('prepare-runtime-commands.json', log)
    assert p.returncode == 0, 'see prepare-runtime-commands.json'
reader = ("import {loadCompiledBuildReference} from './scripts/boundary-semantic-compiled.mjs';"
          "const r=loadCompiledBuildReference(process.cwd(),JSON.parse(process.argv[1]),{installedReference:JSON.parse(process.argv[2])});"
          "console.log(JSON.stringify({status:r.status,recipeVersion:r.recipeVersion,referenceDigest:r.referenceDigest,files:r.files?.length,reason:r.reason}));"
          "if(r.status!=='PROVEN')process.exit(1)")
p, rec = run([NODE, '--input-type=module', '-e', reader, json.dumps(refs['compiledReference']), json.dumps(refs['installedReference'])], CANDIDATE, env, log)
save('prepare-runtime-commands.json', log)
readout = json.loads(p.stdout) if p.stdout.strip() else None
assert p.returncode == 0 and readout['status'] == 'PROVEN', readout
assert_frozen()
out = {'task': TASK, 'status': 'RUNTIME_PREPARED_COMPILED_READER_PROVEN', 'observedAt': now(), 'sourceCommit': h,
       'commands': 'prepare-runtime-commands.json', 'compiledReader': readout, 'sourceEdited': False, 'reviewBudgetReset': False}
save('prepare-runtime.json', out)
print(json.dumps(out))
