"""Fixture catalog of the BUILD0247 tests: the 71 fixtures of the SPEC0247 catalog (fixtures.json of the SPEC unit,
unchanged) plus the five R2 review cases T1, T2, T2b, T3 and Q3 (review-r2/review.json, testsRun; files as written
there, package.json '{}'). Writes fixtures-0247.json. usage: catalog.py"""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

src = json.loads((SPEC_DIR / 'fixtures.json').read_text())
assert src['count'] == 71
review = json.loads((SPEC_DIR / 'review-r2/review.json').read_text())
tests = {t['name'].split(' ')[0]: t for t in review['testsRun']}
P = {'products/x.js': 'module.exports = 1'}
def norm(v):
    # The R2 transcript condenses each file into one line ('; ' between statements and ' else ' after an expression
    # statement). Without a line break there is no ASI before `else`, so the literal strings give UNKNOWN_PARSE in
    # m.js (probe-ref-r2-literal.json). The BUILD uses the same statements, one per line, `else` on its own line.
    return v.replace('; ', '\n').replace(' else ', '\nelse ') + '\n'
def files(name, **extra):
    t = tests[name]
    fs = {'package.json': '{}'}
    for k, v in t['files'].items():
        fs[k] = norm(v)
    return fs
r2 = []
t = tests['T1']; assert t['engine'] == 'v6t3'
r2.append({'id': 'T1-function-file-tuple', 'group': 'R2', 'files': files('T1'), 'origins': [], 'expectV6': 'UNKNOWN',
           'why': 'R2 T1: a junção leva g ao checkExport; a tupla nova fica em n.js, arquivo da função chamada (fecho do módulo tocado, §3.6)'})
t2 = tests['T2']
fs2 = {'package.json': '{}', **{k: norm(v) for k, v in [x for x in review['testsRun'] if x['name'].startswith('T2 ') and x['engine'] == 'v5'][0]['files'].items()}}
r2.append({'id': 'T2-true-violation-opaque', 'group': 'R2', 'files': fs2, 'origins': [], 'expectV6': 'UNKNOWN',
           'why': 'R2 T2: violação verdadeira da base carregada pelo objeto inicial (C1); vira UNKNOWN_CALL'})
r2.append({'id': 'T2b-true-violation-union', 'group': 'R2', 'files': files('T2b'), 'origins': [], 'expectV6': 'UNKNOWN',
           'why': 'R2 T2b: violação verdadeira da base carregada por união (C2); chamada de união recusada'})
r2.append({'id': 'T3-new-true-violation-join', 'group': 'R2', 'files': files('T3'), 'origins': [], 'expectV6': 'VIOLATION',
           'why': 'R2 T3: a junção alcança o especificador ./products/x.js; violação nova e verdadeira, listada por causa (C2)'})
r2.append({'id': 'Q3-computed-key-opaque', 'group': 'R2', 'files': files('Q3'), 'origins': [], 'expectV6': 'UNKNOWN',
           'why': 'R2 Q3: chave computada com o objeto inicial dá UNKNOWN_OBJECT (custo C1 fora do catálogo)'})
for f in r2:
    for k in list(f['files']):
        assert isinstance(f['files'][k], str)
for f in r2:
    t = tests[{'T1-function-file-tuple': 'T1', 'T2-true-violation-opaque': 'T2', 'T2b-true-violation-union': 'T2b', 'T3-new-true-violation-join': 'T3', 'Q3-computed-key-opaque': 'Q3'}[f['id']]]
    f['reviewFiles'] = t['files'] if f['id'] != 'T2-true-violation-opaque' else [x for x in review['testsRun'] if x['name'].startswith('T2 ') and x['engine'] == 'v5'][0]['files']
    f['normalization'] = 'um comando por linha e else em linha própria (ver norm)'
F = src['fixtures'] + r2
assert len({f['id'] for f in F}) == len(F) == 76
save('fixtures-0247.json', {'task': TASK, 'generatedAt': now(), 'source': {'catalog': str((SPEC_DIR / 'fixtures.json').relative_to(PROJECT)), 'catalogSha256': sha(SPEC_DIR / 'fixtures.json'),
     'review': str((SPEC_DIR / 'review-r2/review.json').relative_to(PROJECT)), 'reviewSha256': sha(SPEC_DIR / 'review-r2/review.json')},
     'count': len(F), 'groups': {g: sum(1 for f in F if f['group'] == g) for g in sorted({f['group'] for f in F})}, 'fixtures': F})
print(len(F), {g: sum(1 for f in F if f['group'] == g) for g in sorted({f['group'] for f in F})})
for f in r2: print(f['id'], json.dumps(f['files']))
