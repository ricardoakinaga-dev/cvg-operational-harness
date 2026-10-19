"""DIAGNOSTIC ONLY (never promoted): private recipe copies that exclude docs/04_audit/evidence/** from the
reference snapshots, to measure option A of Q2. usage: q2_patch.py <tools-q2/scripts>"""
import sys
from pathlib import Path
d = Path(sys.argv[1])
p = d / 'build-installed-reference.mjs'; s = p.read_text()
old = "      .filter(({ name }) => !excluded(name))\n"
assert s.count(old) == 1
s = s.replace(old, "      .filter(({ name }) => !excluded(name))\n      // DIAGNOSTIC: option A of the recon (evidence tree outside the snapshot).\n      .filter(({ name }) => !name.startsWith('docs/04_audit/evidence/'))\n")
old = "      sourceSha256,\n"
assert s.count(old) == 1
s = s.replace(old, "      sourceSha256,\n      sourceExclusions: ['docs/04_audit/evidence'],\n")
p.write_text(s)
p = d / 'boundary-semantic-compiled.mjs'; s = p.read_text()
old = "      [...git, 'archive', '--format=tar', '--output=' + archive, commit],"
assert s.count(old) == 1, s.count(old)
s = s.replace(old, "      [...git, 'archive', '--format=tar', '--output=' + archive, commit, '--', '.', ':(exclude)docs/04_audit/evidence'],")
p.write_text(s)
print('ok')
