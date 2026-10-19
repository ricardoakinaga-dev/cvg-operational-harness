"""Join source inventories; no target code, imports, Cargo or runtime effects."""
from pathlib import Path
import collections
import copy
import hashlib
import json
import re
import subprocess
import sys

OUT = Path(__file__).resolve().parent
ROOT = next(p for p in OUT.parents if (p / 'docs/07_agents/AGENTS.md').exists())
E = OUT.parents[1]
UP = Path('/tmp/cvg-rea-codex-20261017/upstream')
PIN = '8d9f6466ff0294785d56f55b1fe363d132fe4133'
CAT = ROOT / 'docs/03_build/tracking/codex100_catalog_v1.json'


def require(ok, detail):
    if not ok:
        raise AssertionError(detail)


def read(p):
    return json.loads(p.read_text())


def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()


def encoded(v):
    return (json.dumps(v, ensure_ascii=False, indent=2) + '\n').encode()


def check_manifest(directory):
    manifest = read(directory / 'manifest.json')
    listed = manifest['files']
    if isinstance(listed, dict):
        listed = [{'path': path, **row} for path, row in listed.items()]
    require({r['path'] for r in listed} == {p.name for p in directory.iterdir()
            if p.is_file() and p.name != 'manifest.json'}, 'Lane manifest file set differs')
    for row in listed:
        p = directory / row['path']
        require(sha(p) == row['sha256'] and p.stat().st_size == row['bytes'],
                'Lane manifest bytes differ: ' + str(p))


def build():
    r = read(OUT / 'rust/inventory.json'); n = read(OUT / 'non-rust/inventory.json')
    catalog = read(CAT); rows = catalog['requirements']; by_id = {x['id']: x for x in rows}
    tasks = set(re.findall(r'^### (DX100-[A-Z]\d\d)\s',
                           (ROOT / 'docs/03_build/0386_backlog_paridade_codex.md').read_text(), re.M))
    require(len(tasks) == 49 and len(rows) == 509, 'Parent denominator differs')
    require(r['pin'] == n['pin'] == PIN and r['catalog_sha256'] == n['catalog_sha256'] == sha(CAT),
            'Inventory source/catalog binding differs')
    require(r['functional_receipts'] == n['functional_receipts'] == 0
            and not r['full_g01_closure'] and not n['full_g01_closure'], 'False lane closure')
    for lane in ['rust', 'non-rust']:
        check_manifest(OUT / lane)
    tree = {}
    for record in subprocess.check_output(['git', '-C', str(UP), 'ls-tree', '-r', '-z', PIN]).split(b'\0'):
        if record:
            header, path = record.split(b'\t', 1)
            mode, kind, oid = header.decode().split()
            tree[path.decode()] = {'mode': mode, 'kind': kind, 'oid': oid}
    require(subprocess.check_output(['git', '-C', str(UP), 'rev-parse', 'HEAD']).decode().strip() == PIN,
            'HEAD differs')
    require(not subprocess.check_output(['git', '-C', str(UP), 'status', '--porcelain']).strip(),
            'Upstream modified')
    cargo = {p for p in tree if p.endswith('Cargo.toml')}
    actual_manifests = {p['manifest'] for p in r['packages']} | {p['path'] for p in r['virtual_manifests']}
    require(cargo == actual_manifests and len(cargo) == 164 and len(r['packages']) == 163,
            'Cargo census mismatch')
    non_cargo = {p for p in tree if p.endswith(('package.json', 'pyproject.toml'))}
    require(set(n['manifest_census']) == non_cargo and len(non_cargo) == 8, 'NonCargo census mismatch')
    sources = {}; data_cache = {}
    for source in r['sources'] + n['sources']:
        path = source['path']; data = (UP / path).read_bytes()
        digest = hashlib.sha256(data).hexdigest()
        require(path in tree and tree[path]['mode'] in ['100644', '100755'], 'Nonregular source')
        require(hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()
                == tree[path]['oid'] == source['git_blob'], 'Git blob differs: ' + path)
        require(digest == source['sha256'] and len(data) == source['bytes'], 'Source SHA/size differs')
        require(path not in sources or sources[path]['sha256'] == digest, 'Conflicting source')
        sources[path] = {'path': path, 'sha256': digest, 'git_blob': tree[path]['oid'], 'bytes': len(data)}
        data_cache[path] = data
    spans = 0

    def check_rust_spans(value):
        nonlocal spans
        if isinstance(value, dict):
            if {'path', 'file_sha256', 'start_byte', 'end_byte_exclusive', 'text'} <= value.keys():
                data = data_cache[value['path']]; start = value['start_byte']; end = value['end_byte_exclusive']
                require(0 <= start <= end <= len(data), 'Rust span bounds differ')
                require(hashlib.sha256(data).hexdigest() == value['file_sha256'], 'Rust whole-file SHA differs')
                require(data[start:end].decode() == value['text'] and
                        hashlib.sha256(data[start:end]).hexdigest() == value['sha256'], 'Rust byte span differs')
                require(value['start_line'] == data[:start].count(b'\n') + 1 and value['end_line'] ==
                        max(value['start_line'], data[:end].count(b'\n') + (not data[:end].endswith(b'\n'))),
                        'Rust span line differs')
                spans += 1
            for item in value.values(): check_rust_spans(item)
        elif isinstance(value, list):
            for item in value: check_rust_spans(item)
    check_rust_spans(r)
    require(all(p['classification']['primary_owner'] in tasks and set(p['owner_bindings']) <= tasks
                for p in r['packages']), 'Unknown Rust owner')
    delegated = []
    nonrust_sources = {s['path'] for s in n['sources']}
    for ref in r['delegated_catalog_source_refs']:
        row = by_id[ref['requirement']]
        require(ref['source'] in nonrust_sources and row['kind'] == 'FUNCTIONAL_PARITY',
                'Delegated catalog source not bound by nonRust lane')
        delegated.append({**ref, 'status': 'BOUND_NON_RUST_SOURCE_NOT_FUNCTIONALLY_QUALIFIED',
                          'owner': row['owner'], 'source_sha256': sources[ref['source']]['sha256']})
    functional_refs = {(row['id'], s['path']) for row in rows if row['kind'] == 'FUNCTIONAL_PARITY'
                       for s in row['sources']}
    bound = {(x['requirement'], x['source_path']) for p in r['packages'] for x in p['catalog_source_refs']}
    bound |= {(x['requirement'], x['source']) for x in delegated}
    require(bound == functional_refs, 'Functional catalog source omitted or invented')
    gaps = []
    for gap in n['open_contracts']:
        owner = gap['proposed_owner']
        require(gap['mandatory'] and gap['status'] == 'OPEN' and owner in tasks, 'Gap dropped/downgraded')
        ids = [row['id'] for row in rows if row['kind'] == 'FUNCTIONAL_PARITY' and row['owner'] == owner]
        require(ids, 'Gap owner lacks existing obligations')
        gaps.append({**gap, 'variant_obligation_id': 'CDX100-COMPONENT-' + gap['id'],
                     'owner': owner, 'existing_owner_requirements': ids,
                     'binding': 'MANDATORY_OPEN_LANGUAGE_OR_PACKAGE_VARIANT; no normative catalog mutation or closed acceptance',
                     'source_evidence': 'non-rust/inventory.json', 'qualification': 'NOT_RUN'})
    require(len(gaps) == 6 and {g['id'] for g in gaps} == {'GAP-PY-API', 'GAP-PY-RPC', 'GAP-GENERATED',
            'GAP-PROVENANCE', 'GAP-TS-LANGUAGE', 'GAP-PLATFORM-PACKAGING'}, 'Mandatory variants differ')
    protected = []
    for package in ['entrypoints', 'pinned-variants', 'exec-server', 'cli-adapters', 'dynamic-factories']:
        manifest = read(E / 'g01' / package / 'manifest.json')
        for row in manifest['files']:
            p = ROOT / row['path']
            require(sha(p) == row['sha256'] and p.stat().st_size == row['bytes'], 'Prior evidence changed')
            protected.append(row['path'])
    return {'task': 'DX100-G01:CLASSIFY-COMPONENT-SURFACES', 'kind': 'T1_SOURCE_CLASSIFICATION_ONLY',
            'pin': PIN, 'contract_sha256': sha(OUT / 'contract.json'), 'catalog_sha256': sha(CAT),
            'lane_manifests': {lane: sha(OUT / lane / 'manifest.json') for lane in ['rust', 'non-rust']},
            'counts': {'cargo_manifests': len(cargo), 'rust_packages': len(r['packages']),
                       'virtual_manifests': len(r['virtual_manifests']), 'non_cargo_manifests': len(non_cargo),
                       'target_candidate_records_not_compiled_targets': len(r['target_candidates']),
                       'local_dependency_declarations': len(r['local_dependency_edges']),
                       'source_git_blobs': len(sources), 'rust_span_occurrences': spans,
                       'functional_catalog_source_pairs': len(functional_refs),
                       'delegated_source_pairs_bound': len(delegated), 'mandatory_open_contracts': len(gaps),
                       'prior_package_files_preserved': len(protected)},
            'package_role_counts': dict(sorted(collections.Counter(p['classification']['role'] for p in r['packages']).items())),
            'non_rust_counts': n['counts'], 'delegated_source_bindings': delegated, 'mandatory_open_variants': gaps,
            'sources': sorted(sources.values(), key=lambda s: s['path']),
            'functional_receipts': 0, 'full_g01_closure': False, 'full_codex_parity_claim': False,
            'remaining_scope': ['20exec-server transitive references', 'scalar parsers/cfg/TUI interaction contracts',
                                'Rust transitive public API/feature/build/platform reachability',
                                'six mandatory SDK/language/provenance/package gaps',
                                'G02 source/executable binding and functional oracles', 'G03 current reuse acceptance',
                                'G04 concrete Discovery/PRD/SPEC and applicable T3 review before runtime BUILD'],
            'next_action_id': 'DX100-G01:RESOLVE-EXEC-TRANSITIVE-TYPES'}


fresh = build()
require(fresh == build(), 'Integration generation differs')
negatives = []
for name, mutation in [
    ('lost_language_gap', lambda v: v['mandatory_open_variants'].pop()),
    ('downgraded_python_api', lambda v: v['mandatory_open_variants'][0].update(mandatory=False)),
    ('unbound_nonrust_source', lambda v: v['delegated_source_bindings'].pop()),
    ('wrong_package_census', lambda v: v['counts'].update(rust_packages=162)),
    ('candidate_as_compiled', lambda v: v['counts'].update(compiled_targets=527)),
    ('false_functional_qualification', lambda v: v.update(functional_receipts=1)),
    ('false_full_closure', lambda v: v.update(full_g01_closure=True)),
]:
    bad = copy.deepcopy(fresh); mutation(bad)
    try: require(bad == fresh, 'Rejected mutated integration')
    except AssertionError: negatives.append({'id': name, 'result': 'REJECTED'})
    else: raise AssertionError('Accepted negative: ' + name)
report = {'result': 'PASS', 'kind': 'T1_SOURCE_INTEGRATION_NOT_FUNCTIONAL_TEST',
          'counts': fresh['counts'], 'negative_controls': negatives, 'functional_receipts': 0,
          'full_g01_closure': False}
for name, value in [('integration.json', fresh), ('verification.json', report)]:
    if '--check' in sys.argv:
        require((OUT / name).read_bytes() == encoded(value), name + ' differs')
    else:
        (OUT / name).write_bytes(encoded(value))
print(json.dumps(report))
