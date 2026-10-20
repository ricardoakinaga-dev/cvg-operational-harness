"""DIAGNOSTIC VARIANT ONLY (never promoted): on top of variant_class_patch.py, K3 accepts parameter initializers.
At a call, an argument that is undefined takes the default (evaluated in order in the callee scope); a union with
undefined adds the default; an unknown argument stays U but the initializer is still evaluated for its effects.
Census keeps today's refusal. usage: variant_default_patch.py <tools>/scripts"""
import sys
from pathlib import Path
p = Path(sys.argv[1]) / 'boundary-semantic-engine.mjs'
s = p.read_text()
old = """    if (n.parameters.some((p) => p.initializer))
      categories.push('PARAMETER_INITIALIZER')"""
assert s.count(old) == 1
s = s.replace(old, """    if (census && n.parameters.some((p) => p.initializer))
      categories.push('PARAMETER_INITIALIZER')""")
old = """    fn.node.parameters.forEach((p, i) =>
      local.bindings.set(p.name.text, args[i] || VOID)
    )"""
assert s.count(old) == 1
s = s.replace(old, """    fn.node.parameters.forEach((p, i) => {
      let a = args[i] || VOID
      const isUndefined = (v) => v.t === 'primitive' && v.v === undefined
      if (p.initializer) {
        if (a === U) {
          expression(p.initializer, local, fn.file)
          a = U
        } else if (isUndefined(a)) a = expression(p.initializer, local, fn.file)
        else if (a.t === 'union' && a.values.some(isUndefined))
          a = union([
            ...a.values.filter((v) => !isUndefined(v)),
            expression(p.initializer, local, fn.file)
          ])
      }
      local.bindings.set(p.name.text, a)
    })""")
p.write_text(s)
print('ok')
