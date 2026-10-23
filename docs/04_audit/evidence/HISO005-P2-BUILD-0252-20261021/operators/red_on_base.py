"""AB01 first red, round r1b: the committed test of the BUILD run against the base v7 engine bytes (tools-v7, 24cdb463),
swapped into the worktree engine file only for the run and restored right after (sha checked before and after).
Writes first-red-0252-r1b-command.json and .vitest.json.gz via run_vitest.py. usage: red_on_base.py <committed-sha256>"""
import json, subprocess, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

committed = sys.argv[1]
engine = CANDIDATE / ENGINE
original = engine.read_bytes()
assert shab(original) == committed
base = (RUNTIME / 'tools-v7' / ENGINE).read_bytes()
assert shab(base) == V7_ENGINE_SHA
engine.write_bytes(base)
try:
    p = subprocess.run(['/usr/bin/python3', '-I', '-B', str(OPS / 'run_vitest.py'), 'first-red-0252-r1b', '--keep-report', TEST], cwd=str(OPS),
                       capture_output=True, text=True, timeout=14400)
finally:
    engine.write_bytes(original)
assert sha(engine) == committed
print(p.stdout[-1500:])
