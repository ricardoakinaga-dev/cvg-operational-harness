"""Copy, byte-identical in the code, of HISO005-P2-NEXT-RECON-20261020B/operators/tsx_parse_patch.py (SPEC0245 variant A),
used here only to build the private v6 base (v5 + 0245 A) on which the SPEC0247 delta is re-measured."""
import sys
from pathlib import Path
p = Path(sys.argv[1]) / 'boundary-semantic-engine.mjs'
s = p.read_text()
old = "      /\\.[cm]?tsx?$/.test(file) ? ts.ScriptKind.TS : ts.ScriptKind.JS\n"
assert s.count(old) == 1, s.count(old)
s = s.replace(old, """      /\\.tsx$/.test(file)
        ? ts.ScriptKind.TSX
        : /\\.jsx$/.test(file)
          ? ts.ScriptKind.JSX
          : /\\.[cm]?ts$/.test(file)
            ? ts.ScriptKind.TS
            : ts.ScriptKind.JS
""")
p.write_text(s)
print('ok')
