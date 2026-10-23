"""(adapted from HISO005-P2-BUILD-0247 tools_copy.py) Private copy of scripts/ for one measurement side: a commit
(git archive of scripts/) of the candidate worktree. node_modules is a hard-link copy of the candidate's (read only).
No patch is ever applied here (mutants run in the worktree, one at a time, see mutants.py).
usage: tools_copy.py <name> <commit>"""
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
archive = subprocess.run(['git', 'archive', '--format=tar', spec, 'scripts'], cwd=CANDIDATE, capture_output=True, check=True).stdout
subprocess.run(['/usr/bin/tar', '-x', '-C', str(dest)], input=archive, check=True)
origin = {'commit': git('rev-parse', spec)}
p, rec = run(['/usr/bin/cp', '-al', str(CANDIDATE / 'node_modules'), str(dest / 'node_modules')], CANDIDATE, env, log, timeout=1800)
assert p.returncode == 0, rec
files = {str(f.relative_to(dest)): sha(f) for f in sorted((dest / 'scripts').glob('*.mjs'))}
assert sha(dest / 'node_modules/typescript/lib/typescript.js') == PARSER_SHA
save('tools-' + name + '.json', {'task': TASK, 'observedAt': now(), 'name': name, 'origin': origin, 'path': str(dest), 'patched': False,
                                 'scripts': files, 'nodeModules': 'cp -al da worktree candidata', 'commands': log})
print(json.dumps({'name': name, 'origin': origin, 'engine': files.get('scripts/boundary-semantic-engine.mjs')}, indent=1))
