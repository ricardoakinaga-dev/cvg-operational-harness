"""MUTATION ONLY (test discrimination evidence, never promoted): M1 disables rule 3 (explicit runtime exports no
longer mask star names in the qualified loop); M2 disables the propagation of a name already ambiguous in the
source (diamond). usage: mutation_patch.py <M1|M2> <tools>/scripts"""
import sys
from pathlib import Path
m, d = sys.argv[1], Path(sys.argv[2])
p = d / 'boundary-semantic-engine.mjs'
s = p.read_text()
old, new = {'M1': ("    for (const [k, v] of namespace.props) {\n      if (k === 'default' || explicit.has(k)) continue",
                   "    for (const [k, v] of namespace.props) {\n      if (k === 'default') continue"),
            'M2': ('        identity === AMBIGUOUS ||\n', '')}[m]
assert s.count(old) == 1, m
p.write_text(s.replace(old, new))
print('ok', m)
