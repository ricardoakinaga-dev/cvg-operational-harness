"""Fresh installed reference + compiled reference from the frozen 0240 source (same physical root)."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

state, freeze, review, h = assert_frozen()
log = []
tmp = RUNTIME / 'references-tmp'
tmp.mkdir(exist_ok=True)
env = minimal_env(tmp)
installed_root = RUNTIME / 'installed-reference-r1'
compiled_root = RUNTIME / 'compiled-reference-r1'
assert not installed_root.exists() and not compiled_root.exists()

def persist(status, extra=None):
    out = {'task': TASK, 'status': status, 'observedAt': now(), 'sourceCommit': h, 'commands': log, **(extra or {})}
    save('references-r1.json', out)
    return out

p, rec = run([NODE, 'scripts/build-installed-reference.mjs', '--source-root=' + str(CANDIDATE), '--commit=' + h,
              '--output-root=' + str(installed_root), '--cache-source=/home/ricardo/.npm'], CANDIDATE, env, log, timeout=1800)
if p.returncode != 0:
    persist('INSTALLED_REFERENCE_FAILED'); raise SystemExit(p.returncode)
installed = json.loads(p.stdout)
assert sha(installed['manifestPath']) == installed['expectedSha256']
assert_frozen()
p, rec = run([NODE, 'scripts/boundary-semantic-compiled.mjs', '--source-root=' + str(CANDIDATE), '--commit=' + h,
              '--output-root=' + str(compiled_root), '--dependencies-root=' + str(CANDIDATE),
              '--installed-reference=' + installed['manifestPath'],
              '--installed-reference-sha256=' + installed['expectedSha256']], CANDIDATE, env, log, timeout=1800)
if p.returncode != 0:
    persist('COMPILED_REFERENCE_FAILED', {'installedReference': installed}); raise SystemExit(p.returncode)
compiled = json.loads(p.stdout)
assert sha(compiled['manifestPath']) == compiled['expectedSha256']
reader = ("import {loadCompiledBuildReference} from './scripts/boundary-semantic-compiled.mjs';"
          "const r=loadCompiledBuildReference(process.cwd(),JSON.parse(process.argv[1]),{installedReference:JSON.parse(process.argv[2])});"
          "console.log(JSON.stringify({status:r.status,recipeVersion:r.recipeVersion,referenceDigest:r.referenceDigest,files:r.files?.length,reason:r.reason}));")
p, rec = run([NODE, '--input-type=module', '-e', reader, json.dumps(compiled), json.dumps(installed)], CANDIDATE, env, log)
readout = json.loads(p.stdout) if p.returncode == 0 and p.stdout.strip() else None
assert_frozen()
out = persist('REFERENCES_BUILT', {'installedReference': installed, 'compiledReference': compiled, 'readerAfterGeneration': readout,
                                   'note': 'Installed reference via runbook 0803 recipe (offline npm ci in private snapshot, cache readonly); not a candidate install, lockfile untouched. Compiled reference is build provenance only, not semantic approval.'})
print(json.dumps({k: v for k, v in out.items() if k != 'commands'}))
