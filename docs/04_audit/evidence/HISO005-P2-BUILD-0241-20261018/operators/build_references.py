"""Fresh installed reference + compiled reference from the frozen 0240 source (same physical root)."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

label = sys.argv[1]
state, freeze, review, h = assert_frozen()
log = []
tmp = RUNTIME / 'references-tmp'
tmp.mkdir(exist_ok=True)
env = dict(minimal_env(tmp), HOME='/home/ricardo')  # recipe fails ENOENT without HOME in the parent (attempts r2/r3)
installed_root = RUNTIME / ('installed-reference-' + label)
compiled_root = RUNTIME / ('compiled-reference-' + label)
assert not compiled_root.exists()

def persist(status, extra=None):
    out = {'task': TASK, 'label': label, 'status': status, 'observedAt': now(), 'sourceCommit': h, 'commands': log, **(extra or {})}
    save('references-' + label + '.json', out)
    if status == 'REFERENCES_BUILT':
        save('references-current.json', out)
    return out

import shutil
assert shutil.disk_usage(RUNTIME).free > 20 * 1024 ** 3, 'own space guard: keep >=20GiB free on /mnt/dados'
reuse = sys.argv[2] if len(sys.argv) > 2 else None
if reuse:
    prior = load('references-' + reuse + '.json')
    assert prior['sourceCommit'] == h and prior['commands'][0]['exitCode'] == 0
    installed = json.loads(prior['commands'][0]['stdout'])
    log.append({'reusedInstalledReferenceFrom': 'references-' + reuse + '.json', 'installed': installed})
else:
    p, rec = run([NODE, 'scripts/build-installed-reference.mjs', '--source-root=' + str(CANDIDATE), '--commit=' + h,
                  '--output-root=' + str(installed_root), '--cache-source=' + str(RUNTIME / 'npm-cache-source')], CANDIDATE, env, log, timeout=1800)
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
                                   'cacheSourceCopy': 'npm-cache-source-copy.json',
                                   'note': 'Installed reference via runbook 0803 recipe (offline npm ci in private snapshot) from a byte-exact private copy of the lock-required cache payloads, because ~/.npm/_cacache became a symlink (CACHE_ALIAS) after the 18/10 migration; not a candidate install, lockfile untouched. Compiled reference is build provenance only, not semantic approval.'})
print(json.dumps({k: v for k, v in out.items() if k != 'commands'}))
