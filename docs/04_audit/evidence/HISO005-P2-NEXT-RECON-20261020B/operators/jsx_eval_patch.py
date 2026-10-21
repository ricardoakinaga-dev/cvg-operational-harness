"""DIAGNOSTIC VARIANT ONLY (SPEC0245 candidate C, never promoted, on top of tsx_parse_patch.py): a JSX element,
self-closing element or fragment evaluates, in source order, its non-intrinsic tag expression, each attribute
initializer expression, each spread attribute and each child expression (nested JSX recursively), as the jsx()
call of the automatic runtime would, and then is refused (U) with UNKNOWN_UNSUPPORTED_SYNTAX and its SyntaxKind:
the implicit jsx-runtime factory is an external call the kernel does not model. usage: jsx_eval_patch.py <tools>/scripts"""
import sys
from pathlib import Path
p = Path(sys.argv[1]) / 'boundary-semantic-engine.mjs'
s = p.read_text()
old = "  function expression(n, e, file) {\n    if (!n) return VOID\n"
assert s.count(old) == 1
s = s.replace(old, """  function __jsx(n, e, file) {
    const opening = ts.isJsxElement(n) ? n.openingElement : ts.isJsxSelfClosingElement(n) ? n : null
    if (opening) {
      const tag = opening.tagName
      if (!(ts.isIdentifier(tag) && /^[a-z]/.test(tag.text))) expression(tag, e, file)
      for (const a of opening.attributes.properties) {
        if (ts.isJsxSpreadAttribute(a)) expression(a.expression, e, file)
        else if (a.initializer && ts.isJsxExpression(a.initializer)) expression(a.initializer.expression, e, file)
        else if (a.initializer && (ts.isJsxElement(a.initializer) || ts.isJsxSelfClosingElement(a.initializer) || ts.isJsxFragment(a.initializer)))
          expression(a.initializer, e, file)
      }
    }
    for (const c of ts.isJsxElement(n) || ts.isJsxFragment(n) ? n.children : []) {
      if (ts.isJsxExpression(c)) expression(c.expression, e, file)
      else if (ts.isJsxElement(c) || ts.isJsxSelfClosingElement(c) || ts.isJsxFragment(c)) expression(c, e, file)
    }
    return unknown(file, 'UNKNOWN_UNSUPPORTED_SYNTAX', ts.SyntaxKind[n.kind])
  }
  function expression(n, e, file) {
    if (!n) return VOID
    if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n) || ts.isJsxFragment(n)) {
      state(n, e, file)
      return __jsx(n, e, file)
    }
""")
p.write_text(s)
print('ok')
