"""Private copies of the recipe/checker scripts for a measurement side: a commit (git archive of scripts/), the
frozen working tree of the candidate (hashes checked against a source freeze), optionally followed by diagnostic
patches (never promoted). node_modules is a hard-link copy of the candidate's (read only for every run).
usage: tools_copy.py <name> <commit|freeze:<round>> [<patch.py> ...]"""
import json, subprocess, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

name, spec, patches = sys.argv[1], sys.argv[2], sys.argv[3:]
dest = RUNTIME / ('tools-' + name)
assert not dest.exists()
dest.mkdir(parents=True)
log = []
env = {'PATH': '/usr/bin:/bin', 'LANG': 'C', 'LC_ALL': 'C'}
if spec.startswith('freeze:'):
    rnd = spec.split(':')[1]
    freeze = load('source-freeze-' + rnd + '.json')
    p, rec = run(['/usr/bin/cp', '-a', str(CANDIDATE / 'scripts'), str(dest / 'scripts')], CANDIDATE, env, log)
    assert p.returncode == 0
    for row in freeze['files']:
        if row['path'].startswith('scripts/'):
            assert sha(dest / row['path']) == row['sha256'], row['path']
    origin = {'freeze': 'source-freeze-' + rnd + '.json'}
else:
    archive = subprocess.run(['git', 'archive', '--format=tar', spec, 'scripts'], cwd=CANDIDATE, capture_output=True, check=True).stdout
    subprocess.run(['/usr/bin/tar', '-x', '-C', str(dest)], input=archive, check=True)
    origin = {'commit': git('rev-parse', spec)}
before = sha(dest / 'scripts/boundary-semantic-engine.mjs')
applied = []
for patch in patches:
    pp = OPS / patch
    p, rec = run(['/usr/bin/python3', '-I', '-B', str(pp), str(dest / 'scripts')], OPS, env, log)
    assert p.returncode == 0, rec
    applied.append({'patch': 'operators/' + patch, 'sha256': sha(pp)})
p, rec = run(['/usr/bin/cp', '-al', str(CANDIDATE / 'node_modules'), str(dest / 'node_modules')], CANDIDATE, env, log, timeout=1800)
assert p.returncode == 0
files = {str(f.relative_to(dest)): sha(f) for f in sorted((dest / 'scripts').glob('*.mjs'))}
save('tools-' + name + '.json', {'observedAt': now(), 'name': name, 'origin': origin, 'path': str(dest), 'engineBeforePatches': before,
                                 'patches': applied, 'diagnosticOnly': bool(applied), 'scripts': files, 'nodeModules': 'cp -al da candidata'})
print(json.dumps({'name': name, 'origin': origin, 'engine': files.get('scripts/boundary-semantic-engine.mjs'), 'patches': [a['patch'] for a in applied]}, indent=1))
