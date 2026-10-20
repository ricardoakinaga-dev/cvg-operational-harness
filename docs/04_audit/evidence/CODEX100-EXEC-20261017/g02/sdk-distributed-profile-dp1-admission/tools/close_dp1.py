"""Closing of DX100-G02:IMPLEMENT-AND-ADMIT-SDK-DISTRIBUTED-PROFILE-DP-1: state.json and next-task.json from the unit records.

Usage: python3 -I -B tools/close_dp1.py <phase>   (cwd = unit folder; phase draft | final)
draft: before the independent review; final: after it (reads review-r1/review.json and, if present, repair-r1.json,
review-r2/review.json and the executor disposition of the last round).
"""
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

U = Path(__file__).resolve().parent.parent
REL = 'docs/04_audit/evidence/CODEX100-EXEC-20261017/g02/sdk-distributed-profile-dp1-admission'
PHASE = sys.argv[1]


def load(p):
    return json.loads((U / p).read_text())


def sha(p):
    return hashlib.sha256((U / p).read_bytes()).hexdigest()


def ref(p):
    return {'path': p, 'sha256': sha(p)}


results = load('case-results.json')
reev = load('reevaluation-dp1.json')
res = load('resource-receipt-final.json')
diag = load('diag-admission-dp1.json')
budget = load('budget.json')
ledger = load('case-ledger.json')
sel = load('selftests/selftest-results.json')
val = load('validation-unit.json')
pre = load('preflight.json')
adj = load('adjudication-dp1.json')
empty = load('empty-artifact-delta.json')
spec_nt = load('inputs/spec-dp/next-task.json')
ctrl = [r for r in results['rows'] if r['case'] == 'DP1-CTRL01'][0]
review, status, carry_review, rounds, repairs = None, 'IN_REVIEW', [], 0, 0
if PHASE == 'repaired':
    r1 = load('review-r1/review.json')
    rounds, repairs, status = 1, 1, 'IN_REVIEW_R2'
    review = {'R1': '%s (%s) review-r1/review.json; texto sem edição em review-r1/verdict.raw.txt' % (r1['verdict'], r1.get('summary_counts', '')),
              'repair': 'repair-r1.json (1/1); preimagens em archives/r1-preimages/', 'critic': 'subagente novo por rodada, somente leitura'}
if PHASE == 'final':
    r1 = load('review-r1/review.json')
    rounds = 1
    review = {'R1': '%s (%s) review-r1/review.json; texto sem edição em review-r1/verdict.raw.txt' % (r1['verdict'], r1.get('summary_counts', '')),
              'critic': 'subagente novo por rodada, somente leitura; o executor grava brief e veredito sem edição'}
    last = r1
    if (U / 'repair-r1.json').exists():
        repairs = 1
        review['repair'] = 'repair-r1.json (1/1)'
    if (U / 'review-r2' / 'review.json').exists():
        r2 = load('review-r2/review.json')
        rounds, last = 2, r2
        review['R2'] = '%s (%s) review-r2/review.json; texto sem edição em review-r2/verdict.raw.txt' % (r2['verdict'], r2.get('summary_counts', ''))
    disp_name = 'review-r%d/executor-disposition.json' % rounds
    if (U / disp_name).exists():
        disp = load(disp_name)
        review['disposition'] = disp_name
        carry_review = [{'finding': 'DP1-ADM/' + i['id'], 'text': i['note']} for i in disp['items'] if i['disposition'].startswith('CARRIED')]
        open_p1p2 = [i['id'] for i in disp['items'] if i.get('severity') in ('P1', 'P2') and not (i['disposition'].startswith('FIXED') or i['disposition'].startswith('CARRIED'))]
    else:
        open_p1p2 = [f['id'] for f in last.get('findings', []) if f['severity'] in ('P1', 'P2')]
    if open_p1p2:
        status = 'BLOCKED_REVIEW'
    elif last['verdict'] == 'APPROVE' and not carry_review:
        status = 'COMPLETED_LOCAL'
    else:
        status = 'COMPLETED_LOCAL_WITH_CARRIED_FINDINGS'

state = {
    'kind': 'UNIT_STATE', 'program': 'CODEX100', 'task': 'DX100-G02:IMPLEMENT-AND-ADMIT-SDK-DISTRIBUTED-PROFILE-DP-1', 'lead': 'CONT-20261018-D9EF',
    'track': 'T1 com execução local contida (serviços transientes próprios, sem rede, sem provider, sem credencial, sem dado real)',
    'status': status,
    'git': {'candidate_worktree': '/mnt/dados/cvg-work/cvg-codex100-dp1-20261019', 'base': '76c047257 (recibo do C3-2)', 'branch': 'nenhuma (HEAD destacado)', 'push': 'não', 'pr': 'não'},
    'runtime': '/mnt/dados/cvg-work/cvg-codex100-dp1-runtime-20261019',
    'spec_inputs': {'folder': 'inputs/spec-dp (cópia byte a byte de ../sdk-distributed-profile-spec) e inputs/acquisition', 'preflight': {'path': 'preflight.json', 'sha256': sha('preflight.json'), 'result': pre['result']},
                    'cases_dp_1_sha256': sha('inputs/spec-dp/cases-dp-1.json'), 'lead_confirmation': 'inputs/spec-dp/lead-confirmation-20261019.json (Q4 lida como capability do kernel; DP-REAL01 dentro da Q3)'},
    'implementation': {
        'layout': 'Pilha única de host dplane/ (supervisor, observador, avaliador, staging) e node/ (driver, loader, canal, filho sintético, wrapper de controle, shim, módulos próprios de DIAG); derivada da pilha TypeScript do C3-1 (tslane/, node/) no commit 76c047257.',
        'DDP-01': 'node/dp-channel.cjs CASE_ID dos 12 slots e 5 DIAG; supervisor liga cases-dp-1.json por sha.',
        'DDP-02/DDP-11': 'dplane/stage.py: /dist do cache (A2, A3, A4, A7) com modos dos membros, conferido contra artifact-metadata.json; árvores de fixture por tentativa (copy_of_member, file, json, dir, symlink, synthetic_child, copy_of_profile); binds só-leitura.',
        'DDP-03': 'node/dp-loader.mjs: entradas de SDK por sha do membro A7; especificadores nus da lista fechada (child_process, fs, module, os, path, readline) só para essas entradas; node/dp-driver.mjs: vocabulário fechado, wrapper.run com env exato, stdin /dev/null, assentamento no close, send_signal depois do CHILD_READY com espera por SigCgt, LEFTOVER, NOT_REACHED.',
        'DDP-04': 'node/dp-synth-child.mjs: programa por arquivo, registro sincronizado antes da ação terminal, CHILD_READY depois dos listeners, espera limitada (NO_SIGNAL, 97); válido como CommonJS e como ES module.',
        'DDP-05': 'MemoryMax 1073741824 e TasksMax 256 em todo serviço do DP-1, conferidos na cgroup (service.limits_declared); pico observado %d tarefas (acima dos 32 herdados).' % res['max_pids_peak'],
        'DDP-07': 'DP-PK09A julgado por dplane/acceptance.py evaluate_artifact, sem serviço.',
        'DDP-09': 'node/dp-control-wrapper.mjs (código próprio; sai 0 sempre).',
        'erratum_DP_SPEC_R2_F01': ('Aplicada antes do source freeze: topologia driver_only declarada em todo config (o canal recusa outra); FIFOs de adapter e peer montados e vazios; '
                                   'dplane/observer.py reconcile_driver_only (PASS só com END completo do driver, EOF, checagens do SO, BLOBs fechados e WRAPPER_RESULT seguido de LEFTOVER; '
                                   'quadro de adapter ou peer é INVALID_CAPTURE); dplane/acceptance.py capture_form mapeia a base driver_only para a forma declarada pelo caso '
                                   '(PASS, PASS_DECLARED_TERMINATION, REAL_CLI_KEYLESS); autotestes obrigatórios em selftests/selftest_dp1.py.'),
        'carry_over': {'DP-SPEC/R2-F02': 'aplicado: SIGNAL_SENT registra sigcgt_bit_seen como informativo para SIGINT/SIGTERM; o DIAG-DP-NODE usa SIGHUP para o bit; o autoteste com e sem listener entrou no reparo R1 (selftests/selftest-caps-results.json: sem listener SIGHUP falso e SIGINT/SIGTERM verdadeiros; com listener SIGHUP verdadeiro).',
                       'DP-SPEC/R2-F03': 'parcial no código congelado: tools/validate_unit.py aceita prefixo (sem ambiguidade nos 9 controles do DP-1); as checagens pós-revisão (post-review-checks-dp1.json) usam igualdade exata; o caso do DP-PY02P vai ao DP-2.',
                       'DP-SPEC/R2-F04': 'aplicado: identity-freeze-dp1.json#/pin_bindings (membro A3 bin/codex, sha do executável do pin ligado a g02-reference-acceptance.json e build-provenance.json, package.json e index.ts do pin); a frase "ausentes na fonte" do PK09.B02 tem fonte no G01 (freeze-addendum-dp1.json#/readings); a parte do DP-PY20A fica para o DP-2.',
                       'DP-SPEC/R2-F05': 'aplicado no DP-1: todos os serviços, inclusive o DIAG-TS-ECHO, com 1 GiB e 256 tarefas; a parte do DIAG-DP-REAL-CLI-APPSERVER fica para o DP-2.',
                       'DP-SPEC/R2-F06': 'DP-2.', '2B2-ADM/R1-F02, R1-F03, R1-F04': 'DP-2 (DDP-10: avaliador e supervisor Python do 2B-2).', 'ACQ/R1-F03': 'só numa aquisição futura.'},
        'deviations': [{'id': d['id'], 'text': d['text'], 'lead_acceptance': d['lead_acceptance']} for d in load('freeze-addendum-dp1.json')['deviations']],
        'freeze_addendum': ref('freeze-addendum-dp1.json'),
    },
    'selftests': {'path': 'selftests/selftest-results.json', 'passed': sel['passed'], 'failed': sel['failed'], 'node': sel['node'],
                  'capabilities_after_review': {'path': 'selftests/selftest-caps-results.json', 'passed': load('selftests/selftest-caps-results.json')['passed'], 'failed': load('selftests/selftest-caps-results.json')['failed'], 'origin': 'reparo R1 (R1-F02), depois dos serviços; arquivos congelados intactos'}},
    'post_review_checks': {'path': 'post-review-checks-dp1.json', 'ok': load('post-review-checks-dp1.json')['ok'], 'negative_controls_refused': load('post-review-checks-dp1.json')['negative_controls_refused']},
    'validator': {'path': 'validation-unit.json', 'ok': val['ok'], 'negative_controls_refused': val['negative_controls_refused'], 'negative_controls': len(val['negative_controls'])},
    'freezes': {'source': ref('source-freeze-dp1.json'), 'identity': ref('identity-freeze-dp1.json'),
                'order': 'autotestes, validador e preflight -> source freeze -> identity freeze -> 5 DIAG -> diag-admission -> CONTROL -> slots em ordem'},
    'diagnostics': {'admission': ref('diag-admission-dp1.json'), 'mandatory': {k: v['dir'] for k, v in diag['admission_diagnostics'].items()},
                    'conditional': {k: v['dir'] for k, v in diag['conditional_diagnostics'].items()}, 'conditional_slots': diag['conditional_slots'], 'failures': 0},
    'control': {'case': 'DP1-CTRL01', 'outcome': ctrl['outcome'], 'composition_rule': ctrl['composition_rule'], 'failed_predicates': ctrl['failed_predicates'],
                'gate': 'MISMATCH pela regra 6 só com wrap.exit_mirror_exact, sanidades aprovadas, antes dos slots', 'gate_passed': ctrl['outcome'] == 'MISMATCH' and ctrl['failed_predicates'] == ['wrap.exit_mirror_exact']},
    'cases': {'counts_excluding_control': results['counts_excluding_control'], 'rows': results['rows'],
              'adjudication': {'path': 'adjudication-dp1.json', 'sha256': sha('adjudication-dp1.json'), 'DP-PK07A': adj['items'][0]['attribution']}},
    'reevaluation': {'path': 'reevaluation-dp1.json', 'all_equal': reev['all_equal'], 'cases': len(reev['cases'])},
    'budget': {'case_slots': '%d/%d' % (ledger['used'], ledger['slots_max']), 'services': '%d/%d' % (budget['services_used'], budget['services_max']),
               'reviews': '%d/2' % rounds, 'grouped_repairs': '%d/1' % repairs, 'automatic_retries': 0, 'conditional_slots': 'DP-REAL01 liberada (DIAG-DP-REAL-CLI DIAG_PASS)'},
    'resources': {k: res[k] for k in ('units', 'all_released', 'unit_prefix', 'pg', 'tcp_ports', 'network', 'max_loadavg_at_service_start', 'load_waits_s', 'max_pids_peak', 'max_memory_peak_bytes', 'kept')},
    'empty_artifacts': {'path': 'empty-artifact-delta.json', 'count': empty['count'], 'by_status': empty['by_status'], 'central_catalog': 'não editado (merge pelo Lead)'},
    'capability': 'nenhuma capability do kernel nem privilégio (Q4, leitura confirmada pelo Lead); CAP-DP-* são mecanismos de harness sem privilégio',
    'review': review, 'functional_receipts': 0, 'parity_credit': 0,
    'note': 'Observação de cliente não é paridade: 0 recibos funcionais, 0 crédito de paridade. NO_BUILD_LINK_DECLARED em todo acceptance não CONTROL.',
    'updated_at': datetime.now(timezone.utc).isoformat(),
}
next_task = {
    'task': 'DX100-G02:IMPLEMENT-AND-ADMIT-SDK-DISTRIBUTED-PROFILE-DP-2 (proposta; nome e claim definidos pelo Lead)',
    'previous_task': state['task'], 'previous_status': status,
    'status': 'READY_PENDING_LEAD_CLAIM' if status.startswith('COMPLETED_LOCAL') else 'DRAFT_PENDING_REVIEW',
    'track': 'T1 com execução local contida, pilha Python do 2B-2 mais DDP-05, DDP-06, DDP-10 e DDP-11', 't3_required': False, 't4_required': False,
    'spec': {k: v for k, v in spec_nt['spec'].items() if k in ('cases_dp_2', 'budget_dp_2', 'freeze_r4_dp_delta', 'evaluator_r4_dp_delta', 'capability_contracts', 'coverage_plan', 't3')},
    'carry_over': [
        {'finding': 'DP-SPEC/R2-F01', 'text': 'Errata obrigatória da topologia driver_only também no DP-2 (DP-PY19A e DP-PY02P): delta do observador do 2B-2 declarado como DDP no freeze do DP-2 (como DDP-12/EDP-09 em freeze-addendum-dp1.json); autotestes, inclusive o do DP-PY19A (captura driver_only sintética com processo de adapter na cgroup dá MISMATCH por proc.spawn_count_exact); checagem de topologia caso a caso com controle negativo de mensagem exata (como post-review-checks-dp1.json).'},
        {'finding': 'DP-SPEC/R2-F03', 'text': 'No validador do DP-2, o controle negativo do binário real usa a mensagem exata "on the real binary" e uma cópia com spawns 1 e process.argv completo (DP-PY02P).'},
        {'finding': 'ACQ/R1-F03', 'text': 'Só numa aquisição futura (exige decisão nova): comparar host e caminho da URL resolvida com o plano antes do GET.'},
        {'finding': 'DP1-ADM/DV2-DV3', 'text': 'No DP-2: selftest-sandbox restrito no código às linhas de código próprio; RuntimeMaxSec 45 ou desvio declarado antes do freeze; DV1-DV4 do DP-1 aguardam aceite do Lead.'},
        {'finding': 'DP1-ADM/R1-F04-F07', 'text': 'No DP-2: critérios dos DIAG alinhados ao pass do contrato (espera de 5 s, shim com restauração, /work julgado) e fixture.tree_exact varrendo a raiz de cada árvore.'},
        {'finding': 'DP-SPEC/R2-F04', 'text': 'Inputs do DP-PY20A: A5 pelo registro e membros comparados na identity freeze.'},
        {'finding': 'DP-SPEC/R2-F05', 'text': 'DIAG-DP-REAL-CLI-APPSERVER com o argv e o env do caso e exercitando realcli.witness, com controle negativo de leitura antes do PROC_RETAIN.'},
        {'finding': 'DP-SPEC/R2-F06', 'text': 'Nota de epílogo por topologia no DP-PY19B e DP-PY19C.'},
        {'finding': '2B2-ADM/R1-F02, R1-F03, R1-F04', 'text': 'DDP-10: antes do source freeze do DP-2.'},
        {'finding': 'DP1-ADM/PK07A', 'text': 'Lição do DP-PK07A: conferir o escopo de módulo (package.json "type") de todo filho sintético com nome .exe ou extensão desconhecida; um caso novo do PK07 com a errata de fixture exige vaga nova e decisão do Lead (adjudication-dp1.json).'},
    ] + carry_review,
    'after_this': ['BIND do perfil distribuído (DP-1 e DP-2) ao lado do v5: linhas PK01-PK06, PK08 e PK09 do DP-1 com observação parcial de cliente; PK07 sem observação do DP-1 (INVALID_CAPTURE adjudicado)',
                   'caso novo do PK07 com a errata de fixture, só com decisão do Lead'],
    'not_authorized_now': ['rede ou nova aquisição', 'provider, credencial, login, turn ou chamada a modelo (gate T4)', 'capability do kernel ou privilégio (Q4)',
                           'npm/pip install ou instalação global', 'executar binário do cache fora da contenção', 'push', 'produção'],
    'functional_receipts': 0, 'parity_credit': 0, 'created_at': datetime.now(timezone.utc).date().isoformat(),
}
for name, obj in (('state.json', state), ('next-task.json', next_task)):
    (U / name).write_text(json.dumps(obj, ensure_ascii=False, indent=2) + '\n')
print(status, results['counts_excluding_control'])
