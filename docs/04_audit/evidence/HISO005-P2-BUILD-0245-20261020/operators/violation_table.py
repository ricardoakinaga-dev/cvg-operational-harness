"""R2-O01: deriva fixture-table.json#violationTable dos results (v5 x v6, normal e census) e confere com a tabela
arquivada; grava violation-table-derivation.json. usage: python3 -B violation_table.py"""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

ft = load('fixture-table.json')
res = ft['results']
lost, gained = [], []
for name, r in res.items():
    for mode in ('normal', 'census'):
        a, b = bool(r['v5:' + mode]['violations']), bool(r['v6:' + mode]['violations'])
        if a and not b:
            lost.append([name, mode])
        if b and not a:
            gained.append([name, mode])
mt04 = all(res['MT04-ts-only-syntax']['v5:' + m]['unknowns'] == res['MT04-ts-only-syntax']['v6:' + m]['unknowns'] for m in ('normal', 'census'))
derived = {'lostV5toV6': lost, 'gainedV5toV6': gained, 'mt04TuplesEqualV5': mt04}
archived = ft['violationTable']
eq = {k: derived[k] == archived[k] for k in derived}
lossClass = {n for n, _ in lost} <= {'F13-jsx-text', 'F7xF13-generic-arrow-import'}
out = {'task': TASK, 'observedAt': now(), 'source': 'fixture-table.json#results', 'derived': derived, 'equalsArchived': eq,
       'lossesOnlyJsxTextClass': lossClass, 'status': 'PASS' if all(eq.values()) and lossClass and mt04 else 'FAIL'}
save('violation-table-derivation.json', out)
print(json.dumps(out, ensure_ascii=False))
