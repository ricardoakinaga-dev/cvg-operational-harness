"""Recompute the completed reference experiment from raw bytes, never run ELF."""
from pathlib import Path
from decimal import Decimal
import datetime
import hashlib
import json
import os
import re
import subprocess

HERE = Path(__file__).resolve().parent


def read(path):
    return json.loads(path.read_text())


def sha(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def decode(data):
    return json.loads(data, parse_float=Decimal)


def identity(value):
    return type(value).__name__, value


def main():
    contract = read(HERE / 'contract.json')
    review = read(HERE / 'review-status.json')
    assert review['status'] == 'APPROVED_BOUNDED_HOW'
    for name, digest in review['input_sha256'].items():
        assert sha(HERE / name) == digest, name + ' drift'
    terminal = read(HERE / 'live.json')
    attempt = terminal['attempt']
    assert re.fullmatch(r'lossless-[0-9a-f]{10}', attempt)
    directory = HERE / attempt
    assert terminal == read(directory / 'terminal.json')
    assert terminal['status'] == 'TERMINAL' and terminal['exit'] == 0
    assert terminal['first_supervisor_failure'] is None and not terminal['secondary_failures']
    assert terminal['contract_sha256'] == sha(HERE / 'contract.json')
    assert terminal['runner_sha256'] == sha(HERE / 'run.py')
    assert terminal['driver_sha256'] == sha(HERE / 'driver.py')
    assert terminal['cleanup']['cleanup_verified'] and terminal['reference_unchanged']
    assert terminal['final_storage_bytes'] <= contract['monitored_storage_limit_bytes']
    assert terminal['preserved_bytes'] <= contract['preservation_limit_bytes']
    artifact = terminal['reference_artifact']
    path = Path(artifact['path'])
    assert not path.is_symlink() and path.stat().st_size == artifact['bytes']
    assert sha(path) == artifact['sha256']
    raw = directory / 'raw'
    for name, expected in [('driver.py', sha(HERE / 'driver.py')),
                           ('target-guard.py', sha(HERE / 'target-guard.py')),
                           ('cases.json', sha(HERE / 'cases.json')),
                           ('base-driver.py', contract['base_driver_input']['sha256'])]:
        assert sha(raw / 'control' / name) == expected, 'copied control drift'
    first = (raw / 'supervisor.stderr.log').read_bytes().split(b'\n', 1)[0]
    prefix = b'CVG_REFERENCE_PROBE_KERNEL '
    assert first.startswith(prefix)
    kernel = json.loads(first[len(prefix):])
    assert kernel == terminal['kernel_proof']
    limits = kernel['limits']
    assert limits['memory.max'] == '4294967296' and limits['memory.swap.max'] == '0'
    assert limits['pids.max'] == '256'
    quota, period = limits['cpu.max'].split()
    assert quota != 'max' and int(quota) == 2 * int(period)
    scope = terminal['scope']
    assert scope == 'cvg-codex100-ref-probe-' + attempt + '.scope'
    assert kernel['cgroup'].endswith('/' + scope)
    env = {'PATH': '/usr/bin:/bin', 'LANG': 'C.UTF-8',
           'XDG_RUNTIME_DIR': '/run/user/' + str(os.getuid()),
           'DBUS_SESSION_BUS_ADDRESS': 'unix:path=/run/user/' + str(os.getuid()) + '/bus'}
    query = subprocess.run(['systemctl', '--user', 'show', scope, '-p', 'LoadState',
                            '-p', 'ActiveState', '-p', 'ControlGroup'],
                           env=env, capture_output=True, text=True, timeout=10)
    assert query.returncode == 0, 'fresh scope query unavailable'
    fields = dict(line.split('=', 1) for line in query.stdout.splitlines() if '=' in line)
    assert fields['ActiveState'] in ['inactive', 'failed']
    group = Path('/sys/fs/cgroup') / kernel['cgroup'].lstrip('/')
    if group.exists():
        events = dict(line.split() for line in (group / 'cgroup.events').read_text().splitlines())
        assert events['populated'] == '0'
        populated = '0'
    else:
        populated = 'REMOVED'
    output = raw / 'output'
    namespace = read(output / 'namespace-proof.json')
    for key in ['host_namespaces_distinct', 'environment_exact', 'host_home_and_sockets_absent',
                'network_routes_absent', 'reference_native_controller_usr_readonly']:
        assert namespace[key] is True
    plan = read(HERE / 'cases.json')['cases']
    observations = read(output / 'observations.json')
    assert observations['processes'] == len(plan) == len(observations['cases']) == 23
    assert observations['wire_requests'] == 69 and observations['functional_parity_receipts'] == 0
    params = {'clientInfo': {'name': 'cvg-reference-probe', 'title': 'Synthetic', 'version': '0.synthetic'},
              'capabilities': {'explicitGatewayOauth': True, 'experimentalApi': False, 'requestAttestation': False}}
    results = []
    total_writes = 0
    for case, recorded in zip(plan, observations['cases']):
        assert all(recorded[key] == value for key, value in case.items())
        name = case['name']
        capture = read(output / (name + '.capture.json'))
        assert capture['exit'] == 0 and not capture['forced_cleanup'] and not capture['secondary_failures']
        assert capture['args'] == ['/reference/codex', 'app-server', '--listen', 'stdio://']
        streams = {}
        for stream in ['stdout', 'stderr']:
            file = output / (name + '.' + stream + '.log')
            data = file.read_bytes()
            assert len(data) == capture['bytes'][stream] and sha(file) == capture['sha256'][stream]
            streams[stream] = data
        assert sum(map(len, streams.values())) <= 8388608
        guard_prefix = b'CVG_INNER_REFERENCE_GUARD '
        guard_line = streams['stderr'].split(b'\n', 1)[0]
        assert guard_line.startswith(guard_prefix)
        guard = json.loads(guard_line[len(guard_prefix):])
        assert guard == read(output / (name + '.inner-guard.json'))
        assert guard['target_argv'] == capture['args']
        assert all(guard[k] is True for k in ['environment_exact', 'readonly_inputs', 'collector_paths_absent'])
        requests = (output / (name + '.requests.ndjson')).read_bytes().splitlines(keepends=True)
        expected = [(json.dumps({'id': 'init', 'method': 'initialize', 'params': params}, ensure_ascii=True) + '\n').encode(),
                    ('{"id":' + case['raw_id_token'] + ',"method":"thread/list","params":{"limit":1}}\n').encode(),
                    b'{"id":"barrier","method":"thread/list","params":{"limit":1}}\n']
        assert requests == expected
        ledger = read(output / (name + '.requests.json'))['writes']
        assert len(ledger) == len(requests) == recorded['writes'] == 3
        offset = 0
        for line, entry in zip(requests, ledger):
            assert entry['raw_utf8'].encode() == line and entry['delivered_to_stdin'] is True
            assert entry['byte_start'] == offset and entry['byte_end_exclusive'] == offset + len(line)
            assert entry['sha256'] == hashlib.sha256(line).hexdigest()
            offset += len(line)
        total_writes += len(requests)
        lines = streams['stdout'].splitlines(keepends=True)
        messages = [decode(line) for line in lines]
        assert [json.loads(line) for line in lines] == capture['messages']
        assert len(lines) == len(recorded['stdout_frames'])
        offset = 0
        for line, frame in zip(lines, recorded['stdout_frames']):
            assert frame == {'byte_start': offset, 'byte_end_exclusive': offset + len(line),
                             'sha256': hashlib.sha256(line).hexdigest()}
            offset += len(line)
        controls = {}
        for control_id in ['init', 'barrier']:
            matches = [m for m in messages if identity(m.get('id')) == identity(control_id)]
            assert len(matches) == 1 and set(matches[0]) == {'id', 'result'}
            controls[control_id] = matches[0]
        assert set(controls['init']['result']) == {'userAgent', 'codexHome', 'platformFamily', 'platformOs'}
        assert controls['init']['result']['codexHome'] == '/reference-home/.codex'
        assert controls['barrier']['result'] == {'data': [], 'readStates': {}, 'nextCursor': None, 'backwardsCursor': None}
        assert not any('id' in m and 'method' in m for m in messages)
        target_frames = [(line, m) for line, m in zip(lines, messages) if 'id' in m
                         and not any(identity(m['id']) == identity(c) for c in controls)]
        wanted = decode(case['raw_id_token'])
        echo = [m for _, m in target_frames if identity(m['id']) == identity(wanted)]
        source = case['source_category'].startswith('SOURCE_')
        match = len(target_frames) == len(echo) == 1 if source else None
        assert recorded['summary']['source_declared_id_echo_observed'] is match
        results.append({**case, 'target_response_count': len(target_frames),
                        'source_declared_typed_echo_observed': match,
                        'target_frames_utf8': [line.decode() for line, _ in target_frames],
                        'target_id_diagnostic_types': [type(m['id']).__name__ for _, m in target_frames],
                        'notification_methods': [m['method'] for m in messages if 'id' not in m],
                        'absence_scope': 'Only through this fixture EOF. Raw full frames retained; no lexical normalization.'})
    assert total_writes == 69
    result = {'kind': 'RECOMPUTED_ACTUAL_REFERENCE_ID_DOMAIN_OBSERVATIONS_NOT_CVG_PARITY',
              'observed_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'attempt': attempt, 'contract_sha256': sha(HERE / 'contract.json'),
              'reference_artifact': artifact, 'fresh_scope_query': fields, 'cgroup_populated': populated,
              'cases': results, 'case_count': len(results), 'verified_wire_writes': total_writes,
              'source_cases': sum(r['source_category'].startswith('SOURCE_') for r in results),
              'source_echo_mismatches': sum(r['source_declared_typed_echo_observed'] is False for r in results),
              'edge_cases': sum(r['source_category'] == 'EDGE_OBSERVE' for r in results),
              'functional_receipts': 0, 'native_CVG_executed': False, 'all_numeric_domains_closed': False}
    (HERE / 'recomputed-observations.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({k: result[k] for k in ['attempt', 'case_count', 'verified_wire_writes', 'source_cases',
                                           'source_echo_mismatches', 'edge_cases', 'cgroup_populated', 'functional_receipts']}))


if __name__ == '__main__':
    main()
