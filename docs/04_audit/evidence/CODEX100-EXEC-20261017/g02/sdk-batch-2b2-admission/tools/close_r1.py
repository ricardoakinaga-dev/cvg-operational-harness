"""Closing after review R1 = APPROVE (offline; no service; no frozen or executed file changes). Run: python3 -I -B tools/close_r1.py

Writes review-r1/executor-disposition.json, adjudication-r1.json and next-task.json and updates state.json (final status,
review, R1-F01 of the 2B-1 approved by the review, DV1 consequence, DV8 arm discrimination, BIND 2B-1 carry-over coverage,
registry fix R1-F04, carry-over to the next units). The arm discrimination record (discrimination-check-2b2.json) limits what
each PASS_CLIENT_OBSERVATION may claim in the BIND of the 2B-2; no case, expectation or outcome changes.
"""
import datetime
import hashlib
import json
from pathlib import Path

U = Path(__file__).resolve().parent.parent
TASK = 'DX100-G02:IMPLEMENT-AND-ADMIT-SDK-SOURCE-BATCH-2B-2'
BIND_NEXT = {'path': 'docs/04_audit/evidence/CODEX100-EXEC-20261017/g02/sdk-batch-2b1-binding/next-task.json',
             'sha256': 'f6afbb430a0b4e9a8cc438ab52d146fcf48cd0d92975e46ea1c7767664e5dbe6'}


def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def jload(rel):
    return json.loads((U / rel).read_text())


def save(rel, doc):
    (U / rel).write_text(json.dumps(doc, ensure_ascii=False, indent=2) + '\n')


def sha(rel):
    return hashlib.sha256((U / rel).read_bytes()).hexdigest()


DISPOSITION = {
    'R1-F01': ('RECORDED_FOR_LEAD_DECISION', 'DV1 completado: com o excepthook.wait do passo 13 do 2B-PY13E mantido como pré-condição de harness (nota congelada '
                                             'do passo), o known_bad "pular o cleanup" termina em INVALID_CAPTURE, nunca em MISMATCH (poder de detecção reduzido, '
                                             'sem PASS falso; nenhuma espera estourou). Decisão do Lead: aceitar ou errata T1 (passo 13 como efeito do cliente) '
                                             'para reuso futuro; sem novo serviço.'),
    'R1-F02': ('CARRIED_OVER', 'expand_parts, Seq e capture_extra para dentro do try de evaluate (ou INVALID_CAPTURE regra 3) com autoteste, na próxima unidade '
                               'que reusar o avaliador; inalcançável com os bytes congelados (sha ligado, admissão de login aprovada em todos os roteiros) e, em '
                               'serviço, o supervisor grava SUPERVISOR_ERROR/INVALID_CAPTURE.'),
    'R1-F03': ('CARRIED_OVER', 'Na reavaliação, conferir o plano da pasta do caso contra case-plan.json (sha do source freeze) ou BARRIER_PLAN e os passos de '
                               'barreira do case_input, com controle negativo; hoje os 28 planos são iguais ao case-plan.json congelado (conferido pela R1).'),
    'R1-F04': ('FIXED_TEXT_AND_CARRIED_OVER', 'state.json corrigido: a checagem zombie_t_ns em no_termination_before está no código sem autoteste; nenhum caso '
                                              'do 2B-2 usa proc.termination_exact. Autoteste positivo/negativo vai para a próxima unidade que usar a forma.'),
    'R1-F05': ('APPLIED_DV8', 'discrimination-check-2b2.json em U com as correções da R1 (PY13.B15 e PY17.B02 para PARTIAL_SCOPE; ressalva do PY17.B04): '
                              '68 DISCRIMINATED, 8 PARTIAL_SCOPE, 1 NOT_DISCRIMINATED (PY13.B06); registrado como DV8 com a razão do atraso; o BIND do 2B-2 '
                              'lê a tabela e nunca usa parte não observada como observada.'),
}

DV1_TEXT = ('Classificação por passo: hook.wait do 2B-PY13E (passo 11) e probe.until do 2B-PY17A (passo 11) são esperas de efeito do cliente (R2-F04); o '
            'excepthook.wait do 2B-PY13E (passo 13) segue pré-condição de harness porque a nota congelada do próprio passo diz "estouro do prazo é '
            'INVALID_CAPTURE, nunca MISMATCH" (E2B-14). Consequência (R1-F01 da revisão): se o cliente pular o cleanup, o passo 11 segue, o passo 12 trata o '
            'nome sem thread vivo como terminado (R2-F02) e o passo 13 estoura, então o known_bad "pular o cleanup" termina em INVALID_CAPTURE, nunca em '
            'MISMATCH: poder de detecção reduzido, sem PASS falso. Nenhuma espera estourou neste serviço. Decisão do Lead: aceitar ou errata T1 do passo 13 '
            'para reuso futuro.')

DV8 = {'id': 'DV8', 'item': 'BIND 2B-1 next-task#/first_step_additions (checagem de discriminação por braço)',
       'text': ('Pedida antes do primeiro serviço, foi feita depois dos 18 slots porque o carry-over do BIND 2B-1 chegou ao executor depois deles. '
                'discrimination-check-2b2.json (corrigido pela R1): 77 braços, 68 DISCRIMINATED, 8 PARTIAL_SCOPE (PY13.B05, PY13.B09, PY13.B10, PY13.B15, '
                'PY14.B03, PY14.B07, PY17.B02, PY17.B04) e 1 NOT_DISCRIMINATED (PY13.B06: t13b2 é efêmero e sem path, a guarda rejeita pelo path sozinho). '
                'Nenhum caso, expectativa ou desfecho muda; os PASS_CLIENT_OBSERVATION não afirmam os braços ou as partes não distinguidas, e o BIND do 2B-2 '
                'lê a tabela.')}


def main():
    review = jload('review-r1/review.json')
    assert review['verdict'] == 'APPROVE' and review['r1_f01']['verdict'] == 'APPROVED'
    assert sorted(f['id'] for f in review['findings']) == sorted(DISPOSITION) and all(f['severity'] == 'P3' for f in review['findings'])
    disc = jload('discrimination-check-2b2.json')
    assert disc['counts'] == {'DISCRIMINATED': 68, 'PARTIAL_SCOPE': 8, 'NOT_DISCRIMINATED': 1}
    save('review-r1/executor-disposition.json', {
        'kind': 'EXECUTOR_DISPOSITION_R1', 'review': 'review-r1/review.json', 'review_sha256': sha('review-r1/review.json'), 'verdict': 'APPROVE',
        'r1_f01_2b1_carry_over': 'APPROVED', 'mandatory': 0,
        'rule': 'Revisão aprovada na primeira rodada: nenhum reparo, nenhum serviço e nenhuma fonte, freeze ou evidência executada mudam; os P3 ficam '
                'registrados, aplicados como documento (DV8) ou levados à próxima unidade.',
        'dispositions': [{'id': k, 'severity': 'P3', 'status': v[0], 'action': v[1]} for k, v in DISPOSITION.items()],
        'arm_discrimination': {'applied': ['PY13.B15 -> PARTIAL_SCOPE', 'PY17.B02 -> PARTIAL_SCOPE', 'PY17.B04: ressalva da variante device code'],
                               'record': 'discrimination-check-2b2.json', 'record_sha256': sha('discrimination-check-2b2.json')},
        'outcomes_changed': False, 'services': 0, 'written_at': now()})
    cr = jload('case-results.json')
    st = jload('state.json')
    arms = {}
    for a in disc['arms']:
        arms.setdefault(a['case'], []).append(a)
    rows = []
    for r in cr['rows']:
        row = {'slot': r['slot'], 'case': r['case'], 'kind': r['kind'], 'outcome': r['outcome'], 'rule': r['composition_rule'],
               'capture_form': r['capture_form'], 'failed': r['failed_predicates'], 'dir': r['attempt_dir']}
        if r['kind'] == 'CONTROL':
            row.update({'final_reading': 'MISMATCH (CONTROL)', 'attribution': 'CONTROL_GATE', 'client_observation': 'NONE',
                        'bind_rule': 'não consumir; o CONTROL só abre o gate'})
        else:
            ok = r['outcome'] == 'PASS_CLIENT_OBSERVATION'
            ca = arms.get(r['case'], [])
            row.update({'final_reading': r['outcome'], 'attribution': 'CLIENT' if ok else None, 'client_observation': 'OBSERVED' if ok else 'NONE',
                        'arms_discriminated': [a['arm'] for a in ca if a['status'] == 'DISCRIMINATED'],
                        'arms_partial_scope': [a['arm'] for a in ca if a['status'] == 'PARTIAL_SCOPE'],
                        'arms_not_discriminated': [a['arm'] for a in ca if a['status'] == 'NOT_DISCRIMINATED'],
                        'bind_rule': ('consumível pelo BIND segundo coverage-plan-2b.json (linhas do 2B-2), só nos braços DISCRIMINATED e na parte observada '
                                      'dos PARTIAL_SCOPE (discrimination-check-2b2.json); NOT_DISCRIMINATED fica não discriminado') if ok else 'não consumir'})
        rows.append(row)
    sdk = [x for x in rows if x['kind'] == 'SDK']
    deviations = [dict(d, text=DV1_TEXT) if d['id'] == 'DV1' else d for d in st['implementation']['deviations']] + [DV8]
    adj = {'kind': 'ADJUDICATION_R1_OFFLINE', 'task': TASK, 'review': 'review-r1/review.json', 'review_verdict': 'APPROVE',
           'rule': 'Leitura final = acceptance.json de serviço (acceptance-r4-2b2), igual à reavaliação offline nos 18 diretórios (reevaluation-2b2.json) e '
                   'reproduzida pela revisão também com a ordem de emissão no lugar do gidx; o que cada PASS afirma é limitado por discrimination-check-2b2.json.',
           'control': cr['control'],
           'sdk_final_reading': {'PASS_CLIENT_OBSERVATION': sum(1 for x in sdk if x['final_reading'] == 'PASS_CLIENT_OBSERVATION'),
                                 'MISMATCH': 0, 'INVALID_CAPTURE': 0, 'INCONCLUSIVE': 0},
           'arm_discrimination': {'record': 'discrimination-check-2b2.json', 'counts': disc['counts'],
                                  'not_discriminated': ['PY13.B06'], 'partial_scope': [a['arm'] for a in disc['arms'] if a['status'] == 'PARTIAL_SCOPE']},
           'rows': rows, 'bind_consumes_only': [x['case'] for x in sdk if x['final_reading'] == 'PASS_CLIENT_OBSERVATION'],
           'deviations': [{'id': d['id'], 'item': d['item'], 'decision': 'ACCEPTED' if d['id'] != 'DV1' else 'ACCEPTED_PENDING_LEAD_CHOICE',
                           'review': {'DV1': 'aceito pela R1 com registro da consequência (R1-F01)', 'DV8': 'registrado por R1-F05 com as correções da R1'}.get(d['id'], 'aceito pela R1')}
                          for d in deviations],
           'carry_over_2b1_r1_f01': {'status': 'APPROVED', 'by': 'review-r1/review.json#/r1_f01'},
           'functional_receipts': 0, 'parity_credit': 0, 'note': 'Observação de cliente não é paridade. SPEC0239 BUILD não autorizada.', 'written_at': now()}
    save('adjudication-r1.json', adj)
    st['status'] = 'COMPLETED_LOCAL'
    st['implementation']['deviations'] = deviations
    st['carry_over_2b2_closure']['R1-F05'] = ('IMPLEMENTADO: barrier.witnesses_in_order confere cada condição do gate e de cada ação antes dela (gidx) e '
                                              'BEFORE_REPLY_WRITTEN antes do commit da resposta, com autotestes positivos e negativos; zombie_t_ns em '
                                              'no_termination_before está no código sem autoteste (nenhum caso do 2B-2 usa proc.termination_exact; corrigido '
                                              'por R1-F04 da revisão).')
    st['bind_2b1_carry_over'] = {
        'source': BIND_NEXT, 'received': 'depois dos 18 slots (mensagem do coordenador durante a revisão R1)',
        'first_step_additions': 'COBERTO DEPOIS DOS SERVIÇOS como DV8: discrimination-check-2b2.json (68/8/1), revisado pela R1; nenhum PASS afirma braço não distinguido.',
        'spec_R2-F04': 'COBERTO: classificação por passo em python-driver.py CLIENT_EFFECT_WAITS e case-plan.json (13E passo 11 e 17A passo 11 efeito do cliente; '
                       '13E passo 13 harness pela nota congelada, DV1 com a consequência registrada); nenhuma espera estourou (HOOK_WAIT, EXCEPTHOOK_WAIT e PROBE_UNTIL ok).',
        'spec_R2-F02': 'CONFIRMADO EM SERVIÇO: no 2B-PY13E o thread.join por nome encontrou o cleanup já terminado (found=false, alive_after=false) depois do hook.wait.',
        'bind_review_P3': {'2B1-BIND/R2-F01': 'NÃO SE APLICA a esta unidade (CARRIED_TO_NEXT_BIND)',
                           '2B1-BIND/R2-F02': 'APLICADO: padrão "efeito colateral no processo pai não sondado" conferido em discrimination-check-2b2.json#/patterns_checked (não aplicável no 2B-2)',
                           '2B1-BIND/R2-F03': 'NÃO SE APLICA a esta unidade (CARRIED_TO_NEXT_BIND)'}}
    st['review'] = {'r1': {'path': 'review-r1/review.json', 'subject': 'review-freeze-r1.json', 'subject_sha256': review['subject_sha256'],
                           'verdict': 'APPROVE', 'r1_f01_2b1_carry_over': 'APPROVED', 'findings': {'P1': 0, 'P2': 0, 'P3': 5},
                           'disposition': 'review-r1/executor-disposition.json'}}
    st['adjudication'] = {'path': 'adjudication-r1.json', 'sdk_final_reading': adj['sdk_final_reading'], 'bind_consumes_only': len(adj['bind_consumes_only']),
                          'arm_discrimination': disc['counts']}
    st['next_task'] = {'path': 'next-task.json', 'task': 'DX100-G02:BIND-SDK-SOURCE-BATCH-2B-2 (proposta)', 't3_required': False}
    st['carry_over_next'] = [{'finding': k, 'text': v[1]} for k, v in DISPOSITION.items() if v[0].startswith(('CARRIED', 'FIXED_TEXT_AND_CARRIED'))] + [
        {'finding': 'R1-F01 (DV1)', 'text': DISPOSITION['R1-F01'][1]}]
    st['budget']['reviews'] = '1/2'
    st['budget']['grouped_repairs'] = '0/1'
    st['closing_documents'] = ['state.json', 'discrimination-check-2b2.json', 'adjudication-r1.json', 'next-task.json', 'review-r1/executor-disposition.json',
                               'ledger-delta-cont-d9ef.md', 'lead-secret-scan-triage.json', 'post-review-r1-changes.json', 'unit-manifest.json', 'commit-receipt.json']
    st['tools_closing'] = ['tools/collect_results.py', 'tools/empty_artifacts.py', 'tools/close_r1.py']
    st['updated_at'] = now()
    save('state.json', st)
    nt = {'task': 'DX100-G02:BIND-SDK-SOURCE-BATCH-2B-2 (proposta; nome e claim definidos pelo Lead)', 'previous_task': TASK,
          'previous_status': 'COMPLETED_LOCAL', 'status': 'READY_PENDING_LEAD_CLAIM', 'track': 'T1 documental (sem serviço, sem SDK, sem rede)',
          't3_required': False, 'resume_checkpoint': 'docs/04_audit/evidence/CODEX100-EXEC-20261017/g02/sdk-batch-2b2-admission/state.json',
          'what': ('coverage-observed-v5 ao lado do v4 (sem editar as versões anteriores), linha a linha das linhas do 2B-2 de inputs/spec-2b/coverage-plan-2b.json '
                   '(PY09, PY13, PY14, PY17, PY18): só os casos de adjudication-r1.json#/bind_consumes_only, e em cada caso só os braços DISCRIMINATED e a parte '
                   'observada dos PARTIAL_SCOPE de discrimination-check-2b2.json; PY13.B06 fica não discriminado; nenhuma linha passa a cobrir o requisito inteiro.'),
          'first_step': 'Lead registra claim novo. Conferir unit-manifest.json e commit-receipt.json desta pasta e os sha de source-freeze-r4-2b2, '
                        'identity-freeze-r4-2b2, diag-admission-2b2 e discrimination-check-2b2 antes de qualquer escrita.',
          'inputs_readonly': ['g02/sdk-batch-2b2-admission/adjudication-r1.json', 'g02/sdk-batch-2b2-admission/discrimination-check-2b2.json',
                              'g02/sdk-batch-2b2-admission/case-results.json', 'g02/sdk-batch-2b2-admission/cases/*/acceptance.json',
                              'g02/sdk-batch-2b2-admission/reevaluation-2b2.json', 'g02/sdk-batch-2b2-admission/inputs/spec-2b/coverage-plan-2b.json',
                              'g02/sdk-batch-2b1-binding/coverage-observed-v4.json', 'g02/sdk-batch-2b1-binding/projection-2b2-on-v4.json'],
          'carry_over': ['Ler final_reading, attribution, arms_* e bind_rule de adjudication-r1.json, nunca dos acceptance.json por caso.',
                         'PY17.B04: o texto geral "variante inesperada não registra fila" é falso para a variante device code; só a apiKey foi exercida (não generalizar).',
                         'Do BIND 2B-1 (CARRIED_TO_NEXT_BIND): 2B1-BIND/R2-F01 (ligação do PY12.B03), 2B1-BIND/R2-F02 (redação do PY02.B02/B07) e 2B1-BIND/R2-F03 '
                         '(validador do v5 e sha das bases), conforme ' + BIND_NEXT['path'] + '#/carry_over_from_bind_review.',
                         'Da admissão 2B-2 (para a próxima unidade que reusar o avaliador): R1-F02, R1-F03 e o autoteste de zombie_t_ns (R1-F04).',
                         'DV1: decisão do Lead entre aceitar o INVALID_CAPTURE do known_bad "pular o cleanup" do 2B-PY13E ou errata T1 do passo 13.'],
          'not_authorized_now': ['novos serviços, import/execução de SDK fora do serviço contido', 'rede, provider, credencial, login real ou dado real',
                                 'testemunha privilegiada (CAP_SYS_PTRACE, fanotify, eBPF, audit)', 'SPEC0239 BUILD', 'push, PR, deploy, produção'],
          'budget': {'services': 0, 'reviews_max': 2, 'grouped_repairs_max': 1, 'automatic_retries': 0},
          'functional_receipts': 0, 'parity_credit': 0, 'created_at': '2026-10-19',
          'previous_review': 'R1 APPROVE (0 P1, 0 P2, 5 P3; R1-F01 do 2B-1 APPROVED): review-r1/executor-disposition.json'}
    save('next-task.json', nt)
    print(json.dumps({'status': st['status'], 'bind_consumes_only': len(adj['bind_consumes_only']), 'deviations': [d['id'] for d in deviations],
                      'arms': disc['counts']}, ensure_ascii=False))


if __name__ == '__main__':
    main()
