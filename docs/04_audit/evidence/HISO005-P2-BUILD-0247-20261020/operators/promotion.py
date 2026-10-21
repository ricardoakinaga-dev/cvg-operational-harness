"""(adapted from HISO005-P2-BUILD-0245) Promotion package of one delta commit: paths, pre-image (parent) and post-image SHA-256, and the full-index
binary diff parent..commit. Nothing is applied anywhere. usage: promotion.py <commit>"""
import json, subprocess, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

commit = sys.argv[1]
commit = git('rev-parse', commit)
parent = git('rev-parse', commit + '~1')
names = [l for l in subprocess.check_output(['git', 'diff', '--name-only', '-z', parent, commit], cwd=CANDIDATE, text=True).split('\0') if l]
def blob(rev, p):
    r = subprocess.run(['git', 'show', rev + ':' + p], cwd=CANDIDATE, capture_output=True)
    return shab(r.stdout) if r.returncode == 0 else None
rows = [{'path': p, 'preImageSha256': blob(parent, p), 'postImageSha256': blob(commit, p)} for p in names]
patch = subprocess.check_output(['git', 'diff', '--full-index', '--binary', parent, commit], cwd=CANDIDATE)
name = 'promotion-' + commit[:12] + '.patch.txt'
(EV / name).write_bytes(patch)
rec = {'task': TASK, 'observedAt': now(), 'status': 'PREPARED_NOT_APPLIED', 'commit': commit, 'parent': parent,
       'candidate': str(CANDIDATE), 'paths': rows, 'patch': name, 'patchSha256': sha(EV / name),
       'applyRule': ('aplicar só sobre pré-imagens iguais (SHA-256 por caminho), sobre a main que já contiver o BUILD0245 (1d40fe51, kernel v6 semantic-kernel-v6-tsx-parse); '
                    'se a 0245 não entrar antes, não aplicar: vale a alternativa da SPEC0247 §3.7 (semantic-kernel-v6-cjs-export-value e a 0245 migrada para semantic-kernel-v7-tsx-parse), decisão do lead; '
                    'promoção à main só pelo lead (esta unidade não faz push nem PR)')}
save('promotion-' + commit[:12] + '.json', rec)
index_file = EV / 'promotion-deltas-prepared.json'
index = json.loads(index_file.read_text()) if index_file.exists() else {'task': TASK, 'status': 'PREPARED_NOT_APPLIED', 'commits': []}
index['commits'] = [c for c in index.get('commits', []) if c['commit'] != commit] + [{'commit': commit, 'parent': parent, 'record': 'promotion-' + commit[:12] + '.json', 'patch': name, 'paths': [r['path'] for r in rows]}]
index['observedAt'] = now()
index['applyRule'] = rec['applyRule']
save('promotion-deltas-prepared.json', index)
print(json.dumps({'commit': commit[:12], 'parent': parent[:12], 'paths': len(rows), 'patch': name}))
