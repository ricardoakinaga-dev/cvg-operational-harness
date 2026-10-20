"""DIAGNOSTIC ONLY (never promoted), applied after cjs_patch_t.py: dumps, at the end of the non-census analysis, one
row per loaded module (mode, closed categories of the scan, recognized writes evaluated at top level and in function
bodies, joins that changed the tracked value, final tracked value type, initial exports object kept, value U for
importers) to CVG_DIAG_GRAPH (forwarded to the worker). Tuples, limits and rules unchanged.
usage: cjs_diag_patch.py <tools>/scripts"""
import sys
from pathlib import Path
p = Path(sys.argv[1]) / 'boundary-semantic-engine.mjs'
s = p.read_text()


def rep(old, new):
    global s
    assert s.count(old) == 1, old[:70]
    s = s.replace(old, new)


rep("""  function cjsHandleCategories(sf) {""", """  const cjsDiag = new Map()
  const diagRow = (file) => {
    if (!cjsDiag.has(file))
      cjsDiag.set(file, {
        file,
        topWrites: 0,
        functionWrites: 0,
        joinsChanged: 0
      })
    return cjsDiag.get(file)
  }
  function cjsHandleCategories(sf) {""")
rep("""          modules.get(file).cjs = expression(x.right, e, file)""",
    """          modules.get(file).cjs = expression(x.right, e, file)
          if (!census) {
            if (ts.findAncestor(n.parent, (a) => ts.isFunctionLike(a)))
              diagRow(file).functionWrites++
            else diagRow(file).topWrites++
          }""")
rep("""          cjsModule.cjs = union([afterThen, cjsModule.cjs])""",
    """          if (!census && valueKey(afterThen) !== valueKey(cjsModule.cjs))
            diagRow(file).joinsChanged++
          cjsModule.cjs = union([afterThen, cjsModule.cjs])""")
rep("""    if (mode === 'require') {
      const categories = cjsHandleCategories(sf)""", """    if (mode === 'require') {
      const categories = cjsHandleCategories(sf)
      if (!census) diagRow(file).categories = categories""")
rep("""    checkExport(result, file)
    // SPEC0247 C0""", """    if (!census) {
      const row = diagRow(file)
      row.mode = mode
      row.finalType = mode === 'require' ? (result === U ? 'unknown' : result.t) : 'namespace'
      row.initialObjectKept = result === CJS_EXPORTS_OBJECT
      row.opaqueForImporters = module.cjsOpaque
    }
    checkExport(result, file)
    // SPEC0247 C0""")
rep("""    .sort((a, b) => sort(a.key, b.key))
  out.proofs.sort((a, b) => sort(a.id, b.id))
  return out
}""", """    .sort((a, b) => sort(a.key, b.key))
  out.proofs.sort((a, b) => sort(a.id, b.id))
  // DIAGNOSTIC COPY ONLY: dump the CJS rows of the non-census pass.
  if (process.env.CVG_DIAG_GRAPH && !census)
    fs.writeFileSync(
      process.env.CVG_DIAG_GRAPH,
      JSON.stringify({
        root,
        files: [...astFiles.keys()].sort(),
        modules: [...cjsDiag.values()].sort((a, b) => sort(a.file, b.file))
      })
    )
  return out
}""")
rep("""          LC_ALL: 'C',
          TZ: 'UTC'
        },
        cwd: path.dirname(SELF),""", """          LC_ALL: 'C',
          TZ: 'UTC',
          ...(process.env.CVG_DIAG_GRAPH
            ? { CVG_DIAG_GRAPH: process.env.CVG_DIAG_GRAPH }
            : {})
        },
        cwd: path.dirname(SELF),""")
p.write_text(s)
print('ok')
