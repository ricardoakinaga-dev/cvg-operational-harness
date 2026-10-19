"""Read-only addendum to input-order-errata.json (repair R1, finding R1-F04). No service, no SDK.
Run: python3 -I tools/input_order_addendum.py   -> writes input-order-errata-addendum-r1.json

For every slot it measures which wire bytes left the frozen insertion order because the delivered case_input had its
object keys sorted: the TypeScript fixture stdout (adapter-committed bytes against the frozen-order and the sorted-order
JSONL serializations), the Python peer v2 output (adapter-committed stdout against a replay of the peer v2 plan over the
recorded client requests, once with the frozen peer_script and once with its key-sorted copy), the CONTROL client lines
(adapter stdin against both serializations) and the key order of the adapter environ (2A-TS09). Values never differ.
"""
import datetime
import importlib.util
import json
from pathlib import Path

U = Path(__file__).resolve().parent.parent


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def sorted_copy(x):
    return json.loads(json.dumps(x, sort_keys=True))


def jsonl(lines):
    return ''.join((ln if isinstance(ln, str) else json.dumps(ln, separators=(',', ':'), ensure_ascii=False)) + '\n' for ln in lines).encode()


def committed(d, role, stream):
    out = bytearray()
    for ln in (d / ('events-%s.jsonl' % role)).read_text().splitlines():
        e = json.loads(ln)
        if e['kind'] == 'RAW_READ' and e['data']['stream'] == stream:
            import base64
            out += base64.b64decode(e['data']['base64'])
    return bytes(out)


def replay(rpc, script, client_bytes):
    s = rpc.ScriptV2(script)
    out = b''
    for raw in client_bytes.split(b'\n'):
        if not raw:
            continue
        msg = json.loads(raw)
        if not (isinstance(msg, dict) and isinstance(msg.get('method'), str) and 'id' in msg):
            continue
        _rule, ops = s.plan(msg)
        for op in ops:
            if op[0] == 'write':
                out += op[3]
            elif op[0] == 'hold':
                out += op[2]
    return out


def main():
    rpc = load('add_fixture_rpc', U / 'python' / 'fixture-rpc.py')
    rpc.C = load('add_channel', U / 'python' / 'channel.py')
    spec = {c['id']: c for c in json.loads((U / 'inputs' / 'spec-2a' / 'cases-2a.json').read_text())['cases']}
    ledger = json.loads((U / 'case-ledger.json').read_text())
    rows = []
    for cid, c in sorted(spec.items(), key=lambda x: x[1]['slot']):
        d = U / 'cases' / ('%s-%s' % (cid, ledger['slots'][cid]['attempt'][:12]))
        res = json.loads((d / 'result.json').read_text())
        acc = json.loads((d / 'acceptance.json').read_text())
        row = {'case': cid, 'capture_form': acc['capture_form'], 'service_outcome': acc['outcome']}
        stdout = committed(d, 'adapter', 'stdout') if (d / 'events-adapter.jsonl').stat().st_size else b''
        if c['kind'] == 'SDK' and c['language'] == 'typescript':
            fx = c['fixture']
            if 'JSONL' in fx:
                fz, so = jsonl(fx['JSONL']), jsonl(sorted_copy(fx['JSONL']))
                row['fixture_stdout'] = {'kind': 'JSONL', 'equals_frozen_order': stdout == fz, 'equals_sorted_order': stdout == so,
                                         'frozen_and_sorted_identical': fz == so, 'bytes': len(stdout),
                                         'service_integrity_check_ran': acc['capture_form'] == 'PASS',
                                         'service_reference': 'ts_fixture (linhas ordenadas)', 'reevaluate_reference': 'ordem congelada'}
            elif 'stdout_chunks_hex' in fx:
                row['fixture_stdout'] = {'kind': 'hex chunks', 'equals_frozen_bytes': stdout == b''.join(bytes.fromhex(h) for h in fx['stdout_chunks_hex'])}
            else:
                row['fixture_stdout'] = {'kind': 'no wire', 'bytes': len(stdout)}
            if 'child_env' in c['expected'] and res.get('adapter_environ') is not None:
                row['adapter_environ_key_order'] = {'observed': list(res['adapter_environ']), 'frozen_child_env': list(c['expected']['child_env']),
                                                    'same_order': list(res['adapter_environ']) == list(c['expected']['child_env']),
                                                    'same_value': res['adapter_environ'] == c['expected']['child_env']}
        else:
            stdin = committed(d, 'adapter', 'stdin')
            fz, so = replay(rpc, c['peer_script'], stdin), replay(rpc, sorted_copy(c['peer_script']), stdin)
            row['peer_v2_stdout'] = {'equals_frozen_order_replay': stdout == fz, 'equals_sorted_order_replay': stdout == so,
                                     'frozen_and_sorted_identical': fz == so, 'bytes': len(stdout)}
            if c['kind'] == 'CONTROL':
                lines = c['control_client']['lines']
                f_cl = ''.join(json.dumps(x) + '\n' for x in lines).encode()
                s_cl = ''.join(json.dumps(x) + '\n' for x in sorted_copy(lines)).encode()
                row['control_client_stdin'] = {'equals_frozen_order': stdin == f_cl, 'equals_sorted_order': stdin == s_cl}
        rows.append(row)
    ts_obj = [r['case'] for r in rows if r.get('fixture_stdout', {}).get('kind') == 'JSONL' and not r['fixture_stdout']['frozen_and_sorted_identical']]
    doc = {'kind': 'INPUT_KEY_ORDER_ERRATA_ADDENDUM_R1', 'task': 'DX100-G02:IMPLEMENT-AND-ADMIT-SDK-SOURCE-BATCH-2A', 'finding': 'review-r1/review.json R1-F04',
           'base': 'input-order-errata.json (explica os 3 MISMATCH; este adendo registra os demais efeitos no fio)',
           'rows': rows,
           'summary': {
               'ts_fixture_stdout_out_of_frozen_order': [r['case'] for r in rows if r.get('fixture_stdout', {}).get('kind') == 'JSONL'
                                                         and not r['fixture_stdout']['equals_frozen_order']],
               'ts_jsonl_cases_with_objects': ts_obj,
               'py_peer_stdout_out_of_frozen_order': [r['case'] for r in rows if 'peer_v2_stdout' in r and not r['peer_v2_stdout']['equals_frozen_order_replay']],
               'py_peer_stdout_equal_to_sorted_replay': all(r['peer_v2_stdout']['equals_sorted_order_replay'] for r in rows if 'peer_v2_stdout' in r),
               'control_client_line_order': [r.get('control_client_stdin') for r in rows if 'control_client_stdin' in r][0],
               'adapter_environ_order_changed': [r['case'] for r in rows if r.get('adapter_environ_key_order') and not r['adapter_environ_key_order']['same_order']]},
           'integrity_reference': {
               'service': 'supervisor.py ts_fixture() deriva o wire de integridade de json.loads(fixture_bytes()), as linhas já ordenadas; por isso a checagem "frozen fixture wire bytes" do observer nunca detectaria o desvio.',
               'reevaluate': 'acceptance.py reevaluate deriva o wire da ordem congelada de cases-2a.json; as duas referências divergem.',
               'masking': 'observer.py reconcile só compara o wire quando o adapter termina com END completo e sem sinal; os três casos TS com objetos JSONL (2A-TS04, 2A-TS14, 2A-TS15) terminaram KNOWN_SIGNAL_TERMINATION, então nenhuma das duas referências foi exercida neles.'},
           'qualification': ('O PASS_CLIENT_OBSERVATION de 2A-TS04, 2A-TS14 e 2A-TS15 foi observado com stdout do fixture de mesmo valor e chaves em ordem de code point; '
                             'nos sete casos PY e no 2A-CTRL01 as respostas do peer e as linhas do cliente de controle saíram da cópia ordenada. Os predicados comparam valores '
                             '(jeq, sem ordem de chave), então nenhum desfecho muda; a ordem de chaves no fio não foi observada com a entrada congelada.'),
           'precondition_for_reuse': ['remover sort_keys da entrega do case_input (fixture-cases.json pode seguir canônico para hash, mas o case_input precisa preservar a ordem de inserção de cases-2a.json)',
                                      'usar os bytes congelados como referência de integridade do wire no supervisor (não ts_fixture sobre linhas ordenadas)',
                                      'autoteste que compare o case_input entregue com o congelado byte a byte e um DIAG com objeto de ordem sensível'],
           'functional_receipts': 0, 'parity_credit': 0, 'generated_at': datetime.datetime.now(datetime.timezone.utc).isoformat()}
    (U / 'input-order-errata-addendum-r1.json').write_text(json.dumps(doc, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(doc['summary'], ensure_ascii=False))


if __name__ == '__main__':
    main()
