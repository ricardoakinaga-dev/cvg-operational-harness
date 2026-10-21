"""MUTATION ONLY (test discrimination evidence, never promoted): every .[cm]ts/.tsx file parses as TSX (the mTsAll
mutant of critic R1-02). usage: mutation_tsall.py <tools>/scripts"""
import sys
from pathlib import Path
p = Path(sys.argv[1]) / 'boundary-semantic-engine.mjs'
s = p.read_text()
old = "      /\\.tsx$/.test(file)\n        ? ts.ScriptKind.TSX"
assert s.count(old) == 1
p.write_text(s.replace(old, "      /\\.[cm]?tsx?$/.test(file)\n        ? ts.ScriptKind.TSX"))
print('ok')
