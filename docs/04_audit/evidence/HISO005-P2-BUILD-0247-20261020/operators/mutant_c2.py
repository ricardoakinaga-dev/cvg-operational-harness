"""MUTANT (never promoted): C2 removida: depois de if não decidido, o último ramo vence (como na v6). usage: mutant_c2.py <tools>/scripts"""
import sys
from pathlib import Path
p = Path(sys.argv[1]) / 'boundary-semantic-engine.mjs'
s = p.read_text()
for old, new in [('          if (join) module.cjs = before\n', ''), ('          if (join) module.cjs = union([afterThen, module.cjs])\n', '')]:
    assert s.count(old) == 1, old[:80]
    s = s.replace(old, new)
p.write_text(s)
print('mutant_c2')
