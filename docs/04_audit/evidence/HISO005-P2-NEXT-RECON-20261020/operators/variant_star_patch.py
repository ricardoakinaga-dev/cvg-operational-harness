"""DIAGNOSTIC VARIANT ONLY (never promoted, never an official measurement): on top of the cause-tag copy, models
`export * from` / `export * as ns from` per ECMAScript when the source is an analyzed ESM namespace: every named
export except default is re-exported with its own value (which stays U when the source value is U); a local export
wins; two different values for one name under star are ambiguous and stay U with UNKNOWN_REEXPORT. CJS, contained
or unresolved sources keep today's refusal. usage: variant_star_patch.py <tools-variant>/scripts"""
import sys
from pathlib import Path
p = Path(sys.argv[1]) / 'boundary-semantic-engine.mjs'
s = p.read_text()
old = """        if (!n.exportClause || !ts.isNamedExports(n.exportClause)) {
          if (!__refused.has(file)) __refused.set(file, new Set())"""
assert s.count(old) == 1
new = """        if (!n.exportClause || !ts.isNamedExports(n.exportClause)) {
          // VARIANT: ECMAScript star re-export over an analyzed namespace.
          if (
            namespace &&
            namespace !== CONTAINED &&
            namespace.t === 'namespace' &&
            namespace.props instanceof Map
          ) {
            const own = modules.get(file).exports
            if (n.exportClause && ts.isNamespaceExport(n.exportClause)) {
              own.set(n.exportClause.name.text, namespace)
              continue
            }
            if (!n.exportClause) {
              if (!__star.has(file)) __star.set(file, new Map())
              const starred = __star.get(file)
              for (const [k, v] of namespace.props) {
                if (k === 'default') continue
                if (own.has(k) && !starred.has(k)) continue
                if (starred.has(k) && starred.get(k) !== v) {
                  own.set(k, U)
                  unknown(file, 'UNKNOWN_REEXPORT', 'AMBIGUOUS_STAR:' + k)
                  continue
                }
                starred.set(k, v)
                own.set(k, v)
              }
              continue
            }
          }
          if (!__refused.has(file)) __refused.set(file, new Set())"""
s = s.replace(old, new)
old = "  const __tags = new Map(), __refused = new Map()"
assert s.count(old) == 1
s = s.replace(old, "  const __tags = new Map(), __refused = new Map(), __star = new Map()")
p.write_text(s)
print('ok')
