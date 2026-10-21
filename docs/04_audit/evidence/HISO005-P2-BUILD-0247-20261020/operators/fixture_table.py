"""Fixture table of SPEC0247 §3.6 over the 76 fixtures: base (v6) against vN (frozen candidate), both measured in
the same probe, plus the diagnostic copies (base graph; vN CJS rows). Per fixture: statuses, tuples gone/new, the C0
categories, touched modules by cause, affected files, rule 1 (gone only in affected files, edge tuple counted at the
file of the lost violation), rule 2 (new tuple in an affected file, reason of the closed list or code reached by the
declared cause), rule 3 (lost violation listed with class; new violation only with cause), rule 4 (no new PROVEN),
and the comparison with the SPEC reference variant (tools-v6t3ref). usage: fixture_table.py <probe-run> <vN> <diag-run> <vNdiag> <basediag>"""
import json, sys
from collections import Counter
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

run_, vn, drun, vnd, bd = sys.argv[1:6]
P = load('probe-' + run_ + '.json')['results']
PD = load('probe-' + drun + '.json')['results']
REF = load('probe-ref.json')['results']
FX = {f['id']: f for f in load('fixtures-0247.json')['fixtures']}
gen = load('test-generation.json')['declaredByHand']
CLOSED = {'UNKNOWN_CJS_EXPORTS', 'UNKNOWN_BINDING_VALUE', 'UNKNOWN_CALL', 'UNKNOWN_PROPERTY', 'UNKNOWN_OPERATOR', 'UNKNOWN_TEMPLATE',
          'UNKNOWN_RESOLUTION', 'UNKNOWN_REFLECTION', 'UNKNOWN_OBJECT', 'UNKNOWN_EXPORT'}
ms = lambda xs: Counter(tuple(x) for x in xs)
N = lambda r: r['normal'] if 'normal' in r else r
rows, allok = [], True
for fid, f in FX.items():
    b, v = N(P[fid]['v6']), N(P[fid][vn])
    dv, db = N(PD[fid][vnd])['diag'], N(PD[fid][bd])['diag']
    E = {k: set(x) for k, x in db['edges'].items()}
    def clo(s):
        seen, st = set(), [s]
        while st:
            n = st.pop()
            if n in seen: continue
            seen.add(n); st.extend(E.get(n, ()))
        return seen
    touched = {}
    for r in dv['cjs']:
        if r.get('mode') != 'require': continue
        cs = (['C0'] if r.get('categories') else []) + (['C1'] if r.get('initialObjectKept') or r.get('foreignInitialObject') else []) + (['C2'] if r.get('joinsChanged') else [])
        if cs: touched[r['file']] = cs
    files = set(dv['modes']) | set(db['modes'])
    affected = set(touched) | {x for x in files if clo(x) & set(touched)} | set().union(*[clo(t) for t in touched]) if touched else set()
    gone, new = ms(b['unknowns']) - ms(v['unknowns']), ms(v['unknowns']) - ms(b['unknowns'])
    vl, vnw = ms(b['violations']) - ms(v['violations']), ms(v['violations']) - ms(b['violations'])
    lost_files = {t[2]: t[1] for t in vl}  # edge target -> violation file
    def at(t):  # file a tuple counts for (edge tuple: file of the violation with the same target)
        if t[0] == 'UNKNOWN_PRODUCT_TARGET':
            tgt = t[1]
            src = lost_files.get(tgt) or next((x[1] for x in list(ms(b['violations'])) + list(ms(v['violations'])) if x[2] == tgt), None)
            return src
        return t[1]
    r1 = all(at(t) in affected and t[0] == 'UNKNOWN_PRODUCT_TARGET' and t[1] in lost_files for t in gone.elements())
    reached_cause = gen['reachedCause'].get(fid)
    r2 = all(at(t) in affected and (t[0] in CLOSED or reached_cause) for t in new.elements())
    r3 = (bool(vl) == (fid in gen['lostViolationClass'])) and (bool(vnw) == (fid in gen['newViolationCause'])) and all(x[1] in affected for x in list(vl) + list(vnw))
    r4 = not (v['status'] == 'PROVEN' and b['status'] != 'PROVEN')
    ref = N(REF[fid]['v6t3ref'])
    same_ref = all(ref[k] == v[k] for k in ('status', 'unknowns', 'violations', 'proofs'))
    expect = f['expectV6']
    meets = v['status'] == expect or (expect == 'VIOLATION_OR_UNKNOWN' and v['status'] in ('VIOLATION', 'UNKNOWN'))
    ok = r1 and r2 and r3 and r4 and same_ref and meets
    allok &= ok
    rows.append({'id': fid, 'group': f['group'], 'base': b['status'], 'vN': v['status'], 'expectedByCatalog': expect, 'meetsCatalog': meets,
                 'c0Categories': sorted([u[1], u[2]] for u in v['unknowns'] if u[0] == 'UNKNOWN_CJS_EXPORTS'),
                 'touchedModules': [{'file': k, 'causes': c} for k, c in sorted(touched.items())], 'affectedFiles': sorted(affected),
                 'tuplesGone': sorted(list(x) for x in gone.elements()), 'tuplesNew': sorted(list(x) for x in new.elements()),
                 'newOutsideClosedList': sorted(list(x) for x in new.elements() if x[0] not in CLOSED), 'reachedCause': reached_cause,
                 'violationsLost': [{'violation': list(x), 'class': gen['lostViolationClass'].get(fid)} for x in vl.elements()],
                 'violationsNew': [{'violation': list(x), 'cause': gen['newViolationCause'].get(fid)} for x in vnw.elements()],
                 'rule1': r1, 'rule2': r2, 'rule3': r3, 'rule4': r4, 'sameAsSpecReferenceVariant': same_ref, 'ok': ok})
G = Counter((r['group'], r['base'], r['vN']) for r in rows)
out = {'task': TASK, 'observedAt': now(), 'probe': 'probe-' + run_ + '.json', 'diagProbe': 'probe-' + drun + '.json',
       'touchedCriterion': 'C0 = ao menos uma categoria; C1 = o valor final contém o objeto inicial (a base tinha VOID); C2 = uma junção mudou o valor rastreado em algum ponto (joinsChanged > 0). O C2 é um superconjunto da definição da §3.6 (valor final diferente do da base; ex.: X07, em que a escrita seguinte devolve o mesmo 1): só alarga os módulos tocados e os arquivos afetados, o que é conservador para as regras 1–3 (R1-P3-03)', 'labels': {'base': 'v6', 'vN': vn, 'vNDiag': vnd, 'baseDiag': bd},
       'engines': load('probe-' + run_ + '.json')['engines'], 'count': len(rows),
       'byGroup': {g: {'count': sum(1 for r in rows if r['group'] == g), 'transitions': {f'{x}->{y}': n for (gg, x, y), n in sorted(G.items()) if gg == g}} for g in ['A', 'B', 'C', 'D', 'V', 'R2']},
       'falseProvenClosed': [r['id'] for r in rows if r['group'] == 'A' and r['base'] == 'PROVEN' and r['vN'] != 'PROVEN'],
       'provenKept': [r['id'] for r in rows if r['base'] == 'PROVEN' and r['vN'] == 'PROVEN'],
       'provenLost': [r['id'] for r in rows if r['base'] == 'PROVEN' and r['vN'] != 'PROVEN' and r['group'] != 'A'],
       'newProven': [r['id'] for r in rows if r['vN'] == 'PROVEN' and r['base'] != 'PROVEN'],
       'violationsLost': {r['id']: r['violationsLost'] for r in rows if r['violationsLost']},
       'violationsNew': {r['id']: r['violationsNew'] for r in rows if r['violationsNew']},
       'touchedByCause': dict(Counter(c for r in rows for t in r['touchedModules'] for c in t['causes'])),
       'allSameAsSpecReferenceVariant': all(r['sameAsSpecReferenceVariant'] for r in rows), 'allRulesOk': allok, 'rows': rows}
save('fixture-table.json', out)
print(json.dumps({k: y for k, y in out.items() if k not in ('rows', 'engines')}, indent=1, ensure_ascii=False)[:5000])
print([r['id'] for r in rows if not r['ok']])
