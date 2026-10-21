"""DIAGNOSTIC VARIANT ONLY (SPEC0245 candidate A, never promoted): the parser ScriptKind follows the extension
(.tsx -> TSX, .jsx -> JSX, .[cm]ts -> TS, otherwise JS). JSX nodes then reach the existing expression fallback and
are refused as UNKNOWN_UNSUPPORTED_SYNTAX with their SyntaxKind (JsxElement, JsxSelfClosingElement, JsxFragment),
without evaluating attributes or children. Formats, resolution and the grammar phase are unchanged.
usage: tsx_parse_patch.py <tools>/scripts"""
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
