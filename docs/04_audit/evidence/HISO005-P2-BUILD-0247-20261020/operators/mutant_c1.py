"""MUTANT (never promoted): C1 removida: o valor inicial volta a VOID (undefined). usage: mutant_c1.py <tools>/scripts"""
import sys
from pathlib import Path
p = Path(sys.argv[1]) / 'boundary-semantic-engine.mjs'
s = p.read_text()
for old, new in [("      cjs: mode === 'require' ? cjsExportsObject(file) : VOID,", '      cjs: VOID,')]:
    assert s.count(old) == 1, old[:80]
    s = s.replace(old, new)
p.write_text(s)
print('mutant_c1')
