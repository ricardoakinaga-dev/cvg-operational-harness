"""Diagnostic variant of the v5 engine (c724567f) with the SPEC0247 delta, never promoted.
C1 initial CJS value: variant A = U; variant B = opaque exports object (no capability, silent in checkExport).
C3 undecided if: join (union) of the CJS value at the end of each branch; an absent branch keeps the value before.
C4 recognized `module.exports = e` statement inside a function body: e evaluated, root UNKNOWN_CJS_EXPORTS
FUNCTION_BODY_WRITE in the written module, value U. Kernel version string unchanged (diagnostic copy).
usage: cjs_patch.py <scripts-dir> <A|B>"""
import sys
from pathlib import Path

d, variant = Path(sys.argv[1]), sys.argv[2]
assert variant in ('A', 'B')
f = d / 'boundary-semantic-engine.mjs'
s = f.read_text()


def rep(old, new):
    global s
    assert s.count(old) == 1, old[:80]
    s = s.replace(old, new)


# C4: write evaluated inside a function body.
rep("""          !find(e, 'module')
        ) {
          modules.get(file).cjs = expression(x.right, e, file)
        } else expression(x, e, file)""",
    """          !find(e, 'module')
        ) {
          const written = expression(x.right, e, file)
          // SPEC0247 C4 (diagnostic): the kernel cannot bound when a write in a
          // function body happens; root in the written module, value U.
          if (ts.findAncestor(n.parent, (a) => ts.isFunctionLike(a))) {
            unknown(file, 'UNKNOWN_CJS_EXPORTS', 'FUNCTION_BODY_WRITE')
            modules.get(file).cjs = U
          } else modules.get(file).cjs = written
        } else expression(x, e, file)""")
# C3: join of the undecided branches.
rep("""        } else {
          const a = branch(n.thenStatement),
            b = branch(n.elseStatement)""",
    """        } else {
          // SPEC0247 C3 (diagnostic): the CJS value after an undecided if is the
          // union of the values at the end of each branch.
          const cjsModule = modules.get(file),
            before = cjsModule.cjs
          const a = branch(n.thenStatement)
          const afterThen = cjsModule.cjs
          cjsModule.cjs = before
          const b = branch(n.elseStatement)
          cjsModule.cjs = union([afterThen, cjsModule.cjs])""")
# C1: initial value of module.exports.
if variant == 'A':
    rep("const module = { exports: new Map(), cjs: VOID, loading: true, mode }",
        "const module = {\n      exports: new Map(),\n      cjs: mode === 'require' ? U : VOID,\n      loading: true,\n      mode\n    }")
else:
    rep("const VOID = primitive(undefined)\n",
        "const VOID = primitive(undefined)\n// SPEC0247 C1 variant B (diagnostic): the initial exports object, opaque.\nconst CJS_EXPORTS_OBJECT = Object.freeze({ t: 'cjs-exports-object' })\n")
    rep("const module = { exports: new Map(), cjs: VOID, loading: true, mode }",
        "const module = {\n      exports: new Map(),\n      cjs: mode === 'require' ? CJS_EXPORTS_OBJECT : VOID,\n      loading: true,\n      mode\n    }")
    rep("""    if (v === U) {
      unknown(file, 'UNKNOWN_EXPORT')
      return
    }
""", """    if (v === U) {
      unknown(file, 'UNKNOWN_EXPORT')
      return
    }
    // SPEC0247 C1 variant B: no capability; every mutation path is a root.
    if (v === CJS_EXPORTS_OBJECT) return
""")
f.write_text(s)
print('patched', variant)
