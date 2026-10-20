"""DIAGNOSTIC VARIANT ONLY (never promoted, what-if for the first proof): in the resolution helper, a non-directory
entry under a workspace parent (legacy/packages/README.md) is skipped, as npm's workspace mapping only considers
directories with a package.json, instead of failing the whole workspace map with UNKNOWN_WORKSPACE_CONFIG. Every
other workspace check is unchanged. usage: ws_skip_patch.py <tools>/scripts"""
import sys
from pathlib import Path
p = Path(sys.argv[1]) / 'boundary-semantic-resolution.mjs'
s = p.read_text()
old = """        const key = parent + '/' + name
        if (!packagePart(name)) fail('UNKNOWN_WORKSPACE_CONFIG', key)
        const s = inspect(key)
        if (!s?.isDirectory()) fail('UNKNOWN_WORKSPACE_CONFIG', key)"""
assert s.count(old) == 1
s = s.replace(old, """        const key = parent + '/' + name
        const s = inspect(key)
        // VARIANT: a non-directory entry is not a workspace (npm semantics).
        if (s && !s.isDirectory() && !s.isSymbolicLink()) continue
        if (!packagePart(name)) fail('UNKNOWN_WORKSPACE_CONFIG', key)
        if (!s?.isDirectory()) fail('UNKNOWN_WORKSPACE_CONFIG', key)""")
p.write_text(s)
print('ok')
