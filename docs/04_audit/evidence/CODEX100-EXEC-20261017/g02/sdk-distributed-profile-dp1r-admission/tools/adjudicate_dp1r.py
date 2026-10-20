"""Writes adjudication-dp1r.json: the recorded reading of the two executed slots of the DP-1R (nothing here changes an acceptance.json).
Usage: python3 -I -B tools/adjudicate_dp1r.py   (cwd = unit folder)
"""
import base64
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

U = Path(__file__).resolve().parent.parent


def sha(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def blobs(ev):
    out = {}
    for line in (ev / 'events-driver.jsonl').read_text().splitlines():
        e = json.loads(line)
        if e['kind'] == 'BLOB':
            out[e['data']['name']] = out.get(e['data']['name'], b'') + base64.b64decode(e['data']['base64'])
    return out


ctrl = sorted((U / 'cases').glob('DP1R-CTRL01-*'))[0]
pk = sorted((U / 'cases').glob('DP-PK07B-*'))[0]
ca, pa = json.loads((ctrl / 'acceptance.json').read_text()), json.loads((pk / 'acceptance.json').read_text())
b = blobs(pk)
paths = {n: [r['exec_path'] for r in json.loads(b.get('child-records:%d' % n, b'[]'))] for n in range(1, 11)}
doc = {
    'kind': 'ADJUDICATION_DP1R', 'task': 'DX100-G02:IMPLEMENT-AND-ADMIT-SDK-DISTRIBUTED-PROFILE-DP-1R', 'round': 1,
    'rule': 'R4-05/E3-09: a leitura de cada desfecho fica registrada aqui; nada muda acceptance.json, que segue como o serviço o gravou.',
    'items': [
        {'case': 'DP1R-CTRL01', 'outcome': ca['outcome'], 'composition_rule': ca['composition_rule'], 'failed_predicates': ca['failed_predicates'],
         'acceptance': {'path': str((ctrl / 'acceptance.json').relative_to(U)), 'sha256': sha(ctrl / 'acceptance.json')},
         'reading': 'Gate do sub-lote cumprido: MISMATCH pela regra 6 vindo só de wrap.exit_mirror_exact (o wrapper de controle próprio sai com 0 quando o filho sai com 3), com as sanidades aprovadas. Liberou o DP-PK07B.',
         'credit': 'NONE_CONTROL_ONLY'},
        {'case': 'DP-PK07B', 'outcome': pa['outcome'], 'composition_rule': pa['composition_rule'], 'capture_form': pa['capture_form'], 'failed_predicates': pa['failed_predicates'],
         'acceptance': {'path': str((pk / 'acceptance.json').relative_to(U)), 'sha256': sha(pk / 'acceptance.json')},
         'replaces': 'a observação perdida do DP-PK07A (INVALID_CAPTURE adjudicado em inputs/dp1/adjudication-dp1.json); caso novo com a errata EDP1R-01, não retry',
         'erratum_effective': ('Os passos 7 e 8 (win32 x64 e arm64 sob o shim) executaram os stand-ins .exe sob o package.json {"type":"commonjs"} '
                               'declarado; cada um gravou o registro com o caminho .exe congelado e saiu com 0, espelhado pelo wrapper. No DP-1 os '
                               'mesmos passos pararam em ERR_UNKNOWN_FILE_EXTENSION.'),
         'observed_arms': {
             'PK07.B01': {'steps': [1, 2, 3, 4, 5, 6, 7, 8], 'executed_paths': {str(n): paths[n] for n in range(1, 9)},
                          'reading': 'oito pares para os seis triples: linux e android dividem os triples musl; darwin com os dois apple-darwin; win32 com os dois pc-windows-msvc e o nome .exe; julgado por child.executed_path_exact e wrap.exit_mirror_exact'},
             'PK07.B02': {'steps': [9], 'stderr_head': b.get('stderr:9', b'').decode('utf-8', 'replace').split('\n')[4][:120],
                          'reading': 'freebsd x64 lança Unsupported platform antes do spawn: exit 1, nenhum filho (wrap.exit_mirror_exact, wrap.stderr_contains, child.executed_path_exact)'},
             'PK07.B03': {'steps': [10], 'stderr_head': b.get('stderr:10', b'').decode('utf-8', 'replace').split('\n')[0][:200],
                          'reading': 'layout vendor/<triple>/codex-responses-api-proxy/<nome> sem checagem de existência: o spawn do caminho aarch64 ausente dá ENOENT pelo evento error e exit 1, nenhum filho'}},
         'contrary_reading': ('Como registrado em erratum-dp1r.json#/contrary_still_visible: os contrários da arm_discrimination congelada dariam '
                              'MISMATCH; um cliente que deixasse de executar um filho esperado (win32 sem .exe) ou executasse um não esperado (fallback '
                              'no B03) daria INVALID_CAPTURE pela regra 4, via child.program_followed. Nenhum dos dois aconteceu: os 10 passos bateram.'),
         'platform_limit': ('Nenhum braço marcado como limite de plataforma: o que o PK07 julga nos ramos win32 são decisões em JavaScript do wrapper '
                            '(triple, nome .exe, spawn sem checagem) sob o shim, observáveis no Linux. Fica fora e não é reivindicado: a criação de '
                            'processo do Windows real (CreateProcess, resolução de .exe, aspas de argv, sinais do Windows).'),
         'credit': 'CLIENT_BEHAVIOR_ONLY_IF_OBSERVED: observação parcial de cliente para o BIND; 0 recibos funcionais e 0 crédito de paridade aqui',
         'build_link': 'NO_BUILD_LINK_DECLARED'}],
    'functional_receipts': 0, 'parity_credit': 0, 'adjudicated_at': datetime.now(timezone.utc).isoformat()}
(U / 'adjudication-dp1r.json').write_text(json.dumps(doc, ensure_ascii=False, indent=2) + '\n')
print(doc['items'][1]['observed_arms']['PK07.B02']['stderr_head'], '|', doc['items'][1]['observed_arms']['PK07.B03']['stderr_head'][:80])
