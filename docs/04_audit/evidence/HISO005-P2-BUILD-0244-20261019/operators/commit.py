"""Commit the frozen delta (only its own paths) in the detached candidate and record it. usage: commit.py <round> <message-file>"""
import json, subprocess, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

rnd, msgfile = sys.argv[1], sys.argv[2]
freeze = load('source-freeze-' + rnd + '.json')
paths = [f['path'] for f in freeze['files']]
assert all(sha(CANDIDATE / f['path']) == f['sha256'] for f in freeze['files'])
parent = head()
assert parent == freeze['parentCommit']
subprocess.run(['git', 'add', '--', *paths], cwd=CANDIDATE, check=True)
staged = [l for l in subprocess.check_output(['git', 'diff', '--cached', '--name-only'], cwd=CANDIDATE, text=True).splitlines() if l]
assert sorted(staged) == sorted(paths), staged
subprocess.run(['git', 'commit', '--no-verify', '-F', msgfile], cwd=CANDIDATE, check=True, capture_output=True)
commit = head()
rec = {'task': TASK, 'observedAt': now(), 'commit': commit, 'parent': parent, 'freeze': 'source-freeze-' + rnd + '.json',
       'files': [{'path': p, 'sha256': shab(subprocess.run(['git', 'show', commit + ':' + p], cwd=CANDIDATE, capture_output=True).stdout),
                  'equalsFreeze': shab(subprocess.run(['git', 'show', commit + ':' + p], cwd=CANDIDATE, capture_output=True).stdout) == f['sha256']}
                 for p, f in zip(paths, freeze['files'])],
       'subject': git('log', '-1', '--format=%s'), 'trackedClean': git('status', '--porcelain', '--untracked-files=no') == '',
       'untracked': git('status', '--porcelain').splitlines(), 'hooks': '--no-verify (os gates rodam no certify próprio)'}
rec['allEqualFreeze'] = all(f['equalsFreeze'] for f in rec['files'])
save('commit-0244.json', rec)
print(json.dumps({k: rec[k] for k in ('commit', 'parent', 'subject', 'allEqualFreeze', 'trackedClean', 'untracked')}, indent=1))
