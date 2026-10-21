"""DIAGNOSTIC ONLY (never promoted): on top of binding_origin_patch.py, a parameter binding records at creation
whether its call came from checkExport (K0 external entry: every parameter of an exported function or public
method is U) or from an ordinary call that passed a U argument. The UNKNOWN_BINDING_VALUE tag of a parameter
read becomes 'parametro-K0' or 'parametro-argumento'. Emitted tuples and control flow are unchanged (a flag and a
side map only). usage: k0_origin_patch.py <tools>/scripts"""
import sys
from pathlib import Path
p = Path(sys.argv[1]) / 'boundary-semantic-engine.mjs'
s = p.read_text()
def rep(old, new, n=1):
    global s
    assert s.count(old) == n, (old, s.count(old))
    s = s.replace(old, new)
rep("  const __tags = new Map(), __refused = new Map()",
    "  const __tags = new Map(), __refused = new Map(), __paramOrigin = new WeakMap()\n  let __k0Next = false")
rep("  function call(fn, args, receiver, file) {\n    rules.add('K3')",
    "  function call(fn, args, receiver, file) {\n    const __k0 = __k0Next\n    __k0Next = false\n    rules.add('K3')")
rep("    fn.node.parameters.forEach((p, i) =>\n      local.bindings.set(p.name.text, args[i] || VOID)\n    )",
    "    fn.node.parameters.forEach((p, i) =>\n      local.bindings.set(p.name.text, args[i] || VOID)\n    )\n"
    "    __paramOrigin.set(local, { origin: __k0 ? 'K0' : 'argumento', names: new Set(fn.node.parameters.map((p) => p.name.text)) })")
rep("          v.node.parameters.map(() => U),", "          ((__k0Next = true), v.node.parameters.map(() => U)),")
rep("              child.node.parameters.map(() => U),", "              ((__k0Next = true), child.node.parameters.map(() => U)),")
rep("? unknown(file, 'UNKNOWN_BINDING_VALUE', n.text, null, 'U-binding:' + __declKind(n, n.text))",
    "? unknown(file, 'UNKNOWN_BINDING_VALUE', n.text, null, 'U-binding:' + __paramKind(e, n, n.text))")
rep("  const __declKind = (node, name) => {",
    """  const __paramKind = (e, node, name) => {
    const kind = __declKind(node, name)
    if (kind !== 'parametro') return kind
    let h = e
    while (h && !h.bindings.has(name)) h = h.parent
    const rec = h && __paramOrigin.get(h)
    return rec && rec.names.has(name) ? 'parametro-' + rec.origin : 'parametro-outro'
  }
  const __declKind = (node, name) => {""")
p.write_text(s)
print('ok')
