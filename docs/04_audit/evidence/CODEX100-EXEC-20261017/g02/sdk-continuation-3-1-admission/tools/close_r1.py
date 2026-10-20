"""Closing after the independent review R1 (offline; no service; no frozen or executed file changes). Run: python3 -I -B tools/close_r1.py

Writes review-r1/executor-disposition.json, adjudication-r1.json and next-task.json and updates state.json (final status,
review, dispositions, budget). Reads DISPOSITION below (one entry per finding of review-r1/review.json); no case, expectation or
outcome changes.
"""
import datetime
import hashlib
import json
from pathlib import Path

U = Path(__file__).resolve().parent.parent
TASK = 'DX100-G02:IMPLEMENT-AND-ADMIT-SDK-SOURCE-CONTINUATION-3-1'
SPEC_NEXT = 'docs/04_audit/evidence/CODEX100-EXEC-20261017/g02/sdk-source-continuation-3-spec/next-task.json'
# finding id -> (status, action), one per finding of review-r1/review.json (R1 APPROVE, 0 P1/P2, 4 P3).
DISPOSITION = {
    'R1-F01': ('CARRIED_OVER', 'Testemunha do SO do término por SIGTERM: na próxima unidade que reusar o rastreador (C3-2: python/acceptance.py '
                               'termination_form; tslane/acceptance.py os_sigterm se reusado), aceitar zombie_exit_code == 15 ou (zombie_exit_code None e '
                               'PID ausente), nunca ausência depois de um zombie com outro status; autoteste negativo (zombie 9 seguido de ausência falha). '
                               'Registro para o BIND: o item (2) dos PASS do C3-TS04 e do C3-TS12 se apoia em zombie 15 observado (o C3-TS13 também); '
                               'nenhum desfecho muda.'),
    'R1-F02': ('CARRIED_OVER', 'Sonda getter_listing_error_recorded de vocabularyProbes (node/ts-driver.mjs): ler a propriedade num try próprio e exigir '
                               'value 1, error EACCES e entries null sem exceção, para que um vazamento dê false; no autoteste do driver e no check do DIAG da '
                               'próxima unidade que reusar o driver. O código congelado está correto e o avaliador é discriminante (R1).'),
    'R1-F03': ('CARRIED_OVER', 'Vocabulário fechado também nas subchaves: expect {throws, spawns}, throw {name, message}, witness da barreira, $REPEAT e '
                               '$INSTANCE; mutate só sobre nomes guardados por options_as; uma regra única de ZERO_SPAWN (expect.spawns 0) no driver, no plano e '
                               'no validador; controles negativos. Na próxima unidade que reusar o interpretador TS; sem efeito nos 14 slots congelados.'),
    'R1-F04': ('RECORDED_FOR_BIND', 'DV2 completado: a barreira SUSPENDED com adapter vivo (inclusive a espera do mapeamento do adapter no supervisor) foi '
                                    'exercida só pelo slot C3-TS04, não pelo DIAG-TS-C3VOCAB (lá adapter_alive false por desenho). O BIND registra isso; '
                                    'se o C3-2 ou um perfil futuro reusar SUSPENDED com filho real, qualificar esse ramo num DIAG com filho próprio antes dos '
                                    'slots. Sem recaptura.'),
}


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
    missing = [f['id'] for f in findings if f['id'] not in DISPOSITION]
    assert not missing, 'findings without disposition: %s' % missing
    blocking = [f['id'] for f in findings if f['severity'] in ('P1', 'P2')]
    disp = {'kind': 'EXECUTOR_DISPOSITION_R1', 'review': 'review-r1/review.json', 'review_sha256': sha('review-r1/review.json'),
            'verdict': review['verdict'], 'erratum_r2_f01': (review.get('erratum_r2_f01') or {}).get('verdict'), 'mandatory': len(blocking),
            'rule': ('Revisão aprovada na primeira rodada: nenhum reparo, nenhum serviço e nenhuma fonte, freeze ou evidência executada mudam; os P3 '
                     'ficam registrados ou levados à próxima unidade.') if review['verdict'] == 'APPROVE' else 'REVISE: ver itens obrigatórios',
            'dispositions': [{'id': f['id'], 'severity': f['severity'], 'status': DISPOSITION[f['id']][0], 'action': DISPOSITION[f['id']][1]} for f in findings],
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
        rows.append({'slot': r['slot'], 'case': r['case'], 'kind': 'SDK', 'outcome': r['outcome'], 'rule': r['composition_rule'],
                     'capture_form': r['capture_form'], 'failed': r['failed_predicates'], 'dir': r['attempt_dir'],
                     'final_reading': r['outcome'], 'attribution': 'CLIENT' if r['outcome'] == 'PASS_CLIENT_OBSERVATION' else 'PENDING_ADJUDICATION',
                     'client_observation': 'OBSERVED' if r['outcome'] == 'PASS_CLIENT_OBSERVATION' else 'NONE',
                     'arms_judged': [a['arm'] for a in r['arm_record'] if all(v is True for v in a['judged_by'].values())],
                     'bind_rule': ('consumível pelo BIND da continuação 3 segundo coverage-plan-c3.json, só nos braços do arm_discrimination congelado '
                                   'cujos predicados de julgamento passaram (case-results.json#/rows[]/arm_record); nada além do que o predicado observa')})
    adj = {'kind': 'ADJUDICATION_R1_OFFLINE', 'task': TASK, 'review': 'review-r1/review.json', 'review_verdict': review['verdict'],
           'rule': ('Leitura final = acceptance.json de serviço (acceptance-r4-c31-ts nos 14 slots TS, acceptance-r4-c31-py no CONTROL), igual à '
                    'reavaliação offline nos 15 diretórios com plan_binding (reevaluation-c31.json).'),
           'control': cr['control'], 'sdk_final_reading': {k: v for k, v in cr['sdk_counts'].items() if k != 'NOT_RUN'},
           'erratum_r2_f01': {'applied_in': 'tslane/acceptance.py node_abort_termination', 'review': (review.get('erratum_r2_f01') or {}).get('verdict'),
                              'order': 'registrada em acceptance.json#/predicates[abort.child_terminated_by_node_abort]/detail/order_recorded_not_judged, não julgada'},
           'rows': rows, 'bind_consumes_only': [r['case'] for r in rows if r['kind'] == 'SDK' and r['client_observation'] == 'OBSERVED'],
           'deviations': [{'id': d['id'], 'decision': 'ACCEPTED' if review['verdict'] == 'APPROVE' else 'PENDING', 'review': 'R1 %s' % review['verdict']}
                          for d in jload('state.json')['implementation']['deviations']],
           'functional_receipts': 0, 'parity_credit': 0, 'note': 'Observação de cliente não é paridade. SPEC0239 BUILD não autorizada.', 'written_at': now()}
    save('adjudication-r1.json', adj)
    nt = {'task': 'DX100-G02:IMPLEMENT-AND-ADMIT-SDK-SOURCE-CONTINUATION-3-2 (proposta; nome e claim definidos pelo Lead)', 'previous_task': TASK,
          'previous_status': 'COMPLETED_LOCAL', 'status': 'READY_PENDING_LEAD_CLAIM',
          'track': 'T1 com execução local contida (serviços transientes próprios, sem rede, sem provider, sem dado real)', 't3_required': False,
          'resume_checkpoint': 'docs/04_audit/evidence/CODEX100-EXEC-20261017/g02/sdk-continuation-3-1-admission/state.json',
          'spec': {'next_task_of_the_spec': SPEC_NEXT, 'cases_c3_2': 'docs/04_audit/evidence/CODEX100-EXEC-20261017/g02/sdk-source-continuation-3-spec/cases-c3-2.json',
                   'budget_c3_2': 'docs/04_audit/evidence/CODEX100-EXEC-20261017/g02/sdk-source-continuation-3-spec/execution-budget-c3-2.json'},
          'what': ('Sub-lote C3-2 (14 vagas: 13 Python + C32-CTRL01; 10 serviços) com D3-04, D3-05 e D3-08 e as cláusulas E3 do C3-2, conforme '
                   'next-task.json da especificação; carry-overs C3-SPEC/R2-F03 e R2-F04.'),
          'reuse_from_c3_1': ['python/channel.py (D3-01 já aceita C3-PY* e C32-CTRL01)', 'python/control-client.py (C32-CTRL01)',
                              'python/acceptance.py com R1-F02 e plan_binding (R1-F03) e autoteste R1-F04 já aplicados'],
          'carry_over': [{'id': 'C31-ADM/' + f['id'], 'text': DISPOSITION[f['id']][1]} for f in findings if DISPOSITION[f['id']][0] == 'CARRIED_OVER'],
          'record_for_bind': [{'id': 'C31-ADM/' + f['id'], 'text': DISPOSITION[f['id']][1]} for f in findings if DISPOSITION[f['id']][0] == 'RECORDED_FOR_BIND'],
          'after_this': ['BIND da continuação 3 (mapa v6 ao lado do v5)', 'pacote de decisão Q1-Q5 em paralelo'],
          'not_authorized_now': ['rede', 'wheel/npm distribuídos', 'Codex CLI real', 'provider', 'credencial', 'login real', 'dado real', 'push', 'produção',
                                 'testemunha privilegiada (Q4 negada)', 'injeção de falha de fs ou do lado Node, fault novo de adapter', 'SPEC0239 BUILD'],
          'functional_receipts': 0, 'parity_credit': 0, 'created_at': now()}
    save('next-task.json', nt)
    st = jload('state.json')
    st['status'] = 'COMPLETED_LOCAL' if review['verdict'] == 'APPROVE' else 'REVIEW_REVISE'
    st['review'] = {'r1': {'path': 'review-r1/review.json', 'subject': 'review-freeze-r1.json', 'subject_sha256': review['subject_sha256'],
                           'verdict': review['verdict'], 'erratum_r2_f01': (review.get('erratum_r2_f01') or {}).get('verdict'),
                           'findings': {s: sum(1 for f in findings if f['severity'] == s) for s in ('P1', 'P2', 'P3')},
                           'disposition': 'review-r1/executor-disposition.json'}}
    st['budget']['reviews'] = '1/2'
    st['adjudication'] = 'adjudication-r1.json'
    st['next_task'] = 'next-task.json'
    st['closing_documents'] = ['review-r1/executor-disposition.json', 'adjudication-r1.json', 'next-task.json', 'ledger-delta-cont-d9ef.md',
                               'lead-secret-scan-triage.json', 'post-review-r1-changes.json', 'unit-manifest.json', 'commit-receipt.json']
    st['updated_at'] = now()
    save('state.json', st)
    print(json.dumps({'verdict': review['verdict'], 'findings': len(findings), 'blocking': blocking}))


if __name__ == '__main__':
    main()
