"""R1-04: analysis usage against the unchanged limits (SPEC0242) for v4 and v5 on the real root, the remaining
margin, the risk for promotion, and the function instances with most call contexts (diagnostic dump copies).
usage: usage_margins.py <v4-label> <v5-label> <v4ctx-label> <v5diag-label> [<other v5 labels>...]"""
import gzip, json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

v4, v5, v4ctx, v5diag = sys.argv[1:5]
extra = sys.argv[5:]
gz = lambda n: json.loads(gzip.decompress((EV / n).read_bytes()))
rows = {}
for label in (v4, v5, *extra):
    summ = load('real-' + label + '-summary.json')
    for run_ in summ['runs']:
        rows[label + ':' + run_['mode']] = {'usage': {k: run_['usage'][k] for k in ('contexts', 'states', 'callDepth', 'unionValues', 'nodes', 'files')},
                                           'workerElapsedMs': round(run_['telemetry']['elapsedMs']), 'wallSeconds': run_['wallSeconds'],
                                           'loadAvgAtStart': run_['loadAvgAtStart'], 'phasesBody': run_['phases']['body']}
limits = load('real-' + v5 + '-summary.json')['runs'][0]['limits']
cap = {'contexts': 'maxContexts', 'states': 'maxStates', 'callDepth': 'maxCallDepth', 'unionValues': 'maxUnionValues', 'nodes': 'maxNodes', 'files': 'maxFiles'}
margins = {}
for key, lim in cap.items():
    a, b = rows[v4 + ':normal']['usage'][key], rows[v5 + ':normal']['usage'][key]
    margins[key] = {'limit': limits[lim], 'v4': a, 'v5': b, 'v5Pct': round(100 * b / limits[lim], 1), 'v5Margin': limits[lim] - b, 'v4Margin': limits[lim] - a}
t4 = max(rows[v4 + ':' + m]['workerElapsedMs'] for m in ('normal', 'strict'))
t5 = max(r_['workerElapsedMs'] for k_, r_ in rows.items() if not k_.startswith(v4 + ':'))
margins['timeMs'] = {'limit': limits['timeoutMs'], 'v4MaxWorker': t4, 'v5MaxWorkerAllRuns': t5, 'v5Pct': round(100 * t5 / limits['timeoutMs'], 1),
                     'v5Runs': {k_: [r_['workerElapsedMs'], r_['loadAvgAtStart']] for k_, r_ in rows.items() if not k_.startswith(v4 + ':')},
                     'note': 'tempo depende da carga da máquina (loadAvgAtStart registrado por execução)'}
top = {label: gz('diag-' + label + '-normal.json.gz').get('contextsTop', [])[:10] for label in (v4ctx, v5diag)}
rec = {'task': TASK, 'observedAt': now(), 'limitsUnchanged': limits, 'runs': rows, 'margins': margins, 'contextsTop': top,
       'risk': 'maxContexts é a menor folga: estourar qualquer teto de BODY_CUT corta o corpo (phases.body CUT), condição de parada da SPEC0244 §5 e regressão da medição B6. E1 torna funções conhecidas no ponto de chamada e aumenta contextos; mudanças futuras no código avaliado ou novos reexports podem esgotar a folga. Os limites não mudam neste BUILD (SPEC0242/SPEC0244).',
       'recommendation': 'antes da promoção, o lead deve conhecer a folga de contextos; se outra mudança aumentar contextos, a medição precisa ser refeita e qualquer CUT bloqueia a promoção'}
save('usage-margins.json', rec)
print(json.dumps({'margins': margins, 'top': {k: [(x['contexts'], x['file'], x['pos'], x['head'][:70]) for x in v[:5]] for k, v in top.items()}}, indent=1, ensure_ascii=False))
