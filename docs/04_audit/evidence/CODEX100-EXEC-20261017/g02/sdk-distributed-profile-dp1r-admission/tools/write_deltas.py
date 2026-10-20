"""Writes freeze-deltas-dp1r.json: the declared deltas of the DP-1R code over the admitted DP-1 code (commit 3ca3fd3b0) and the
disposition of every carry-over that reaches this unit. Read-only over the code; run before the source freeze (the file is frozen).
Usage: python3 -I -B tools/write_deltas.py   (cwd = unit folder)
"""
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

UNIT = Path(__file__).resolve().parent.parent
BASE = UNIT.parent / 'sdk-distributed-profile-dp1-admission'
FILES = ['dplane/' + n for n in ('acceptance.py', 'bootstrap.py', 'observer.py', 'stage.py', 'supervisor.py')] + [
    'node/' + n for n in ('dp-channel.cjs', 'dp-control-wrapper.mjs', 'dp-diag-sdkbad.mjs', 'dp-diag-sdkdrift.mjs', 'dp-diag-sdklike.mjs',
                          'dp-diag-wrapper.mjs', 'dp-driver.mjs', 'dp-loader.mjs', 'dp-platform-shim.mjs', 'dp-synth-child.mjs')]


def sha(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


files = {f: {'base_sha256': sha(BASE / f), 'dp1r_sha256': sha(UNIT / f), 'byte_copy': sha(BASE / f) == sha(UNIT / f)} for f in FILES}
doc = {
    'kind': 'DECLARED_DELTAS_DP1R', 'task': 'DX100-G02:IMPLEMENT-AND-ADMIT-SDK-DISTRIBUTED-PROFILE-DP-1R',
    'base': {'path': '../sdk-distributed-profile-dp1-admission', 'commit': '3ca3fd3b0 (recibo do DP-1; presente na base c9b9650bf da candidata)',
             'status': 'COMPLETED_LOCAL_WITH_CARRIED_FINDINGS; DV1-DV4 aceitos (inputs/dp1/lead-decision-dv1-dv4.json)'},
    'files': files,
    'byte_copies': sorted(f for f, v in files.items() if v['byte_copy']),
    'changed': sorted(f for f, v in files.items() if not v['byte_copy']),
    'deltas': [
        {'id': 'EDP1R-01', 'file': 'erratum-dp1r.json, cases-dp-1r.json, tools/build_cases_dp1r.py',
         'text': 'Errata T1 da fixture do PK07: package.json {"type":"commonjs"} declarado nas duas folhas win32 de /fixture/pk07/all, antes dos stand-ins .exe; DP-PK07B = DP-PK07A com essa errata e nada mais; DP1R-CTRL01 = DP1-CTRL01 com os mesmos bytes de case_input.'},
        {'id': 'DDP1R-01', 'file': 'dplane/supervisor.py, node/dp-channel.cjs',
         'text': 'IDs do DP-1R (DP-PK07B, DP1R-CTRL01, DIAG-DP-STAGE, DIAG-DP-NODE, DIAG-DP-SYNTH-CHILD); cases-dp-1r.json ligado pelo sha registrado em erratum-dp1r.json; 2 vagas e 4 serviços; sem vaga condicional nem ARTIFACT_CHECK.'},
        {'id': 'DDP1R-02', 'file': 'node/dp-driver.mjs, dplane/stage.py',
         'text': 'fixture-listing (sandbox) e fixture_manifest (host) varrem a raiz de cada árvore; só os diretórios pais implícitos com modo 0755 são aceitos além das entradas declaradas (carry-over DP1-ADM/R1-F07).'},
        {'id': 'DDP1R-03', 'file': 'node/dp-driver.mjs',
         'text': 'LIMITS e PATHS exportados e congelados com os valores do contrato; interpret aceita limits, paths, scan e killAllowed só para os autotestes offline (main() nunca passa); no prazo do close o wrapper é morto e WRAPPER_DEADLINE é registrado antes de o passo lançar (carry-over DP1-ADM/R2-F02).'},
        {'id': 'DDP1R-04', 'file': 'node/dp-driver.mjs',
         'text': 'A limpeza do LEFTOVER só mata dentro do namespace de PID do bwrap (/proc/1/comm igual a bwrap); fora dele recusa antes de qualquer kill. O driver registra CLEANUP_GUARD {pid1_comm, cleanup_allowed} no início de cada serviço.'},
        {'id': 'DDP1R-05', 'file': 'node/dp-driver.mjs, dplane/supervisor.py',
         'text': 'Só as três linhas DIAG dos contratos das capacidades usadas pelas duas vagas (CAP-DP-STAGE, CAP-DP-NODE-DRIVER, CAP-DP-SYNTH-CHILD). DIAG-TS-ECHO (base do 2AC requalificada no DP-1, DV1) e DIAG-DP-REAL-CLI (só para o DP-REAL01) não são usados; o código deles foi removido do driver.'},
        {'id': 'DDP1R-06', 'file': 'node/dp-diag-wrapper.mjs',
         'text': 'Primeiro argumento opcional --child=<caminho em /fixture/diag> escolhe o filho e não é repassado; sem ele o comportamento é o do DP-1.'},
        {'id': 'DDP1R-07', 'file': 'dplane/stage.py, dplane/supervisor.py',
         'text': 'Gate de escopo de módulo (lição DP1-ADM/PK07A): stage.module_scope_problems; uma vaga com problema é BLOQUEADA antes do lançamento, sem consumir a vaga; no DIAG-DP-SYNTH-CHILD a checagem estática precisa achar exatamente a linha negativa declarada.'},
        {'id': 'DDP1R-08', 'file': 'dplane/supervisor.py',
         'text': 'Critérios dos DIAG alinhados ao pass dos contratos (carry-over DP1-ADM/R1-F04): shim.platform e shim.restore do driver no DIAG-DP-NODE; NO_SIGNAL depois de 5 s no DIAG-DP-SYNTH-CHILD (elapsed julgado); linhas de escopo de módulo da EDP1R-01; symlink com alvo exato e raiz varrida no DIAG-DP-STAGE; guarda de limpeza dentro do bwrap em todos.'},
        {'id': 'DDP1R-09', 'file': 'dplane/supervisor.py',
         'text': 'O source freeze recusa autotestes com falha, fontes dos autotestes diferentes das atuais e validação da unidade com ok false (adotado do DP2-ADM/R1-F01).'},
        {'id': 'EDP1R-02', 'file': 'dplane/acceptance.py',
         'text': 'Avaliador acceptance-dp1r: casos de cases-dp-1r.json ligados pelo sha da errata; tabela de predicados e composição são as cópias inalteradas de cases-dp-1.json (EDP-01).'},
        {'id': 'EDP1R-03', 'file': 'dplane/acceptance.py, dplane/stage.py',
         'text': 'fixture.tree_exact julga todo caminho sob cada raiz (DDP1R-02); o oráculo congelado ("exatamente como declaradas") passa a ser checado também para extras.'},
        {'id': 'EDP1R-04', 'file': 'dplane/acceptance.py', 'text': 'Sem ARTIFACT_CHECK no DP-1R: evaluate_artifact e o parser de exports removidos.'},
    ],
    'deviations': [],
    'deviations_note': 'Nenhum desvio novo. RuntimeMaxSec 90 (DV3) e o layout do registro do filho (DV4) seguem os aceites do Lead do DP-1.',
    'carry_over': [
        {'id': 'DP1-ADM/PK07A', 'from': 'inputs/dp2/next-task.json', 'disposition': 'APPLIED', 'where': 'EDP1R-01, DDP1R-07, DIAG-DP-SYNTH-CHILD (linhas de escopo) e autotestes'},
        {'id': 'DP1-ADM/R2-F02', 'from': 'inputs/dp2/next-task.json', 'disposition': 'APPLIED',
         'where': 'DDP1R-03 e selftests/selftest_dp1r_driver.mjs: prazo injetável com script próprio que não fecha; mutante que cria o marcador antes dos listeners; LEFTOVER com caso negativo e guarda'},
        {'id': 'DP1-ADM/R1-F04-F07', 'from': 'inputs/dp1/next-task.json', 'disposition': 'APPLIED',
         'where': 'DDP1R-08 (pass dos DIAG) e DDP1R-02/EDP1R-03 (raiz das árvores); "/work julgado" vale para o DIAG-DP-REAL-CLI, não usado no DP-1R'},
        {'id': 'DP1-ADM/R2-F04', 'from': 'inputs/dp1/next-task.json', 'disposition': 'APPLIED',
         'where': 'tools/close_dp1r.py: o status final considera desvios pendentes e carry-overs; P1 nunca passa por CARRIED'},
        {'id': 'DP1-ADM/R2-F05', 'from': 'inputs/dp1/next-task.json', 'disposition': 'APPLIED',
         'where': 'tools/validate_unit.py: todas as propriedades de serviço comparadas com a identity freeze do DP-1, com controle negativo; subchecagem do plano com controle negativo'},
        {'id': 'DP1-ADM/R2-F06', 'from': 'inputs/dp1/next-task.json', 'disposition': 'APPLIED_FOR_THE_CAPABILITIES_USED',
         'where': 'selftests_offline de CAP-DP-STAGE, CAP-DP-NODE-DRIVER e CAP-DP-SYNTH-CHILD com positivo e negativo antes do freeze; zip e EROFS de /dist: zip não se aplica (layout A7, A2, A3, A4, sem A1), EROFS fica no DIAG-DP-STAGE'},
        {'id': 'DP2-ADM/R1-F01', 'from': 'inputs/dp2/next-task.json', 'disposition': 'ADOPTED', 'where': 'DDP1R-09 (applies_to era a pilha Python do DP-2; adotado no supervisor reusado)'},
        {'id': 'DP2-ADM/R1-F06', 'from': 'inputs/dp2/next-task.json', 'disposition': 'ADOPTED', 'where': 'dry-runs-before-freeze.json registra os sha do /profile e do host; o validador exige igualdade com as fontes atuais'},
        {'id': 'DP2-ADM/R1-F02, R1-F03, R1-F08, R1-F09', 'from': 'inputs/dp2/next-task.json', 'disposition': 'NOT_APPLICABLE', 'where': 'pilha Python do DP-2, não reusada'},
        {'id': 'ACQ/R1-F03', 'from': 'inputs/dp2/next-task.json', 'disposition': 'NOT_APPLICABLE', 'where': 'sem aquisição; o driver Node não faz GET'},
        {'id': 'DP1-ADM/R2-F03', 'from': 'inputs/dp1/next-task.json', 'disposition': 'NOT_APPLICABLE', 'where': 'DIAG do binário real não usado no DP-1R'},
    ],
    'functional_receipts': 0, 'parity_credit': 0, 'written_at': datetime.now(timezone.utc).isoformat()}
(UNIT / 'freeze-deltas-dp1r.json').write_text(json.dumps(doc, ensure_ascii=False, indent=2) + '\n')
print(len(doc['byte_copies']), 'byte copies;', len(doc['changed']), 'changed')
