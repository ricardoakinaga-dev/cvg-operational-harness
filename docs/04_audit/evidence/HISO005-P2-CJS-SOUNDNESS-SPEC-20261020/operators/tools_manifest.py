"""Manifest of the private engine copies (origin, patches, sha256) and unified diffs of each variant against v5.
usage: tools_manifest.py"""
import difflib, json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

base = RUNTIME / 'tools-m5/scripts/boundary-semantic-engine.mjs'
assert sha(base) == V5_ENGINE_SHA
rows = {
    'v5': {'use': 'fixtures (base)', 'patches': []}, 'v6a': {'use': 'fixtures, 1ª rodada', 'patches': ['operators/cjs_patch.py A']},
    'v6b': {'use': 'fixtures, 1ª rodada', 'patches': ['operators/cjs_patch.py B']}, 'v6s': {'use': 'fixtures, 1ª rodada', 'patches': ['operators/cjs_patch_s.py']},
    'v6t': {'use': 'fixtures (proposta, 1ª versão)', 'patches': ['operators/cjs_patch_t_r1.py']},
    'v6t2': {'use': 'fixtures (proposta r1)', 'patches': ['operators/cjs_patch_t.py']},
    'm5': {'use': 'raiz avaliada (base v5)', 'patches': []}, 'm6t': {'use': 'raiz avaliada (proposta, 1ª versão)', 'patches': ['operators/cjs_patch_t_r1.py']},
    'm6t2': {'use': 'raiz avaliada (proposta r1)', 'patches': ['operators/cjs_patch_t.py']},
    'm6a': {'use': 'raiz avaliada (alternativa E-U)', 'patches': ['operators/cjs_patch.py A']},
    'm6b': {'use': 'raiz avaliada (alternativa E-opaco)', 'patches': ['operators/cjs_patch.py B']},
    'm6tdiag': {'use': 'raiz avaliada (só despejo diagnóstico)', 'patches': ['operators/cjs_patch_t_r1.py', 'operators/cjs_diag_patch.py']},
    'm45': {'use': 'raiz avaliada (base v6 diagnóstica: v5 + SPEC0245 A)', 'patches': ['operators/tsx_parse_patch.py']},
    'm45t2': {'use': 'raiz avaliada (proposta r1 sobre a base v6)', 'patches': ['operators/tsx_parse_patch.py', 'operators/cjs_patch_t.py']},
    'v6t3': {'use': 'fixtures (proposta r2)', 'patches': ['operators/cjs_patch_t3.py']},
    'v6r': {'use': 'fixtures (alternativa R: C0 só com raiz)', 'patches': ['operators/cjs_patch_r.py']},
    'm6t3': {'use': 'raiz avaliada (proposta r2)', 'patches': ['operators/cjs_patch_t3.py']},
    'm45t3': {'use': 'raiz avaliada (proposta r2 sobre a base v6)', 'patches': ['operators/tsx_parse_patch.py', 'operators/cjs_patch_t3.py']}}
out = {'task': TASK, 'observedAt': now(), 'origin': {'main': MAIN, 'scripts': 'git archive da main remota (só os 3 .mjs do engine nas cópias v*, scripts/ inteiro nas m*)',
       'unmeasuredRemoved': 'tools-m45t (patch r1 sobre a base v6) foi apagada sem medir', 'baseRepeats': 'm5b e m5c usam tools-m5; m45c usa tools-m45 (repetições da base em outra época da raiz)',
       'nodeModules': 'v*: só node_modules/typescript copiado de ' + str(PR9) + '; m*: node_modules copiado (cp -a) de ' + str(PR9) + ', depois cp -al dentro do runtime'},
       'engineV5Sha256': V5_ENGINE_SHA, 'diagnosticOnly': True, 'kernelVersionString': 'inalterado nas cópias (semantic-kernel-v5-esm-module-shape)', 'copies': {}}
a = base.read_text().splitlines(keepends=True)
for label, row in rows.items():
    eng = RUNTIME / ('tools-' + label) / 'scripts/boundary-semantic-engine.mjs'
    out['copies'][label] = dict(row, engineSha256=sha(eng), patchSha256={pp.split()[0]: sha(EV / pp.split()[0]) for pp in row['patches']})
for label in ('v6t3', 'v6t2', 'v6r', 'v6b', 'v6s'):
    b = (RUNTIME / ('tools-' + label) / 'scripts/boundary-semantic-engine.mjs').read_text().splitlines(keepends=True)
    diff = ''.join(difflib.unified_diff(a, b, 'v5/boundary-semantic-engine.mjs', label + '/boundary-semantic-engine.mjs'))
    (EV / ('variant-' + label + '.diff.txt')).write_text(diff)
    out['copies'][label]['diff'] = 'variant-' + label + '.diff.txt'
save('tools-variants.json', out)
print(json.dumps({k: v['engineSha256'] for k, v in out['copies'].items()}, indent=1))
