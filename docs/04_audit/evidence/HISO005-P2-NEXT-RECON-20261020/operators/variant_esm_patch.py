"""DIAGNOSTIC VARIANT ONLY (never promoted, never official): E1 + E2 exactly as SPEC0244 r2 §3.1/§3.2, on top of
the tag copy (diag_patch + cause_patch + binding_origin_patch).
E1: a star source qualifies when it is an analyzed ESM namespace and complete (every export statement registered,
transitively); the re-exporting module's explicit export names (syntactic) prevail over stars; ambiguity is by
resolved binding identity (module#name after following stars) and sticky; any non-qualified star makes every
star-provided name of that module U and keeps UNKNOWN_REEXPORT.
E2: class names are predeclared U at block entry; a class declaration keeps its UNKNOWN_UNSUPPORTED_SYNTAX root
(plus UNKNOWN_RUNTIME_DECLARATION when `declare`); exported classes (named or default, anonymous included) are
registered with U. Touched modules are dumped. usage: variant_esm_patch.py <tools>/scripts"""
import sys
from pathlib import Path
p = Path(sys.argv[1]) / 'boundary-semantic-engine.mjs'
s = p.read_text()
def rep(old, new):
    global s
    assert s.count(old) == 1, (old[:80], s.count(old))
    s = s.replace(old, new)
rep("  const __tags = new Map(), __refused = new Map()",
    """  const __tags = new Map(), __refused = new Map()
  const __incomplete = new Set(), __origin = new Map(), __ambiguous = new Map(), __starPoisoned = new Set(), __starNames = new Map(), __touched = new Set()
  const __explicitCache = new Map()
  const __explicit = (file) => {
    if (__explicitCache.has(file)) return __explicitCache.get(file)
    const names = new Set(), sf = astFiles.get(file)
    for (const st of sf ? sf.statements : []) {
      const exp = st.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
      const dflt = st.modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)
      if (ts.isExportAssignment(st)) names.add('default')
      else if (ts.isExportDeclaration(st) && st.exportClause) {
        if (ts.isNamedExports(st.exportClause)) for (const x of st.exportClause.elements) names.add(x.name.text)
        else names.add(st.exportClause.name.text)
      } else if (exp && dflt) names.add('default')
      else if (exp && ts.isVariableStatement(st))
        for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name)) names.add(d.name.text)
      else if (exp && st.name && ts.isIdentifier(st.name)) names.add(st.name.text)
    }
    __explicitCache.set(file, names)
    return names
  }""")
# completeness: any exported statement that reaches the generic fallback, and non-registered export forms
rep("""            if (!ts.isIdentifier(d.name)) unknown(file, 'UNKNOWN_EXPORT')""",
    """            if (!ts.isIdentifier(d.name)) {
              __incomplete.add(file)
              unknown(file, 'UNKNOWN_EXPORT')
            }""")
rep("""          else unknown(file, 'UNKNOWN_EXPORT')
        } else if (!n.name)""", """          else {
            __incomplete.add(file)
            unknown(file, 'UNKNOWN_EXPORT')
          }
        } else if (!n.name)""")
# predeclare class names (E2)
rep("""      if (ts.isFunctionDeclaration(n) && n.name)
        e.bindings.set(n.name.text, functionValue(n, e, file))""", """      if (ts.isFunctionDeclaration(n) && n.name)
        e.bindings.set(n.name.text, functionValue(n, e, file))
      // VARIANT E2: class names exist (TDZ) with value U from block entry.
      if (ts.isClassDeclaration(n) && n.name) e.bindings.set(n.name.text, U)""")
# E1 star handling (replaces the refusal branch start)
rep("""        if (!n.exportClause || !ts.isNamedExports(n.exportClause)) {
          if (!__refused.has(file)) __refused.set(file, new Set())""", """        if (!n.exportClause || !ts.isNamedExports(n.exportClause)) {
          const own = modules.get(file).exports
          const qualified =
            namespace &&
            namespace !== CONTAINED &&
            namespace.t === 'namespace' &&
            namespace.props instanceof Map &&
            !__incomplete.has(namespace.id)
          if (qualified && n.exportClause && ts.isNamespaceExport(n.exportClause)) {
            __touched.add(file)
            own.set(n.exportClause.name.text, namespace)
            continue
          }
          if (qualified && !n.exportClause && !__starPoisoned.has(file)) {
            __touched.add(file)
            const explicit = __explicit(file)
            if (!__origin.has(file)) __origin.set(file, new Map())
            if (!__ambiguous.has(file)) __ambiguous.set(file, new Set())
            if (!__starNames.has(file)) __starNames.set(file, new Set())
            const origins = __origin.get(file), ambiguous = __ambiguous.get(file), starNames = __starNames.get(file)
            for (const [k, v] of namespace.props) {
              if (k === 'default' || explicit.has(k) || ambiguous.has(k)) continue
              const origin = __origin.get(namespace.id)?.get(k) || namespace.id + '#' + k
              if (origins.has(k) && origins.get(k) !== origin) {
                ambiguous.add(k)
                own.set(k, U)
                unknown(file, 'UNKNOWN_REEXPORT', 'AMBIGUOUS_STAR:' + k)
                continue
              }
              origins.set(k, origin)
              starNames.add(k)
              own.set(k, v)
            }
            continue
          }
          // Non-qualified star (or any star after one): every star-provided
          // name of this module is U; names of an analyzable source exist as U.
          __starPoisoned.add(file)
          __incomplete.add(file)
          if (!__starNames.has(file)) __starNames.set(file, new Set())
          for (const k of __starNames.get(file)) modules.get(file).exports.set(k, U)
          if (
            !n.exportClause &&
            namespace &&
            namespace !== CONTAINED &&
            namespace.t === 'namespace' &&
            namespace.props instanceof Map
          ) {
            const explicit = __explicit(file)
            for (const k of namespace.props.keys())
              if (k !== 'default' && !explicit.has(k)) {
                __starNames.get(file).add(k)
                modules.get(file).exports.set(k, U)
              }
          }
          if (!__refused.has(file)) __refused.set(file, new Set())""")
# E2 at the statement: keep root, declare -> runtime declaration, export U
rep("""      if (ts.isClassDeclaration(n) && n.name) {
        if (!__refused.has(file)) __refused.set(file, new Set())
        __refused.get(file).add(n.name.text)
      }""", """      if (ts.isClassDeclaration(n) && n.name) {
        if (!__refused.has(file)) __refused.set(file, new Set())
        __refused.get(file).add(n.name.text)
      }
      if (ts.isClassDeclaration(n)) {
        __touched.add(file)
        if (n.modifiers?.some((m) => m.kind === ts.SyntaxKind.DeclareKeyword))
          unknown(file, 'UNKNOWN_RUNTIME_DECLARATION')
        if (exported(n))
          modules
            .get(file)
            .exports.set(
              n.modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)
                ? 'default'
                : n.name.text,
              U
            )
      } else if (exported(n)) __incomplete.add(file)""")
rep("""        refused: [...__refused].map(([k, v]) => [k, [...v].sort()])""", """        refused: [...__refused].map(([k, v]) => [k, [...v].sort()]),
        touched: [...__touched].sort(),
        incomplete: [...__incomplete].sort(),
        ambiguous: [...__ambiguous].filter(([, v]) => v.size).map(([k, v]) => [k, [...v].sort()])""")
p.write_text(s)
print('ok')
