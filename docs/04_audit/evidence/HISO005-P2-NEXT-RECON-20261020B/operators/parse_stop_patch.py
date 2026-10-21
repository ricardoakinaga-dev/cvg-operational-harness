"""DIAGNOSTIC VARIANT ONLY (alternative B, never promoted): a file with parse diagnostics keeps UNKNOWN_PARSE and its
body is not evaluated (the recovered AST is not the program); its namespace is incomplete and empty, so importers
read U through the usual paths. Acquisition (edges and finite dynamic specifiers) is unchanged.
usage: parse_stop_patch.py <tools>/scripts"""
import sys
from pathlib import Path
p = Path(sys.argv[1]) / 'boundary-semantic-engine.mjs'
s = p.read_text()
old = """    const module = { exports: new Map(), cjs: VOID, loading: true, mode }
    modules.set(file, module)
    coverage.modules.started++
    if (block(sf.statements, env(), file).returned)"""
assert s.count(old) == 1
s = s.replace(old, """    const module = { exports: new Map(), cjs: VOID, loading: true, mode }
    modules.set(file, module)
    coverage.modules.started++
    if (sf.parseDiagnostics.length) {
      // VARIANT B: never evaluate a recovered AST.
      if (!census) incompleteNamespaces.add(file)
      module.cjs = U
      module.loading = false
      coverage.modules.completed++
      return mode === 'require' ? U : { t: 'namespace', id: file, props: module.exports }
    }
    if (block(sf.statements, env(), file).returned)""")
p.write_text(s)
print('ok')
