"""Private copies of the recipe/checker scripts for a measurement side: 'pre' = scripts of a commit (git archive),
'post' = the frozen working tree of the candidate (hashes checked against a source freeze). node_modules is a
hard-link copy of the candidate's (read only for every run). usage: tools_copy.py <name> <commit|freeze:<task>:<round>> [<evidence-task>]"""
import json, subprocess, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

name, spec = sys.argv[1], sys.argv[2]
dest = RUNTIME / ('tools-' + name)
assert not dest.exists()
dest.mkdir(parents=True)
log = []
env = {'PATH': '/usr/bin:/bin', 'LANG': 'C', 'LC_ALL': 'C'}
if spec.startswith('freeze:'):
    _, task, rnd = spec.split(':')
    freeze = load(task, 'source-freeze-' + rnd + '.json')
    p, rec = run(['/usr/bin/cp', '-a', str(CANDIDATE / 'scripts'), str(dest / 'scripts')], CANDIDATE, env, log)
    assert p.returncode == 0
    for row in freeze['files']:
        if row['path'].startswith('scripts/'):
            assert sha(dest / row['path']) == row['sha256'], row['path']
    origin = {'freeze': 'source-freeze-' + rnd + '.json', 'task': TASKS[task]}
else:
    archive = subprocess.run(['git', 'archive', '--format=tar', spec, 'scripts'], cwd=CANDIDATE, capture_output=True, check=True).stdout
    subprocess.run(['/usr/bin/tar', '-x', '-C', str(dest)], input=archive, check=True)
    origin = {'commit': git('rev-parse', spec)}
p, rec = run(['/usr/bin/cp', '-al', str(CANDIDATE / 'node_modules'), str(dest / 'node_modules')], CANDIDATE, env, log, timeout=1800)
assert p.returncode == 0
files = {str(f.relative_to(dest)): sha(f) for f in sorted((dest / 'scripts').glob('*.mjs'))}
save(sys.argv[3] if len(sys.argv) > 3 else '0243', 'tools-' + name + '.json',
     {'observedAt': now(), 'name': name, 'origin': origin, 'path': str(dest), 'scripts': files, 'nodeModules': 'cp -al da candidata'})
print(json.dumps({'name': name, 'origin': origin, 'engine': files.get('scripts/boundary-semantic-engine.mjs'), 'compiled': files.get('scripts/boundary-semantic-compiled.mjs')}, indent=1))
