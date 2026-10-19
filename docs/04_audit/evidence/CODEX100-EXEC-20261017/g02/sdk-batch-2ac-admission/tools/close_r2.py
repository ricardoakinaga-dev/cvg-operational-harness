"""Closing after review R2 (offline; no service). Run: python3 -I -B tools/close_r2.py apply
                                                       python3 -I -B tools/close_r2.py validation <validation.json>

apply: applies the dispositions of review-r2/review.json (APPROVE, 5 P3) to the reviewed documents without regenerating them:
state.json (final status, deviations D1-D9 and carry-over from tools/repair_r1.py, review R2, budget), errata-r1.json (E6 base,
R2-F03), adjudication-r1.json (decisions D1-D9 from tools/adjudicate_r1.py), next-task.json (previous_review) and writes
review-r2/executor-disposition.json.
validation: records the closing validations (JSON object) in state.json#/validation.
"""
import datetime
import importlib.util
import json
import sys
from pathlib import Path

sys.dont_write_bytecode = True
U = Path(__file__).resolve().parent.parent


def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def jload(rel):
    return json.loads((U / rel).read_text())


def save(rel, doc):
    (U / rel).write_text(json.dumps(doc, ensure_ascii=False, indent=2) + '\n')


DISPOSITION = {
    'R2-F01': ('FIXED', 'Desvios D7 (F4-09), D8 (F4-12) e D9 (F4-10) em state.json#/implementation/deviations, com decisão em adjudication-r1.json; '
                        'renomear o teste F4-01 e os autotestes do driver vão ao carry-over.'),
    'R2-F02': ('FIXED', 'Texto de D4 corrigido (11 verificações portadas; os seis genéricos não portados listados, com a prova da R2 numa cópia); '
                        'porte no carry-over.'),
    'R2-F03': ('FIXED', 'E6 de errata-r1.json: instante da drenagem em ns monotônicos desde o t0 da tentativa (result.json t0_monotonic_ns), a '
                        'mesma base de actions[].t_ns e recv_ns.'),
    'R2-F04': ('FIXED', 'state.json passa a COMPLETED_LOCAL depois da R2; unit-manifest.json e commit-receipt.json são escritos antes da entrega, '
                        'e next-task.json só é entregue com os dois presentes.'),
    'R2-F05': ('FIXED', 'Os blocos adjudication, next_task e tools_repair passaram para tools/repair_r1.py (write_state); este fechamento é feito '
                        'por tools/close_r2.py e registrado em post-review-r2-changes.json.'),
}


def apply():
    rep = load('close_repair', U / 'tools' / 'repair_r1.py')
    adj = load('close_adjudicate', U / 'tools' / 'adjudicate_r1.py')
    review = jload('review-r2/review.json')
    assert review['verdict'] == 'APPROVE' and sorted(f['id'] for f in review['findings']) == sorted(DISPOSITION)
    assert all(f['severity'] == 'P3' for f in review['findings'])

    st = jload('state.json')
    st['status'] = 'COMPLETED_LOCAL'
    st['implementation']['deviations'] = rep.DEVIATIONS
    st['carry_over_next_freeze'] = rep.CARRY_OVER
    st['adjudication']['deviations'] = 'D1-D9 aceitos (D5 e D9 com carry-over)'
    st['tools_repair'] = ['tools/repair_r1.py', 'tools/adjudicate_r1.py', 'tools/empty_artifacts.py (motivos do 2A-TS12R)', 'tools/close_r2.py']
    st['review']['r2'] = {'path': 'review-r2/review.json', 'subject': 'review-freeze-r2.json',
                          'subject_sha256': review['subject_sha256'], 'verdict': 'APPROVE', 'findings': {'P1': 0, 'P2': 0, 'P3': 5},
                          'disposition': 'review-r2/executor-disposition.json'}
    st['budget']['reviews'] = '2/2'
    st['post_review_r2_changes'] = 'post-review-r2-changes.json'
    st['closing_documents'] = ['state.json', 'errata-r1.json (E6)', 'adjudication-r1.json (D1-D9)', 'next-task.json', 'review-r2/executor-disposition.json',
                               'ledger-delta-cont-d9ef.md', 'lead-secret-scan-triage.json', 'post-review-r2-changes.json', 'unit-manifest.json',
                               'commit-receipt.json']
    st['updated_at'] = now()
    save('state.json', st)

    err = jload('errata-r1.json')
    for row in err['rows']:
        if row['id'] == 'E6':
            row['read_as'] = ('instante da drenagem, não o do evento inotify, em ns monotônicos desde o t0 da tentativa (result.json t0_monotonic_ns), '
                              'a mesma base de actions[].t_ns e recv_ns (correção R2-F03)')
    err['amended'] = {'by': 'tools/close_r2.py', 'finding': 'review-r2 R2-F03', 'at': now()}
    save('errata-r1.json', err)

    ad = jload('adjudication-r1.json')
    ad['deviations'] = [{'id': d['id'], 'item': d['item'], 'finding': d['finding'], 'decision': adj.DEVIATION_DECISIONS[d['id']][0],
                         'why': adj.DEVIATION_DECISIONS[d['id']][1]} for d in rep.DEVIATIONS]
    ad['amended'] = {'by': 'tools/close_r2.py', 'finding': 'review-r2 R2-F01, R2-F02', 'at': now(), 'outcomes_changed': False}
    save('adjudication-r1.json', ad)

    nt = jload('next-task.json')
    nt['previous_review'] = 'R1 REVISE (1 P2, 11 P3) -> reparo agrupado offline -> R2 APPROVE (0 obrigatórios, 5 P3: review-r2/executor-disposition.json)'
    save('next-task.json', nt)

    save('review-r2/executor-disposition.json', {
        'kind': 'EXECUTOR_DISPOSITION_R2', 'review': 'review-r2/review.json', 'verdict': 'APPROVE', 'mandatory': 0,
        'dispositions': [{'id': k, 'severity': 'P3', 'status': v[0], 'action': v[1]} for k, v in DISPOSITION.items()],
        'outcomes_changed': False, 'services': 0, 'written_at': now()})
    print(json.dumps({'status': st['status'], 'deviations': [d['id'] for d in rep.DEVIATIONS],
                      'adjudication': [[d['id'], d['decision']] for d in ad['deviations']]}, ensure_ascii=False))


def validation(path):
    st = jload('state.json')
    st['validation'] = json.loads(Path(path).read_text())
    st['updated_at'] = now()
    save('state.json', st)
    print('validation recorded')


if __name__ == '__main__':
    if len(sys.argv) == 2 and sys.argv[1] == 'apply':
        apply()
    elif len(sys.argv) == 3 and sys.argv[1] == 'validation':
        validation(sys.argv[2])
    else:
        print(__doc__)
        sys.exit(2)
