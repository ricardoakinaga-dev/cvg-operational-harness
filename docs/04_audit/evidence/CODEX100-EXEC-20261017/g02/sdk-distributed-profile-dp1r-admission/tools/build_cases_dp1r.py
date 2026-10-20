"""Derivation of the DP-1R cases with the declared fixture erratum EDP1R-01 (T1, before the source freeze).

Usage (cwd = unit folder):
  python3 -I -B tools/build_cases_dp1r.py write   -> cases-dp-1r.json and erratum-dp1r.json (refuses to overwrite)
  python3 -I -B tools/build_cases_dp1r.py check   -> recomputes both from the frozen spec and compares bytes (exit 0 when equal)

Source: inputs/spec-dp/cases-dp-1.json (sha daafcb4e..., the approved spec). Two cases are derived, nothing else is invented:
- DP-PK07B: DP-PK07A with the fixture erratum EDP1R-01 and nothing else. In DP-1 the synthetic child named
  codex-responses-api-proxy.exe sat inside the "type": "module" scope of the A4 package.json, and Node v24.20.0 refused the
  unknown extension (ERR_UNKNOWN_FILE_EXTENSION, inputs/dp1/pk07a/blob-stderr-7.txt), so the win32 pairs left no child record
  (DP-PK07A INVALID_CAPTURE, inputs/dp1/adjudication-dp1.json). The path the wrapper builds (vendor/<triple>/
  codex-responses-api-proxy/<name>[.exe]) is the observation of PK07.B01 and PK07.B03 (child.executed_path_exact), so neither the
  location nor the extension of the spawned file may change. The erratum moves the module-scope boundary instead: a declared
  package.json {"type":"commonjs"} in each of the two win32 leaf directories, so the nearest package.json of the .exe stand-in is
  no longer the A4 one and Node loads it as CommonJS (the synthetic child is valid in both formats). The A4 wrapper keeps its own
  scope (bin/ under the A4 package.json, "type": "module"). Steps, expected values, predicates, arms and anchors are unchanged.
- DP1R-CTRL01: the CONTROL of the sub-lot, DP1-CTRL01 with the same case_input bytes (sha b0234bc9...), new id and slot.
The predicate table, the composition, the capture forms and the classes are copied unchanged (EDP-01: never reclassified).
"""
import copy
import hashlib
import json
import sys
from pathlib import Path

sys.dont_write_bytecode = True
UNIT = Path(__file__).resolve().parent.parent
SRC = UNIT / 'inputs' / 'spec-dp' / 'cases-dp-1.json'
SRC_SHA = 'daafcb4e53e06b284e92f94f221bfd1653fff44a697234051ae8d2da3e60829b'
OUT = UNIT / 'cases-dp-1r.json'
ERRATUM = UNIT / 'erratum-dp1r.json'
TASK = 'DX100-G02:IMPLEMENT-AND-ADMIT-SDK-DISTRIBUTED-PROFILE-DP-1R'
PKG = '/fixture/pk07/all/node_modules/@openai/codex-responses-api-proxy'
WIN_LEAVES = [PKG + '/vendor/aarch64-pc-windows-msvc/codex-responses-api-proxy', PKG + '/vendor/x86_64-pc-windows-msvc/codex-responses-api-proxy']
SCOPE_ENTRY = {'kind': 'json', 'value': {'type': 'commonjs'}}
COPIED_TOP = ('pins', 'profile', 'staging', 'expectation_rule', 'capture_forms', 'predicate_classes', 'composition', 'predicate_table')
PK07B_CHANGED = ('id', 'sub_lot', 'slot', 'case_input', 'case_input_sha256', 'erratum', 'replaces_observation_of')
CTRL_CHANGED = ('id', 'sub_lot', 'slot', 'gate')


def sha(b):
    return hashlib.sha256(b).hexdigest()


def compact(obj):
    return json.dumps(obj, separators=(',', ':'), ensure_ascii=False, allow_nan=False)


def dumps(obj):
    return (json.dumps(obj, ensure_ascii=False, indent=1) + '\n').encode('utf-8')


def source():
    raw = SRC.read_bytes()
    assert sha(raw) == SRC_SHA, 'cases-dp-1.json drifted from the approved spec'
    doc = json.loads(raw)
    cases = {c['id']: c for c in doc['cases']}
    return doc, cases


def derive_pk07b(a):
    b = copy.deepcopy(a)
    entries = b['case_input']['trees'][0]['entries']
    assert b['case_input']['trees'][0]['root'] == '/fixture/pk07/all'
    out = []
    for e in entries:
        leaf = e['path'].rsplit('/', 1)[0]
        if e['kind'] == 'synthetic_child' and e['path'].endswith('.exe'):
            assert leaf in WIN_LEAVES, 'unexpected .exe stand-in: %s' % e['path']
            out.append(dict(path=leaf + '/package.json', **copy.deepcopy(SCOPE_ENTRY)))
        out.append(e)
    b['case_input']['trees'][0]['entries'] = out
    assert sum(1 for e in out if e['path'].endswith('/package.json') and e['kind'] == 'json') == 2
    b['id'] = 'DP-PK07B'
    b['sub_lot'] = 'DP-1R'
    b['slot'] = 1
    b['case_input_sha256'] = sha(compact(b['case_input']).encode('utf-8'))
    b['erratum'] = {'id': 'EDP1R-01', 'file': 'erratum-dp1r.json', 'track': 'T1',
                    'summary': 'package.json {"type":"commonjs"} declarado nas duas folhas win32, antes dos stand-ins .exe; nada mais muda'}
    b['replaces_observation_of'] = 'DP-PK07A (INVALID_CAPTURE adjudicado em inputs/dp1/adjudication-dp1.json; caso novo, não retry)'
    return b


def derive_ctrl(c):
    d = copy.deepcopy(c)
    d['id'] = 'DP1R-CTRL01'
    d['sub_lot'] = 'DP-1R'
    d['slot'] = 2
    d['gate'] = ('Roda antes do DP-PK07B, o único caso do sub-lote DP-1R. Critério: MISMATCH vindo só de wrap.exit_mirror_exact, com '
                 'capture.case_input_frozen_bytes, fixture.tree_exact, keyless.no_network_no_credential, service.limits_declared, '
                 'child.program_followed e control.own_code_only aprovados. Qualquer outro desfecho para o sub-lote.')
    assert d['case_input_sha256'] == sha(compact(d['case_input']).encode('utf-8')), 'CONTROL case_input bytes'
    return d


def unchanged(a, b, changed):
    return sorted(k for k in set(a) | set(b) if k not in changed and a.get(k) != b.get(k))


def build():
    doc, cases = source()
    a, c = cases['DP-PK07A'], cases['DP1-CTRL01']
    assert a['case_input_sha256'] == sha(compact(a['case_input']).encode('utf-8')), 'DP-PK07A case_input bytes'
    b, ctrl = derive_pk07b(a), derive_ctrl(c)
    assert not unchanged(a, b, PK07B_CHANGED) and not unchanged(c, ctrl, CTRL_CHANGED)
    used = sorted({k for x in (b, ctrl) for k in x['inputs']})
    out = {'kind': 'SDK_DISTRIBUTED_PROFILE_CASES_DERIVED_WITH_DECLARED_ERRATUM', 'task': TASK, 'sub_lot': 'DP-1R',
           'status': 'DERIVED_BEFORE_SOURCE_FREEZE_NOT_RUN',
           'derived_from': {'path': 'inputs/spec-dp/cases-dp-1.json', 'sha256': SRC_SHA, 'cases': ['DP-PK07A', 'DP1-CTRL01'],
                            'tool': 'tools/build_cases_dp1r.py', 'erratum': 'erratum-dp1r.json'},
           'inputs': {k: doc['inputs'][k] for k in used}}
    for k in COPIED_TOP:
        out[k] = doc[k]
    out['counts'] = {'slots': 2, 'cases': 1, 'control': 1, 'conditional': 0, 'artifact_checks': 0}
    out['execution_order'] = ('O CONTROL DP1R-CTRL01 roda primeiro e precisa dar MISMATCH; depois o DP-PK07B, uma vez, sem retry. '
                              'Nenhuma vaga condicional.')
    out['cases'] = [b, ctrl]
    out['functional_receipts'] = 0
    out['parity_credit'] = 0
    cases_bytes = dumps(out)
    added = [e for e in b['case_input']['trees'][0]['entries'] if e['kind'] == 'json']
    err = {
        'kind': 'DECLARED_FIXTURE_ERRATUM', 'id': 'EDP1R-01', 'task': TASK, 'track': 'T1 (errata de fixture antes do source freeze)',
        'authority': ['inputs/dp1/lead-decision-dv1-dv4.json#/pk07 (NEW_CASE_IN_DP1R_AFTER_DP2)',
                      'mensagem do coordenador de 20/10/2026 (errata T1 da fixture antes do freeze, registrada como delta declarado)'],
        'source': {'path': 'inputs/spec-dp/cases-dp-1.json', 'sha256': SRC_SHA, 'case': 'DP-PK07A', 'case_input_sha256': a['case_input_sha256']},
        'defect': {'observed_in': 'inputs/dp1/pk07a (DP-PK07A, passos 7 e 8)',
                   'stderr_step_7_sha256': sha((UNIT / 'inputs' / 'dp1' / 'pk07a' / 'blob-stderr-7.txt').read_bytes()),
                   'stderr_step_8_sha256': sha((UNIT / 'inputs' / 'dp1' / 'pk07a' / 'blob-stderr-8.txt').read_bytes()),
                   'text': ('Node v24.20.0 executa o stand-in pelo shebang; o package.json mais próximo era o do A4 ("type": "module"), '
                            'e no escopo de módulo uma extensão desconhecida (.exe) é recusada antes de qualquer código '
                            '(ERR_UNKNOWN_FILE_EXTENSION). Sem registro do filho, child.program_followed (sanidade) falhou: '
                            'INVALID_CAPTURE pela regra 4, defeito de fixture da especificação, não fato do cliente.')},
        'change': {'added_entries': added, 'changed_entries': [], 'removed_entries': [],
                   'placement': 'cada package.json entra na mesma árvore /fixture/pk07/all, logo antes do stand-in .exe da sua folha'},
        'why_not_location_or_extension': ('O caminho que o wrapper monta é o que o PK07 observa: vendor/<triple>/codex-responses-api-proxy/'
                                          '<nome>, com .exe em win32 (âncoras das linhas 51-58 do A4). Mudar o local ou a extensão do '
                                          'arquivo executado mudaria o child_executed_path congelado e tiraria o poder de distinguir o '
                                          'braço PK07.B01 (par errado) e o PK07.B03 (layout). A errata muda só a fronteira do escopo de '
                                          'módulo, que o wrapper nunca lê.'),
        'node_rule': ('Node v24.20.0, entrada principal: .mjs é ESM, .cjs é CommonJS, .js e sem extensão seguem o "type" do package.json '
                      'mais próximo (sem extensão em escopo module roda como ESM); outra extensão em escopo "type": "module" lança '
                      'ERR_UNKNOWN_FILE_EXTENSION, e em escopo commonjs (ou sem "type") carrega como CommonJS. O filho sintético não '
                      'tem import nem require (builtins por process.getBuiltinModule), então roda igual nos dois formatos.'),
        'preserved': {'pk07b_fields_changed': list(PK07B_CHANGED), 'everything_else_equal_to': 'DP-PK07A',
                      'expected': 'igual (child_executed_path com .exe nas duas folhas win32)', 'predicates': a['predicates'],
                      'arms': [x['arm'] for x in a['arm_discrimination']], 'anchors_sha256': sorted({x['sha256'] for x in a['anchors']})},
        'contrary_still_visible': {
            'reading': ('Os contrários da arm_discrimination congelada continuam visíveis como MISMATCH; os contrários em que o cliente '
                        'deixa de executar um filho esperado, ou executa um filho não esperado, caem antes em child.program_followed '
                        '(classe peer_or_capture_sanity da tabela congelada, nunca reclassificada: EDP-01) e dão INVALID_CAPTURE pela '
                        'regra 4, nunca PASS. Um INVALID_CAPTURE do DP-PK07B se adjudica pelo stderr do passo (ENOENT do spawn do '
                        'cliente contra ERR_UNKNOWN_FILE_EXTENSION do stand-in) antes de qualquer atribuição.'),
            'mismatch': [
                'PK07.B01 triple errado em win32: o filho de outra folha roda e registra outro caminho -> child.executed_path_exact (regra 6)',
                'PK07.B02 plataforma inválida aceita (exit 0, sem o texto Unsupported platform) -> wrap.exit_mirror_exact e wrap.stderr_contains (regra 6)',
                'PK07.B03 checagem de existência com erro diferente de ENOENT, sem spawn -> wrap.stderr_contains (regra 6)'],
            'invalid_capture_rule_4': [
                'win32 sem .exe: spawn de um caminho inexistente, ENOENT, nenhum filho -> child.program_followed com wrap.exit_mirror_exact e child.executed_path_exact',
                'PK07.B03 com fallback que executa o filho de outra folha -> child.program_followed com os predicados de cliente']},
        'real_distribution_note': ('No pacote publicado a folha win32 contém um PE (codex-responses-api-proxy.exe) que o Node nunca carrega '
                                   'como módulo; o escopo só importa porque o stand-in do harness é um script Node. O package.json '
                                   'declarado é artefato do harness, não do pacote.'),
        'platform_limit': ('Os braços win32 do PK07.B01 julgam decisões em JavaScript do wrapper (triple, nome com .exe e spawn sem '
                           'checagem de existência) sob o shim de plataforma no Linux; para isso não é preciso Windows real, e nenhum '
                           'braço é marcado como limite de plataforma. Fica fora da observação, e não é reivindicado: a criação de '
                           'processo do Windows (CreateProcess, resolução de .exe, aspas de argv e sinais do Windows).'),
        'lesson_applied': ('DP1-ADM/PK07A: o supervisor e o validador conferem o escopo de módulo de todo filho sintético com extensão '
                           'fora de "", .js, .mjs e .cjs antes de qualquer serviço (stage.module_scope_problems); um caso com problema '
                           'é bloqueado antes do lançamento, sem consumir vaga.'),
        'outputs': {'cases-dp-1r.json': {'sha256': sha(cases_bytes), 'cases': ['DP-PK07B', 'DP1R-CTRL01']},
                    'DP-PK07B': {'case_input_sha256': b['case_input_sha256'], 'fixture_entries': sum(len(t['entries']) for t in b['case_input']['trees'])},
                    'DP1R-CTRL01': {'case_input_sha256': ctrl['case_input_sha256'], 'same_bytes_as': 'DP1-CTRL01'}},
        'functional_receipts': 0, 'parity_credit': 0}
    return cases_bytes, dumps(err)


def main(argv):
    cases_bytes, err_bytes = build()
    if argv[:1] == ['write']:
        for p, b in ((OUT, cases_bytes), (ERRATUM, err_bytes)):
            with open(p, 'xb') as f:
                f.write(b)
        print(json.dumps({'cases-dp-1r.json': sha(cases_bytes), 'erratum-dp1r.json': sha(err_bytes)}))
        return 0
    if argv[:1] == ['check']:
        ok = OUT.read_bytes() == cases_bytes and ERRATUM.read_bytes() == err_bytes
        print('equal' if ok else 'DIFFERENT')
        return 0 if ok else 1
    print(__doc__)
    return 2


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
