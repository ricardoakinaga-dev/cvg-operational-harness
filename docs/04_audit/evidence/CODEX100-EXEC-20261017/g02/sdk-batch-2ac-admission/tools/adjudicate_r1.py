"""Offline adjudication after repair R1 (no service, no SDK). Run: python3 -I -B tools/adjudicate_r1.py -> adjudication-r1.json

Final reading of the 9 slots from the service acceptance.json (r4), checked against the offline reevaluation r4 (reevaluation-r4.json),
plus the decisions on the deviations D1-D6 of state.json. The evaluator did not change in the repair, so nothing is rewritten.
"""
import datetime
import json
from pathlib import Path

U = Path(__file__).resolve().parent.parent
TASK = 'DX100-G02:IMPLEMENT-AND-ADMIT-SDK-SOURCE-BATCH-2A-CONTINUATION'


def jload(rel):
    return json.loads((U / rel).read_text())


QUALIFY = {
    '2A-TS03R': 'Reexecução do 2A-TS03 com o case_input do slot congelado (F4-01); substitui o 2A-TS03 na regra de coverage-plan-2a-cont.json.',
    '2A-TS06R': 'Reexecução do 2A-TS06 com o case_input do slot congelado (F4-01); substitui o 2A-TS06 (TS05 e TS06) na regra do plano.',
    '2A-TS07R': ('Reexecução do 2A-TS07 com o case_input do slot congelado (F4-01); substitui o 2A-TS07. O case_input tem dois floats (errata E7, '
                 'sem efeito: os três papéis relataram o sha congelado).'),
    '2A-TS12R': ('Forma PREFRAME_TERMINATION (observer NO_CHILD -> R4-03): existência do filho testemunhada pelo SO (1 IN_OPEN do executável do '
                 'adapter na janela, sem falha de spawn, sem sobrevivente); término NOT_WITNESSED (abort.os_witness_recorded_r4). Consome só o '
                 'braço TS12.B01 (sinal pré-abortado) como fato do cliente: AbortError ABORT_ERR, nenhum yield depois do aborto, nenhuma parada '
                 'remota afirmada. A linha TS12 do plano não tem replaces: o 2A-TS12 (INVALID_CAPTURE na r3.1) segue não consumido e o braço '
                 'TS12.B01 é alvo deste caso.'),
    '2A-TS10E': ('Braço TS10.B04 forma B: exatamente um uncaughtException EPIPE (syscall write) antes do CALLS_DONE e o resultado vazio do run; '
                 'a origem no child.stdin é inferida (R1-F05), reproduzida pelo DIAG-TS-EPIPE com código próprio.'),
    '2A-TS06X': 'Caso novo de ramos do TS06 (marcadores F4-08).',
    '2A-TS07X': 'Caso novo de ramos do TS07.',
    '2A-TS08X': 'Caso novo de ramos do TS08.',
}

DEVIATION_DECISIONS = {
    'D1': ('ACCEPTED', 'A evidência em serviço do DIAG-TS-EPIPE cobre o que o autoteste offline provaria (FAULT depois do READY, nenhuma leitura de stdin, '
                       'STREAM_END com 0 bytes, assert de fd 0) e o adapter fora do sandbox não tem canal; restrição da chave por ID vai ao próximo freeze.'),
    'D2': ('ACCEPTED', 'Mudança feita antes do source-freeze-r4; necessária para a evidência NO_CHILD do R4-03.'),
    'D3': ('ACCEPTED', 'O identity freeze liga os DIAG aprovados e a decisão das vagas condicionais; o source freeze precede todo serviço e os 9 result.json '
                       'conferem os dois freezes. Separação vai ao próximo freeze.'),
    'D4': ('ACCEPTED', ('11 verificações genéricas da r3.1 portadas e aprovadas (selftests/r4_1); os seis genéricos não portados passaram numa cópia '
                        'na revisão R2 e vão ao próximo freeze; os testes específicos de casos 2A não se aplicam às 9 vagas.')),
    'D5': ('ACCEPTED_WITH_CARRY_OVER', 'A ordem do /proc environ registrado é a congelada e os sha de BEGIN conferem; a checagem em ordem vai ao próximo freeze.'),
    'D6': ('ACCEPTED', 'Estado do replay registrado offline (EQUAL, 279 bytes); o status no detalhe de captura vai ao próximo freeze.'),
    'D7': ('ACCEPTED', ('A réplica prova a semântica do Node e o serviço prova um único UNCAUGHT antes do CALLS_DONE nos dois serviços; autoteste '
                        'do driver com canal simulado vai ao próximo freeze.')),
    'D8': ('ACCEPTED', 'A cadeia em serviço, na mesma base de tempo, mostra drenagem antes da liberação e o driver parado até o STEP_RELEASE nas três janelas.'),
    'D9': ('ACCEPTED_WITH_CARRY_OVER', ('A regex TS foi testada por execução e a admissão em serviço foi exata; aceitação e rejeição nas listas Python e '
                                        'constantes do supervisor vão ao próximo freeze.')),
}


def main():
    cr = jload('case-results.json')
    re4 = {r['case']: r for r in jload('reevaluation-r4.json')['cases']}
    plan = jload('inputs/spec-2ac/coverage-plan-2a-cont.json')
    replaces = {}
    for row in plan['rows']:
        for old, new in (row.get('replaces') or {}).items():
            replaces[new] = old
    state = jload('state.json')
    rows = []
    for r in cr['rows']:
        case = r['case']
        rv = re4[case]
        row = {'slot': r['slot'], 'case': case, 'kind': r['kind'], 'service_outcome_r4': r['outcome'], 'offline_outcome_r4': rv['outcome'],
               'offline_equal': bool(rv['predicate_level_equal'] and rv['outcome_equal']), 'rule': r['composition_rule'],
               'failed': r['failed_predicates'], 'capture_reading': r['capture_reading'], 'dir': r['attempt_dir']}
        if r['kind'] == 'CONTROL':
            row.update({'final_reading': 'MISMATCH (CONTROL)', 'attribution': 'CONTROL_GATE', 'client_observation': 'NONE',
                        'bind_rule': 'não consumir; CONTROL só abre o gate',
                        'gate': ('regra 6, failed_predicates só wire.no_turn_interrupt, control.peer_answered_unscripted, control.client_not_blocked e '
                                 'capture.case_input_frozen_bytes aprovados; replay do peer v2 EQUAL (reevaluation-r4_1-peer-replay.json)')})
        else:
            ok = r['outcome'] == 'PASS_CLIENT_OBSERVATION' and row['offline_equal']
            row.update({'final_reading': r['outcome'] if ok else 'NEEDS_REVIEW', 'attribution': 'CLIENT' if ok else None,
                        'client_observation': 'OBSERVED' if ok else 'NONE',
                        'bind_rule': 'consumível pelo BIND segundo coverage-plan-2a-cont.json' if ok else 'não consumir',
                        'replaces_2a_case': replaces.get(case), 'qualification': QUALIFY.get(case)})
        rows.append(row)
    sdk = [x for x in rows if x['kind'] == 'SDK']
    counts = {k: sum(1 for x in sdk if x['final_reading'] == k) for k in ('PASS_CLIENT_OBSERVATION', 'MISMATCH', 'INVALID_CAPTURE', 'INCONCLUSIVE', 'NEEDS_REVIEW')}
    deviations = []
    for d in state['implementation']['deviations']:
        decision, why = DEVIATION_DECISIONS[d['id']]
        deviations.append({'id': d['id'], 'item': d['item'], 'finding': d['finding'], 'decision': decision, 'why': why})
    doc = {'kind': 'ADJUDICATION_R1_OFFLINE', 'task': TASK, 'repair': 'repair-r1.json', 'review': 'review-r1/review.json',
           'rule': ('Leitura final = acceptance.json de serviço (avaliador r4), igual à reavaliação offline r4 predicado a predicado nos 9 diretórios. '
                    'O reparo R1 não mudou o avaliador nem desfecho; nenhum documento de caso é reescrito.'),
           'control': {'case': '2AC-CTRL01', 'outcome': 'MISMATCH', 'gate_passed': True},
           'sdk_final_reading': counts, 'rows': rows,
           'bind_consumes_only': [x['case'] for x in sdk if x['final_reading'] == 'PASS_CLIENT_OBSERVATION'],
           'conditional_slots': {'2A-TS12R': 'RUN e usada (DIAG-TS-ENOENT NO_CHILD e DIAG-TS-PREABORT PREFRAME_TERMINATION aprovados)',
                                 '2A-TS10E': 'RUN e usada (DIAG-TS-EPIPE aprovado)'},
           'deviations': deviations,
           'batch_2a_rows': ('As linhas do lote 2A ficam como registradas (2A-TS03/06/07 MISMATCH_NOT_ATTRIBUTABLE_TO_CLIENT, 2A-TS12 INVALID_CAPTURE); '
                             'o BIND aplica a replacement_rule de coverage-plan-2a-cont.json com os casos R desta unidade.'),
           'functional_receipts': 0, 'parity_credit': 0,
           'note': 'Observação de cliente não é paridade. SPEC0239 BUILD não autorizada.',
           'written_at': datetime.datetime.now(datetime.timezone.utc).isoformat()}
    (U / 'adjudication-r1.json').write_text(json.dumps(doc, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'sdk_final_reading': counts, 'bind_consumes_only': doc['bind_consumes_only'],
                      'deviations': [[d['id'], d['decision']] for d in deviations]}, ensure_ascii=False))


if __name__ == '__main__':
    main()
