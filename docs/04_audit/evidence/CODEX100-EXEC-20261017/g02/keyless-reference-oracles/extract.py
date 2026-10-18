"""Read a frozen accepted capture; never execute a target or issue a receipt."""
from pathlib import Path
import argparse
import hashlib
import json
import re

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[5]
PROGRAM = HERE.parents[1]
K = HERE.parent / 'keyless-cli-probe/keyless-b9ab371c1b/raw/output'


def read(path):
    return json.loads(path.read_text())


def sha(data):
    return hashlib.sha256(data).hexdigest()


def dump(value):
    return json.dumps(value, ensure_ascii=False, indent=2) + '\n'


def derive():
    bindings = read(HERE / 'input-bindings.json')
    for row in bindings['inputs']:
        path = Path(bindings['roots'][row['root']]) / row['path']
        data = path.read_bytes()
        assert len(data) == row['bytes'] and sha(data) == row['sha256'], str(path)
    requests = read(K / 'stdio.requests.json')
    capture = read(K / 'stdio.capture.json')
    raw = (K / 'stdio.stdout.log').read_bytes()
    assert capture['exit'] == 0 and not capture['forced_cleanup']
    assert capture['bytes']['stdout'] == len(raw)
    assert capture['sha256']['stdout'] == sha(raw)
    frames = []
    offset = 0
    for line in raw.splitlines(keepends=True):
        frames.append({'index': len(frames), 'byte_start': offset,
                       'byte_end_exclusive': offset + len(line),
                       'raw_utf8': line.decode('utf-8'), 'sha256': sha(line),
                       'message': json.loads(line)})
        offset += len(line)
    assert [f['message'] for f in frames] == capture['messages']
    responses = [f for f in frames if 'id' in f['message']]
    notifications = [f for f in frames if 'id' not in f['message']]
    assert len(requests) == len(responses) == 6 and len(notifications) == 1
    assert len(frames) == 7 and all('jsonrpc' not in f['message'] for f in frames)
    assert all(set(f['message']) in ({'id', 'result'}, {'id', 'error'}) for f in responses)
    assert all('method' in f['message'] for f in notifications)
    cases = []
    for name in ['version', 'help', 'app-server-help']:
        meta = read(K / (name + '.capture.json'))
        streams = {}
        for stream in ['stdout', 'stderr']:
            data = (K / (name + '.' + stream + '.log')).read_bytes()
            assert sha(data) == meta['sha256'][stream] and len(data) == meta['bytes'][stream]
            streams[stream] = {'path': str((K / (name + '.' + stream + '.log')).relative_to(ROOT)),
                               'bytes': len(data), 'sha256': sha(data), 'raw_utf8': data.decode('utf-8')}
        assert meta['exit'] == 0 and not meta['forced_cleanup']
        cases.append({'case': name, 'kind': 'REFERENCE_IDENTITY_OR_HELP_ONLY',
                      'related_requirement': 'CDX100-10-01', 'argv': meta['args'],
                      'exit': meta['exit'], 'streams': streams,
                      'scope': 'Observed identity/help, not execution of advertised functionality.'})
    assert cases[0]['streams']['stdout']['raw_utf8'] == 'codex-cli 0.0.0\n'
    names = ['before-initialize', 'invalid-client-without-state-commit', 'initialize',
             'duplicate-initialize', 'empty-thread-list', 'unknown-method']
    request_ids = [(type(r['id']), r['id']) for r in requests]
    assert len(set(request_ids)) == 6
    for request, name in zip(requests, names):
        matches = [f for f in responses if type(f['message']['id']) is type(request['id'])
                   and f['message']['id'] == request['id']]
        assert len(matches) == 1
        frame = matches[0]
        cases.append({'case': name, 'kind': 'OBSERVED_REFERENCE_RPC_FIXTURE_ONLY',
                      'related_requirements': ['CDX100-08-02',
                          'CDX100-RPC-ClientRequest-thread.list' if name == 'empty-thread-list'
                          else 'CDX100-RPC-ClientRequest-initialize' if name != 'unknown-method'
                          else 'CDX100-08-03'],
                      'request_index': requests.index(request), 'request': request,
                      'response_frame': frame,
                      'state_scope': 'Same fresh connection, six sequential requests; preserve earlier requests.'})
    by_name = {r['case']: r for r in cases}
    assert [f['message']['id'] for f in responses] == ['before', 'invalid', 7, 'duplicate', 'empty-list', 'unknown']
    assert by_name['before-initialize']['response_frame']['message']['error'] == {'code': -32600, 'message': 'Not initialized'}
    assert by_name['invalid-client-without-state-commit']['response_frame']['message']['error']['code'] == -32600
    initialized = by_name['initialize']['response_frame']['message']['result']
    assert set(initialized) == {'userAgent', 'codexHome', 'platformFamily', 'platformOs'}
    assert by_name['duplicate-initialize']['response_frame']['message']['error'] == {'code': -32600, 'message': 'Already initialized'}
    assert by_name['empty-thread-list']['response_frame']['message']['result'] == {
        'data': [], 'readStates': {}, 'nextCursor': None, 'backwardsCursor': None}
    error = by_name['unknown-method']['response_frame']['message']['error']
    assert error['code'] == -32600
    methods = re.findall(r'`([^`]+)`', error['message'])
    assert methods.pop(0) == 'cvg.synthetic.unknown'
    source_methods = [r['method'] for r in read(PROGRAM / 'g01/protocol-source-inventory.json')['entries']
                      if r['envelope'] == 'ClientRequest']
    assert methods == source_methods and len(methods) == 175
    observed = read(K / 'observations.json')
    assert [r['case'] for r in observed['cases']] == [r['case'] for r in cases]
    oracles = {'kind': 'OBSERVED_RAW_REFERENCE_CORPUS_NOT_APPROVED_COMPARISON_RULES',
               'pin': bindings['pin'], 'input_bindings_sha256': sha((HERE / 'input-bindings.json').read_bytes()),
               'cases': cases, 'unsolicited_notifications': notifications,
               'advertised_ClientRequest_discriminants': methods,
               'counts': {'cases': 9, 'CLI_identity_or_help': 3, 'RPC_requests': 6,
                          'RPC_responses': 6, 'unsolicited_notifications': 1,
                          'advertised_discriminants_not_executed_handlers': 175},
               'future_comparison_authority': 'PENDING; raw corpus is not a CVG capture/receipt or approved projection rule.',
               'normalizations_applied': [],
               'environment_scope': 'Exact captured Linux fixture. Host/installationId/userAgent/home/time values are retained; no cross-environment equivalence or silent normalization is approved.',
               'native_CVG_executed': False, 'functional_receipts': 0}
    overlay = {'kind': 'ADDITIVE_RECONCILIATION_OLD_DOCUMENTARY_PROJECTION_NOT_MODIFIED',
               'old_packet': str((PROGRAM / 'g01/public-acceptance/interfaces/cases.json').relative_to(ROOT)),
               'changes': [
                   {'variant': 'CDX100-08-01:baseline', 'old_field': 'response.result.capabilities',
                    'finding': 'ABSENT in actual initialize result and source InitializeResponse. Capabilities are input declarations.',
                    'proposed_response_fields': list(initialized), 'rule_status': 'PROPOSED_NOT_APPROVED',
                    'input_fixture_difference': 'The accepted fixture sends no initialized client notification. Its necessity/effect across transports is not proven here.'},
                   {'variant': 'CDX100-08-02:edge',
                    'finding': 'Invalid clientInfo.name and unknown method both returned -32600 in this fixture; no generic -32601/-32602 assumption.',
                    'limit': 'Invalid header validation is not proof of every invalid-params decoder branch.'},
                   {'variant': 'CDX100-08-01:edge',
                    'finding': 'A failed invalid-client initialize is followed by a successful initialize; a later duplicate returns Already initialized.',
                    'limit': 'Observed connection admission state only; do not claim every global/durable side effect is transactional.'}],
               'still_open': ['Legacy aliases, schema version and all 54 historical uncovered axes.',
                              'Full i64 boundary/decimal/UUID grammar is not exercised by request ID7.',
                              'All175 advertised handlers need actual fixtures; error advertisement is not handler execution.',
                              'CVG run, full native journey, approved equivalence and per-variant functional receipts.'],
               'functional_receipts': 0}
    return {'oracles.json': dump(oracles), 'projection-overlay.json': dump(overlay)}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--write', action='store_true')
    args = parser.parse_args()
    results = derive()
    for name, contents in results.items():
        if args.write:
            (HERE / name).write_text(contents)
        else:
            assert (HERE / name).read_text() == contents, name + ' drift'
    print(json.dumps({'status': 'DATA_DERIVATION_VERIFIED', 'cases': 9, 'input_bindings': 28,
                      'RPC_responses': 6, 'notifications': 1, 'functional_receipts': 0}))
