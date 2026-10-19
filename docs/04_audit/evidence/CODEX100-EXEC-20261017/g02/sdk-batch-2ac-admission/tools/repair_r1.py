"""Grouped repair R1 (offline; no service, no SDK, no network). Run: python3 -I -B tools/repair_r1.py

Answers review-r1/review.json without changing any outcome and without rewriting frozen or executed records:
- R1-F04: replays the frozen peer v2 script over the committed adapter stdin of every directory whose case_input has a
  peer_script (CONTROL and the DIAG-PY rows) and writes reevaluation-r4_1-peer-replay.json;
- R1-F02: adds the R4-03 reading next to the observer verdict in case-results.json (rows and a new diagnostics block);
- R1-F02, R1-F08, R1-F10: writes errata-r1.json for the records that stay as executed (case-ledger.json, budget.json,
  identity-freeze-r4.json, labels of the frozen sources and the specification);
- R1-F01, R1-F03, R1-F05..F07, R1-F11, R1-F12: rewrites state.json (status, selftest suites, the complete deviation list,
  the carry-over to the next freeze) and writes repair-r1.json.
After review R2 (review-r2/review.json), the deviation list (D4 text, D7-D9), E6, the carry-over and the adjudication, next_task and
tools_repair blocks of state.json (written by hand before R2, R2-F05) were brought into this tool; tools/close_r2.py applies the same
changes to the reviewed documents without regenerating them.
Preimages are kept in archives/review-r1-preimages/ (copied once, never overwritten).
"""
import datetime
import glob
import hashlib
import importlib.util
import json
import shutil
import sys
from pathlib import Path

sys.dont_write_bytecode = True
U = Path(__file__).resolve().parent.parent
ARCH = U / 'archives' / 'review-r1-preimages'
TASK = 'DX100-G02:IMPLEMENT-AND-ADMIT-SDK-SOURCE-BATCH-2A-CONTINUATION'


def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def sha(b):
    return hashlib.sha256(b).hexdigest()


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def jload(rel):
    return json.loads((U / rel).read_text())


def save(rel, doc):
    (U / rel).write_text(json.dumps(doc, ensure_ascii=False, indent=2) + '\n')


def archive(rel, name=None):
    ARCH.mkdir(parents=True, exist_ok=True)
    dst = ARCH / (name or Path(rel).name)
    if not dst.exists():
        shutil.copy2(U / rel, dst)
    return {'path': dst.relative_to(U).as_posix(), 'sha256': sha(dst.read_bytes())}


ACC = load('repair_acceptance', U / 'python' / 'acceptance.py')
OBS = load('repair_observer', U / 'python' / 'observer.py')


def role_logs(ev):
    """The RoleLogs of one directory, rebuilt as acceptance.py _judge does (raw frames + recv_ns)."""
    result = json.loads((ev / 'result.json').read_text())
    cfg = json.loads((ev / 'profile' / 'adapter-config.json').read_text())
    files = json.loads((ev / 'profile-manifest.json').read_text())['files']
    src = {'python': {'driver': 'python-driver.py', 'adapter': 'adapter-python.py', 'peer': 'fixture-rpc.py'},
           'typescript': {'driver': 'ts-driver.mjs', 'adapter': 'adapter-typescript', 'peer': 'fixture-cli.mjs'}}[cfg['language']]
    if cfg['case'] == '2AC-CTRL01':
        src = dict(src, driver='control-client.py')
    logs = {}
    for role in ('driver', 'adapter', 'peer'):
        log = OBS.RoleLog(role, {'attempt': cfg['attempt'], 'case': cfg['case'], 'nonce': cfg['nonce'], 'source_sha256': files['/profile/' + src[role]]})
        raw = (ev / ('events-%s.bin' % role)).read_bytes()
        recv = [json.loads(x)['recv_ns'] for x in (ev / ('events-%s.recv.jsonl' % role)).read_text().splitlines()]
        payloads, rest = OBS.split_frames(raw)
        for i, pl in enumerate(payloads):
            log.feed(len(pl).to_bytes(4, 'big') + pl, recv[i] if i < len(recv) else -1)
        if rest:
            log.feed(rest, -1)
        if result['os_checks'].get('fifo_eof_all'):
            log.finish()
        logs[role] = log
    return cfg, result, logs


def peer_replay():
    rows = []
    for d in sorted(glob.glob(str(U / 'cases' / '*'))) + sorted(glob.glob(str(U / 'diagnostics' / '*'))):
        ev = Path(d)
        cfg = json.loads((ev / 'profile' / 'adapter-config.json').read_text())
        if 'peer_script' not in cfg['case_input']:
            continue
        cfg, result, logs = role_logs(ev)
        r = ACC.peer_replay_check(cfg['case_input'], logs)
        recorded = (result.get('diag_checks') or {}).get('peer_wire_replay_equal')
        rows.append(dict({'case': cfg['case'], 'dir': ev.relative_to(U).as_posix(), 'recorded_in_service': recorded}, **r))
    doc = {'kind': 'OFFLINE_REEVALUATION_R4_1_PEER_REPLAY', 'finding': 'review-r1 R1-F04',
           'command': 'python3 -I -B tools/repair_r1.py (acceptance.py peer_replay_check sobre os RoleLogs reconstruídos dos quadros brutos)',
           'evaluator_version': ACC.VERSION, 'rows': rows,
           'control': [r for r in rows if r['case'] == '2AC-CTRL01'][0],
           'note': ('F4-05: igualdade com o stdout comitado quando o adapter termina completo sem sinal, prefixo sob sinal, NOT_CHECKED sem stdout. '
                    'No serviço, capture_extra só registra o MISMATCH; este documento guarda o estado de cada diretório sem reescrever os documentos '
                    'de caso. recorded_in_service = diag_checks.peer_wire_replay_equal quando o DIAG o registrou.'),
           'outcome_changed': False, 'computed_at': now()}
    save('reevaluation-r4_1-peer-replay.json', doc)
    return doc


def r4_03(observer, form):
    """Observer verdict with the R4-03 form next to it whenever the capture is frameless or the two differ."""
    return 'observer %s -> R4-03 %s' % (observer, form) if observer == 'NO_CHILD' or observer != form else observer


def diag_readings():
    out = {}
    for d in sorted(glob.glob(str(U / 'diagnostics' / '*'))):
        res = json.loads((Path(d) / 'result.json').read_text())
        chk = res.get('diag_checks') or {}
        form = 'PREFRAME_TERMINATION' if chk.get('frameless_form_preframe') else 'NO_CHILD' if chk.get('frameless_form_no_child') else res['verdict']
        out[res['case']] = {'dir': Path(d).relative_to(U).as_posix(), 'observer_verdict': res['verdict'], 'r4_03_form': form,
                            'reading': r4_03(res['verdict'], form),
                            'diag_pass': bool(chk.get('verdict_matches_expectation'))}
    return out


def amend_case_results(diags):
    pre = archive('case-results.json')
    doc = jload(pre['path'])  # always amend the preimage, so a rerun gives the same document
    for row in doc['rows']:
        if row.get('outcome') is not None:
            row['capture_reading'] = r4_03(row['capture_verdict'], row['capture_form'])
    doc['diagnostics'] = diags
    doc['amendments'] = [{'by': 'repair-r1 (tools/repair_r1.py)', 'finding': 'review-r1 R1-F02', 'at': now(), 'preimage': pre,
                          'change': 'capture_reading em cada linha e bloco diagnostics com a forma R4-03 ao lado do veredito do observer; nenhum desfecho mudou'}]
    save('case-results.json', doc)
    return pre


def errata(diags):
    idf = jload('identity-freeze-r4.json')
    ledger = jload('case-ledger.json')
    budget = jload('budget.json')
    rows = []
    rows.append({'id': 'E1', 'finding': 'R1-F02', 'file': 'case-ledger.json', 'pointer': '/slots/2A-TS12R/result',
                 'as_recorded': ledger['slots']['2A-TS12R']['result'],
                 'read_as': 'PASS_CLIENT_OBSERVATION; observer NO_CHILD -> R4-03 PREFRAME_TERMINATION (cases/2A-TS12R-*/acceptance.json capture_form)'})
    for i, h in enumerate(budget['history']):
        if h['case'] in diags and diags[h['case']]['observer_verdict'] == 'NO_CHILD':
            rows.append({'id': 'E1', 'finding': 'R1-F02', 'file': 'budget.json', 'pointer': '/history/%d/result' % i, 'as_recorded': h['result'],
                         'read_as': 'DIAG_PASS; %s' % diags[h['case']]['reading']})
    for block in ('admission_diagnostics',):
        for case, v in idf[block].items():
            if v.get('verdict') == 'NO_CHILD':
                rows.append({'id': 'E1', 'finding': 'R1-F02', 'file': 'identity-freeze-r4.json', 'pointer': '/%s/%s/verdict' % (block, case),
                             'as_recorded': v['verdict'], 'read_as': diags[case]['reading']})
    for case, v in idf['ts12r_slot']['diags'].items():
        rows.append({'id': 'E1', 'finding': 'R1-F02', 'file': 'identity-freeze-r4.json', 'pointer': '/ts12r_slot/diags/%s/verdict' % case,
                     'as_recorded': v['verdict'], 'read_as': diags[case]['reading']})
    rows += [
        {'id': 'E2', 'finding': 'R1-F08', 'file': 'source-freeze-r4.json', 'pointer': '/task (escrito por python/supervisor.py, função de source freeze)',
         'as_recorded': jload('source-freeze-r4.json')['task'], 'read_as': TASK},
        {'id': 'E3', 'finding': 'R1-F08', 'file': 'case-plan.json e python/acceptance.py (plan)', 'pointer': '/cases/*/composition',
         'as_recorded': 'cases-2a.json#/composition', 'read_as': 'inputs/spec-2ac/cases-2a-cont.json#/composition'},
        {'id': 'E4', 'finding': 'R1-F08', 'file': 'python/acceptance.py', 'pointer': 'docstrings de reevaluate e reevaluate_write',
         'as_recorded': 'acceptance-r3_1.json', 'read_as': 'acceptance-r4_1.json (constante R31_DOC, que é o que o código usa)'},
        {'id': 'E5', 'finding': 'R1-F08', 'file': 'interface-bindings-v2.json', 'pointer': '/role_kinds/adapter e campos de BEGIN',
         'as_recorded': 'igual ao lote 2A: adapter sem FAULT; BEGIN sem case_input_sha256',
         'read_as': ('vigoram os vínculos de node/channel.cjs, python/channel.py e python/observer.py congelados em source-freeze-r4 (FAULT do adapter, '
                     'campo BEGIN.case_input_sha256), autorizados por F4-01 e F4-07')},
        {'id': 'E6', 'finding': 'R1-F08', 'file': 'python/supervisor.py (ExecWitness.drain) e result.json exec_witness', 'pointer': 'events_in_window[*].t_ns',
         'as_recorded': 't_ns', 'read_as': ('instante da drenagem, não o do evento inotify, em ns monotônicos desde o t0 da tentativa '
                                                     '(result.json t0_monotonic_ns), a mesma base de actions[].t_ns e recv_ns (correção R2-F03)')},
        {'id': 'E7', 'finding': 'R1-F10', 'file': 'inputs/spec-2ac/cases-2a-cont.json e inputs/spec-2ac/freeze-r4-contract.json (especificação, raiz f65f43e5)',
         'pointer': '2A-TS07R.case_input (n: 1e21, f: 1.5); freeze-r4 F4-01 e texto do 2A-TS07X',
         'as_recorded': 'a especificação diz que não há float no case_input TS',
         'read_as': ('o case_input do 2A-TS07R tem dois floats (cópia fiel do 2A-TS07); sem efeito: Python serializa 1e+21 e 1.5 como o JSON.stringify, a '
                     'reserialização Node e Python é igual nos 20 adapter-config.json (selftests/r4_1) e os três papéis relataram o sha congelado em '
                     'serviço. Errata a levar ao BIND.')},
    ]
    doc = {'kind': 'ERRATA_R1', 'task': TASK, 'source': 'review-r1/review.json (R1-F02, R1-F08, R1-F10)',
           'rule': 'Os registros executados e congelados ficam como estão; esta errata diz como lê-los.', 'rows': rows, 'written_at': now()}
    save('errata-r1.json', doc)
    return doc


def selftest_summary():
    r4 = jload('selftests/selftest-results.json')
    r41 = jload('selftests/r4_1/selftest-results.json')
    return {
        'r4': {'path': 'selftests/selftest-results.json', 'passed': r4['passed'], 'failed': r4['failed'], 'sdk_imported': False, 'services': 0,
               'scope': ('suíte própria do r4 (54 testes novos), congelada em source-freeze-r4; não é a suíte r3.1 da admissão 2A, apesar da mesma '
                         'contagem (review-r1 R1-F01)')},
        'r4_1': {'path': 'selftests/r4_1/selftest-results.json', 'passed': r41['passed'], 'failed': r41['failed'], 'sdk_imported': False, 'services': 0,
                 'scope': ('reparo R1 (R1-F01): recorder F4-09 (erro sem listener num stream próprio, ordem no driver e um UNCAUGHT antes do CALLS_DONE '
                           'nos dois serviços), barreira F4-12 (drenar antes de liberar, no fonte e nas três janelas em serviço), suíte r3.1 portada '
                           '(R3-11, regras 2 e 5, R3-08 por prazo, R3-F02, RoleLogs vazios nos 9 casos, rejeições do ScriptV2, exit 2, perturbação e '
                           'versão alheia no reevaluate, wireFixture x frozen_wire), reserialização por papel em todas as vagas F4-01, F4-05 com o '
                           'stdout ordenado do 2A-PY03, efeitos do quadro exit F4-04 executados, IN_Q_OVERFLOW e IN_IGNORED em ExecWitness.drain F4-06, '
                           'aceitação e rejeição de IDs F4-10')}}


DEVIATIONS = [
    {'id': 'D1', 'item': 'F4-07', 'finding': 'R1-F12',
     'text': ('O autoteste offline do fault do adapter foi substituído pelo DIAG-TS-EPIPE em serviço: o adapter exige FIFOs e admissão do canal. '
              'Evidência: diagnostics/962e98815e0c-DIAG-TS-EPIPE/events-adapter.jsonl (READY seq 1, FAULT seq 2, STREAM_END stdin com 0 bytes, '
              'nenhum RAW_READ de stdin) e o assert de fd 0 reaberto em /dev/null em node/adapter-typescript. Adjudicação pedida.')},
    {'id': 'D2', 'item': 'F4-06 / R4-03', 'finding': None,
     'text': 'enoentProbe passou a emitir ERROR_DETAIL com a falha de spawn, para a evidência de NO_CHILD do R4-03 (mudança antes do source-freeze-r4).'},
    {'id': 'D3', 'item': 'F4-11', 'finding': 'R1-F07',
     'text': ('identity-freeze-r4 foi feito depois dos 11 DIAG (06:10:36Z; último DIAG 06:10:31Z; CONTROL 06:10:42Z), contra a letra de F4-11 e do '
              'passo 2 do orçamento. Razão: o desenho herdado do lote 2A liga no identity freeze os DIAG aprovados e a decisão das vagas '
              'condicionais (freeze_identities exige DIAG_PASS). source-freeze-r4 (06:09:56Z) precede o primeiro serviço (06:10:02Z) e os 9 '
              'result.json conferem os dois freezes.')},
    {'id': 'D4', 'item': 'F4-11', 'finding': 'R1-F01, R2-F02',
     'text': ('A suíte r3.1 (54) não foi rodada como estava: ela mira a tabela e os IDs do lote 2A. selftests/r4_1 portou 11 verificações genéricas '
              '(R3-11, regras 2 e 5, R3-08 no 2A-TS12R e no 2A-TS03R, R3-F02, RoleLogs vazios, rejeições do ScriptV2, exit 2, reevaluate, '
              'wireFixture x frozen_wire). Seis testes genéricos da r3.1 que valem para esta tabela não foram portados: nenhum código '
              '-32099..-32000 nem texto de retry nos peer_script congelados; todo nth na ordem da regra; pedido não roteirizado -> -32601 com '
              'data; ctrl-2 recebe o erro não roteirizado congelado; INVALID sem prazo no 2A-TS12R -> INVALID_CAPTURE; acceptance-r4_1.json com '
              'versão alheia -> exit 1. A revisão R2 os portou numa cópia e todos passam (review-r2/review.json R2-F02); o porte vai ao próximo freeze.')},
    {'id': 'D5', 'item': 'F4-01', 'finding': 'R1-F03',
     'text': ('As checagens de env do DIAG-TS-ARGVENV comparam por igualdade de dict e não conferem a ordem. Observação: o /proc environ registrado '
              '(result.json adapter_environ) está na ordem congelada PATH, HOME, CVG_DIAG_ENV, CODEX_INTERNAL_ORIGINATOR_OVERRIDE, e os sha dos '
              'papéis no BEGIN são iguais ao do supervisor; o EXEC_ENV é ordenado pelo adapter por desenho desde o lote 2A (CAP-ENV-EXACT) e não '
              'pode provar a ordem.')},
    {'id': 'D6', 'item': 'F4-05', 'finding': 'R1-F04',
     'text': ('O estado do replay do peer v2 do CONTROL não ficou no documento de caso (capture_extra só registra MISMATCH); registrado offline em '
              'reevaluation-r4_1-peer-replay.json.')},
    {'id': 'D7', 'item': 'F4-09', 'finding': 'R2-F01',
     'text': ('O autoteste do recorder não executa o ts-driver.mjs (que exige canal e SDK): selftests/r4_1 prova a semântica com uma réplica Node '
              '(erro de stream próprio sem listener vira uncaughtException e o processo segue), a ordem registro -> drenagem de 500 ms -> UNCAUGHT '
              '-> CALLS_DONE no fonte e, em serviço, exatamente um UNCAUGHT antes do CALLS_DONE no 2A-TS10E e no DIAG-TS-EPIPE.')},
    {'id': 'D8', 'item': 'F4-12', 'finding': 'R2-F01',
     'text': ('Não há autoteste offline do driver com o passo de barreira: a prova é a ordem no fonte do supervisor (open_window antes do '
              'STEP_RELEASE) e a cadeia em serviço recv(WINDOW_OPEN) <= window_open_ns <= t_ns do STEP_RELEASE <= recv(próximo quadro do driver) '
              'nas três janelas (2A-TS12R, DIAG-TS-PREABORT, DIAG-TS-ENOENT), todas na base do t0 da tentativa.')},
    {'id': 'D9', 'item': 'F4-10', 'finding': 'R2-F01',
     'text': ('Aceitação e rejeição de ID foram testadas por execução só na regex TS de channel.cjs; as listas de channel.py e as constantes do '
              'supervisor são conferidas por presença de texto e, em serviço, pela admissão exata das 9 vagas e dos 11 DIAG. O nome do teste F4-01 '
              'diz "frozen sha in every preserved adapter-config.json", mas o sha congelado só é comparado nas 9 vagas (nos 11 DIAG, Node == Python).')},
]

CARRY_OVER = [
    {'finding': 'R1-F03', 'text': 'Comparar a lista de pares do /proc environ em ordem, não por dict.'},
    {'finding': 'R1-F04', 'text': 'Levar o status do replay do peer v2 (EQUAL, PREFIX, NOT_CHECKED, MISMATCH) ao detalhe de captura de todo caso com peer_script.'},
    {'finding': 'R1-F05', 'text': ('api.stdin_error_uncaught: contar só os UNCAUGHT anteriores ao CALLS_DONE, remover o listener depois da drenagem (ou emitir os '
                                   'tardios como violação) e registrar a pilha e o stream para a adjudicação.')},
    {'finding': 'R1-F06', 'text': 'O gate do CONTROL deve exigir regra 6 e failed_predicates == ["wire.no_turn_interrupt"], não qualquer MISMATCH.'},
    {'finding': 'R1-F07', 'text': 'Separar o identity freeze (antes de qualquer serviço) do registro de admissão dos DIAG, ou mudar a letra do contrato.'},
    {'finding': 'R1-F08', 'text': ('Corrigir os rótulos (task do source freeze, composition, docstrings), atualizar interface-bindings com FAULT e '
                                   'BEGIN.case_input_sha256 e renomear events_in_window[*].t_ns para drained_t_ns.')},
    {'finding': 'R1-F11', 'text': 'Abrir a janela inotify também nos passos de erro com spawns=0 (CAP-ZERO-SPAWN-WITNESS).'},
    {'finding': 'R1-F12', 'text': 'Guardar a chave adapter_close_stdin_at_start por ID de caso no fixture-cli e no adapter.'},
    {'finding': 'R2-F01', 'text': ('Autotestes do driver com canal simulado para o recorder (F4-09) e a barreira (F4-12); aceitação e rejeição de ID '
                                   'nas listas de channel.py e nas constantes do supervisor (F4-10); renomear o teste F4-01 ou comparar o sha '
                                   'congelado também nos DIAG.')},
    {'finding': 'R2-F02', 'text': 'Portar os seis testes genéricos da r3.1 listados em D4.'},
]


def write_state(diags, replay, pre_cr):
    pre = archive('state.json')
    st = jload('archives/review-r1-preimages/state.json')
    st['status'] = 'REPAIRED_AWAITING_REVIEW_R2'
    st['implementation']['deviations'] = DEVIATIONS
    st['selftests'] = selftest_summary()
    st['diagnostics'] = {c: v['reading'] for c, v in diags.items()}
    st['diagnostics_note'] = ('Veredito do observer; nos sem quadro aparece a forma R4-03 ao lado (review-r1 R1-F02). DIAG-TS-PREABORT é '
                              'PREFRAME_TERMINATION e DIAG-TS-ENOENT é NO_CHILD, como o gate do 2A-TS12R exige; os 11 são DIAG_PASS.')
    st['cases']['capture_reading_by_slot'] = {r['case']: r['capture_reading'] for r in jload('case-results.json')['rows'] if r.get('outcome') is not None}
    c = replay['control']
    st['control']['peer_replay_r4_1'] = {'status': c['status'], 'stdout_bytes': c['stdout_bytes'], 'stdout_sha256': c['stdout_sha256'],
                                         'path': 'reevaluation-r4_1-peer-replay.json'}
    st['control']['gate_note'] = ('O gate do supervisor aceita qualquer MISMATCH (R1-F06); o CONTROL executado cumpre o critério completo do contrato: '
                                  'regra 6, failed_predicates só wire.no_turn_interrupt, sanidades aprovadas.')
    st['empty_artifacts']['repair_r1'] = ('motivos do 2A-TS12R reescritos (R1-F09): existência testemunhada por IN_OPEN; término NOT_WITNESSED; '
                                          'DIAG-TS-PREABORT cita o próprio registro de PID e SIGTERM. Pré-imagem em archives/review-r1-preimages/.')
    st['review'] = {'r1': {'path': 'review-r1/review.json', 'subject': 'review-freeze-r1.json', 'verdict': 'REVISE', 'findings': {'P2': 1, 'P3': 11}},
                    'repair_r1': {'path': 'repair-r1.json'}}
    st['errata'] = {'path': 'errata-r1.json', 'findings': ['R1-F02', 'R1-F08', 'R1-F10']}
    st['carry_over_next_freeze'] = CARRY_OVER
    st['adjudication'] = {'path': 'adjudication-r1.json', 'sdk_final_reading': {'PASS_CLIENT_OBSERVATION': 8}, 'bind_consumes_only': 8,
                          'deviations': 'D1-D9 aceitos (D5 e D9 com carry-over)'}
    st['next_task'] = {'path': 'next-task.json', 'task': 'DX100-G02:BIND-SDK-SOURCE-BATCH-2A-CONTINUATION (proposta)', 't3_required': False}
    st['tools_repair'] = ['tools/repair_r1.py', 'tools/adjudicate_r1.py', 'tools/empty_artifacts.py (motivos do 2A-TS12R)', 'tools/close_r2.py']
    st['budget']['reviews'] = '1/2'
    st['budget']['grouped_repairs'] = '1/1'
    st['updated_at'] = now()
    save('state.json', st)
    return pre


def main():
    replay = peer_replay()
    diags = diag_readings()
    pre_cr = amend_case_results(diags)
    err = errata(diags)
    pre_state = write_state(diags, replay, pre_cr)
    pre_empty = archive('empty-artifact-delta.json')
    pre_tool = archive('tools/empty_artifacts.py', 'empty_artifacts.py.txt')
    r41 = jload('selftests/r4_1/selftest-results.json')
    disp = {
        'R1-F01': ('FIXED: selftests/r4_1/selftest_r4_1.py (%d/%d) cobre recorder, barreira, suíte r3.1 portada, reserialização por papel, F4-05 com o '
                   '2A-PY03, efeitos do quadro exit, IN_Q_OVERFLOW/IN_IGNORED em drain e IDs; o que não foi feito como pedido está em D1 e D4; state.json '
                   'diz que os 54 são a suíte r4 e lista D1-D6.' % (r41['passed'], r41['passed'] + r41['failed'])),
        'R1-F02': 'FIXED: capture_reading em case-results.json, leituras R4-03 em state.json e errata E1 para case-ledger.json, budget.json e identity-freeze-r4.json.',
        'R1-F03': 'RECORDED: desvio D5 com a observação da ordem; comparação em ordem levada ao próximo freeze.',
        'R1-F04': 'FIXED: reevaluation-r4_1-peer-replay.json (CONTROL %s, %d bytes, sha256 %s); status no detalhe de captura levado ao próximo freeze.'
                  % (replay['control']['status'], replay['control']['stdout_bytes'], replay['control']['stdout_sha256']),
        'R1-F05': 'CARRIED_OVER: próximo freeze; sem efeito no desfecho (um UNCAUGHT antes do CALLS_DONE nos dois serviços, provado em r4_1).',
        'R1-F06': 'CARRIED_OVER: próximo freeze; o CONTROL executado cumpre o critério completo (state.json control.gate_note).',
        'R1-F07': 'RECORDED: desvio D3 com a razão.',
        'R1-F08': 'RECORDED: errata E2-E6; correções levadas ao próximo freeze.',
        'R1-F09': 'FIXED: tools/empty_artifacts.py separa 2A-TS12R e DIAG-TS-PREABORT; empty-artifact-delta.json regenerado (42 registros, 12 motivos mudaram).',
        'R1-F10': 'RECORDED: errata E7 para o BIND.',
        'R1-F11': 'CARRIED_OVER: próximo freeze.',
        'R1-F12': 'RECORDED: desvio D1 pede adjudicação; restrição da chave por ID levada ao próximo freeze.',
    }
    doc = {'kind': 'GROUPED_REPAIR_R1', 'task': TASK, 'review': {'path': 'review-r1/review.json', 'verdict': 'REVISE'},
           'mode': 'offline: sem serviço, sem SDK, sem rede; vagas não repetidas; desfechos inalterados', 'dispositions': disp,
           'outputs': ['selftests/r4_1/selftest_r4_1.py', 'selftests/r4_1/selftest-results.json', 'reevaluation-r4_1-peer-replay.json', 'errata-r1.json',
                       'case-results.json (emendado)', 'state.json', 'empty-artifact-delta.json', 'tools/empty_artifacts.py', 'tools/repair_r1.py', 'repair-r1.json'],
           'preimages': {'state.json': pre_state, 'case-results.json': pre_cr, 'empty-artifact-delta.json': pre_empty, 'tools/empty_artifacts.py': pre_tool},
           'frozen_untouched': ['source-freeze-r4.json', 'identity-freeze-r4.json', 'selftests/selftest_r4.py', 'selftests/selftest-results.json', 'python/**',
                                'node/**', 'cases/**', 'diagnostics/**', 'case-ledger.json', 'budget.json', 'reevaluation-r4.json', 'review-freeze-r1.json'],
           'outcomes_changed': False, 'services': 0, 'errata_rows': len(err['rows']), 'written_at': now()}
    save('repair-r1.json', doc)
    print(json.dumps({'control_replay': replay['control']['status'], 'replay_rows': [[r['case'], r['status']] for r in replay['rows']],
                      'diags': {c: v['reading'] for c, v in diags.items()}, 'errata_rows': len(err['rows'])}, ensure_ascii=False, indent=1))


if __name__ == '__main__':
    main()
