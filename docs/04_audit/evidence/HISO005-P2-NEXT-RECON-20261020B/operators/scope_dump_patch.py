"""DIAGNOSTIC ONLY (never promoted): on top of diag_patch + cause_v5 + binding_origin + k0_origin, adds to the graph
dump what a proof-by-scope rule needs and the engine does not publish today: (1) every contained edge with its
importer (the contained tuple is attributed to the target file, not to the importer); (2) the native grammar result
of EVERY analysed file (today the grammar phase only runs when there is no UNKNOWN), computed with the same code
path; (3) the callee of each refused NewExpression as a tag. Tuples, values and control flow are unchanged.
usage: scope_dump_patch.py <tools>/scripts"""
import sys
from pathlib import Path
p = Path(sys.argv[1]) / 'boundary-semantic-engine.mjs'
s = p.read_text()
def rep(old, new):
    global s
    assert s.count(old) == 1, (old[:80], s.count(old))
    s = s.replace(old, new)
rep("  const __tags = new Map(), __refused = new Map()", "  const __tags = new Map(), __refused = new Map(), __contained = [], __grammar = {}")
rep("""      coverage.containedEdges++
      unknown(relative(error.file) ? error.file : from, reason, message)""", """      coverage.containedEdges++
      __contained.push([from, relative(error.file) ? error.file : '', reason, specifier])
      unknown(relative(error.file) ? error.file : from, reason, message)""")
rep("""    return unknown(file, 'UNKNOWN_UNSUPPORTED_SYNTAX', ts.SyntaxKind[n.kind])
  }""", """    return unknown(
      file,
      'UNKNOWN_UNSUPPORTED_SYNTAX',
      ts.SyntaxKind[n.kind],
      null,
      ts.isNewExpression(n)
        ? 'new:' +
            (ts.isIdentifier(n.expression)
              ? n.expression.text + (find(e, n.expression.text) ? ':local' : ':global')
              : 'expr')
        : null
    )
  }""")
rep("""    if (!out.unknowns.length && !out.violations.length) {
      for (const file of [...astFiles.keys()].sort(sort)) {""", """    // DIAGNOSTIC COPY ONLY: the same grammar check for every file, recorded aside.
    if (!census)
      for (const file of [...astFiles.keys()].sort(sort)) {
        try {
          let source = astFiles.get(file).text
          if (/\\.[cm]?ts$/.test(file))
            source = stripTypeScriptTypes(source, { mode: 'strip' })
          if (modules.get(file)?.mode === 'import')
            void new vm.SourceTextModule(source, { identifier: path.join(root, file) })
          else if (modules.get(file)?.mode === 'require') {
            source = source.replace(/^\\uFEFF/, '').replace(/^#![^\\r\\n]*/, '')
            void new vm.Script(Module.wrap(source), { filename: path.join(root, file) })
          } else throw Error('unknown grammar profile')
          __grammar[file] = 'OK'
        } catch (error) {
          __grammar[file] = 'UNKNOWN_RUNTIME_SYNTAX'
        }
      }
    if (!out.unknowns.length && !out.violations.length) {
      for (const file of [...astFiles.keys()].sort(sort)) {""")
rep("""        tags: [...__tags].map(([k, v]) => [k, [...v].sort()]),""", """        tags: [...__tags].map(([k, v]) => [k, [...v].sort()]),
        contained: __contained,
        grammar: __grammar,
        modes: Object.fromEntries([...modules].map(([k, v]) => [k, v.mode])),""")
p.write_text(s)
print('ok')
