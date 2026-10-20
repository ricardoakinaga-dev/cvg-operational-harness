"""Closing of DX100-G02:IMPLEMENT-AND-ADMIT-SDK-DISTRIBUTED-PROFILE-DP-2 after the independent review (offline; no service; no frozen
source, freeze or executed evidence changes). Run: python3 -I -B tools/close_dp2.py

Writes review-r1/executor-disposition.json, adjudication-dp2.json and next-task.json and updates state.json (final status, review,
dispositions, budget). Reads DISPOSITION and DECLARED below (one entry per finding and per declared deviation of review-r1/review.json);
no case, expectation or outcome changes.

Status rule (carry-over DP1-ADM/R2-F04): a P1 or P2 finding is never closed by CARRIED_OVER; a P1 or P2 that is not FIXED gives
REVIEW_REVISE; a deviation the review did not accept gives REVIEW_REVISE; items carried to a later unit give
COMPLETED_LOCAL_WITH_CARRIED_FINDINGS; otherwise COMPLETED_LOCAL.
"""
import datetime
import hashlib
import json
from pathlib import Path

U = Path(__file__).resolve().parent.parent
TASK = 'DX100-G02:IMPLEMENT-AND-ADMIT-SDK-DISTRIBUTED-PROFILE-DP-2'
G02 = 'docs/04_audit/evidence/CODEX100-EXEC-20261017/g02/'
ROUNDS = ['r1']  # review rounds used
# finding id -> (status, action); status in FIXED, CARRIED_OVER, RECORDED, RECORDED_FOR_BIND, NOT_APPLICABLE.
DISPOSITION = {
    'R1-F01': ('CARRIED_OVER', 'Registrado na adjudicação (refreeze íntegro em substância: código sob teste com o mesmo sha, primeiro serviço depois do '
               'refreeze; os bytes do selftest_dp2.py substituído, sha a5a7a533…, não foram guardados e não podem ser recuperados). Na próxima '
               'unidade que reusar o supervisor: freeze e freeze-identities recusam selftest-results com failed > 0, sources_sha256 diferente das '
               'fontes atuais ou validation-unit.json com ok false, com controle negativo; arquivar os bytes de toda fonte substituída; não '
               'declarar repetições sem registro (o "59/59 três vezes" do DV-DP2-02 fica sem registro e não é usado como prova).'),
    'R1-F02': ('CARRIED_OVER', 'Nenhum desfecho muda (valores registrados coerentes: interfaces [lo], 0 rotas, namespace diferente do host, '
               'cpu.max 100000 100000). Na reutilização: o avaliador recomputa interfaces, rotas, net_ns_differs_from_host, credential_keys, '
               'codex_home e a cota de cpu.max a partir do registro; a testemunha lê também /proc/<pid>/net/ipv6_route; controle negativo de '
               'reavaliação com o booleano preservado.'),
    'R1-F03': ('CARRIED_OVER', 'O avaliador já recusa a ordem trocada por gidx (perturbação do revisor). Na reutilização: controle negativo com pid '
               'real pedido antes do seu PROC_RETAIN, no supervisor e no avaliador, por mensagem exata.'),
    'R1-F04': ('RECORDED_FOR_BIND', 'O BIND credita o PY19.B02 por api.steps_exact (FileNotFoundError com causa ModuleNotFoundError, sem fallback '
               'npm); proc.spawn_count_exact conta só processos de adapter e não cobre spawn de outro binário; process_scan.extra vazio é '
               'registro amostrado (20 ms), não predicado.'),
    'R1-F05': ('RECORDED_FOR_BIND', 'A forma REAL_CLI_KEYLESS do DP-PY02P foi atribuída pela declaração do caso sobre a base driver_only (errata '
               'R2-F01 (4)); a observação do binário publicado se apoia em realcli.exe_identity, realcli.witness_read e realcli.argv_exact; a '
               'regra 2 não dispara em driver_only.'),
    'R1-F06': ('CARRIED_OVER', 'A exigência do DV-C32-02 fica cumprida pelas 15 pastas executadas e pelo result.json do DP-PY20A (case_plan_file '
               'case-plan.json 22172a9d…; reavaliação 6/6 com plan_binding_ok). Na reutilização: o autoteste escolhe o dry run por tempo e exige '
               'fontes do manifesto iguais ao freeze, ou o manifesto registra o sha do supervisor.'),
    'R1-F07': ('FIXED', 'Registros corrigidos no fechamento, sem tocar fonte, freeze ou evidência executada: state.json#/implementation/DDP-08 '
               'com o conteúdo real da identity freeze (as árvores de fixture são materializadas por tentativa e ficam em '
               'profile-manifest.json#/fixture_manifest_host, a partir de fixture-cases.json ligado pelo source freeze); '
               'state.json#/implementation/ddp12_binding com as fontes que declaram o DDP-12 e o case-plan.json, cada um com o sha do source '
               'freeze; state.json#/post_execution_tools com o sha de cada ferramenta pós-execução fora do freeze.'),
    'R1-F08': ('CARRIED_OVER', 'Conforme ao texto do carry-over e sem efeito no DP-PY02P congelado. Na reutilização: mensagens distintas por '
               'condição (spawns, argv, predicado de adapter) com controles separados; lista completa de predicados que leem adapter ou peer; '
               'controle negativo de channel.load_config com topologia trocada.'),
    'R1-F09': ('CARRIED_OVER', 'Sem efeito nos resultados (WHEEL do A1 com uma só linha Tag; modos do A1 iguais ao metadado, conferidos pelo '
               'revisor). Na reutilização: chaves repetidas do WHEEL como lista julgada por jeq; stage_dist recusa membro cujo modo no arquivo '
               'difere do metadado; docstring corrigido.'),
    'R1-F10': ('FIXED', 'Status final pela regra do DP1-ADM/R2-F04 (tools/close_dp2.py final_status, com autotestes positivos e negativos em '
               'review-r1/executor-disposition.json#/status_rule_selftests); /dist do sub-lote apagado no fechamento conforme o CAP-DP-STAGE, '
               'com o manifesto 764d89eb… registrado (refazível com supervisor.py stage-dist a partir do cache); o BIND não usa o DP-2 como '
               'qualificação do vocabulário D3 (registro em next-task.json).'),
}
# declared deviation id -> (decision, note)
DECLARED = {
    'DV-DP2-01': ('ACCEPTED', 'Base C3-2 aceita pela R1; o vocabulário D3 fica presente e não qualificado no DP-2 (R1-F10).'),
    'DV-DP2-02': ('ACCEPTED_WITH_RECORD', 'Refreeze antes de qualquer serviço aceito pela R1; o processo fica endurecido na reutilização (R1-F01).'),
    'DV-DP2-03': ('ACCEPTED', 'Seis dry runs em DRY_ROWS, como o DV2 do DP-1 aceito pelo Lead.'),
    'DV-DP2-04': ('ACCEPTED', 'Lista fechada de credenciais; na prática o ambiente é a lista permitida FIXED_ENV de oito chaves.'),
    'DV-DP2-05': ('ACCEPTED', 'stage.bound_to_cache no host antes do lançamento e FIXTURE_READBACK dentro do sandbox.'),
    'DV-DP2-06': ('ACCEPTED_WITH_RECORD', 'Staging próprio em /fixture/ownstage; nota de modo do R1-F09 levada à reutilização.'),
    'DV-DP2-07': ('ACCEPTED_WITH_RECORD', 'Ordem por gidx aceita; endurecimento da testemunha de rede levado à reutilização (R1-F02).'),
}
CLOSED_P3 = ('FIXED', 'CARRIED_OVER', 'RECORDED', 'RECORDED_FOR_BIND', 'NOT_APPLICABLE')


def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def jload(rel):
    return json.loads((U / rel).read_text())


def save(rel, doc):
    (U / rel).write_text(json.dumps(doc, ensure_ascii=False, indent=2) + '\n')


def sha(rel):
    return hashlib.sha256((U / rel).read_bytes()).hexdigest()


def declared_of(review):
    d = review.get('declared_deviations') or {}
    return d if isinstance(d, dict) else {x['id']: x for x in d}


def final_status(review, findings, declared):
    problems = []
    for f in findings:
        st = DISPOSITION[f['id']][0]
        if f['severity'] in ('P1', 'P2') and st != 'FIXED':
            problems.append('%s %s is %s (only FIXED closes P1/P2)' % (f['id'], f['severity'], st))
        if st not in CLOSED_P3:
            problems.append('%s has unknown status %s' % (f['id'], st))
    for k, d in declared.items():
        if DECLARED[k][0] not in ('ACCEPTED', 'ACCEPTED_WITH_RECORD'):
            problems.append('%s not accepted by the review' % k)
    if review['verdict'] != 'APPROVE' or problems:
        return 'REVIEW_REVISE', problems
    carried = [f['id'] for f in findings if DISPOSITION[f['id']][0] == 'CARRIED_OVER']
    return ('COMPLETED_LOCAL_WITH_CARRIED_FINDINGS' if carried else 'COMPLETED_LOCAL'), []


def selftest_status():
    """Selftests of the rule above (positive and negative), recorded in the disposition."""
    global DISPOSITION, DECLARED
    keep = DISPOSITION, DECLARED
    out = []
    try:
        rv = {'verdict': 'APPROVE'}
        DISPOSITION, DECLARED = {'X1': ('CARRIED_OVER', '')}, {'DV': ('ACCEPTED', '')}
        out.append(('P1 carried is refused', final_status(rv, [{'id': 'X1', 'severity': 'P1'}], {'DV': {}})[0] == 'REVIEW_REVISE'))
        out.append(('P3 carried gives WITH_CARRIED', final_status(rv, [{'id': 'X1', 'severity': 'P3'}], {'DV': {}})[0] == 'COMPLETED_LOCAL_WITH_CARRIED_FINDINGS'))
        DISPOSITION = {'X1': ('RECORDED', '')}
        out.append(('P3 recorded gives COMPLETED_LOCAL', final_status(rv, [{'id': 'X1', 'severity': 'P3'}], {'DV': {}})[0] == 'COMPLETED_LOCAL'))
        DECLARED = {'DV': ('REJECTED', '')}
        out.append(('deviation not accepted is refused', final_status(rv, [{'id': 'X1', 'severity': 'P3'}], {'DV': {}})[0] == 'REVIEW_REVISE'))
        DISPOSITION, DECLARED = {'X1': ('FIXED', '')}, {'DV': ('ACCEPTED', '')}
        out.append(('P2 fixed closes', final_status(rv, [{'id': 'X1', 'severity': 'P2'}], {'DV': {}})[0] == 'COMPLETED_LOCAL'))
        out.append(('REVISE verdict never completes', final_status({'verdict': 'REVISE'}, [{'id': 'X1', 'severity': 'P2'}], {'DV': {}})[0] == 'REVIEW_REVISE'))
    finally:
        DISPOSITION, DECLARED = keep
    return [{'check': n, 'ok': ok} for n, ok in out]


STAGING_DIST = {'path': '/mnt/dados/cvg-work/cvg-codex100-dp2-runtime-20261020/dist', 'files': 36,
                'manifest_sha256': '764d89eb23a167ae6d834a3c3d64adc3f604e0d5214f7b9942b6cef785450594',
                'rule': 'capability-contracts-dp.json CAP-DP-STAGE: um diretório de staging por sub-lote, apagado no fim do sub-lote',
                'rebuild': 'python3 -I -B python/supervisor.py stage-dist (só a partir do cache conferido por sha)'}
POST_EXEC_TOOLS = ('tools/collect_results.py', 'tools/dry_summary.py', 'tools/empty_artifacts.py', 'tools/preflight_dp2.py',
                   'tools/topology_checks.py', 'tools/close_dp2.py')
DDP12_FILES = ('python/channel.py', 'python/observer.py', 'python/python-driver.py', 'python/supervisor.py', 'python/acceptance.py',
               'case-plan.json', 'selftests/selftest_dp2.py', 'selftests/selftest-results.json', 'tools/validate_unit.py')


def main():
    review = jload('review-r1/review.json')
    findings = review.get('findings', [])
    declared = declared_of(review)
    missing = [f['id'] for f in findings if f['id'] not in DISPOSITION] + [k for k in declared if k not in DECLARED]
    extra = [k for k in DISPOSITION if k not in {f['id'] for f in findings}]
    assert not missing and not extra, 'dispositions out of step with the review: %s %s' % (missing, extra)
    status, problems = final_status(review, findings, declared)
    rule_tests = selftest_status()
    assert all(t['ok'] for t in rule_tests), rule_tests
    blocking = [f['id'] for f in findings if f['severity'] in ('P1', 'P2')]
    carried_ids = [f['id'] for f in findings if DISPOSITION[f['id']][0] == 'CARRIED_OVER']
    disp = {'kind': 'EXECUTOR_DISPOSITION_R1', 'task': TASK, 'review': 'review-r1/review.json', 'review_sha256': sha('review-r1/review.json'),
            'subject': review['subject'], 'subject_sha256': review['subject_sha256'], 'verdict': review['verdict'],
            'erratum_r2_f01': (review.get('erratum_r2_f01') or {}).get('verdict'), 'mandatory': len(blocking),
            'rule': ('Revisão aprovada na primeira rodada sem P1 nem P2: nenhum reparo, nenhum serviço e nenhuma fonte, freeze ou evidência '
                     'executada mudam; os P3 são corrigidos nos registros (R1-F07, R1-F10), registrados para o BIND (R1-F04, R1-F05) ou levados à '
                     'próxima unidade que reusar a pilha Python (os demais).'),
            'dispositions': [{'id': f['id'], 'severity': f['severity'], 'title': f['title'], 'status': DISPOSITION[f['id']][0],
                              'action': DISPOSITION[f['id']][1]} for f in findings],
            'declared_dispositions': [{'id': k, 'review_severity': d.get('severity'), 'decision': DECLARED[k][0], 'note': DECLARED[k][1]}
                                      for k, d in declared.items()],
            'status_rule': 'DP1-ADM/R2-F04 (docstring de tools/close_dp2.py)', 'status_rule_selftests': rule_tests,
            'final_status': status, 'status_problems': problems, 'carried_over': carried_ids,
            'functional_receipts': 0, 'parity_credit': 0, 'written_at': now()}
    save('review-r1/executor-disposition.json', disp)

    cr = jload('case-results.json')
    re_ = jload('reevaluation-dp2.json')
    rows = []
    for r in cr['rows']:
        if r['kind'] == 'CONTROL':
            rows.append({'slot': r['slot'], 'case': r['case'], 'kind': 'CONTROL', 'outcome': r['outcome'], 'rule': r['composition_rule'],
                         'capture_form': r['capture_form'], 'failed': r['failed_predicates'], 'dir': r['attempt_dir'],
                         'final_reading': 'MISMATCH (CONTROL)', 'attribution': 'CONTROL_GATE', 'client_observation': 'NONE',
                         'bind_rule': 'não consumir; o CONTROL só abre o gate'})
            continue
        arms = []
        for a in r.get('arm_record') or []:
            judged = {k: v for k, v in a['judged_by'].items()}
            if a['arm'] == 'PY19.B02':
                judged = {'api.steps_exact': judged.get('api.steps_exact')}
            arms.append({'arm': a['arm'], 'steps': a['steps'], 'credited_by': judged,
                         'credited': all(v is True for v in judged.values())})
        row = {'slot': r['slot'], 'case': r['case'], 'kind': r['kind'], 'conditional': r.get('conditional', False), 'outcome': r['outcome'],
               'rule': r['composition_rule'], 'capture_form': r['capture_form'], 'topology': r.get('topology'), 'failed': r['failed_predicates'],
               'dir': r['attempt_dir'], 'final_reading': r['outcome'],
               'attribution': 'CLIENT' if r['outcome'] == 'PASS_CLIENT_OBSERVATION' else 'PENDING_ADJUDICATION',
               'client_observation': 'OBSERVED' if r['outcome'] == 'PASS_CLIENT_OBSERVATION' else 'NONE', 'arms': arms,
               'build_link': r.get('build_link'),
               'bind_rule': ('consumível pelo BIND do perfil distribuído segundo coverage-plan-dp.json, só nos braços creditados acima e só no '
                             'que o predicado observa; nada além')}
        if r['case'] == 'DP-PY19A':
            row['record'] = DISPOSITION['R1-F04'][1]
        if r['case'] == 'DP-PY02P':
            row['record'] = DISPOSITION['R1-F05'][1]
            row['version_identity'] = 'runtime_version 0.153.4 derivada do userAgent do initialize keyless; build_link NO_BUILD_LINK_DECLARED'
        if r['case'] == 'DP-PY20A':
            row['record'] = ('PY20.B02 creditado sobre o WHEEL observado (uma só linha Tag py3-none-manylinux_2_17_x86_64, Root-Is-Purelib '
                             'false); o endurecimento de chaves repetidas fica para a reutilização (R1-F09).')
        rows.append(row)
    adj = {'kind': 'ADJUDICATION_DP2_OFFLINE', 'task': TASK, 'review': 'review-r1/review.json', 'review_verdict': review['verdict'],
           'rule': ('Leitura final = acceptance.json de serviço (acceptance-r4-dp2) nas 5 pastas executadas e result.json/acceptance.json do '
                    'DP-PY20A, iguais à reavaliação offline em predicados, desfecho e ligação ao plano (reevaluation-dp2.json; reproduzida pelo '
                    'revisor em cópia própria).'),
           'control': cr['control'], 'sdk_final_reading': {k: v for k, v in cr['sdk_counts'].items() if k != 'NOT_RUN'},
           'conditional_slots': {'DP-PY02P': 'RUN depois do DIAG-DP-REAL-CLI-APPSERVER DIAG_PASS (diag-admission-dp2.json)'},
           'erratum_r2_f01': {'applied_in': 'DDP-12 declarado (state.json#/implementation/ddp12_binding)',
                              'review': (review.get('erratum_r2_f01') or {}).get('verdict')},
           'reevaluation': {'predicate_level_equal': re_['all_predicate_level_equal'], 'outcome_equal': re_['all_outcome_equal'],
                            'plan_binding_ok': re_['all_plan_binding_ok']},
           'rows': rows, 'bind_consumes_only': [r['case'] for r in rows if r['kind'] != 'CONTROL' and r['client_observation'] == 'OBSERVED'],
           'not_qualified_here': ['vocabulário D3 da C3-2 presente no driver e não exercido por caso do DP-2 (DV-DP2-01, R1-F10)'],
           'freeze_discipline': {'deviation': 'DV-DP2-02', 'review': 'íntegra em substância (R1)', 'record': DISPOSITION['R1-F01'][1]},
           'declared_deviations': [{'id': k, 'review_severity': d.get('severity'), 'decision': DECLARED[k][0], 'note': DECLARED[k][1],
                                    'lead_acceptance': 'pendente'} for k, d in declared.items()],
           'functional_receipts': 0, 'parity_credit': 0,
           'note': 'Observação de cliente não é paridade: 0 recibos funcionais, 0 crédito de paridade. SPEC0239 BUILD não autorizada.',
           'written_at': now()}
    save('adjudication-dp2.json', adj)

    dp1 = jload('inputs/dp1/next-task.json')
    lead = jload('inputs/dp1/lead-decision-dv1-dv4.json')
    carried = [{'id': 'DP2-ADM/' + i, 'text': DISPOSITION[i][1], 'applies_to': 'próxima unidade que reusar a pilha Python do DP-2'} for i in carried_ids]
    carried += [{'id': c['finding'], 'text': c['text'], 'applies_to': 'aquisição futura ou unidade do driver Node'} for c in dp1['carry_over']
                if c['finding'] in ('ACQ/R1-F03', 'DP1-ADM/R2-F02', 'DP1-ADM/PK07A')]
    record = [{'id': 'DP2-ADM/R1-F04', 'text': DISPOSITION['R1-F04'][1]}, {'id': 'DP2-ADM/R1-F05', 'text': DISPOSITION['R1-F05'][1]},
              {'id': 'DP2-ADM/R1-F09', 'text': rows[[r['case'] for r in rows].index('DP-PY20A')]['record']},
              {'id': 'DP2-ADM/R1-F10', 'text': 'O BIND não usa o DP-2 como qualificação do vocabulário D3 da C3-2.'}]
    nt = {'task': 'DX100-G02:IMPLEMENT-AND-ADMIT-SDK-DISTRIBUTED-PROFILE-DP-1R (proposta; nome, claim e ordem definidos pelo Lead)',
          'previous_task': TASK, 'previous_status': status, 'status': 'READY_PENDING_LEAD_CLAIM',
          'track': 'T1 com execução local contida, pilha Node do DP-1; só o caso novo do PK07',
          't3_required': False, 't4_required': False, 'resume_checkpoint': G02 + 'sdk-distributed-profile-dp2-admission/state.json',
          'why_this_order': ('Decisão do Lead para o PK07 (inputs/dp1/lead-decision-dv1-dv4.json#/pk07 = %s): mini-unidade DP-1R depois do DP-2, '
                             'com errata da fixture e vaga própria, sem retry. Fazê-la antes do BIND deixa o BIND do perfil distribuído '
                             'consumir DP-1, DP-1R e DP-2 numa só rodada; se o Lead preferir o BIND primeiro, o PK07 fica sem observação nele.')
                            % lead['pk07']['decision'],
          'what': ('Especificar a errata da fixture do DP-PK07A (escopo de módulo: filho sintético .exe dentro do "type": "module" do A4) e '
                   'executar um caso novo do PK07 numa vaga própria, com CONTROL do sub-lote, na pilha Node do DP-1; 0 recibos e 0 crédito.'),
          'inputs': {'dp1_adjudication': G02 + 'sdk-distributed-profile-dp1-admission/adjudication-dp1.json',
                     'dp1_next_task': G02 + 'sdk-distributed-profile-dp1-admission/next-task.json',
                     'lead_decision_dp1': G02 + 'sdk-distributed-profile-dp1-admission/lead-decision-dv1-dv4.json',
                     'dp2_adjudication': G02 + 'sdk-distributed-profile-dp2-admission/adjudication-dp2.json',
                     'coverage_plan': G02 + 'sdk-distributed-profile-spec/coverage-plan-dp.json'},
          'carry_over': carried, 'record_for_bind': record,
          'after_this': ['BIND do perfil distribuído (DP-1, DP-1R e DP-2) ao lado do v5 (base de coverage-plan-dp.json; compor com o v6 da '
                         'continuação 3 fica a critério do Lead): PY19, PY20 e o ramo empacotado do PY02 com observação parcial de cliente '
                         'nos braços creditados em adjudication-dp2.json; GAP-PROVENANCE e GAP-PLATFORM-PACKAGING seguem OPEN; build_link '
                         'NO_BUILD_LINK_DECLARED',
                         'apagar o runtime privado e as worktrees das unidades DP depois do BIND, por decisão do Lead'],
          'not_authorized_now': ['rede ou nova aquisição', 'provider, credencial, login, turn ou chamada a modelo (gate T4)',
                                 'capability do kernel ou privilégio (Q4)', 'npm/pip install ou instalação global',
                                 'executar binário do cache fora da contenção', 'outras versões de pydantic ou Node (Q5)', 'push', 'produção',
                                 'SPEC0239 BUILD'],
          'functional_receipts': 0, 'parity_credit': 0, 'created_at': now()}
    save('next-task.json', nt)

    st = jload('state.json')
    sf = jload('source-freeze-dp2.json')['files']
    im = st['implementation']
    im['DDP-08'] = ('aplicado: source-freeze-dp2.json (pilha Python, autotestes e resultado, validador e resultado, plano, fixture-cases.json e '
                    'cópias da especificação) e identity-freeze-dp2.json (cache reconferido contra acquisition-ledger.json: arquivos A1-A5 e A7 e '
                    'o metadado M7; membros das entradas dos casos contra artifact-metadata.json; A5 pelo registro e membros comuns A1/A5; '
                    'manifesto do /dist do sub-lote, 36 arquivos; árvores sdk-python e python-deps; âncoras de entrada; host; propriedades de '
                    'serviço; topologia; argv) antes de qualquer serviço. As árvores de fixture são materializadas por tentativa a partir de '
                    'fixture-cases.json e registradas em profile-manifest.json#/fixture_manifest_host de cada pasta (texto corrigido pelo '
                    'R1-F07; ver DV-DP2-02 sobre o refreeze).')
    im['ddp12_binding'] = {'rule': ('DDP-12 (errata DP-SPEC/R2-F01) não tem adendo próprio: a declaração normativa é o texto de '
                                    'DDP-12_erratum_R2_F01 acima, e o comportamento está ligado pelo source freeze nos arquivos abaixo (R1-F07).'),
                           'files': {p: sf[p]['sha256'] for p in DDP12_FILES},
                           'source_freeze_sha256': sha('source-freeze-dp2.json')}
    im['carry_over_dp1']['DP1-ADM/R2-F04'] = ('aplicado no fechamento: tools/close_dp2.py final_status (P1/P2 só fecham como FIXED; desvio não '
                                              'aceito ou P1/P2 aberto dá REVIEW_REVISE; item levado adiante dá '
                                              'COMPLETED_LOCAL_WITH_CARRIED_FINDINGS), com autotestes positivos e negativos.')
    st['post_execution_tools'] = {'rule': ('Ferramentas que só leem as pastas executadas e escrevem registros derivados; ficam fora do source freeze '
                                           'e são ligadas aqui por sha (R1-F07). O revisor reproduziu topology_checks e a reavaliação.'),
                                  'files': {p: sha(p) for p in POST_EXEC_TOOLS}}
    st['status'] = status
    st['review'] = {'r1': {'path': 'review-r1/review.json', 'sha256': sha('review-r1/review.json'), 'subject': 'review-freeze-r1.json',
                           'subject_sha256': review['subject_sha256'], 'verdict': review['verdict'],
                           'erratum_r2_f01': (review.get('erratum_r2_f01') or {}).get('verdict'),
                           'findings': {s: sum(1 for f in findings if f['severity'] == s) for s in ('P1', 'P2', 'P3')},
                           'declared_deviations': {k: d.get('severity') for k, d in declared.items()},
                           'disposition': 'review-r1/executor-disposition.json'}}
    st['budget']['reviews'] = '1/2'
    st['budget']['grouped_repairs'] = '0/1'
    st['resources']['staging_dist'] = dict(STAGING_DIST, status='apagado no fechamento' if not Path(STAGING_DIST['path']).exists() else 'presente')
    st['resources']['kept'] = ['worktree /mnt/dados/cvg-work/cvg-codex100-dp2-20261020',
                               'runtime /mnt/dados/cvg-work/cvg-codex100-dp2-runtime-20261020 sem o /dist (attempts, dry, sdk-python, python-deps; '
                               'evidência privada das execuções; apagar depois do BIND fica para o Lead)']
    st['adjudication'] = 'adjudication-dp2.json'
    st['next_task'] = 'next-task.json'
    st['closing_documents'] = ['review-r1/executor-disposition.json', 'adjudication-dp2.json', 'next-task.json', 'ledger-delta-cont-d9ef.md',
                               'lead-secret-scan-triage.json', 'post-review-r1-changes.json', 'unit-manifest.json', 'commit-receipt.json']
    st['updated_at'] = now()
    save('state.json', st)
    print(json.dumps({'status': status, 'problems': problems, 'verdict': review['verdict'], 'findings': len(findings),
                      'carried': carried_ids, 'rule_selftests': '%d/%d' % (sum(t['ok'] for t in rule_tests), len(rule_tests))}, ensure_ascii=False))


if __name__ == '__main__':
    main()
