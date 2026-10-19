"""Grouped repair 1 after review R1 (offline; no service, no SDK). Run: python3 -I tools/repair_r1.py

Writes adjudication-r1.json (final reading of the 24 slots: service outcome r3, offline outcome r3.1, attribution and
what the BIND may consume), reevaluation-r3_1.json (each case directory re-judged with r3.1 and compared predicate by
predicate with its acceptance-r3_1.json) and adds the adjudicated columns to case-results.json (preimage archived in
archives/review-r1-preimages/). The service acceptance.json files are never rewritten (R3-09).
"""
import datetime
import importlib.util
import json
from pathlib import Path

U = Path(__file__).resolve().parent.parent
OUTCOMES = ('PASS_CLIENT_OBSERVATION', 'MISMATCH', 'INVALID_CAPTURE', 'INCONCLUSIVE')
ORDER_MISMATCH = {'2A-TS03': 'fixture.schema_bytes_exact', '2A-TS06': 'argv.exact_vector', '2A-TS07': 'argv.exact_vector'}
WIRE_ORDER_QUALIFIED = {'2A-TS04': 'stdout do fixture', '2A-TS14': 'stdout do fixture', '2A-TS15': 'stdout do fixture',
                        '2A-PY03': 'respostas do peer v2', '2A-PY08': 'respostas e notificações do peer v2', '2A-PY15': 'respostas e notificações do peer v2',
                        '2A-TS09': 'ordem das chaves do environ do adapter', '2A-CTRL01': 'linhas do cliente de controle'}


def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def main():
    spec = importlib.util.spec_from_file_location('repair_acceptance', U / 'python' / 'acceptance.py')
    acc_mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(acc_mod)
    ledger = json.loads((U / 'case-ledger.json').read_text())
    cases = {c['id']: c for c in json.loads((U / 'inputs' / 'spec-2a' / 'cases-2a.json').read_text())['cases']}
    rows, reevals = [], []
    for cid in sorted(cases, key=lambda c: cases[c]['slot']):
        d = U / 'cases' / ('%s-%s' % (cid, ledger['slots'][cid]['attempt'][:12]))
        svc = json.loads((d / 'acceptance.json').read_text())
        r31 = json.loads((d / 'acceptance-r3_1.json').read_text())
        reevals.append(acc_mod.reevaluate(d))
        row = {'case': cid, 'kind': cases[cid]['kind'], 'service_outcome_r3': svc['outcome'], 'offline_outcome_r3_1': r31['outcome'],
               'r3_1_rule': r31['composition_rule'], 'r3_1_failed': [[x['id'], x['class']] for x in r31['predicates'] if not x['ok']],
               'differences_r3_vs_r3_1': [x['reevaluated'][0] if 'reevaluated' in x else x for x in r31['service_document']['differences']],
               'dir': d.relative_to(U).as_posix()}
        if cid in ORDER_MISMATCH:
            row.update({'final_reading': 'MISMATCH_NOT_ATTRIBUTABLE_TO_CLIENT', 'attribution': 'HARNESS_INPUT_DELIVERY',
                        'client_observation': 'NONE', 'bind_rule': 'não consumir como fato de cliente, nem PASS nem divergência; braço de ordem de inserção OPEN',
                        'why': ('MISMATCH bruto preservado (R3-09): %s falhou porque o case_input foi entregue com chaves em ordem de code point; a observação é '
                                'exatamente a derivação congelada com essa ordem (input-order-errata.json). O caso não rodou com a entrada congelada.') % ORDER_MISMATCH[cid]})
        elif cid == '2A-TS12':
            row.update({'final_reading': 'INVALID_CAPTURE', 'attribution': 'CAPTURE_WITNESS',
                        'client_observation': 'NONE', 'bind_rule': 'não consumir; braço TS12.B01 (aborto e término do filho) OPEN',
                        'why': ('r3.1 (R1-F02): abort.os_witness_recorded falha, regra 4. A forma NO_CHILD do observer é mais ampla que R3-10: o erro do cliente '
                                '(AbortError ABORT_ERR de abortChildProcess, sem ENOENT) indica filho criado e morto por SIGTERM antes do primeiro quadro, e o SO '
                                'não testemunhou existência nem término. abort.no_remote_stop_claim e abort.no_yield_after_abort passaram, mas sob INVALID ficam '
                                'só informativos.')})
        elif r31['outcome'] == 'PASS_CLIENT_OBSERVATION':
            row.update({'final_reading': 'PASS_CLIENT_OBSERVATION', 'attribution': 'CLIENT', 'client_observation': 'OBSERVED',
                        'bind_rule': 'consumível pelo BIND segundo coverage-plan-2a.json'})
            if cid in WIRE_ORDER_QUALIFIED:
                row['qualification'] = ('observado com %s de mesmo valor e chaves em ordem de code point (input-order-errata-addendum-r1.json); '
                                        'nenhum predicado deste caso depende da ordem de chaves' % WIRE_ORDER_QUALIFIED[cid])
        elif cid == '2A-CTRL01':
            row.update({'final_reading': 'MISMATCH', 'attribution': 'CONTROL_GATE', 'client_observation': 'NOT_SDK',
                        'bind_rule': 'gate R3-07 atendido; nunca conta como observação do SDK',
                        'qualification': 'linhas do cliente de controle com chaves em ordem de code point; o known-bad é julgado pelo método (wire.no_turn_interrupt)'})
        else:
            row.update({'final_reading': r31['outcome'], 'attribution': 'UNADJUDICATED', 'client_observation': 'NONE', 'bind_rule': 'não consumir'})
        rows.append(row)
    sdk = [r for r in rows if r['kind'] == 'SDK']
    counts_r3 = {o: sum(1 for r in sdk if r['service_outcome_r3'] == o) for o in OUTCOMES}
    counts_r31 = {o: sum(1 for r in sdk if r['offline_outcome_r3_1'] == o) for o in OUTCOMES}
    final = {'PASS_CLIENT_OBSERVATION': sum(1 for r in sdk if r['final_reading'] == 'PASS_CLIENT_OBSERVATION'),
             'MISMATCH_ATTRIBUTABLE_TO_CLIENT': sum(1 for r in sdk if r['final_reading'] == 'MISMATCH'),
             'MISMATCH_NOT_ATTRIBUTABLE_TO_CLIENT': sum(1 for r in sdk if r['final_reading'] == 'MISMATCH_NOT_ATTRIBUTABLE_TO_CLIENT'),
             'INVALID_CAPTURE': sum(1 for r in sdk if r['final_reading'] == 'INVALID_CAPTURE'),
             'INCONCLUSIVE': sum(1 for r in sdk if r['final_reading'] == 'INCONCLUSIVE')}
    adj = {'kind': 'ADJUDICATION_R1_OFFLINE', 'task': 'DX100-G02:IMPLEMENT-AND-ADMIT-SDK-SOURCE-BATCH-2A', 'repair': 'repair-r1.json',
           'findings': ['R1-F01', 'R1-F02', 'R1-F03', 'R1-F04'], 'rule': ('Leitura final = r3.1 offline (evaluator-freeze-r3_1.json), exceto 2A-TS03/06/07, '
                                                                          'que ficam MISMATCH bruto não atribuível ao cliente. O acceptance.json de serviço (r3) não é reescrito.'),
           'sdk_counts_service_r3': counts_r3, 'sdk_counts_offline_r3_1': counts_r31, 'sdk_final_reading': final,
           'control': [r for r in rows if r['kind'] == 'CONTROL'][0]['final_reading'], 'rows': rows,
           'bind_consumes_only': [r['case'] for r in sdk if r['client_observation'] == 'OBSERVED'],
           'functional_receipts': 0, 'parity_credit': 0, 'adjudicated_at': now()}
    (U / 'adjudication-r1.json').write_text(json.dumps(adj, ensure_ascii=False, indent=2) + '\n')
    (U / 'reevaluation-r3_1.json').write_text(json.dumps({
        'kind': 'OFFLINE_REEVALUATION_R3_1', 'command': 'python3 -I python/acceptance.py reevaluate <case-dir> (via tools/repair_r1.py)',
        'compared_with': 'acceptance-r3_1.json de cada diretório',
        'all_predicate_level_equal': all(r['predicate_level_equal'] for r in reevals), 'all_outcome_equal': all(r['outcome_equal'] for r in reevals),
        'cases': reevals, 'collected_at': now()}, ensure_ascii=False, indent=2) + '\n')
    cr = json.loads((U / 'case-results.json').read_text())
    by = {r['case']: r for r in rows}
    for r in cr['rows']:
        a = by[r['case']]
        r.update({'offline_outcome_r3_1': a['offline_outcome_r3_1'], 'final_reading': a['final_reading'], 'attribution': a['attribution'],
                  'client_observation': a['client_observation'], 'bind_rule': a['bind_rule']})
        if 'qualification' in a:
            r['qualification'] = a['qualification']
    cr['sdk_counts_note'] = 'sdk_counts = desfechos de serviço (acceptance-r3); a leitura final é sdk_final_reading (adjudication-r1.json).'
    cr['sdk_counts_offline_r3_1'] = counts_r31
    cr['sdk_final_reading'] = final
    cr['adjudication'] = 'adjudication-r1.json'
    cr['repaired_at'] = now()
    (U / 'case-results.json').write_text(json.dumps(cr, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'r3': counts_r3, 'r3_1': counts_r31, 'final': final,
                      'reeval_equal': all(r['predicate_level_equal'] and r['outcome_equal'] for r in reevals)}, ensure_ascii=False))


if __name__ == '__main__':
    main()
