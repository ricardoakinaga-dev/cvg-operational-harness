"""DIAGNOSTIC ONLY (never promoted): on top of cause_patch.py, the tag of each UNKNOWN_BINDING_VALUE emission names
the lexical declaration of the identifier (parameter, import, local, function, class, other), found by walking the
AST scopes of the reference. Emitted tuples are unchanged. usage: binding_origin_patch.py <tools>/scripts"""
import sys
from pathlib import Path
p = Path(sys.argv[1]) / 'boundary-semantic-engine.mjs'
s = p.read_text()
old = "          ? unknown(file, 'UNKNOWN_BINDING_VALUE', n.text, null, 'U-binding')"
assert s.count(old) == 1
s = s.replace(old, "          ? unknown(file, 'UNKNOWN_BINDING_VALUE', n.text, null, 'U-binding:' + __declKind(n, n.text))")
old = "  const __tags = new Map(), __refused = new Map()"
assert s.count(old) == 1
s = s.replace(old, """  const __tags = new Map(), __refused = new Map()
  const __declares = (b, name) =>
    ts.isIdentifier(b)
      ? b.text === name
      : (ts.isObjectBindingPattern(b) || ts.isArrayBindingPattern(b)) &&
        b.elements.some((x) => ts.isBindingElement(x) && __declares(x.name, name))
  const __declKind = (node, name) => {
    for (let p = node.parent; p; p = p.parent) {
      if (ts.isFunctionLike(p) && p.parameters?.some((q) => __declares(q.name, name))) return 'parametro'
      if ((ts.isFunctionExpression(p) || ts.isClassExpression(p)) && p.name?.text === name) return 'funcao'
      if (ts.isCatchClause(p) && p.variableDeclaration && __declares(p.variableDeclaration.name, name)) return 'local'
      if ((ts.isForOfStatement(p) || ts.isForInStatement(p) || ts.isForStatement(p)) && p.initializer &&
          ts.isVariableDeclarationList(p.initializer) && p.initializer.declarations.some((d) => __declares(d.name, name))) return 'local'
      const stmts = ts.isSourceFile(p) || ts.isBlock(p) || ts.isModuleBlock(p) || ts.isCaseClause(p) || ts.isDefaultClause(p) ? p.statements : null
      if (stmts)
        for (const st of stmts) {
          if (ts.isImportDeclaration(st) && st.importClause) {
            const c = st.importClause, nb = c.namedBindings
            if (c.name?.text === name) return 'import'
            if (nb && ts.isNamespaceImport(nb) && nb.name.text === name) return 'import'
            if (nb && ts.isNamedImports(nb) && nb.elements.some((x) => x.name.text === name)) return 'import'
          }
          if (ts.isVariableStatement(st) && st.declarationList.declarations.some((d) => __declares(d.name, name))) return 'local'
          if (ts.isFunctionDeclaration(st) && st.name?.text === name) return 'funcao'
          if (ts.isClassDeclaration(st) && st.name?.text === name) return 'classe'
          if (ts.isEnumDeclaration(st) && st.name?.text === name) return 'enum'
        }
    }
    return 'outro'
  }""")
p.write_text(s)
print('ok')
