"""MUTANT (never promoted): C0 só com raiz (alternativa R): o importador recebe o valor rastreado, na primeira carga e no cache. usage: mutant_c0r.py <tools>/scripts"""
import sys
from pathlib import Path
p = Path(sys.argv[1]) / 'boundary-semantic-engine.mjs'
s = p.read_text()
for old, new in [('        ? module.cjsUnknown\n          ? U\n          : module.cjs\n', '        ? module.cjs\n'), ('    return module.cjsUnknown ? U : result\n', '    return result\n')]:
    assert s.count(old) == 1, old[:80]
    s = s.replace(old, new)
p.write_text(s)
print('mutant_c0r')
