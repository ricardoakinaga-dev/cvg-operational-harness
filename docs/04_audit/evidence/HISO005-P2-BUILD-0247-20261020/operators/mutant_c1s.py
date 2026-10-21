"""MUTANT (never promoted): C1 sem silêncio no checkExport: o objeto inicial cai em UNKNOWN_ESCAPED_CAPABILITY. usage: mutant_c1s.py <tools>/scripts"""
import sys
from pathlib import Path
p = Path(sys.argv[1]) / 'boundary-semantic-engine.mjs'
s = p.read_text()
for old, new in [("    if (v.t === 'cjs-exports-object') return\n", '')]:
    assert s.count(old) == 1, old[:80]
    s = s.replace(old, new)
p.write_text(s)
print('mutant_c1s')
