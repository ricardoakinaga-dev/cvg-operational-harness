"""DIAGNOSTIC ONLY (never promoted): private copy of the vN engine (or of the v6 base, with --base) that dumps, at the
end of the non-census analysis, to CVG_DIAG_GRAPH (forwarded to the worker): the resolution edges, starts, analysed
files, reached packages, the 15 function instances with most call contexts, and (vN only) one row per loaded module:
mode, closed C0 categories, recognized writes evaluated at top level and in function bodies, joins that changed the
tracked value, final tracked value kind, initial exports object kept in the final value, value U for importers.
Base mode (no CJS rows) when the engine has no C0 function (v6). Tuples, limits and rules are unchanged.
usage: diag_patch.py <tools>/scripts"""
import sys
from pathlib import Path
p = Path(sys.argv[1]) / 'boundary-semantic-engine.mjs'
s = p.read_text()
base = 'function cjsHandleCategories' not in s


def rep(old, new):
    global s
    assert s.count(old) == 1, old[:80]
    s = s.replace(old, new)


if not base:
    rep("""  function cjsHandleCategories(sf) {""", """  const cjsDiag = new Map()
  const diagRow = (file) => {
    if (!cjsDiag.has(file))
      cjsDiag.set(file, { file, topWrites: 0, functionWrites: 0, joinsChanged: 0 })
    return cjsDiag.get(file)
  }
  function cjsHandleCategories(sf) {""")
    rep("""          modules.get(file).cjs = expression(x.right, e, file)
        } else expression(x, e, file)""", """          modules.get(file).cjs = expression(x.right, e, file)
          if (!census) {
            if (ts.findAncestor(n.parent, ts.isFunctionLike))
              diagRow(file).functionWrites++
            else diagRow(file).topWrites++
          }
        } else expression(x, e, file)""")
    rep("""          if (join) module.cjs = union([afterThen, module.cjs])""", """          if (join && !census && valueKey(afterThen) !== valueKey(module.cjs))
            diagRow(file).joinsChanged++
          if (join) module.cjs = union([afterThen, module.cjs])""")
    rep("""    if (mode === 'require')
      for (const category of cjsHandleCategories(sf)) {""", """    if (!census) {
      diagRow(file).mode = mode
      diagRow(file).categories =
        mode === 'require' ? cjsHandleCategories(sf) : []
    }
    if (mode === 'require')
      for (const category of cjsHandleCategories(sf)) {""")
    rep("""    checkExport(result, file)
    return module.cjsUnknown ? U : result""", """    if (!census) {
      const row = diagRow(file)
      const members = result.t === 'union' ? result.values : [result]
      row.finalKind = mode === 'require' ? (result === U ? 'unknown' : result.t) : 'namespace'
      row.initialObjectKept = members.some(
        (m) => m.t === 'cjs-exports-object' && m.id === 'cjs-exports:' + file
      )
      row.foreignInitialObject = members.some(
        (m) => m.t === 'cjs-exports-object' && m.id !== 'cjs-exports:' + file
      )
      row.opaqueForImporters = module.cjsUnknown
    }
    checkExport(result, file)
    return module.cjsUnknown ? U : result""")
rep("""    .sort((a, b) => sort(a.key, b.key))
  out.proofs.sort((a, b) => sort(a.id, b.id))
  return out
}""", """    .sort((a, b) => sort(a.key, b.key))
  out.proofs.sort((a, b) => sort(a.id, b.id))
  // DIAGNOSTIC COPY ONLY: dump the semantic graph of the non-census pass.
  if (process.env.CVG_DIAG_GRAPH && !census)
    fs.writeFileSync(
      process.env.CVG_DIAG_GRAPH,
      JSON.stringify({
        root,
        starts: input?.starts ?? [],
        files: [...astFiles.keys()].sort(),
        edges: Object.fromEntries(
          [...resolutionEdges].map(([k, v]) => [k, [...v].sort()])
        ),
        reachedPackages: [...reachedPackages.keys()].sort(),
        modes: Object.fromEntries([...modules].map(([k, v]) => [k, v.mode])),
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
          .slice(0, 15),
        cjs: """ + ("[]" if base else "[...cjsDiag.values()].sort((a, b) => sort(a.file, b.file))") + """
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
print('diag' + (' base' if base else ''))
