"""MUTANT (never promoted): C0 removida: nenhuma categoria é classificada (sem raiz UNKNOWN_CJS_EXPORTS e sem U). usage: mutant_c0.py <tools>/scripts"""
import sys
from pathlib import Path
p = Path(sys.argv[1]) / 'boundary-semantic-engine.mjs'
s = p.read_text()
for old, new in [('      for (const category of cjsHandleCategories(sf)) {', '      for (const category of []) {')]:
    assert s.count(old) == 1, old[:80]
    s = s.replace(old, new)
p.write_text(s)
print('mutant_c0')
