"""DIAGNOSTIC ONLY (never promoted): copy of tools-diag with the checker instrumented to print, on stderr, the
status/reasons/elapsedMs of both installed-identity finalizations and the time spent in runSemanticBoundary.
usage: identity_probe_patch.py <tools-probe/scripts>"""
import sys
from pathlib import Path
p = Path(sys.argv[1]) / 'check-product-boundary.mjs'
s = p.read_text()
old = "  const identityFinalization = installedPackages.finalize()\n"
assert s.count(old) == 1
s = s.replace(old, old + "  process.stderr.write('CVG_DIAG_IDENTITY first ' + JSON.stringify(identityFinalization) + ' t=' + Math.round(performance.now()) + '\\n')\n")
old = "    const finalIdentity = installedPackages.finalize()\n"
assert s.count(old) == 1
s = s.replace(old, old + "    process.stderr.write('CVG_DIAG_IDENTITY final ' + JSON.stringify(finalIdentity) + ' t=' + Math.round(performance.now()) + '\\n')\n")
old = "  const installedPackages = createInstalledPackageVerifier(root, {\n"
assert s.count(old) == 1
s = s.replace(old, "  process.stderr.write('CVG_DIAG_IDENTITY verifierCreated t=' + Math.round(performance.now()) + '\\n')\n" + old)
p.write_text(s)
print('ok')

# Second part: CVG_DIAG_COMPARATOR_TIMEOUT_MS overrides ONLY the comparator lifetime deadline (diagnostic). The
# INSTALLED_IDENTITY_LIMITS constant and the receipt limits stay untouched.
p = Path(sys.argv[1]) / 'boundary-installed-identity.mjs'
s = p.read_text()
old = "  const started = performance.now()\n  const used = [],\n"
assert s.count(old) == 1
s = s.replace(old, "  const started = performance.now()\n  const DIAG_CMP_MS = process.env.CVG_DIAG_COMPARATOR_TIMEOUT_MS ? Number(process.env.CVG_DIAG_COMPARATOR_TIMEOUT_MS) : INSTALLED_IDENTITY_LIMITS.comparisonTimeoutMs\n  const used = [],\n")
seg_start = s.index('const DIAG_CMP_MS')
seg_end = s.index('return { compare, finalize }', seg_start)
seg = s[seg_start:seg_end]
n = seg.count('INSTALLED_IDENTITY_LIMITS.comparisonTimeoutMs')
seg = seg.replace('INSTALLED_IDENTITY_LIMITS.comparisonTimeoutMs', 'DIAG_CMP_MS')
seg = seg.replace('DIAG_CMP_MS = process.env.CVG_DIAG_COMPARATOR_TIMEOUT_MS ? Number(process.env.CVG_DIAG_COMPARATOR_TIMEOUT_MS) : DIAG_CMP_MS',
                  'DIAG_CMP_MS = process.env.CVG_DIAG_COMPARATOR_TIMEOUT_MS ? Number(process.env.CVG_DIAG_COMPARATOR_TIMEOUT_MS) : INSTALLED_IDENTITY_LIMITS.comparisonTimeoutMs')
s = s[:seg_start] + seg + s[seg_end:]
p.write_text(s)
print('comparator deadline uses replaced:', n - 1)
