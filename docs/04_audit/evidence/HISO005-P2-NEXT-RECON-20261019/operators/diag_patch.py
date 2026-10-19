"""DIAGNOSTIC ONLY (never promoted): private engine copy with env-overridable body caps and instrumentation.

usage: diag_patch.py <engine.mjs>   (patches in place, inside the private runtime copy)
"""
import sys
from pathlib import Path
p = Path(sys.argv[1]); s = p.read_text()
def rep(old, new, count=1):
    global s
    assert s.count(old) == count, (s.count(old), old[:80])
    s = s.replace(old, new)
rep("export const SEMANTIC_LIMITS = Object.freeze({", "const BASE_LIMITS = Object.freeze({")
rep("""  timeoutMs: 120000
})
function limitsFor(input) {""", """  timeoutMs: 120000
})
// DIAGNOSTIC COPY: caps can be raised through CVG_DIAG_LIMITS; the helper keeps
// the frozen BASE_LIMITS. Never promoted, never an official measurement.
export const SEMANTIC_LIMITS = Object.freeze({
  ...BASE_LIMITS,
  ...(process.env.CVG_DIAG_LIMITS ? JSON.parse(process.env.CVG_DIAG_LIMITS) : {})
})
export const __diag = {
  enabled: false, t0: 0, fn: new Map(), fileStates: new Map(), fileDepth: new Map(),
  modules: [], series: [], cut: null, calls: 0, lastSeries: 0
}
const diagName = (n, ts) => {
  try {
    if (n.name) return n.name.getText()
    const p = n.parent
    if (p && ts.isVariableDeclaration(p)) return p.name.getText()
    if (p && ts.isPropertyAssignment(p)) return p.name.getText()
    if (p && ts.isCallExpression(p)) return '<arg of ' + p.expression.getText().slice(0, 40) + '>'
    return '<anonymous>'
  } catch { return '<?>' }
}
function limitsFor(input) {""")
rep("limits: { ...SEMANTIC_LIMITS, ...resolutionLimits },", "limits: { ...BASE_LIMITS, ...resolutionLimits },")
rep("limits: { ...SEMANTIC_LIMITS, ...RESOLUTION_LIMITS }", "limits: { ...BASE_LIMITS, ...RESOLUTION_LIMITS }", 2)
rep("""    else if (
      arg === '--input-type' &&
      ['module', 'commonjs'].includes(process.execArgv[index + 1])
    )""", """    else if (
      process.env.CVG_DIAG_LIMITS !== undefined &&
      /^--max-old-space-size=\\d+$/.test(arg)
    )
      continue
    else if (
      arg === '--input-type' &&
      ['module', 'commonjs'].includes(process.execArgv[index + 1])
    )""")
rep("""    if (value > limits[cap]) throw Error('UNKNOWN_ANALYSIS_LIMIT:' + cap)""", """    if (value > limits[cap]) {
      if (__diag.enabled && !__diag.cut)
        __diag.cut = { cap, value, ms: performance.now() - started, stack: stack.slice(-12),
          contextDepth: contextStack.length, statesNow: states.size, modulesStarted: coverage.modules.started }
      throw Error('UNKNOWN_ANALYSIS_LIMIT:' + cap)
    }""")
rep("""    states.add(id)
    bump('states', states.size, 'maxStates')""", """    const diagBefore = states.size
    states.add(id)
    if (__diag.enabled && states.size > diagBefore) {
      __diag.fileStates.set(file, (__diag.fileStates.get(file) || 0) + 1)
      if (states.size - __diag.lastSeries >= 2000) {
        __diag.lastSeries = states.size
        const mem = process.memoryUsage()
        let maxCtx = 0
        for (const v of contexts.values()) maxCtx = Math.max(maxCtx, v.size)
        __diag.series.push({ ms: Math.round(performance.now() - started), states: states.size, maxContexts: maxCtx,
          functionsWithContexts: contexts.size, calls: __diag.calls, modulesStarted: coverage.modules.started,
          modulesCompleted: coverage.modules.completed, heapMB: Math.round(mem.heapUsed / 1048576), rssMB: Math.round(mem.rss / 1048576) })
        if (process.env.CVG_DIAG_PROGRESS)
          try { fs.writeFileSync(process.env.CVG_DIAG_PROGRESS, JSON.stringify(__diag.series.slice(-50))) } catch {}
      }
    }
    bump('states', states.size, 'maxStates')""")
rep("""    contexts.get(fn.id).add(signature)""", """    contexts.get(fn.id).add(signature)
    if (__diag.enabled) {
      __diag.calls++
      let d = __diag.fn.get(fn.codeId)
      if (!d) __diag.fn.set(fn.codeId, (d = { file: fn.file, name: diagName(fn.node, ts), ids: new Set(), signatures: new Set(),
        receivers: new Set(), args: new Set(), captures: new Set(), calls: 0, maxPerId: 0, depth: 0 }))
      d.calls++
      d.ids.add(fn.id)
      d.signatures.add(hash(signature))
      d.receivers.add(hash(valueKey(receiver)))
      d.args.add(hash(args.map(valueKey).join(',')))
      d.captures.add(hash([...fn.capture.bindings].map(([k, v]) => k + '=' + valueKey(v)).join(',')))
      d.maxPerId = Math.max(d.maxPerId, contexts.get(fn.id).size)
      d.depth = Math.max(d.depth, stack.length + 1)
      __diag.fileDepth.set(fn.file, Math.max(__diag.fileDepth.get(fn.file) || 0, stack.length + 1))
    }""")
rep("""    modules.set(file, module)
    coverage.modules.started++""", """    modules.set(file, module)
    coverage.modules.started++
    const diagModule = __diag.enabled ? { file, order: coverage.modules.started, t0: performance.now() - started, statesAt: states.size } : null
    if (diagModule) __diag.modules.push(diagModule)""")
rep("""    module.loading = false
    coverage.modules.completed++""", """    module.loading = false
    coverage.modules.completed++
    if (diagModule) {
      diagModule.ms = Math.round(performance.now() - started - diagModule.t0)
      diagModule.states = states.size - diagModule.statesAt
    }""")
p.write_text(s)
print('patched', p)
