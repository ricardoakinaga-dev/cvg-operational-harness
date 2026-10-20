"""DIAGNOSTIC ONLY (never promoted): on top of diag_patch.py, tags every emission of the propagation-prone reasons
with WHY it fired (U operand vs a known value outside the domain), records names refused by unsupported class
declarations and star re-exports, and dumps the tags with the graph. Emitted tuples are unchanged.
usage: cause_patch.py <tools-diag>/scripts"""
import sys
from pathlib import Path
p = Path(sys.argv[1]) / 'boundary-semantic-engine.mjs'
s = p.read_text()
def rep(old, new, count=1):
    global s
    assert s.count(old) == count, (old[:70], s.count(old))
    s = s.replace(old, new)
rep("""  const unknown = (file, reason, detail = '', originId = null) => {""",
    """  const __tags = new Map(), __refused = new Map()
  const unknown = (file, reason, detail = '', originId = null, tag = null) => {""")
rep("""    const key = semanticCanonicalJson(item)
    if (!unknownKeys.has(key)) {""", """    const key = semanticCanonicalJson(item)
    if (!__tags.has(key)) __tags.set(key, new Set())
    __tags.get(key).add(tag || 'untagged')
    if (!unknownKeys.has(key)) {""")
rep("""    )
      return unknown(file, 'UNKNOWN_PROPERTY')
    if (v.t === 'union') return union(v.values.map((x) => get(x, key, file)))""",
    """    )
      return unknown(file, 'UNKNOWN_PROPERTY', '', null, v === U ? 'U-receiver' : 'key-not-literal')
    if (v.t === 'union') return union(v.values.map((x) => get(x, key, file)))""")
rep("""    if (v.t !== 'object' && v.t !== 'namespace')
      return unknown(file, 'UNKNOWN_PROPERTY')""", """    if (v.t !== 'object' && v.t !== 'namespace')
      return unknown(file, 'UNKNOWN_PROPERTY', '', null, 'known-non-object:' + v.t)""")
rep("""      : unknown(file, 'UNKNOWN_INHERITED_PROPERTY', String(key.v))""", """      : unknown(file, 'UNKNOWN_INHERITED_PROPERTY', String(key.v), null,
          v.t !== 'namespace' ? 'missing-own-property'
            : __refused.get(v.id)?.has(String(key.v)) ? 'missing-export-refused-class'
            : __refused.get(v.id)?.has('*') ? 'missing-export-star-reexport'
            : 'missing-export')""")
rep("""    if (fn.t !== 'function') return unknown(file, 'UNKNOWN_CALL')""",
    """    if (fn.t !== 'function') return unknown(file, 'UNKNOWN_CALL', '', null, fn === U ? 'U-callee' : 'known-non-function:' + fn.t)""")
rep("""        n.arguments.some(ts.isSpreadElement)
      )
        return unknown(file, 'UNKNOWN_CALL')""", """        n.arguments.some(ts.isSpreadElement)
      )
        return unknown(file, 'UNKNOWN_CALL', '', null, 'call-syntax')""")
rep("""          ? unknown(file, 'UNKNOWN_BINDING_VALUE', n.text)""", """          ? unknown(file, 'UNKNOWN_BINDING_VALUE', n.text, null, 'U-binding')""")
rep("""    if (v === U) {
      unknown(file, 'UNKNOWN_EXPORT')
      return
    }""", """    if (v === U) {
      unknown(file, 'UNKNOWN_EXPORT', '', null, 'U-export')
      return
    }""")
rep("""          if (x.t !== 'primitive' || y.t !== 'primitive')
            return unknown(file, 'UNKNOWN_OPERATOR')""", """          if (x.t !== 'primitive' || y.t !== 'primitive')
            return unknown(file, 'UNKNOWN_OPERATOR', '', null, x === U || y === U ? 'U-operand' : 'known-non-primitive')""")
rep("""            default:
              return unknown(file, 'UNKNOWN_OPERATOR')""", """            default:
              return unknown(file, 'UNKNOWN_OPERATOR', '', null, 'operator-outside-domain')""")
rep("""        if (parts.some((x) => x.t !== 'primitive'))
          return unknown(file, 'UNKNOWN_TEMPLATE')""", """        if (parts.some((x) => x.t !== 'primitive'))
          return unknown(file, 'UNKNOWN_TEMPLATE', '', null, parts.some((x) => x === U) ? 'U-operand' : 'known-non-primitive')""")
rep("""        : unknown(file, 'UNKNOWN_OPERATOR')
    }
    return unknown(file, 'UNKNOWN_UNSUPPORTED_SYNTAX', ts.SyntaxKind[n.kind])""", """        : unknown(file, 'UNKNOWN_OPERATOR', '', null, v === U ? 'U-operand' : 'known-non-primitive')
    }
    return unknown(file, 'UNKNOWN_UNSUPPORTED_SYNTAX', ts.SyntaxKind[n.kind])""")
rep("""        if (!n.exportClause || !ts.isNamedExports(n.exportClause)) {
          unknown(file, 'UNKNOWN_REEXPORT')""", """        if (!n.exportClause || !ts.isNamedExports(n.exportClause)) {
          if (!__refused.has(file)) __refused.set(file, new Set())
          __refused.get(file).add('*')
          unknown(file, 'UNKNOWN_REEXPORT')""")
rep("""      unknown(file, 'UNKNOWN_UNSUPPORTED_SYNTAX', ts.SyntaxKind[n.kind])
    }
    return { returned: false, value: VOID }""", """      if (ts.isClassDeclaration(n) && n.name) {
        if (!__refused.has(file)) __refused.set(file, new Set())
        __refused.get(file).add(n.name.text)
      }
      unknown(file, 'UNKNOWN_UNSUPPORTED_SYNTAX', ts.SyntaxKind[n.kind])
    }
    return { returned: false, value: VOID }""")
rep("""        reachedPackages: [...reachedPackages.keys()].sort()
      })""", """        reachedPackages: [...reachedPackages.keys()].sort(),
        tags: [...__tags].map(([k, v]) => [k, [...v].sort()]),
        refused: [...__refused].map(([k, v]) => [k, [...v].sort()])
      })""")
p.write_text(s)
print('ok')
