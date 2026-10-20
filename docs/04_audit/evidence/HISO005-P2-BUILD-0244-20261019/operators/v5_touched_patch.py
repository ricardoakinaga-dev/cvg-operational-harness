"""DIAGNOSTIC ONLY (never promoted): on top of diag_patch.py applied to the v5 engine, records the modules touched
by SPEC0244 (E1 processed a star of the module, qualified or not; E2 met or predeclared a class declaration), the
namespaces left incomplete and the ambiguous star names, and adds them to the graph dump. touchedStrict is the
SPEC wording (E1 modelled a qualified star; E2 bound a class name), touched the published superset. Tuples, values and
control flow are unchanged (a Set filled beside the existing code). usage: v5_touched_patch.py <tools>/scripts"""
import sys
from pathlib import Path
p = Path(sys.argv[1]) / 'boundary-semantic-engine.mjs'
s = p.read_text()
def rep(old, new):
    global s
    assert s.count(old) == 1, (old[:80], s.count(old))
    s = s.replace(old, new)
rep("    explicitExports = new Map()\n", "    explicitExports = new Map()\n  const __touched = new Set(), __touchedStrict = new Set()\n")
rep("""  function star(n, namespace, file) {
    const exports = modules.get(file).exports""", """  function star(n, namespace, file) {
    __touched.add(file)
    const exports = modules.get(file).exports""")
rep("""      if (!census && ts.isClassDeclaration(n) && n.name)
        e.bindings.set(n.name.text, U)""", """      if (!census && ts.isClassDeclaration(n) && n.name) {
        __touched.add(file)
        __touchedStrict.add(file)
        e.bindings.set(n.name.text, U)
      }""")
rep("""      if (qualified) {
        // A re-exported namespace""", """      if (qualified) {
        __touchedStrict.add(file)
        // A re-exported namespace""")
rep("""    for (const [k, v] of namespace.props) {
      if (k === 'default' || explicit.has(k)) continue""", """    __touchedStrict.add(file)
    for (const [k, v] of namespace.props) {
      if (k === 'default' || explicit.has(k)) continue""")
rep("""      if (!census && ts.isClassDeclaration(n)) {
""", """      if (!census && ts.isClassDeclaration(n)) {
        __touched.add(file)
""")
rep("""        reachedPackages: [...reachedPackages.keys()].sort()
      })""", """        reachedPackages: [...reachedPackages.keys()].sort(),
        touched: [...__touched].sort(),
        touchedStrict: [...__touchedStrict].sort(),
        incomplete: [...incompleteNamespaces].sort(),
        ambiguous: [...ambiguousStarNames]
          .filter(([, v]) => v.size)
          .map(([k, v]) => [k, [...v].sort()])
          .sort()
      })""")
p.write_text(s)
print('ok')
