"""MUTANT (never promoted): C3 removida (alternativa S): checkExport não roda quando a C0 dá U aos importadores. usage: mutant_c3.py <tools>/scripts"""
import sys
from pathlib import Path
p = Path(sys.argv[1]) / 'boundary-semantic-engine.mjs'
s = p.read_text()
for old, new in [('    checkExport(result, file)\n    return module.cjsUnknown ? U : result\n', '    if (!module.cjsUnknown) checkExport(result, file)\n    return module.cjsUnknown ? U : result\n')]:
    assert s.count(old) == 1, old[:80]
    s = s.replace(old, new)
p.write_text(s)
print('mutant_c3')
