"""DIAGNOSTIC ONLY (never promoted): the parent of runSemanticBoundary also writes the exact serialized worker input
to CVG_DIAG_INPUT_DUMP. Nothing else changes. usage: input_dump_patch.py <tools>/scripts"""
import sys
from pathlib import Path
p = Path(sys.argv[1]) / 'boundary-semantic-engine.mjs'
s = p.read_text()
old = "        input: JSON.stringify(input),\n"
assert s.count(old) == 1
s = s.replace(old, """        input: (() => {
          const body = JSON.stringify(input)
          if (process.env.CVG_DIAG_INPUT_DUMP)
            fs.writeFileSync(process.env.CVG_DIAG_INPUT_DUMP, body)
          return body
        })(),
""")
p.write_text(s)
print('ok')
