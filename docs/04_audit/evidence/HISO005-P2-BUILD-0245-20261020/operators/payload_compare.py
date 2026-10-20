"""R1-01: field-by-field comparison of the v5 payload measured on the reconstituted root (first without the harness
step, r1; then complete, r2) against the sealed BUILD0244 v5 payload (same scripts). usage: payload_compare.py"""
import gzip, json, sys
from collections import Counter
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

sealed = {m: json.loads(gzip.decompress((SEALED_V5.parent / ('real-v5r3-' + m + '-report.json.gz')).read_bytes())) for m in ('normal', 'strict')}
def cmp(label, mode):
    a = json.loads(gzip.decompress((EV / ('real-' + label + '-' + mode + '-report.json.gz')).read_bytes()))
    sa, ss = a['semanticBoundary'], sealed[mode]['semanticBoundary']
    out = {}
    for k in sorted(set(sa) | set(ss)):
        out[k] = 'equal' if json.dumps(sa.get(k), sort_keys=True) == json.dumps(ss.get(k), sort_keys=True) else 'differs'
    ra, rs = sa.get('runtimeResolution') or {}, ss.get('runtimeResolution') or {}
    rr = {k: ('equal' if json.dumps(ra.get(k), sort_keys=True) == json.dumps(rs.get(k), sort_keys=True) else 'differs') for k in sorted(set(ra) | set(rs))}
    ia, is_ = ra.get('inputs', []), rs.get('inputs', [])
    by = lambda xs: {(x['kind'], x['file']): x for x in xs}
    ba, bs = by(ia), by(is_)
    kinds_diff = Counter(k[0] for k in set(ba) | set(bs) if json.dumps(ba.get(k), sort_keys=True) != json.dumps(bs.get(k), sort_keys=True))
    file_inputs_equal = all(json.dumps(ba.get(k), sort_keys=True) == json.dumps(bs.get(k), sort_keys=True) for k in set(ba) | set(bs) if k[0] == 'file')
    ca, cs = sa.get('compiledProvenance') or {}, ss.get('compiledProvenance') or {}
    fa, fs = {x['file'] for x in ca.get('files', [])}, {x['file'] for x in cs.get('files', [])}
    diags = lambda r: Counter(json.dumps(d, sort_keys=True) for d in r['diagnostics'])
    return {'semanticBoundaryFields': out, 'runtimeResolutionFields': rr, 'runtimeResolutionInputKindsDiffering': dict(kinds_diff),
            'fileInputsEqual': file_inputs_equal, 'rootSame': ra.get('root') == rs.get('root'),
            'compiledProvenance': {'status': [ca.get('status'), cs.get('status')], 'files': [len(fa), len(fs)], 'missingVsSealed': sorted(fs - fa)[:60], 'extraVsSealed': sorted(fa - fs)[:20]},
            'diagnosticsEqual': diags(a) == diags(sealed[mode]), 'unknownsEqual': sa['unknowns'] == ss['unknowns']}
rec = {'task': TASK, 'observedAt': now(), 'sealed': str(SEALED_V5.relative_to(PROJECT)),
       'r1_withoutHarness': {m: cmp('v5', m) for m in ('normal', 'strict')}, 'r2_complete': {m: cmp('v5b', m) for m in ('normal', 'strict')},
       'reading': ('r1: a raiz sem o passo harness não tinha as 48 saídas de teste compiladas (42 em packages/shared/dist/__tests__ e 6 em packages/contracts/dist/__tests__); '
                   'a referência compilada leu 73 de 121 arquivos e compiledProvenance diferiu; diagnósticos e unknowns já eram iguais ao selado. '
                   'r2: com o passo harness, compiledProvenance volta a 121 arquivos; o que difere do selado é só identidade física (stat, root) e digests derivados das referências refeitas. '
                   'A §3.3 não depende disso: v5 e v6 sempre usaram a mesma raiz e as mesmas referências em cada rodada.')}
save('eval-root-payload-comparison.json', rec)
for k in ('r1_withoutHarness', 'r2_complete'):
    x = rec[k]['normal']
    print(k, x['diagnosticsEqual'], x['unknownsEqual'], x['fileInputsEqual'], x['compiledProvenance']['files'], x['runtimeResolutionInputKindsDiffering'], [f for f, v in x['semanticBoundaryFields'].items() if v == 'differs'], [f for f, v in x['runtimeResolutionFields'].items() if v == 'differs'])
