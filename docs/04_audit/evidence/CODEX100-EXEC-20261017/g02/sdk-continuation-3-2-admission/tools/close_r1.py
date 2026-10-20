"""Closing after the independent review R1 (offline; no service; no frozen or executed file changes). Run: python3 -I -B tools/close_r1.py

Writes review-r1/executor-disposition.json, adjudication-r1.json and next-task.json and updates state.json (final status,
review, dispositions, budget). Reads DISPOSITION and DECLARED below (one entry per finding and per declared finding of
review-r1/review.json); no case, expectation or outcome changes.
"""
import datetime
import hashlib
import json
from pathlib import Path

U = Path(__file__).resolve().parent.parent
TASK = 'DX100-G02:IMPLEMENT-AND-ADMIT-SDK-SOURCE-CONTINUATION-3-2'
G02 = 'docs/04_audit/evidence/CODEX100-EXEC-20261017/g02/'
REUSE = 'na próxima unidade que reusar python/python-driver.py, python/harness2b.py, python/supervisor.py ou python/acceptance.py'
# finding id -> (status, action), one per finding of review-r1/review.json (R1 APPROVE, 0 P1/P2, 4 P3).
DISPOSITION = {
    'R1-F01': ('CARRIED_OVER', 'Carry-over vinculante %s: (1) registro de threads por threading.local (ou equivalente) no lugar do conjunto de '
                               'idents, com autoteste do driver de dois threads em sequência com ident reusado (correção do DV-C32-01); (2) controle '
                               'negativo do avaliador: zero chamadas com o thread vigiado no THREAD_REGISTRY dá INVALID_CAPTURE pela regra 4; (3) a '
                               'regra de zero chamadas também é recusada quando algum frame (HOOK_EVENT, EXCEPTHOOK_RECORD) traz o thread_name vigiado, '
                               'e o THREAD_REGISTRY publica a mesma união (registro ou vivo) usada no WAIT_RESULT; (4) adjudicação e BIND não creditam '
                               'o guarda "nunca iniciou" do E3-07 nem WAIT_RESULT.thread_started como provados em serviço.' % REUSE),
    'R1-F02': ('RECORDED_FOR_BIND', 'No C3-PY13ER, client_effect_timeout true do passo 12 (acceptance.json) e thread_started false dos passos 11 a 13 '
                                    '(WAIT_RESULT) são artefatos do DV-C32-01 com o DV-C32-03: não houve estouro (0,1 ms) nem efeito do cliente, o thread '
                                    'de cleanup já tinha terminado. Nenhuma atribuição ou leitura de efeito do cliente se apoia neles. Sem reparo.'),
    'R1-F03': ('CARRIED_OVER', 'Carry-over %s: fechar WAIT_APIS na lista do D3-05 (thread.join, hook.wait, excepthook.wait, worker.join, probe.until) '
                               'ou registrar a ampliação a worker.parked e worker.still_parked como desvio justificado; controle negativo do validador '
                               'com wait_class em worker.parked. Nenhum caso do C3-2 usa wait_class nesses passos.' % REUSE),
    'R1-F04': ('RECORDED', 'Texto do DV-C32-04 corrigido na adjudicação: no 2B-2 o worker.join era CLIENT_EFFECT fixo no código do driver, não '
                           'uma linha da tabela CLIENT_EFFECT_WAITS; o C3-PY08 passo 9 declara CLIENT_EFFECT; os passos herdados DIAG-PY-BARRIER 12 '
                           'e 15 e DIAG-PY-BEFOREREPLY 7 foram requalificados como HARNESS_PRECONDITION (direção fail-closed do D3-05). Sem reparo.'),
}
DECLARED = {
    'DV-C32-01': ('CARRIED_OVER', 'Confirmado P3 pela R1, sem efeito em desfecho; correção vinculante no item (1) do R1-F01.'),
    'DV-C32-02': ('CARRIED_OVER', 'Confirmado P3 pela R1; D3-08/R1-F03 cumprido em substância. Carry-over %s: gravar case_plan_file {path, sha256} no '
                                  'profile-manifest.json; autoteste do plan_binding sobre o manifesto real que o supervisor escreve (não sintético); '
                                  'alinhar o docstring do reevaluate ao código de saída (1 quando plan_binding_ok é false) ou separar os dois. '
                                  'Registro para o BIND: plan_binding_content_ok vem de tools/collect_results.py, fora do source freeze, e só vale '
                                  'quando o registro ausente é o único problema.' % REUSE),
}
DV04_CORRECTED = ('Com a tabela CLIENT_EFFECT_WAITS retirada (D3-05), toda espera sem wait_class é HARNESS_PRECONDITION. O worker.join, que no '
                  '2B-2 era CLIENT_EFFECT fixo no código do driver (não na tabela), também passou a HARNESS_PRECONDITION sem o campo; os passos '
                  'herdados DIAG-PY-BARRIER 12 e 15 e DIAG-PY-BEFOREREPLY 7 foram requalificados assim e passaram; o C3-PY08 passo 9 declara '
                  'CLIENT_EFFECT (texto corrigido pelo R1-F04).')


def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def jload(rel):
    return json.loads((U / rel).read_text())


def save(rel, doc):
    (U / rel).write_text(json.dumps(doc, ensure_ascii=False, indent=2) + '\n')


def sha(rel):
    return hashlib.sha256((U / rel).read_bytes()).hexdigest()


def main():
    review = jload('review-r1/review.json')
    findings = review.get('findings', [])
    declared = review.get('declared_findings') or {}
    declared = declared if isinstance(declared, dict) else {d['id']: d for d in declared}
    missing = [f['id'] for f in findings if f['id'] not in DISPOSITION] + [k for k in declared if k not in DECLARED]
    assert not missing, 'findings without disposition: %s' % missing
    blocking = [f['id'] for f in findings if f['severity'] in ('P1', 'P2')] + [k for k, d in declared.items() if d.get('severity') in ('P1', 'P2')]
    t1 = (review.get('erratum_t1') or {}).get('verdict')
    disp = {'kind': 'EXECUTOR_DISPOSITION_R1', 'review': 'review-r1/review.json', 'review_sha256': sha('review-r1/review.json'),
            'verdict': review['verdict'], 'erratum_t1': t1, 'mandatory': len(blocking),
            'rule': ('Revisão aprovada na primeira rodada: nenhum reparo, nenhum serviço e nenhuma fonte, freeze ou evidência executada mudam; os P3 '
                     'ficam registrados ou levados à próxima unidade que reusar o código.') if review['verdict'] == 'APPROVE' else 'REVISE: ver itens obrigatórios',
            'dispositions': [{'id': f['id'], 'severity': f['severity'], 'status': DISPOSITION[f['id']][0], 'action': DISPOSITION[f['id']][1]} for f in findings],
            'declared_dispositions': [{'id': k, 'severity': d.get('severity'), 'status': DECLARED[k][0], 'action': DECLARED[k][1]} for k, d in declared.items()],
            'functional_receipts': 0, 'parity_credit': 0, 'written_at': now()}
    save('review-r1/executor-disposition.json', disp)
    cr = jload('case-results.json')
    rows = []
    for r in cr['rows']:
        if r['kind'] == 'CONTROL':
            rows.append({'slot': r['slot'], 'case': r['case'], 'kind': 'CONTROL', 'outcome': r['outcome'], 'rule': r['composition_rule'],
                         'capture_form': r['capture_form'], 'failed': r['failed_predicates'], 'dir': r['attempt_dir'],
                         'final_reading': 'MISMATCH (CONTROL)', 'attribution': 'CONTROL_GATE', 'client_observation': 'NONE',
                         'bind_rule': 'não consumir; o CONTROL só abre o gate'})
            continue
        row = {'slot': r['slot'], 'case': r['case'], 'kind': 'SDK', 'conditional': r.get('conditional', False), 'outcome': r['outcome'],
               'rule': r['composition_rule'], 'capture_form': r['capture_form'], 'failed': r['failed_predicates'], 'dir': r['attempt_dir'],
               'final_reading': r['outcome'], 'attribution': 'CLIENT' if r['outcome'] == 'PASS_CLIENT_OBSERVATION' else 'PENDING_ADJUDICATION',
               'client_observation': 'OBSERVED' if r['outcome'] == 'PASS_CLIENT_OBSERVATION' else 'NONE',
               'arms_judged': list(dict.fromkeys(a['arm'] for a in r['arm_record'] if all(v is True for v in a['judged_by'].values()))),
               'bind_rule': ('consumível pelo BIND da continuação 3 segundo coverage-plan-c3.json, só nos braços do arm_discrimination congelado '
                             'cujos predicados de julgamento passaram (case-results.json#/rows[]/arm_record); nada além do que o predicado observa')}
        if r['case'] == 'C3-PY13ER':
            row['not_credited'] = ['guarda "nunca iniciou" da regra de zero chamadas do E3-07 (não exercido: o alvo foi chamado uma vez; R1-F01)',
                                   'WAIT_RESULT.thread_started dos passos 11 a 13 e ok do passo 12 (artefatos do DV-C32-01 com o DV-C32-03)',
                                   'acceptance.json client_effect_timeout true do passo 12 (sem estouro nem efeito do cliente; R1-F02)']
        rows.append(row)
    st = jload('state.json')
    re_ = jload('reevaluation-c32.json')
    adj = {'kind': 'ADJUDICATION_R1_OFFLINE', 'task': TASK, 'review': 'review-r1/review.json', 'review_verdict': review['verdict'],
           'rule': ('Leitura final = acceptance.json de serviço (acceptance-r4-c32) nos 14 diretórios, igual à reavaliação offline em predicados e '
                    'desfecho (reevaluation-c32.json); plan_binding cumprido em substância (plano da pasta igual à entrada de case-plan.json ligada '
                    'pelo source freeze, passos de barreira exatos), com o registro case_plan_file ausente (DV-C32-02).'),
           'control': cr['control'], 'sdk_final_reading': {k: v for k, v in cr['sdk_counts'].items() if k != 'NOT_RUN'},
           'conditional_slots': {'C3-PY02': 'RUN depois do DIAG-PY-PROCWITNESS DIAG_PASS (diag-admission-c32.json)'},
           'erratum_t1': {'applied_in': 'C3-PY13ER passos 11, 12 e 13 (CLIENT_EFFECT_UNLESS_ALIVE, D3-05) e python/acceptance.py fault_fired (E3-07)',
                          'review': t1},
           'reevaluation': {'predicate_level_equal': re_['all_predicate_level_equal'], 'outcome_equal': re_['all_outcome_equal'],
                            'plan_binding_ok': re_['all_plan_binding_ok'], 'plan_binding_content_ok': re_['all_plan_binding_content_ok']},
           'rows': rows, 'bind_consumes_only': [r['case'] for r in rows if r['kind'] == 'SDK' and r['client_observation'] == 'OBSERVED'],
           'declared_findings': [{'id': k, 'severity': d.get('severity'), 'review': 'confirmado', 'decision': DECLARED[k][0]} for k, d in declared.items()],
           'deviations': [{'id': d['id'], 'decision': 'ACCEPTED' if review['verdict'] == 'APPROVE' else 'PENDING', 'review': 'R1 %s' % review['verdict'],
                           **({'corrected_text': DV04_CORRECTED} if d['id'] == 'DV-C32-04' else {})}
                          for d in st['implementation']['deviations']],
           'functional_receipts': 0, 'parity_credit': 0, 'note': 'Observação de cliente não é paridade. SPEC0239 BUILD não autorizada.', 'written_at': now()}
    save('adjudication-r1.json', adj)
    c31 = jload('inputs/c31-review/next-task.json')
    carried = [{'id': 'C32-ADM/' + f['id'], 'text': DISPOSITION[f['id']][1]} for f in findings if DISPOSITION[f['id']][0] == 'CARRIED_OVER']
    carried += [{'id': 'C32-ADM/' + k, 'text': DECLARED[k][1]} for k in declared if DECLARED[k][0] == 'CARRIED_OVER']
    carried += [c for c in c31['carry_over'] if c['id'] in ('C31-ADM/R1-F02', 'C31-ADM/R1-F03')]
    record = [{'id': 'C32-ADM/' + f['id'], 'text': DISPOSITION[f['id']][1]} for f in findings if DISPOSITION[f['id']][0] in ('RECORDED_FOR_BIND', 'RECORDED')]
    record += [{'id': 'C32-ADM/DV-C32-01', 'text': 'O PASS do C3-PY13ER vale (R1); o BIND não credita o guarda "nunca iniciou" do E3-07 nem '
                                                   'thread_started (R1-F01 item 4).'},
               {'id': 'C32-ADM/DV-C32-02', 'text': 'plan_binding das 14 pastas do C3-2 cumprido em substância; registro case_plan_file ausente.'}]
    record += c31.get('record_for_bind', [])
    nt = {'task': 'DX100-G02:BIND-SDK-SOURCE-CONTINUATION-3 (proposta; nome e claim definidos pelo Lead)', 'previous_task': TASK,
          'previous_status': 'COMPLETED_LOCAL', 'status': 'READY_PENDING_LEAD_CLAIM', 'track': 'T1 documental (sem serviço, sem rede, sem provider, sem dado real)',
          't3_required': False, 'resume_checkpoint': G02 + 'sdk-continuation-3-2-admission/state.json',
          'inputs': {'c3_1': G02 + 'sdk-continuation-3-1-admission/adjudication-r1.json', 'c3_2': G02 + 'sdk-continuation-3-2-admission/adjudication-r1.json',
                     'coverage_plan': G02 + 'sdk-source-continuation-3-spec/coverage-plan-c3.json',
                     'spec_next_task': G02 + 'sdk-source-continuation-3-spec/next-task.json'},
          'what': ('BIND da continuação 3 (mapa v6 ao lado do v5): consumir as observações de cliente do C3-1 (14 TS) e do C3-2 (13 Python) só nos braços '
                   'do arm_discrimination cujos predicados de julgamento passaram, com os registros abaixo; 0 recibos funcionais e 0 crédito de paridade.'),
          'carry_over': carried, 'record_for_bind': record,
          'after_this': ['pacote de decisão Q1-Q5 (errata do BIND do 2B-2), em paralelo',
                         'itens OUT_NEW_CAPABILITY de coverage-plan-c3.json só com unidade própria que especifique a capacidade'],
          'not_authorized_now': ['rede', 'wheel/npm distribuídos', 'Codex CLI real', 'provider', 'credencial', 'login real', 'dado real', 'push', 'produção',
                                 'testemunha privilegiada (Q4 negada)', 'injeção de falha de fs ou do lado Node, fault novo de adapter', 'SPEC0239 BUILD'],
          'functional_receipts': 0, 'parity_credit': 0, 'created_at': now()}
    save('next-task.json', nt)
    st['status'] = 'COMPLETED_LOCAL' if review['verdict'] == 'APPROVE' else 'REVIEW_REVISE'
    for d in st['implementation']['deviations']:
        if d['id'] == 'DV-C32-04':
            d['corrected_text_r1_f04'] = DV04_CORRECTED
    st['review'] = {'r1': {'path': 'review-r1/review.json', 'subject': 'review-freeze-r1.json', 'subject_sha256': review['subject_sha256'],
                           'verdict': review['verdict'], 'erratum_t1': t1,
                           'findings': {s: sum(1 for f in findings if f['severity'] == s) for s in ('P1', 'P2', 'P3')},
                           'declared_findings': {k: d.get('severity') for k, d in declared.items()},
                           'disposition': 'review-r1/executor-disposition.json'}}
    st['budget']['reviews'] = '1/2'
    st['adjudication'] = 'adjudication-r1.json'
    st['next_task'] = 'next-task.json'
    st['closing_documents'] = ['review-r1/executor-disposition.json', 'adjudication-r1.json', 'next-task.json', 'ledger-delta-cont-d9ef.md',
                               'lead-secret-scan-triage.json', 'post-review-r1-changes.json', 'unit-manifest.json', 'commit-receipt.json']
    st['updated_at'] = now()
    save('state.json', st)
    print(json.dumps({'verdict': review['verdict'], 'findings': len(findings), 'declared': len(declared), 'blocking': blocking,
                      'carry_over': [c['id'] for c in carried], 'record_for_bind': [c['id'] for c in record]}, ensure_ascii=False))


if __name__ == '__main__':
    main()
