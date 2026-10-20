"""Materialize the final draft as the file the lead copies byte for byte to docs/02_spec (formatted with the
repository's prettier via npx --stdin-filepath; .md.txt here because the links are relative to docs/02_spec).
usage: materialize.py <final-draft-in-evidence>"""
import json, re, subprocess, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

NAME = '0247_b6_cjs_export_soundness.md'
SPECDIR = PROJECT / 'docs/02_spec'
src = EV / sys.argv[1]
dst = EV / 'materialized' / (NAME + '.txt')
dst.parent.mkdir(exist_ok=True)
dst.write_bytes(src.read_bytes())
s = dst.read_text()
assert not re.search(r'/home/|/mnt/', s)
p = npx_prettier(dst.read_bytes(), 'materialize check')
links = re.findall(r'\]\(([^)#\s]+)(?:#[^)]*)?\)', s)
broken = [l for l in links if not l.startswith('http') and not (SPECDIR / l).resolve().exists()]
inMain = subprocess.run(['git', '-C', str(PROJECT), 'ls-tree', '--name-only', MAIN, 'docs/02_spec/' + NAME], capture_output=True, text=True).stdout.strip()
out = {'task': TASK, 'observedAt': now(), 'targetDir': 'docs/02_spec',
       'file': {'spec': 'SPEC0247', 'path': 'materialized/' + NAME + '.txt', 'target': 'docs/02_spec/' + NAME, 'source': sys.argv[1],
                'sourceSha256': sha(src), 'sha256': sha(dst), 'bytes': dst.stat().st_size, 'byteEqualToSource': dst.read_bytes() == src.read_bytes(),
                'prettierStdinIdempotent': p.returncode == 0 and p.stdout == dst.read_bytes(), 'links': len(links), 'brokenFromSpecDir': broken,
                'targetFreeInWorkingTree': not list(SPECDIR.glob('0247_*')), 'targetFreeInMainRemote': not inMain,
                'formatter': 'npx --no-install prettier --stdin-filepath docs/02_spec/' + NAME + ' (prettier 3.8.3, cwd na worktree PR9 só leitura, .prettierrc.json igual ao da main)'}}
f = out['file']
out['status'] = 'PASS' if f['byteEqualToSource'] and f['prettierStdinIdempotent'] and not f['brokenFromSpecDir'] and f['targetFreeInWorkingTree'] and f['targetFreeInMainRemote'] else 'FAIL'
save('materialized-specs.json', out)
print(json.dumps(out, indent=1, ensure_ascii=False))
