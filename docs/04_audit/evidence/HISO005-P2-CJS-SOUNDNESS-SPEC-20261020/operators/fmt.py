"""Format a SPEC0247 draft as the repository asks: `npx prettier --stdin-filepath docs/02_spec/0247_b6_cjs_export_soundness.md`,
run with cwd in the read-only worktree PR9 (same .prettierrc.json as the main, prettier 3.8.3); nothing is written
there. Cross-check: the recon method (prettier.cjs --config <main .prettierrc.json> --parser markdown) gives the same
bytes. usage: fmt.py <draft-path> <out-name-in-evidence>"""
import json, subprocess, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

src, out = Path(sys.argv[1]), sys.argv[2]
data = src.read_bytes()
p = npx_prettier(data, 'format ' + out)
assert p.returncode == 0, p.stderr
env = NPX_ENV
q = subprocess.run([NODE, str(PR9 / 'node_modules/prettier/bin/prettier.cjs'), '--config', str(PR9 / '.prettierrc.json'), '--parser', 'markdown'],
                   cwd=str(RUNTIME), input=data, capture_output=True, env=env, check=True)
assert p.stdout == q.stdout, 'formatters differ'
(EV / out).write_bytes(p.stdout)
print(json.dumps({'out': out, 'sha256': sha(EV / out), 'changedByPrettier': p.stdout != data, 'bytes': len(p.stdout)}))
