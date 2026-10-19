"""DIAGNOSTIC ONLY (never promoted): on top of identity_probe_patch.py, CVG_DIAG_PHASE_CLOCK=1 runs the L3 clock of
the SPEC0242 draft in the comparator copy: phase 1 from creation to the end of the first finalize; each later
finalize from its own start; checkTime and collect()'s _deadline both use the current phase start. Logs phase
durations and any compare() after the first finalize on stderr. usage: identity_phase_patch.py <tools-probe/scripts>"""
import sys
from pathlib import Path
p = Path(sys.argv[1]) / 'boundary-installed-identity.mjs'
s = p.read_text()
def rep(old, new):
    global s
    assert s.count(old) == 1, old[:60]
    s = s.replace(old, new)
rep("  let invalid = null\n  function checkTime() {\n    if (\n      performance.now() - started >=\n",
    "  let invalid = null\n  let phaseStart = started, finalizations = 0, comparesAfterFinalize = 0\n  const PHASE = process.env.CVG_DIAG_PHASE_CLOCK === '1'\n  function checkTime() {\n    if (\n      performance.now() - (PHASE ? phaseStart : started) >=\n")
rep("      _deadline: started + DIAG_CMP_MS,\n", "      _deadline: (PHASE ? phaseStart : started) + DIAG_CMP_MS,\n")
rep("  function compare(context, key) {\n", "  function compare(context, key) {\n    if (finalizations > 0) comparesAfterFinalize++\n")
rep("  function finalize() {\n    try {\n", "  function finalize() {\n    const fStart = performance.now()\n    if (PHASE && finalizations > 0) phaseStart = fStart\n    finalizations++\n    try {\n")
rep("    return {\n      status: invalid ? 'UNAVAILABLE' : 'COMPLETE',\n",
    "    process.stderr.write('CVG_DIAG_PHASE ' + JSON.stringify({ finalization: finalizations, phaseClock: PHASE, phaseMs: Math.round(performance.now() - (finalizations === 1 ? started : fStart)), finalizeMs: Math.round(performance.now() - fStart), comparesAfterFinalize, invalid }) + '\\n')\n    return {\n      status: invalid ? 'UNAVAILABLE' : 'COMPLETE',\n")
p.write_text(s)
print('ok')
