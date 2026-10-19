"""Source freeze of a delta in the candidate working tree (before its commit): every changed path with SHA-256,
the base/parent commit, the unchanged pre-images and the binary diff. usage: freeze.py <task> <round>"""
import json, subprocess, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

task, rnd = sys.argv[1], sys.argv[2]
parent = head()
changed = [e[3:] for e in subprocess.check_output(['git', 'status', '--porcelain', '-z', '--untracked-files=all'], cwd=CANDIDATE, text=True).split('\0') if e]
diff = subprocess.check_output(['git', 'diff', '--binary', 'HEAD'], cwd=CANDIDATE)
untracked = [p for p in changed if git('ls-files', '--', p) == '']
for p in untracked:
    diff += subprocess.run(['git', 'diff', '--binary', '--no-index', '/dev/null', p], cwd=CANDIDATE, capture_output=True).stdout
patch = 'source-freeze-' + rnd + '.patch.txt'
(EVS[task] / patch).write_bytes(diff)
rec = {'task': TASKS[task], 'round': rnd, 'observedAt': now(), 'candidate': str(CANDIDATE), 'parentCommit': parent,
       'files': [{'path': p, 'sha256': sha(CANDIDATE / p), 'status': 'added' if p in untracked else 'modified'} for p in sorted(changed)],
       'parentBlobSha256': {p: (shab(subprocess.run(['git', 'show', parent + ':' + p], cwd=CANDIDATE, capture_output=True).stdout) if p not in untracked else None) for p in sorted(changed)},
       'patch': patch, 'patchSha256': sha(EVS[task] / patch), 'nodeSha256': sha(NODE),
       'parserSha256': sha(CANDIDATE / 'node_modules/typescript/lib/typescript.js')}
save(task, 'source-freeze-' + rnd + '.json', rec)
print(json.dumps({k: rec[k] for k in ('round', 'parentCommit', 'patchSha256')}, indent=1), len(rec['files']), 'files')
