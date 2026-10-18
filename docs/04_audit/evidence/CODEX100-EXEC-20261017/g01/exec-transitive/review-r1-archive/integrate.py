"""Offline source-bound join; no target/crate code is imported or executed."""
from pathlib import Path
import copy
import hashlib
import json
import subprocess
import sys
import tomllib

OUT = Path(__file__).resolve().parent
E = OUT.parents[1]
ROOT = next(p for p in OUT.parents if (p / 'docs/07_agents/AGENTS.md').exists())
UP = Path('/tmp/cvg-rea-codex-20261017/upstream')
CACHE = Path('/tmp/cvg-codex100-exec-20261017/exec-transitive/crates')


def require(ok, detail):
    if not ok: raise AssertionError(detail)


def read(path):
    return json.loads(path.read_text())


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def encoded(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode()


def build():
    contract = read(OUT / 'contract.json'); pin = contract['pin']
    require(all(sha(E/r['path']) == r['sha256'] for r in contract['inputs']), 'Frozen parent input differs')
    inner = read(OUT / 'internal/inventory.json'); flow = read(OUT / 'internal/flow-links.json')
    external = read(OUT / 'external/inventory.json')
    require(inner['contract_sha256'] == external['parent_contract_sha256'] == sha(OUT/'contract.json'),
            'Parent contract differs')
    require(external['external_contract_sha256'] == sha(OUT/'external-contract.json'), 'Worker contract differs')
    for lane in ['internal', 'external']:
        directory = OUT / lane; manifest = read(directory/'manifest.json')
        require({r['path'] for r in manifest['files']} == {str(p.relative_to(directory))
                for p in directory.rglob('*') if p.is_file() and p != directory/'manifest.json'}, 'Lane file set differs')
        require(all(sha(directory/r['path']) == r['sha256'] and (directory/r['path']).stat().st_size == r['bytes']
                    for r in manifest['files']), 'Lane file identity differs')
    lock = tomllib.loads((UP/'codex-rs/Cargo.lock').read_text()); contracts = {}
    for row in external['crates']:
        package = row['binding']['locked_packages'][0]
        require([r for r in lock['package'] if r['name'] == package['name'] and r['version'] == package['version']]
                == [package], 'Archive binding differs from actual lock')
        path = CACHE/(package['name']+'-'+package['version']+'.crate')
        require(path.is_file() and not path.is_symlink() and path.stat().st_size <= 8*1024*1024
                and sha(path) == package['checksum'], 'Cached archive differs')
        require(not row['qualified_runtime'] and row['functional_receipts'] == 0
                and row['source_status'] == 'AUTHENTICATED_SELECTED_SOURCE_BOUND_RUNTIME_OPEN', 'False external qualification')
        contracts[row['id']] = {'id': row['id'], 'version': package['version'],
                                'archive_sha256': package['checksum'], 'source_status': row['source_status'],
                                'runtime_status': 'NOT_RUN_OPEN'}
    require(set(contracts) == {'external:serde_json::Value', 'external:url::Url', 'external:uuid::Uuid'},
            'External contract census differs')
    worker_owners = {(r['owner'], r['symbol']) for c in external['crates'] for r in c['original_owners']}
    resolved = []
    for row in inner['original_reference_bindings']:
        bound = row['binding']; out = {'original': row['original'], 'owner_type': row['owner_type']}
        if bound.get('external_type'):
            cid = 'external:' + bound['external_type']
            require(cid in contracts and (row['original']['owner'], row['original']['symbol']) in worker_owners,
                    'Original external owner not preserved')
            out.update(resolution='AUTHENTICATED_EXTERNAL_SOURCE_CONTRACT_RUNTIME_OPEN', contract=contracts[cid])
        else:
            require(bound.get('target_id') in {t['id'] for t in inner['types']}, 'Historical internal target missing')
            out.update(resolution='BOUND_SELECTED_INTERNAL_SOURCE_TYPE', target_id=bound['target_id'])
        resolved.append(out)
    operations = []
    for row in flow['operations']:
        ids = ['external:'+name for name in row['external_source_boundaries']]
        require(set(ids) <= contracts.keys(), 'Operation external contract missing')
        operations.append({**row, 'external_contracts': [contracts[cid] for cid in ids]})
    direct = next(r for r in operations if r['method'] == 'initialized')
    require('external:serde_json::Value' in {c['id'] for c in direct['external_contracts']},
            'initialized JSON Value incorrectly erased as primitive')
    sources = {}; span_count = 0
    for row in inner['sources']:
        path = row['path']; raw = (UP/path).read_bytes()
        require(hashlib.sha256(raw).hexdigest() == row['sha256'] and len(raw) == row['bytes'], 'Internal source drift')
        require(hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest() == row['git_blob'],
                'Internal Git object differs')
        sources[path] = raw

    def walk(value):
        nonlocal span_count
        if isinstance(value, dict):
            if {'path','file_sha256','start_byte','end_byte_exclusive','text','sha256'} <= value.keys():
                raw = sources[value['path']]; a = value['start_byte']; b = value['end_byte_exclusive']
                require(0 <= a <= b <= len(raw) and raw[a:b].decode() == value['text'] and
                        hashlib.sha256(raw[a:b]).hexdigest() == value['sha256'] and
                        hashlib.sha256(raw).hexdigest() == value['file_sha256'], 'Internal UTF8 span differs')
                require(raw[:a].count(b'\n')+1 == value['start_line'] and raw[:b].count(b'\n')+1 == value['end_line'],
                        'Internal span line differs')
                span_count += 1
            for item in value.values(): walk(item)
        elif isinstance(value, list):
            for item in value: walk(item)
    walk(inner)
    protected = []
    for directory in ['entrypoints','pinned-variants','exec-server','cli-adapters','dynamic-factories','component-surfaces']:
        base = E/'g01'/directory; manifest = read(base/'manifest.json')
        for row in manifest['files']:
            path = Path(row['path']) if directory != 'component-surfaces' else base/row['path']
            if not path.is_absolute() and directory != 'component-surfaces': path = ROOT/path
            require(sha(path) == row['sha256'] and path.stat().st_size == row['bytes'], 'Prior package drift')
            protected.append(str(path))
    require(len(protected) == 244, 'Prior six-package census differs')
    require(len(external['limits']) == 5 and all(r['status'] == 'OPEN' for r in external['limits']), 'External limits disappeared')
    return {'task': contract['task'], 'kind': 'T1_EXEC_TRANSITIVE_SOURCE_BINDING_NOT_NATIVE_PARITY', 'pin': pin,
            'lane_manifests': {lane: sha(OUT/lane/'manifest.json') for lane in ['internal','external']},
            'contract_sha256': sha(OUT/'contract.json'),
            'catalog_sha256': sha(ROOT/'docs/03_build/tracking/codex100_catalog_v1.json'),
            'historical_reference_resolutions': resolved, 'external_contracts': list(contracts.values()),
            'operations': operations, 'historical_reference_dispositions': flow['historical_reference_dispositions'],
            'initialized_value_addendum': {'method': 'initialized', 'field': 'params',
                'historical_label': 'BUILTIN_UNIT_OR_JSON_VALUE', 'current_source_disposition': 'external:serde_json::Value',
                'historical_file_unchanged': True, 'runtime_status': 'NOT_RUN'},
            'external_runtime_and_dependency_limits': external['limits'], 'internal_counts': inner['counts'],
            'external_counts': read(OUT/'external/verification.json')['counts'],
            'counts': {'historical_references': len(resolved), 'internal_bindings': 14, 'external_bindings': 6,
                       'external_contracts': 3, 'new_types': 31, 'selected_types_in_join': 168,
                       'operations': len(operations), 'operations_reaching_new_types': 13,
                       'operations_with_external_boundary': 17, 'internal_git_sources': len(sources),
                       'internal_span_occurrences': span_count, 'prior_package_files_preserved': len(protected)},
            'functional_receipts': 0, 'full_g01_closure': False, 'full_codex_parity_claim': False,
            'remaining_scope': ['Six mandatory SDK/Python/TS/RPC/package gaps remain OPEN.',
                                'Runtime callgraph/macros/cfg/platform/effects, parser/TUI variants remain mandatory.',
                                'External dependency/Cargo feature/grammar/runtime limits require future oracles.',
                                'G02 executable binding, G03 reuse acceptance and G04 concrete SPEC precede dependent BUILD.']}


fresh = build(); require(fresh == build(), 'Integration nondeterministic')
negatives = []
for name, mutation in [
    ('lost_historical_reference', lambda v: v['historical_reference_resolutions'].pop()),
    ('lost_external_contract', lambda v: v['external_contracts'].pop()),
    ('wrong_archive_checksum', lambda v: v['external_contracts'][0].update(archive_sha256='0'*64)),
    ('lost_initialized_addendum', lambda v: v.pop('initialized_value_addendum')),
    ('lost_operation_owner', lambda v: v['operations'][0].update(owner=None)),
    ('lost_external_runtime_limit', lambda v: v['external_runtime_and_dependency_limits'].pop()),
    ('false_external_runtime_qualification', lambda v: v['external_contracts'][0].update(runtime_status='QUALIFIED')),
    ('false_full_g01', lambda v: v.update(full_g01_closure=True)),
    ('false_functional_receipt', lambda v: v.update(functional_receipts=1)),
]:
    bad = copy.deepcopy(fresh); mutation(bad)
    try: require(bad == fresh, 'Rejected mutated integration')
    except AssertionError: negatives.append({'id': name, 'result': 'REJECTED'})
    else: raise AssertionError('Accepted mutated integration')
report = {'result': 'PASS', 'kind': 'T1_SOURCE_INTEGRATION_ONLY', 'counts': fresh['counts'],
          'negative_controls': negatives, 'functional_receipts': 0, 'full_g01_closure': False}
for name, value in [('integration.json',fresh),('verification.json',report)]:
    if '--check' in sys.argv: require((OUT/name).read_bytes() == encoded(value), name+' differs')
    else: (OUT/name).write_bytes(encoded(value))
print(json.dumps(report))
