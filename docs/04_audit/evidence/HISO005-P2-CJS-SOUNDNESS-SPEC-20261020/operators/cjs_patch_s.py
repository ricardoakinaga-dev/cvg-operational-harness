"""Diagnostic variant S of the v5 engine (c724567f) with the SPEC0247 delta, never promoted.
Per CJS file, a syntactic scan classifies the handles of the wrapper scope. A handle is DELIMITED only when it is the
`module` of a recognized statement `module.exports = e` whose ancestors up to the SourceFile are only Block and
IfStatement. Any other handle (module, exports, this or arguments outside a non-arrow function, require other than a
direct call or require.resolve call, eval), or a recognized write elsewhere, makes the module's CJS value U from
the start of the load, with one root UNKNOWN_CJS_EXPORTS per closed category. Otherwise the value starts as the
opaque exports object (silent in checkExport), delimited writes replace it and an undecided if joins the branches.
Kernel version string unchanged (diagnostic copy). usage: cjs_patch_s.py <scripts-dir>"""
import sys
from pathlib import Path

d = Path(sys.argv[1])
f = d / 'boundary-semantic-engine.mjs'
s = f.read_text()


def rep(old, new):
    global s
    assert s.count(old) == 1, old[:80]
    s = s.replace(old, new)


rep("const VOID = primitive(undefined)\n",
    "const VOID = primitive(undefined)\n// SPEC0247 C1 (diagnostic): the initial exports object, opaque.\nconst CJS_EXPORTS_OBJECT = Object.freeze({ t: 'cjs-exports-object' })\n")
# Recognized write: only when the module value is not fixed to U.
rep("""          !find(e, 'module')
        ) {
          modules.get(file).cjs = expression(x.right, e, file)
        } else expression(x, e, file)""",
    """          !find(e, 'module')
        ) {
          const written = expression(x.right, e, file)
          if (!modules.get(file).cjsFixed) modules.get(file).cjs = written
        } else expression(x, e, file)""")
rep("""        } else {
          const a = branch(n.thenStatement),
            b = branch(n.elseStatement)""",
    """        } else {
          // SPEC0247 C3 (diagnostic): join of the CJS value of the branches.
          const cjsModule = modules.get(file),
            before = cjsModule.cjs
          const a = branch(n.thenStatement)
          const afterThen = cjsModule.cjs
          cjsModule.cjs = before
          const b = branch(n.elseStatement)
          cjsModule.cjs = union([afterThen, cjsModule.cjs])""")
rep("""    if (v === U) {
      unknown(file, 'UNKNOWN_EXPORT')
      return
    }
""", """    if (v === U) {
      unknown(file, 'UNKNOWN_EXPORT')
      return
    }
    // SPEC0247 C1: no in-module handle reaches the exports object.
    if (v === CJS_EXPORTS_OBJECT) return
""")
rep("""    const module = { exports: new Map(), cjs: VOID, loading: true, mode }
    modules.set(file, module)""",
    """    const module = {
      exports: new Map(),
      cjs: mode === 'require' ? CJS_EXPORTS_OBJECT : VOID,
      cjsFixed: false,
      loading: true,
      mode
    }
    if (mode === 'require') {
      const categories = cjsHandleCategories(sf)
      if (categories.length) {
        module.cjs = U
        module.cjsFixed = true
        for (const category of categories)
          unknown(file, 'UNKNOWN_CJS_EXPORTS', category)
      }
    }
    modules.set(file, module)""")
rep("""  function load(file) {
    rules.add('K5')""",
    """  // SPEC0247 C0 (diagnostic): closed categories of the non-delimited handles
  // of the CJS wrapper scope, by syntax only; shadowing is ignored (more U).
  function cjsHandleCategories(sf) {
    const found = new Set()
    const nonArrowFunction = (node) => {
      for (let a = node.parent; a && !ts.isSourceFile(a); a = a.parent)
        if (ts.isFunctionLike(a) && !ts.isArrowFunction(a)) return true
      return false
    }
    const propertyName = (node) => {
      const p = node.parent
      return (
        (ts.isPropertyAccessExpression(p) && p.name === node) ||
        ((ts.isPropertyAssignment(p) ||
          ts.isMethodDeclaration(p) ||
          ts.isPropertyDeclaration(p) ||
          ts.isGetAccessorDeclaration(p) ||
          ts.isSetAccessorDeclaration(p) ||
          ts.isPropertySignature(p) ||
          ts.isMethodSignature(p) ||
          ts.isEnumMember(p)) &&
          p.name === node) ||
        ((ts.isBindingElement(p) ||
          ts.isImportSpecifier(p) ||
          ts.isExportSpecifier(p)) &&
          p.propertyName === node)
      )
    }
    const recognized = (statement) =>
      ts.isExpressionStatement(statement) &&
      ts.isBinaryExpression(statement.expression) &&
      statement.expression.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isPropertyAccessExpression(statement.expression.left) &&
      ts.isIdentifier(statement.expression.left.expression) &&
      statement.expression.left.expression.text === 'module' &&
      statement.expression.left.name.text === 'exports'
    const delimited = (statement) => {
      for (let a = statement.parent; !ts.isSourceFile(a); a = a.parent)
        if (!ts.isBlock(a) && !ts.isIfStatement(a)) return false
      return true
    }
    const visit = (node) => {
      if (recognized(node)) {
        if (!delimited(node)) {
          let a = node.parent
          while (!ts.isSourceFile(a) && !ts.isFunctionLike(a)) a = a.parent
          found.add(
            ts.isFunctionLike(a) ? 'FUNCTION_BODY_WRITE' : 'REFUSED_CONTEXT_WRITE'
          )
        }
        // The `module` of the write is a delimited (or classified) handle.
        visit(node.expression.right)
        return
      }
      if (node.kind === ts.SyntaxKind.ThisKeyword && !nonArrowFunction(node))
        found.add('TOP_LEVEL_THIS')
      if (ts.isIdentifier(node) && !propertyName(node)) {
        const p = node.parent
        if (node.text === 'module') found.add('MODULE_REFERENCE')
        else if (node.text === 'exports') found.add('EXPORTS_REFERENCE')
        else if (node.text === 'eval') found.add('EVAL_REFERENCE')
        else if (node.text === 'arguments' && !nonArrowFunction(node))
          found.add('TOP_LEVEL_ARGUMENTS')
        else if (
          node.text === 'require' &&
          !(ts.isCallExpression(p) && p.expression === node) &&
          !(
            ts.isPropertyAccessExpression(p) &&
            p.expression === node &&
            p.name.text === 'resolve' &&
            ts.isCallExpression(p.parent) &&
            p.parent.expression === p
          )
        )
          found.add('LOADER_REFERENCE')
      }
      ts.forEachChild(node, visit)
    }
    visit(sf)
    return [...found].sort()
  }
  function load(file) {
    rules.add('K5')""")
f.write_text(s)
print('patched S')
