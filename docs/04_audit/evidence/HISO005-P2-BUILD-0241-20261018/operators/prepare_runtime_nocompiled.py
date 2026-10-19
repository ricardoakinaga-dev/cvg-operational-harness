"""Runbook 0803 preparation of generated runtime outputs in the frozen candidate (no compiled reader: compiled reference BLOCKED)."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

state, freeze, review, h = assert_frozen()
refs = load('references-current.json')
assert refs['status'] == 'INSTALLED_REFERENCE_BUILT' and refs['sourceCommit'] == h
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
    p, rec = run(argv, CANDIDATE, env, log, timeout=1800)
    save('prepare-runtime-commands.json', log)
    assert p.returncode == 0, 'see prepare-runtime-commands.json'
assert_frozen()
out = {'task': TASK, 'status': 'RUNTIME_PREPARED_COMPILED_READER_NOT_RUN', 'observedAt': now(), 'sourceCommit': h,
       'commands': 'prepare-runtime-commands.json', 'compiledReader': None,
       'compiledReaderReason': 'compiled reference BLOCKED by the frozen recipe listing cap on this tree (reference-recipe-blocker.json)',
       'sourceEdited': False, 'reviewBudgetReset': False}
save('prepare-runtime.json', out)
print(json.dumps(out))
