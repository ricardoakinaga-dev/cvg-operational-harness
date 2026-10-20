"""Tuple-by-tuple comparison, on the evaluated root, of each variant against its base, from the private reports:
v5 (m5) against m6t (r1 patch), m6t2 (proposal), m6a and m6b (alternatives); v6 base = v5 + SPEC0245 A (m45) against
m45t2 (proposal on the v6 base). Payload equality excluding telemetry; per-module CJS rows of the diagnostic copy.
Writes real-conservation.json. usage: conservation.py"""
import gzip, json, sys
from collections import Counter
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

rep = RUNTIME / 'reports'
cache = {}
def L(n):
    if n not in cache:
        raw = gzip.decompress((rep / n).read_bytes())
        cache[n] = (json.loads(raw), shab(raw))
    return cache[n]
def body(r):
    x = dict(r); x.pop('semanticTelemetry', None)
    return json.dumps(x, sort_keys=True)
def tuples(r): return Counter(json.dumps(u, sort_keys=True) for u in r['semanticBoundary']['unknowns'])
def viols(r): return Counter(json.dumps(u, sort_keys=True) for u in r['semanticBoundary']['violations'] + r['violations'])
PAIRS = [('m5', 'm6t', 'normal'), ('m5', 'm6t', 'strict'), ('m5', 'm6tdiag', 'normal'), ('m5', 'm5b', 'normal'), ('m5b', 'm6t2', 'normal'), ('m5b', 'm6t2', 'strict'),
         ('m5', 'm6a', 'normal'), ('m5', 'm6b', 'normal'), ('m5', 'm45', 'normal'), ('m45', 'm45t2', 'normal'), ('m45', 'm45t2', 'strict'),
         ('m5c', 'm6t3', 'normal'), ('m5c', 'm6t3', 'strict'), ('m45c', 'm45t3', 'normal'), ('m45c', 'm45t3', 'strict'), ('m5c', 'm45c', 'normal')]
out = {'task': TASK, 'observedAt': now(), 'evaluatedRoot': str(EVAL_ROOT), 'evaluatedCommit': EVAL_COMMIT, 'references': 'references-scoped.json',
       'rejectedAttempts': 'guarded-runs.json e real-m6t2-summary-rejected-attempt1.json (strict invalidado: a unidade BUILD0245 reconstruiu dist/ na raiz durante a execução)',
       'epochs': {'1': 'antes de 2026-10-20T11:18:50Z: m5, m6t, m6tdiag, m6a, m6b', '2': 'depois que a unidade BUILD0245 reconstruiu dist/ na raiz (mais saídas de teste em dist; os 1.410 inputs semânticos iguais): m5b, m6t2, m45, m45t2',
                  'rule': 'igualdade de payload só se compara dentro da mesma época; entre épocas mudam só runtimeResolution (stat e sha256 de dist) e compiledProvenance.files'},
       'labels': {'m5': 'v5 (main 6c9fc651, engine c724567f), época 1', 'm5b': 'v5 repetida na época 2', 'm6t': 'v5 + cjs_patch_t_r1 (sem TOP_LEVEL_RETURN)', 'm6tdiag': 'm6t + despejo diagnóstico',
                  'm6t2': 'v5 + cjs_patch_t (proposta)', 'm6a': 'v5 + cjs_patch A (E-U)', 'm6b': 'v5 + cjs_patch B (E-opaco)',
                  'm45': 'v5 + SPEC0245 A (base v6 diagnóstica)', 'm45t2': 'm45 + cjs_patch_t (proposta r1 sobre a base v6)',
                  'm5c': 'v5 repetida na época da r2', 'm6t3': 'v5 + cjs_patch_t3 (proposta r2)', 'm45c': 'base v6 repetida na época da r2',
                  'm45t3': 'm45 + cjs_patch_t3 (proposta r2 sobre a base v6)'},
       'comparisons': []}
out['pending'] = []
for base, var, mode in PAIRS:
    if not (rep / ('real-' + var + '-' + mode + '-report.json.gz')).exists() or not (rep / ('real-' + base + '-normal-report.json.gz')).exists():
        out['pending'].append([base, var, mode]); continue
    a, asha = L('real-' + base + '-normal-report.json.gz')
    b, bsha = L('real-' + var + '-' + mode + '-report.json.gz')
    ua, ub, va, vb = tuples(a), tuples(b), viols(a), viols(b)
    plus, minus = ub - ua, ua - ub
    out['comparisons'].append({
        'base': base, 'variant': var, 'mode': mode, 'baseReportSha256': asha, 'variantReportSha256': bsha,
        'diagnostics': [len(a['diagnostics']), len(b['diagnostics'])], 'tuples': [sum(ua.values()), sum(ub.values())],
        'tuplesOnlyInBase': sum(minus.values()), 'tuplesOnlyInVariant': sum(plus.values()),
        'newByReason': dict(Counter(json.loads(x)['reason'] for x in plus.elements())),
        'goneByReason': dict(Counter(json.loads(x)['reason'] for x in minus.elements())),
        'violations': [sum(va.values()), sum(vb.values())], 'violationsLost': sum((va - vb).values()),
        'proofs': len(b['semanticBoundary']['proofs']), 'validation': b['semanticBoundary']['validation'],
        'usage': {k: b['semanticBoundary']['usage'][k] for k in ('contexts', 'states', 'callDepth', 'unionValues')},
        'payloadEqualToBaseExcludingTelemetry': body(a) == body(b) if mode == 'normal' else None})
for var in ('m6t', 'm6t2', 'm45t2', 'm6t3', 'm45t3'):
    if not all((rep / ('real-' + var + '-' + m + '-report.json.gz')).exists() for m in ('normal', 'strict')): continue
    n, _ = L('real-' + var + '-normal-report.json.gz'); s, _ = L('real-' + var + '-strict-report.json.gz')
    out.setdefault('normalEqualsStrictExcludingTelemetry', {})[var] = body(n) == body(s)
d = json.loads(gzip.decompress((EV / 'diag-m6tdiag-normal.json.gz').read_bytes()))
req = [m for m in d['modules'] if m.get('mode') == 'require']
out['cjsRows'] = {'source': 'diag-m6tdiag-normal.json.gz (cópia diagnóstica m6tdiag, só despejo)', 'loadedModules': len(d['modules']),
                  'byMode': dict(Counter(m.get('mode') for m in d['modules'])), 'requireModeModules': len(req),
                  'requireModeByExtension': dict(Counter(m['file'].rsplit('.', 1)[-1] for m in req)),
                  'requireModeTopDirs': sorted({'/'.join(m['file'].split('/')[:2]) for m in req}),
                  'withScanCategories': sum(1 for m in req if m.get('categories')), 'withTopLevelWrites': sum(1 for m in req if m['topWrites']),
                  'withFunctionBodyWrites': sum(1 for m in req if m['functionWrites']), 'withJoinsChanged': sum(1 for m in d['modules'] if m['joinsChanged']),
                  'initialExportsObjectKept': sum(1 for m in req if m.get('initialObjectKept')), 'opaqueForImporters': sum(1 for m in req if m.get('opaqueForImporters')),
                  'reading': 'os 64 módulos em modo require são .ts e .tsx de primeira parte em pacotes sem type module; nenhum tem escrita reconhecida, alça ou junção que mude o valor; o valor rastreado de todos fica o objeto exports inicial; nenhum arquivo instalado é carregado em modo require'}
start = RUNTIME / 'chain4.start'
if start.exists():
    t0 = int(start.read_text().strip())
    q = subprocess.run(['find', str(EVAL_ROOT), '(', '-path', str(EVAL_ROOT / 'node_modules'), '-o', '-path', str(EVAL_ROOT / '.git'), ')', '-prune', '-o',
                        '-type', 'f', '-newermt', '@' + str(t0), '-print'], capture_output=True, text=True)
    changed = [l for l in q.stdout.splitlines() if l]
    out['epochR2'] = {'startedAt': datetime.datetime.fromtimestamp(t0, datetime.timezone.utc).isoformat(), 'checkedAt': now(),
                      'rootFilesChangedSinceStart': len(changed), 'sample': changed[:10],
                      'reading': 'm5c, m6t3, m45c e m45t3 estão na mesma época só se a contagem for zero'}
save('real-conservation.json', out)
for c in out['comparisons']:
    print(c['base'], '->', c['variant'], c['mode'], c['diagnostics'], '+', c['tuplesOnlyInVariant'], '-', c['tuplesOnlyInBase'], c['newByReason'], 'eq', c['payloadEqualToBaseExcludingTelemetry'], 'ctx', c['usage']['contexts'])
print(out.get('normalEqualsStrictExcludingTelemetry'))
