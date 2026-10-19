"""Closing after review R1 = APPROVE (offline; no service; no frozen or executed file changes). Run: python3 -I -B tools/close_r1.py

Writes review-r1/executor-disposition.json, adjudication-r1.json and next-task.json and updates state.json (final status,
review, R2-F01 closed by the explicit approval, DV8, registry fixes R1-F03/R1-F06, carry-over to the 2B-2).
"""
import datetime
import json
from pathlib import Path

U = Path(__file__).resolve().parent.parent
TASK = 'DX100-G02:IMPLEMENT-AND-ADMIT-SDK-SOURCE-BATCH-2B-1'


def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def jload(rel):
    return json.loads((U / rel).read_text())


def save(rel, doc):
    (U / rel).write_text(json.dumps(doc, ensure_ascii=False, indent=2) + '\n')


DISPOSITION = {
    'R1-F01': ('CARRIED_OVER_2B2', 'Condição de barreira por gancho com (id, event, occurrence, record_subset), autoteste positivo e negativo; '
                                   'pré-requisito dos passos 10 e 16 do 2B-PY13D. Sem efeito no 2B-1 (conferido pela revisão).'),
    'R1-F02': ('CARRIED_OVER_2B2', 'Recontagem independente da ocorrência por (id, event) no avaliador ou no observador; validador recusando token '
                                   'HOOK de gancho call+return ou não declarado; autoteste R2-F01 passando pelo profiler com threads nomeadas.'),
    'R1-F03': ('FIXED_TEXT_AND_CARRIED_OVER_2B2', 'state.json corrigido: o validador confere @threadId só de RELEASE_REPLY; a conferência de '
                                                  '@threadId de RAW_READ/COMMIT_REPLY e as regras completas sobre cases-2b-2.json vão para a IMPLEMENT do 2B-2.'),
    'R1-F04': ('RECORDED_DV8', 'Desvio DV8 registrado: o classificador aceita peer encerrado por END próprio (peer que já saiu pelo roteiro antes do '
                               'sinal); nos dados o peer terminou por SIGTERM nos quatro casos; estreitamento possível no 2B-2.'),
    'R1-F05': ('CARRIED_OVER_2B2', 'Três checagens a acrescentar ao avaliador (condições por ação do plano, zombie_t_ns em no_termination_before, '
                                   'marco BEFORE_REPLY_WRITTEN antes do commit da resposta); conferidas à mão pela revisão nos dados do 2B-1.'),
    'R1-F06': ('RECORDED', 'state.json registra que a testemunha "peer RECEIVED turn/start = 1" do passo 9 do 2B-PY11B é registro (valor 1), não gatilho.'),
    'R1-F07': ('CARRIED_OVER_2B2', 'Roteiro do 2B2-CTRL01 no autoteste do D2B-13 (depende do login sintético do 2B-2); R3-12 conferindo CAPTURE_CLASSES '
                                   'e client contra predicate_classes congelado.'),
    'R1-F08': ('CARRIED_OVER_2B2', 'hook.code_identity conferindo o sha do arquivo contra identity-freeze antes de ler a linha (ou linhas guardadas em U); '
                                   'sem drift no 2B-1 (22 arquivos e 7 âncoras conferidos pela revisão).'),
}

DV8 = {'id': 'DV8', 'item': 'E2B-03 / CAP-2B-PROC-WITNESS', 'finding': 'R1-F04',
       'text': ('O classificador CLIENT_TERMINATED_SIGTERM aceita peer encerrado pelo sinal repassado ou por END próprio (peer que já saiu pelo '
                'roteiro antes do sinal). Nos dados (2B-PY01A, 2B-PY01D, 2B-PY02A, DIAG-PY-CLOSETERM) o peer terminou por SIGTERM.')}


def main():
    review = jload('review-r1/review.json')
    assert review['verdict'] == 'APPROVE' and review['r2_f01']['verdict'] == 'APPROVED'
    assert sorted(f['id'] for f in review['findings']) == sorted(DISPOSITION) and all(f['severity'] == 'P3' for f in review['findings'])
    save('review-r1/executor-disposition.json', {
        'kind': 'EXECUTOR_DISPOSITION_R1', 'review': 'review-r1/review.json', 'verdict': 'APPROVE', 'r2_f01': 'APPROVED', 'mandatory': 0,
        'rule': 'Revisão aprovada na primeira rodada: nenhum reparo, nenhum serviço e nenhuma fonte, freeze ou evidência executada mudam; '
                'os P3 ficam registrados ou levados à IMPLEMENT do 2B-2.',
        'dispositions': [{'id': k, 'severity': 'P3', 'status': v[0], 'action': v[1]} for k, v in DISPOSITION.items()],
        'outcomes_changed': False, 'services': 0, 'written_at': now()})
    cr = jload('case-results.json')
    da = jload('diag-admission-2b1.json')
    st = jload('state.json')
    rows = []
    for r in cr['rows']:
        row = {'slot': r['slot'], 'case': r['case'], 'kind': r['kind'], 'conditional': r['conditional'], 'outcome': r['outcome'],
               'rule': r['composition_rule'], 'capture_form': r['capture_form'], 'failed': r['failed_predicates'], 'dir': r['attempt_dir']}
        if r['kind'] == 'CONTROL':
            row.update({'final_reading': 'MISMATCH (CONTROL)', 'attribution': 'CONTROL_GATE', 'client_observation': 'NONE',
                        'bind_rule': 'não consumir; o CONTROL só abre o gate'})
        else:
            ok = r['outcome'] == 'PASS_CLIENT_OBSERVATION'
            row.update({'final_reading': r['outcome'], 'attribution': 'CLIENT' if ok else None, 'client_observation': 'OBSERVED' if ok else 'NONE',
                        'bind_rule': 'consumível pelo BIND segundo coverage-plan-2b.json (linhas do 2B-1)' if ok else 'não consumir'})
        rows.append(row)
    sdk = [x for x in rows if x['kind'] == 'SDK']
    deviations = list(st['implementation']['deviations']) + [DV8]
    adj = {'kind': 'ADJUDICATION_R1_OFFLINE', 'task': TASK, 'review': 'review-r1/review.json', 'review_verdict': 'APPROVE',
           'rule': 'Leitura final = acceptance.json de serviço (acceptance-r4-2b1), igual à reavaliação offline em todos os 16 diretórios '
                   '(reevaluation-2b1.json) e reproduzida pela revisão também com a ordem de emissão no lugar do gidx.',
           'control': cr['control'], 'sdk_final_reading': {'PASS_CLIENT_OBSERVATION': sum(1 for x in sdk if x['final_reading'] == 'PASS_CLIENT_OBSERVATION'),
                                                           'MISMATCH': 0, 'INVALID_CAPTURE': 0, 'INCONCLUSIVE': 0},
           'rows': rows, 'bind_consumes_only': [x['case'] for x in sdk if x['final_reading'] == 'PASS_CLIENT_OBSERVATION'],
           'conditional_slots': {'2B-PY02A': da['procwitness_slots']['decision'], '2B-PY02B': da['procwitness_slots']['decision'],
                                 '2B-PY02K': da['killwait_slot']['decision'], 'used': True,
                                 't3_contingent': 'não ativada: a leitura de /proc do mesmo usuário funcionou sem privilégio; nenhuma capability concedida'},
           'deviations': [{'id': d['id'], 'item': d['item'], 'decision': 'ACCEPTED', 'review': 'aceito pela R1' if d['id'] != 'DV8' else 'registrado por R1-F04'}
                          for d in deviations],
           'r2_f01': {'status': 'CLOSED', 'by': 'implementação no driver, no quadro HOOK_EVENT e no avaliador + autoteste positivo e negativo contra o '
                                                'expected.hooks do 2B-PY13D + validador com controle negativo; aprovação explícita da R1 (review-r1/review.json#/r2_f01)',
                      'gate_for_2B_2': 'aberto quanto ao R2-F01 (nenhuma errata T1 necessária); o 2B-2 também exige o 2B-1 admitido'},
           'functional_receipts': 0, 'parity_credit': 0, 'note': 'Observação de cliente não é paridade. SPEC0239 BUILD não autorizada.', 'written_at': now()}
    save('adjudication-r1.json', adj)
    carry = [{'finding': k, 'text': v[1]} for k, v in DISPOSITION.items() if v[0].startswith(('CARRIED', 'FIXED_TEXT_AND_CARRIED'))]
    carry += [{'finding': 'spec R2-F05', 'text': 'FORBIDDEN_LOGIN_KEYS enumerada no código e no contrato da IMPLEMENT do 2B-2 (CAP-2B-PEER-LOGIN).'},
              {'finding': 'continuação R1-F03/R1-F04', 'text': 'environ em ordem e status do replay do peer v2 no detalhe de captura (mantidos).'}]
    st['status'] = 'COMPLETED_LOCAL'
    st['implementation']['deviations'] = deviations
    st['carry_over_spec_r2']['R2-F01'] = ('FECHADO: implementado (driver HookSet, quadro HOOK_EVENT, avaliador), autoteste positivo e negativo contra o '
                                          'expected.hooks congelado do 2B-PY13D, validador com controle negativo; aprovado explicitamente pela R1 (review-r1/review.json#/r2_f01).')
    st['carry_over_spec_r2']['R2-F07'] = ('IMPLEMENTADO EM PARTE: tools/validate_unit.py confere WORKER, métodos de RAW_READ/COMMIT_REPLY/RELEASE_REPLY contra '
                                          'peer_script e hold, @threadId de RELEASE_REPLY, passo de CANCEL, guarda de excepthook e regra de ocorrência, cada um com '
                                          'controle negativo; @threadId de RAW_READ/COMMIT_REPLY e as regras completas sobre cases-2b-2.json vão para o 2B-2 (R1-F03).')
    st['carry_over_spec_r2']['R2-F04'] += (' No 2B-PY11B, a testemunha do supervisor "peer RECEIVED turn/start = 1" do passo 9 é registro e não gatilho '
                                           '(valor observado 1, result.json#/barrier_log), coerente com R2-F04 (R1-F06).')
    st['review'] = {'r1': {'path': 'review-r1/review.json', 'subject': 'review-freeze-r1.json', 'subject_sha256': review['subject_sha256'],
                           'verdict': 'APPROVE', 'r2_f01': 'APPROVED', 'findings': {'P1': 0, 'P2': 0, 'P3': 8},
                           'disposition': 'review-r1/executor-disposition.json'}}
    st['adjudication'] = {'path': 'adjudication-r1.json', 'sdk_final_reading': adj['sdk_final_reading'], 'bind_consumes_only': len(adj['bind_consumes_only'])}
    st['next_task'] = {'path': 'next-task.json', 'task': 'DX100-G02:BIND-SDK-SOURCE-BATCH-2B-1 (proposta)', 't3_required': False}
    st['carry_over_2b2'] = carry
    st['budget']['reviews'] = '1/2'
    st['budget']['grouped_repairs'] = '0/1'
    st['closing_documents'] = ['state.json', 'adjudication-r1.json', 'next-task.json', 'review-r1/executor-disposition.json', 'ledger-delta-cont-d9ef.md',
                               'lead-secret-scan-triage.json', 'post-review-r1-changes.json', 'unit-manifest.json', 'commit-receipt.json']
    st['tools_closing'] = ['tools/collect_results.py', 'tools/empty_artifacts.py', 'tools/close_r1.py']
    st['updated_at'] = now()
    save('state.json', st)
    nt = {'task': 'DX100-G02:BIND-SDK-SOURCE-BATCH-2B-1 (proposta; nome e claim definidos pelo Lead)', 'previous_task': TASK,
          'previous_status': 'COMPLETED_LOCAL', 'status': 'READY_PENDING_LEAD_CLAIM', 'track': 'T1 documental (sem serviço, sem SDK, sem rede)',
          't3_required': False, 'resume_checkpoint': 'docs/04_audit/evidence/CODEX100-EXEC-20261017/g02/sdk-batch-2b1-admission/state.json',
          'what': ('Ligar as 15 observações do 2B-1 ao mapa de cobertura sem ampliar crédito: coverage-observed nova versão ao lado da v3 da continuação '
                   '(sem editar as anteriores), linha a linha das linhas do 2B-1 de inputs/spec-2b/coverage-plan-2b.json; só os casos de '
                   'adjudication-r1.json#/bind_consumes_only podem levar braço a OBSERVED_CLIENT_PARTIAL, com ponteiro para cases/*/acceptance.json; '
                   'nenhuma linha passa a cobrir o requisito inteiro.'),
          'first_step': 'Lead registra claim novo. Conferir unit-manifest.json e commit-receipt.json desta pasta e os sha de source-freeze-r4-2b1, '
                        'identity-freeze-r4-2b1 e diag-admission-2b1 antes de qualquer escrita.',
          'inputs_readonly': ['g02/sdk-batch-2b1-admission/adjudication-r1.json', 'g02/sdk-batch-2b1-admission/case-results.json',
                              'g02/sdk-batch-2b1-admission/cases/*/acceptance.json', 'g02/sdk-batch-2b1-admission/reevaluation-2b1.json',
                              'g02/sdk-batch-2b1-admission/inputs/spec-2b/coverage-plan-2b.json', 'g02/sdk-batch-2b1-admission/inputs/spec-2b/cases-2b-1.json'],
          'carry_over': ['Ler final_reading, attribution e bind_rule de adjudication-r1.json, nunca dos acceptance.json por caso.',
                         'As formas CLIENT_TERMINATED_SIGTERM (2B-PY01A, 2B-PY01D, 2B-PY02A) e CLIENT_KILLED_SIGKILL (2B-PY02K) são formas declaradas pelos casos, '
                         'com testemunha do SO e do canal; o returncode do Popen é fato do cliente julgado por probe e proc.termination_exact.'],
          'then': ('DX100-G02:IMPLEMENT-AND-ADMIT-SDK-SOURCE-BATCH-2B-2 (18 vagas, 10 serviços): o gate de R2-F01 está fechado por esta unidade '
                   '(adjudication-r1.json#/r2_f01) e exige o 2B-1 admitido; carry-over obrigatório em state.json#/carry_over_2b2 (R1-F01 em particular).'),
          'not_authorized_now': ['novos serviços, import/execução de SDK fora do serviço contido', 'rede, provider, credencial, login real ou dado real',
                                 'testemunha privilegiada (CAP_SYS_PTRACE, fanotify, eBPF, audit)', 'SPEC0239 BUILD', 'push, PR, deploy, produção'],
          'budget': {'services': 0, 'reviews_max': 2, 'grouped_repairs_max': 1, 'automatic_retries': 0},
          'functional_receipts': 0, 'parity_credit': 0, 'created_at': '2026-10-19',
          'previous_review': 'R1 APPROVE (0 P1, 0 P2, 8 P3; R2-F01 APPROVED): review-r1/executor-disposition.json'}
    save('next-task.json', nt)
    print(json.dumps({'status': st['status'], 'bind_consumes_only': len(adj['bind_consumes_only']), 'deviations': [d['id'] for d in deviations]}))


if __name__ == '__main__':
    main()
