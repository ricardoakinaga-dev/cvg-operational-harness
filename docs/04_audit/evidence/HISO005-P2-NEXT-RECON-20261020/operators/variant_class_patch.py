"""DIAGNOSTIC VARIANT ONLY (never promoted): on top of variant_star_patch.py, a refused class declaration keeps its
UNKNOWN_UNSUPPORTED_SYNTAX root but its name is bound and, when exported, exported with the value U (the export
exists; its value is unknown), instead of being absent from the namespace. usage: variant_class_patch.py <tools>/scripts"""
import sys
from pathlib import Path
p = Path(sys.argv[1]) / 'boundary-semantic-engine.mjs'
s = p.read_text()
old = """      if (ts.isClassDeclaration(n) && n.name) {
        if (!__refused.has(file)) __refused.set(file, new Set())
        __refused.get(file).add(n.name.text)
      }"""
assert s.count(old) == 1
s = s.replace(old, """      if (ts.isClassDeclaration(n) && n.name) {
        if (!__refused.has(file)) __refused.set(file, new Set())
        __refused.get(file).add(n.name.text)
        // VARIANT: the binding and the export exist; their value is U.
        e.bindings.set(n.name.text, U)
        if (exported(n))
          modules
            .get(file)
            .exports.set(
              n.modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)
                ? 'default'
                : n.name.text,
              U
            )
      }""")
p.write_text(s)
print('ok')
