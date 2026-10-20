"""DIAGNOSTIC ONLY (never promoted): on top of diag_patch.py, adds to the graph dump the 15 function instances with
the most call contexts (the maxContexts usage), with file, position and the first characters of the function text.
Nothing else changes. usage: contexts_patch.py <tools>/scripts"""
import sys
from pathlib import Path
p = Path(sys.argv[1]) / 'boundary-semantic-engine.mjs'
s = p.read_text()
old = "        reachedPackages: [...reachedPackages.keys()].sort()"
assert s.count(old) == 1
s = s.replace(old, """        reachedPackages: [...reachedPackages.keys()].sort(),
        contextsTop: [...contexts]
          .map(([id, set]) => {
            const [hashPart, end, pos, ...file] = id.split(':').reverse()
            const f = file.reverse().join(':')
            const text = astFiles.get(f)?.text ?? ''
            return {
              file: f,
              pos: Number(pos),
              end: Number(end),
              contexts: set.size,
              head: text.slice(Number(pos), Number(pos) + 160).trim()
            }
          })
          .sort((a, b) => b.contexts - a.contexts)
          .slice(0, 15)""", 1)
p.write_text(s)
print('ok')
