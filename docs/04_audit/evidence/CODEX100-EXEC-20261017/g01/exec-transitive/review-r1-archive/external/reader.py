#!/usr/bin/env python3
"""Bounded source reader. Only --fetch permits network; never executes target data."""
import argparse
import copy
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import subprocess
import sys
import tarfile
import tomllib

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[6]
UPSTREAM = Path('/tmp/cvg-rea-codex-20261017/upstream')
CACHE = Path('/tmp/cvg-codex100-exec-20261017/exec-transitive/crates')
PIN = '8d9f6466ff0294785d56f55b1fe363d132fe4133'
PARENT_SHA = 'd3f493fcd507a405533994692ef2cd235bd5d31dabb351afb9ea6e3bb15d4288'
EXTERNAL_SHA = 'c2912831cd59136cb76dfd3c37443e80d5059fb18abc62ea8ea884a0ae29fcfb'
COMPRESSED = 8 * 1024 * 1024
REGULAR = 32 * 1024 * 1024
TAR_STREAM = 40 * 1024 * 1024
GIT_ENV = {**os.environ, 'GIT_NO_LAZY_FETCH': '1', 'GIT_OPTIONAL_LOCKS': '0',
           'GIT_TERMINAL_PROMPT': '0'}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def encoded(value):
    return (json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + '\n').encode()


def require(condition, message):
    if not condition:
        raise ValueError(message)


def contracts():
    p = (HERE.parent / 'contract.json').read_bytes()
    e = (HERE.parent / 'external-contract.json').read_bytes()
    require(digest(p) == PARENT_SHA, 'parent contract digest')
    require(digest(e) == EXTERNAL_SHA, 'external contract digest')
    return json.loads(p), json.loads(e)


def git(path):
    require(not path.startswith('/') and '..' not in PurePosixPath(path).parts, 'Git path')
    return subprocess.check_output(['git', '-C', str(UPSTREAM), 'show', PIN + ':' + path], env=GIT_ENV)


def archive(data, checksum, prefix):
    """Authenticate BEFORE gzip/tar parsing. No member is written to the filesystem."""
    require(len(data) <= COMPRESSED, 'compressed size limit')
    require(digest(data) == checksum, 'archive checksum')
    # Bound total decompressed tar bytes too, including metadata, padding and directories.
    import gzip
    with gzip.GzipFile(fileobj=io.BytesIO(data)) as gz:
        raw = gz.read(TAR_STREAM + 1)
    require(len(raw) <= TAR_STREAM, 'tar stream limit')
    files = {}
    seen = set()
    total = 0
    with tarfile.open(fileobj=io.BytesIO(raw), mode='r:') as tf:
        for member in tf:
            require(len(seen) < 10000, 'member count limit')
            name = member.name.rstrip('/')
            pieces = name.split('/')
            require(name and not name.startswith('/') and '\\' not in name
                    and '\x00' not in name and all(p not in ('', '.', '..') for p in pieces),
                    'unsafe member path')
            require(pieces[0] == prefix, 'outside archive prefix')
            require(name not in seen, 'duplicate member')
            seen.add(name)
            require(member.isdir() or member.isfile(), 'non-regular member/link')
            if member.isfile():
                require(len(pieces) > 1, 'regular member needs prefix and member path')
                total += member.size
                require(member.size >= 0 and total <= REGULAR, 'regular data limit')
                f = tf.extractfile(member)  # In-memory reader, not extraction to disk.
                require(f is not None, 'missing member data')
                b = f.read(member.size + 1)
                require(len(b) == member.size, 'member size')
                files[name[len(prefix) + 1:]] = b
    return files, {'members': len(seen), 'regular_files': len(files),
                   'regular_bytes': total, 'compressed_bytes': len(data),
                   'tar_stream_bytes': len(raw)}


def locked_sources(contract, read_git=git):
    lock_bytes = read_git('codex-rs/Cargo.lock')
    lock = tomllib.loads(lock_bytes.decode())
    sources = []
    for entry in contract['sources']:
        binding = entry['external_binding']
        require(digest(lock_bytes) == binding['lock_file']['sha256'], 'lock source SHA')
        package = binding['locked_packages'][0]
        actual = [p for p in lock['package'] if p['name'] == package['name']
                  and p['version'] == package['version']]
        require(actual == [package], 'locked package mismatch')
        sources.append((entry, package))
    require({p['name'] for _, p in sources} == {'serde_json', 'url', 'uuid'}, 'three crates')
    return sources


def fetch(contract):
    import urllib.request
    import urllib.parse

    class OfficialRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            old = urllib.parse.urlsplit(req.full_url)
            new = urllib.parse.urlsplit(newurl)
            require(new.scheme == 'https' and new.hostname == 'static.crates.io'
                    and new.netloc == old.netloc and new.path == old.path
                    and not new.query and not new.fragment and not new.username,
                    'redirect outside exact official archive')
            return super().redirect_request(req, fp, code, msg, headers, newurl)

    # Do not send downloads through environment proxy destinations.
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), OfficialRedirect())
    CACHE.mkdir(parents=True, exist_ok=True)
    report = []
    for entry, package in locked_sources(contract):
        name, version = package['name'], package['version']
        filename = name + '-' + version + '.crate'
        path = CACHE / filename
        url = 'https://static.crates.io/crates/' + name + '/' + filename
        failure = HERE / 'first-download-failure.json'
        try:
            if path.exists():
                require(not path.is_symlink(), 'cache symlink')
                require(path.stat().st_size <= COMPRESSED, 'cache size')
                data = path.read_bytes()
                origin = 'authenticated_existing_cache'
            else:
                req = urllib.request.Request(url, headers={'User-Agent': 'CVG-static-source-reader/1'})
                with opener.open(req, timeout=30) as response:
                    require(response.geturl() == url, 'response URL changed')
                    data = response.read(COMPRESSED + 1)
                require(len(data) <= COMPRESSED, 'compressed size limit')
                require(digest(data) == package['checksum'], 'download checksum')
                path.write_bytes(data)
                origin = 'official_https_download'
            _, stats = archive(data, package['checksum'], name + '-' + version)
            report.append({'crate': name, 'version': version, 'url': url,
                           'sha256': digest(data), 'origin': origin, **stats})
        except Exception as exc:
            detail = {'status': 'OPEN', 'crate': name, 'url': url,
                      'exception': type(exc).__name__, 'first_output': str(exc),
                      'functional_receipts': 0}
            if not failure.exists():
                failure.write_bytes(encoded(detail))
            print(encoded(detail).decode(), end='')
            return 1
    (HERE / 'download.json').write_bytes(encoded(report))
    print('FETCH authenticated_archives=3 destinations=static.crates.io only; no extraction/install')
    return 0


# Frozen selection, not a general Rust/Cargo resolver. Full selected files retain
# private helpers, cfg alternatives, attributes, comments and macro source.
SELECTED = {
    'url': ['Cargo.toml', 'Cargo.toml.orig', 'src/lib.rs', 'src/parser.rs', 'src/host.rs'],
    'uuid': ['Cargo.toml', 'Cargo.toml.orig', 'src/lib.rs', 'src/external.rs', 'src/parser.rs',
             'src/fmt.rs', 'src/external/serde_support.rs'],
    'serde_json': ['Cargo.toml', 'Cargo.toml.orig', 'src/lib.rs', 'src/value/mod.rs',
                   'src/value/de.rs', 'src/value/ser.rs', 'src/number.rs',
                   'src/map.rs', 'src/raw.rs', 'src/de.rs', 'src/ser.rs', 'src/read.rs'],
}
LOCAL = {
    'rpc': 'codex-rs/exec-server-protocol/src/rpc.rs',
    'path_uri': 'codex-rs/utils/path-uri/src/lib.rs',
    'thread_id': 'codex-rs/protocol/src/thread_id.rs',
}
LIMITS = [
    {'id': 'thirdparty_dependencies', 'status': 'OPEN',
     'detail': 'No audit of serde/serde_core/derive, indexmap, zmij, IDNA, encoding, RNG or any downstream dependency closure.'},
    {'id': 'cargo_feature_unification', 'status': 'OPEN',
     'detail': 'Declarations and conditional/default/optional feature edges only; no Cargo resolution, selected target, build invocation, cfg evaluation or activated-feature receipt.'},
    {'id': 'url_idna_platform', 'status': 'OPEN',
     'detail': 'URL parsing/IDNA, file-path conversions, platform helpers, native byte handling and OS behavior have no runtime qualification.'},
    {'id': 'grammar_runtime', 'status': 'OPEN',
     'detail': 'Authenticated source binds branches; numeric/UUID/URL/string grammar, serde format behavior, recursion/budget, duplicate handling and resource behavior have no executable target oracle.'},
    {'id': 'g01_and_parity', 'status': 'OPEN',
     'detail': 'No G01 closure, functional receipt, CVG grant, production/release approval or full third-party security audit.'},
]


def span(data, start=0, end=None):
    if end is None:
        end = len(data)
    require(isinstance(start, int) and isinstance(end, int)
            and 0 <= start <= end <= len(data), 'span byte bounds')
    require((start == len(data) or data[start] & 0xC0 != 0x80)
            and (end == len(data) or data[end] & 0xC0 != 0x80), 'span UTF-8 boundary')
    text = data[start:end].decode('utf-8', errors='strict')
    return {'byte_start': start, 'byte_end_exclusive': end,
            'line_start': data[:start].count(b'\n') + 1,
            'line_end_inclusive': data[:end].count(b'\n') + (not data[:end].endswith(b'\n')),
            'sha256': digest(data[start:end]), 'text': text}


def source_record(data, provenance):
    data.decode('utf-8', errors='strict')
    return {'provenance': provenance, 'sha256': digest(data), 'bytes': len(data),
            'utf8_span': span(data)}


def git_provenance(path, data):
    header = ('blob ' + str(len(data)) + '\0').encode()
    return {'kind': 'pinned_git_blob', 'pin': PIN, 'path': path,
            'git_blob_sha1': hashlib.sha1(header + data).hexdigest()}


def dependency_tables(obj, trail=()):
    for key, value in obj.items():
        if key in ('dependencies', 'dev-dependencies', 'build-dependencies') and isinstance(value, dict):
            yield trail + (key,), value
        elif isinstance(value, dict):
            yield from dependency_tables(value, trail + (key,))


def declaration_features(manifest, source_id, workspace):
    declarations = []
    for context, deps in dependency_tables(manifest):
        for alias, value in deps.items():
            spec = {'version': value} if isinstance(value, str) else value
            name = spec.get('package', alias)
            if name not in ('serde_json', 'url', 'uuid', 'serde'):
                continue
            inherited = spec.get('workspace', False)
            base = workspace.get(alias, {}) if inherited else {}
            base = {'version': base} if isinstance(base, str) else base
            declarations.append({
                'source': source_id, 'context': list(context), 'alias': alias, 'crate': name,
                'declaration': value, 'workspace_base': base if inherited else None,
                'declared_feature_union': sorted(set(base.get('features', []) + spec.get('features', []))),
                'default_features_declaration': spec.get('default-features', base.get('default-features', True)),
                'optional_declaration': spec.get('optional', False),
                'target_predicate': context[1] if context and context[0] == 'target' else None,
                'activation_status': 'DECLARATION_ONLY_CARGO_RESOLUTION_OPEN',
            })
    return declarations


def anchor(source, needle, occurrence=0):
    data = source['utf8_span']['text'].encode()
    found = list(re.finditer(re.escape(needle.encode()), data))
    require(len(found) > occurrence, 'missing source anchor: ' + needle)
    m = found[occurrence]
    a = data.rfind(b'\n', 0, m.start()) + 1
    b = data.find(b'\n', m.end())
    if b == -1:
        b = len(data)
    else:
        b += 1
    return span(data, a, b)


def semantic_contract(name, sources):
    def evidence(member, needle):
        sid = name + ':' + member
        return {'source': sid, 'span': anchor(sources[sid], needle)}

    if name == 'serde_json':
        variants = []
        for variant in ['Null', 'Bool(bool)', 'Number(Number)', 'String(String)',
                        'Array(Vec<Value>)', 'Object(Map<String, Value>)']:
            variants.append({'declaration': variant,
                             'evidence': evidence('src/value/mod.rs', '    ' + variant + ',')})
        return {
            'value_variants': variants,
            'defaults': [{'value': 'Value::Null',
                          'evidence': evidence('src/value/mod.rs', 'impl Default for Value {')},
                         {'value': 'Map::new()',
                          'evidence': evidence('src/map.rs', 'impl Default for Map<String, Value> {')}],
            'branches': [
                {'id': 'value_serialize', 'detail': 'Serialize matches all six variants; Number delegates; objects iterate entries.',
                 'evidence': evidence('src/value/ser.rs', 'impl Serialize for Value {')},
                {'id': 'value_deserialize', 'detail': 'Generic deserialize_any visitor; map classification has Number/RawValue feature alternatives. Library map insertion differs from local duplicate-key rejection.',
                 'evidence': evidence('src/value/de.rs', "impl<'de> Deserialize<'de> for Value {")},
                {'id': 'number_representation', 'detail': 'Without arbitrary_precision: u64/i64/finite f64 enum; with feature: String-backed N.',
                 'evidence': evidence('src/number.rs', 'type N = String;')},
                {'id': 'number_finite', 'detail': 'from_f64 rejects nonfinite; Value/local visitor map None to Null. zmij formatting dependency not qualified.',
                 'evidence': evidence('src/number.rs', 'pub fn from_f64(f: f64)')},
                {'id': 'number_token', 'detail': 'arbitrary_precision Serialize/Deserialize and local bounded visitor use private Number token.',
                 'evidence': evidence('src/number.rs', 'const TOKEN:')},
                {'id': 'number_parse', 'detail': 'Number FromStr calls parse_any_signed_number; arbitrary precision parse retains non-integer/range spelling via ParserNumber::String. Grammar/runtime OPEN.',
                 'evidence': evidence('src/de.rs', 'impl FromStr for Number {')},
                {'id': 'raw_token', 'detail': 'RawValue uses private token; local bounded visitor reparses encoded string and calls end. Feature source is not a runtime receipt.',
                 'evidence': evidence('src/raw.rs', 'const TOKEN:')},
                {'id': 'map_representation', 'detail': 'BTreeMap default versus IndexMap with preserve_order; whole-workspace feature resolution remains OPEN.',
                 'evidence': evidence('src/map.rs', 'type MapImpl<K, V> = BTreeMap<K, V>;')},
            ],
        }
    if name == 'url':
        return {'defaults': [{'value': 'Cargo default=[std]; Url has no Default impl in selected src/lib.rs',
                              'evidence': evidence('Cargo.toml', 'default = ["std"]')}],
                'branches': [
                    {'id': 'url_serialize', 'detail': 'serde-gated Url Serialize emits as_str; PathUri uses its own string serializer regardless of url serde activation.',
                     'evidence': evidence('src/lib.rs', 'impl serde::Serialize for Url {')},
                    {'id': 'url_deserialize', 'detail': 'serde-gated string visitor calls Url::parse; PathUri calls custom parse/TryFrom validations.',
                     'evidence': evidence('src/lib.rs', "impl<'de> serde::Deserialize<'de> for Url {")},
                    {'id': 'url_parse', 'detail': 'Url::parse -> options().parse -> Parser::parse_url, with file URL branch and host/IDNA dependency boundary.',
                     'evidence': evidence('src/parser.rs', 'fn parse_file(')},
                    {'id': 'url_idna', 'detail': 'Host parse percent-decodes then calls IDNA; no dependency closure or platform qualification.',
                     'evidence': evidence('src/host.rs', 'idna::domain_to_ascii_from_cow')},
                ]}
    return {'defaults': [{'value': 'Uuid default is nil; ThreadId default uses new/now_v7 instead',
                          'evidence': evidence('src/lib.rs', 'impl Default for Uuid {')}],
            'parse_forms': ['32 hexadecimal bytes', '36-byte hyphenated', '38-byte braced hyphenated',
                            '45-byte lowercase urn:uuid: prefix + hyphenated'],
            'branches': [
                {'id': 'uuid_serialize', 'detail': 'Generic serde human-readable -> lowercase hyphenated string; binary -> bytes. ThreadId always collect_str via Uuid Display.',
                 'evidence': evidence('src/external/serde_support.rs', 'impl Serialize for Uuid {')},
                {'id': 'uuid_serde_cfg', 'detail': 'external::serde_support module is gated by feature=serde; local ThreadId codec does not invoke that trait implementation.',
                 'evidence': evidence('src/external.rs', '#[cfg(feature = "serde")]')},
                {'id': 'uuid_deserialize', 'detail': 'Generic serde readable visitor accepts string/bytes/sequence callbacks when supplied by format; binary uses byte visitor. ThreadId instead requires String then parse_str.',
                 'evidence': evidence('src/external/serde_support.rs', "impl<'de> Deserialize<'de> for Uuid {")},
                {'id': 'uuid_parse', 'detail': 'parse_str -> try_parse -> simple/hyphenated byte parsers and HEX_TABLE. Does not impose UUIDv7-only validation.',
                 'evidence': evidence('src/parser.rs', 'const fn try_parse(input:')},
                {'id': 'uuid_display', 'detail': 'Display -> LowerHex -> hyphenated lowercase representation; macro implementation retained as source, not executed.',
                 'evidence': evidence('src/fmt.rs', 'impl fmt::Display for Uuid {')},
            ]}


def generate(contract):
    sources = {}
    crates = []
    for entry, package in locked_sources(contract):
        name, version = package['name'], package['version']
        path = CACHE / (name + '-' + version + '.crate')
        require(path.is_file() and not path.is_symlink(), 'OPEN: authenticated cache missing: ' + str(path))
        require(path.stat().st_size <= COMPRESSED, 'cache size')
        files, stats = archive(path.read_bytes(), package['checksum'], name + '-' + version)
        prefix = name + '-' + version + '/'
        for member in SELECTED[name]:
            require(member in files, 'missing selected archive member: ' + member)
            sid = name + ':' + member
            sources[sid] = source_record(files[member], {
                'kind': 'authenticated_crate_member', 'crate': name, 'version': version,
                'archive_sha256': package['checksum'], 'archive_cache': str(path),
                'url': 'https://static.crates.io/crates/' + name + '/' + path.name,
                'member': prefix + member,
            })
        manifest = tomllib.loads(files['Cargo.toml'].decode())
        original = tomllib.loads(files['Cargo.toml.orig'].decode())
        require(manifest['package']['name'] == name and manifest['package']['version'] == version,
                'archive package identity')
        stable_ids = {'url': 'external:url::Url', 'uuid': 'external:uuid::Uuid',
                      'serde_json': 'external:serde_json::Value'}
        crate = {'id': stable_ids[name], 'symbol': entry['symbol'], 'original_owners': entry['unresolved_owners'],
                 'original_status': entry['status'], 'binding': entry['external_binding'],
                 'source_status': 'AUTHENTICATED_SELECTED_SOURCE_BOUND_RUNTIME_OPEN',
                 'binding_origin': 'Frozen external-contract unknown record; its qualification describes the historical pre-source state, not current selected-source evidence.',
                 'functional_receipts': 0, 'qualified_runtime': False,
                 'archive': stats,
                 'archive_member_hashes': [{'member': prefix + m, 'bytes': len(b), 'sha256': digest(b)}
                                          for m, b in sorted(files.items())],
                 'features': manifest.get('features', {}),
                 'original_manifest_features': original.get('features', {}),
                 'dependency_declarations': [{'context': list(c), 'declarations': v}
                                             for c, v in dependency_tables(manifest)],
                 'selected_members': [name + ':' + m for m in SELECTED[name]],
                 'codec_contract': semantic_contract(name, sources)}
        crates.append(crate)
    for key, path in LOCAL.items():
        data = git(path)
        sources['local:' + key] = source_record(data, git_provenance(path, data))

    workspace_bytes = git('codex-rs/Cargo.toml')
    workspace = tomllib.loads(workspace_bytes.decode())['workspace']['dependencies']
    paths = subprocess.check_output(['git', '-C', str(UPSTREAM), 'ls-tree', '-r', '--name-only', PIN], env=GIT_ENV).decode().splitlines()
    manifests = [p for p in paths if p.startswith('codex-rs/') and p.endswith('/Cargo.toml')]
    local_features = []
    for path in sorted(manifests):
        data = git(path)
        parsed = tomllib.loads(data.decode())
        decls = declaration_features(parsed, 'git:' + path, workspace)
        if decls:
            sources['git:' + path] = source_record(data, git_provenance(path, data))
            local_features.extend(decls)

    # Bind each lock table to the authenticated pin without duplicating the entire lock.
    lock_bytes = git('codex-rs/Cargo.lock')
    for crate in crates:
        package = crate['binding']['locked_packages'][0]
        marker = ('[[package]]\nname = "' + package['name'] + '"\nversion = "' + package['version'] + '"').encode()
        start = lock_bytes.index(marker)
        end = lock_bytes.find(b'[[package]]', start + len(marker))
        if end == -1:
            end = len(lock_bytes)
        crate['lock_evidence'] = {'provenance': git_provenance('codex-rs/Cargo.lock', lock_bytes),
                                  'file_sha256': digest(lock_bytes), 'span': span(lock_bytes, start, end)}

    local_sites = [
        {'id': 'rpc_bounded_value', 'source': 'local:rpc', 'crate': 'serde_json',
         'owner_bindings': [o['owner'] for e in contract['sources'] if e['symbol'] == 'serde_json::Value' for o in e['unresolved_owners']],
         'detail': 'Result alias + params/data options. JSONRPCMessage custom Deserialize uses a 256*1024-node budget, BoundedValueSeed/Visitor, private Number and RawValue map branches, raw reparse/end and duplicate-key rejection. Direct derived envelope deserializers and generic Value are distinct paths; no measured budget/grammar behavior.',
         'evidence': anchor(sources['local:rpc'], "impl<'de> Deserialize<'de> for JSONRPCMessage {")},
        {'id': 'path_uri_custom_serde', 'source': 'local:path_uri', 'crate': 'url',
         'owner_bindings': [o['owner'] for e in contract['sources'] if e['symbol'] == 'Url' for o in e['unresolved_owners']],
         'detail': 'Private Url payload. Deserialize String -> PathUri::parse -> Url::parse -> TryFrom<Url>: file scheme, metadata checks, encoded NUL/fallback validation, localhost removal and Windows drive normalization. Serialize emits inner as_str; native conversions and platform/helper dependency behavior OPEN.',
         'evidence': anchor(sources['local:path_uri'], "impl<'de> Deserialize<'de> for PathUri {")},
        {'id': 'thread_id_custom_serde', 'source': 'local:thread_id', 'crate': 'uuid',
         'owner_bindings': [o['owner'] for e in contract['sources'] if e['symbol'] == 'Uuid' for o in e['unresolved_owners']],
         'detail': 'Private uuid payload. Serialize collect_str; Deserialize String -> Uuid::parse_str, no v7-only check. Default/new call now_v7 rather than Uuid nil. RNG/time generation dependency boundary OPEN.',
         'evidence': anchor(sources['local:thread_id'], 'impl Serialize for ThreadId {')},
    ]
    lexical_index = []
    pattern = re.compile(r'^\s*(#\[(cfg|serde)|(?:pub(?:\([^)]*\))?\s+)?(?:const\s+)?(?:async\s+)?fn\s|impl[<\s]|(?:pub(?:\([^)]*\))?\s+)?(?:struct|enum|type|const)\s)')
    for sid, record in sorted(sources.items()):
        if not (sid.endswith('.rs') or sid.startswith('local:')):
            continue
        offset = 0
        for line in record['utf8_span']['text'].splitlines(keepends=True):
            raw = line.encode()
            if pattern.search(line):
                lexical_index.append({'source': sid, 'span': span(record['utf8_span']['text'].encode(), offset, offset + len(raw))})
            offset += len(raw)
    return {'task': contract['task'], 'pin': PIN, 'tier': 'T1',
            'parent_contract_sha256': PARENT_SHA, 'external_contract_sha256': EXTERNAL_SHA,
            'status': 'IMPLEMENTED_SOURCE_INVENTORY_REVIEW_PENDING',
            'independent_approval': False, 'functional_receipts': 0, 'full_g01_closure': False,
            'crates': crates, 'local_sites': local_sites, 'local_feature_declarations': local_features,
            'manifest_scan': {'scope': 'pinned codex-rs Cargo.toml declarations only',
                              'manifests_read': len(manifests), 'resolved_feature_graph': False},
            'sources': sources, 'lexical_index': lexical_index, 'limits': LIMITS}


def validate_inventory(actual, expected):
    require(actual == expected, 'inventory differs from authenticated source regeneration')


def validate_spans(inventory):
    """Recheck every nested evidence span against whole-file bytes and UTF-8 bounds."""
    checked = 0

    def check(data, evidence):
        nonlocal checked
        require(evidence == span(data, evidence['byte_start'], evidence['byte_end_exclusive']),
                'source evidence span mismatch')
        checked += 1

    for record in inventory['sources'].values():
        data = record['utf8_span']['text'].encode()
        require(digest(data) == record['sha256'] and len(data) == record['bytes'], 'whole-file integrity')
        check(data, record['utf8_span'])
    for row in inventory['lexical_index']:
        check(inventory['sources'][row['source']]['utf8_span']['text'].encode(), row['span'])
    for site in inventory['local_sites']:
        check(inventory['sources'][site['source']]['utf8_span']['text'].encode(), site['evidence'])
    for crate in inventory['crates']:
        contract = crate['codec_contract']
        for row in contract.get('value_variants', []) + contract['defaults'] + contract['branches']:
            evidence = row['evidence']
            check(inventory['sources'][evidence['source']]['utf8_span']['text'].encode(), evidence['span'])
        evidence = crate['lock_evidence']
        data = git(evidence['provenance']['path'])
        require(digest(data) == evidence['file_sha256'], 'lock evidence file digest')
        check(data, evidence['span'])
    return checked


def negative_controls(expected, contract):
    results = []

    def reject(name, procedure):
        try:
            procedure()
        except (ValueError, KeyError, UnicodeDecodeError):
            results.append({'id': name, 'outcome': 'REJECTED'})
            return
        raise ValueError('negative control escaped: ' + name)

    def mutate(name, change):
        candidate = copy.deepcopy(expected)
        change(candidate)
        reject(name, lambda: validate_inventory(candidate, expected))

    mutate('omit_one_of_three_types', lambda d: d['crates'].pop())
    mutate('omit_original_owner', lambda d: d['crates'][2]['original_owners'].pop())
    mutate('wrong_locked_checksum', lambda d: d['crates'][0]['binding']['locked_packages'][0].update(checksum='0' * 64))
    mutate('wrong_member_source', lambda d: d['sources']['url:src/lib.rs']['provenance'].update(member='uuid-1.20.0/src/lib.rs'))
    mutate('wrong_utf8_span', lambda d: d['sources']['url:src/lib.rs']['utf8_span'].update(byte_end_exclusive=3))
    mutate('wrong_wholefile_hash', lambda d: d['sources']['url:src/lib.rs'].update(sha256='0' * 64))
    mutate('omit_value_variant', lambda d: d['crates'][2]['codec_contract']['value_variants'].pop())
    mutate('omit_default', lambda d: d['crates'][2]['codec_contract']['defaults'].pop())
    mutate('omit_feature_branch', lambda d: d['crates'][2]['features'].pop('arbitrary_precision'))
    mutate('omit_local_feature_declaration', lambda d: d['local_feature_declarations'].pop())
    mutate('omit_serde_branch', lambda d: d['crates'][0]['codec_contract']['branches'].pop(0))
    mutate('omit_local_codec_site', lambda d: d['local_sites'].pop())
    mutate('false_runtime_qualification', lambda d: d['crates'][0].update(qualified_runtime=True))
    mutate('false_g01_closure', lambda d: d.update(full_g01_closure=True))
    mutate('erase_open_dependency', lambda d: d['limits'].pop(0))
    mutate('alter_cfg_source', lambda d: d['lexical_index'].pop())
    # Input-bound controls execute the same reader boundary, not only JSON equality.
    entry, package = locked_sources(contract)[0]
    filename = package['name'] + '-' + package['version']
    data = (CACHE / (filename + '.crate')).read_bytes()
    reject('archive_actual_wrong_checksum', lambda: archive(data, '0' * 64, filename))
    reject('archive_actual_corrupt_bytes', lambda: archive(data[:-1] + bytes([data[-1] ^ 1]), package['checksum'], filename))
    reject('archive_actual_wrong_prefix', lambda: archive(data, package['checksum'], 'wrong-1.0'))
    reject('compressed_limit', lambda: archive(b'x' * (COMPRESSED + 1), '0' * 64, filename))
    lock = git('codex-rs/Cargo.lock')
    bad_lock = lock.replace(package['checksum'].encode(), b'0' * 64)
    reject('input_lock_sha_drift', lambda: locked_sources(contract, lambda _: bad_lock))
    # Even if the test updates file SHA coherently, package checksum must match frozen record.
    altered_contract = copy.deepcopy(contract)
    for entry in altered_contract['sources']:
        entry['external_binding']['lock_file']['sha256'] = digest(bad_lock)
    reject('input_lock_package_drift', lambda: locked_sources(altered_contract, lambda _: bad_lock))
    for test_id, needle in [('input_value_variant_omitted', 'Object(Map<String, Value>)'),
                            ('input_value_default_omitted', 'impl Default for Value {')]:
        changed = dict(expected['sources'])
        sid = 'serde_json:src/value/mod.rs'
        raw = changed[sid]['utf8_span']['text'].replace(needle, 'REMOVED').encode()
        changed[sid] = source_record(raw, changed[sid]['provenance'])
        reject(test_id, lambda s=changed: semantic_contract('serde_json', s))
    broken = copy.deepcopy(expected)
    broken['sources']['url:src/lib.rs']['utf8_span']['byte_end_exclusive'] -= 1
    reject('span_verifier_actual_mismatch', lambda: validate_spans(broken))

    def synthetic(members):
        stream = io.BytesIO()
        with tarfile.open(fileobj=stream, mode='w:gz') as tf:
            for path, kind in members:
                info = tarfile.TarInfo(path)
                if kind == 'symlink':
                    info.type, info.linkname = tarfile.SYMTYPE, '/tmp/escape'
                elif kind == 'hardlink':
                    info.type, info.linkname = tarfile.LNKTYPE, 'fake-1/a'
                elif kind == 'device':
                    info.type = tarfile.CHRTYPE
                elif kind == 'oversize':
                    info.size = REGULAR + 1
                    tf.addfile(info, io.BytesIO(b'\0' * (REGULAR + 1)))
                    continue
                tf.addfile(info)
        return stream.getvalue()

    cases = {
        'tar_traversal': [('fake-1/../a', 'file')],
        'tar_absolute': [('/fake-1/a', 'file')],
        'tar_outside_prefix': [('other-1/a', 'file')],
        'tar_duplicate': [('fake-1/a', 'file'), ('fake-1/a', 'file')],
        'tar_symlink': [('fake-1/a', 'symlink')],
        'tar_hardlink': [('fake-1/a', 'hardlink')],
        'tar_device': [('fake-1/a', 'device')],
        'tar_prefix_is_regular': [('fake-1', 'file')],
        'tar_regular_limit': [('fake-1/a', 'oversize')],
    }
    for name, members in cases.items():
        bad = synthetic(members)
        reject(name, lambda b=bad: archive(b, digest(b), 'fake-1'))

    # Tamper member data and re-authenticate as synthetic data to exercise UTF-8 and anchors.
    rec = source_record(b'pub enum Value { Null, }\n', {'kind': 'synthetic'})
    reject('missing_required_source_anchor', lambda: anchor(rec, 'Object(Map<String, Value>)'))
    reject('non_utf8_source', lambda: source_record(b'\xff', {'kind': 'synthetic'}))
    reject('span_out_of_bounds', lambda: span(b'abc', 0, 4))
    reject('span_mid_utf8_codepoint', lambda: span('é'.encode(), 0, 1))
    return results


def frozen_inputs():
    baseline = json.loads((HERE / 'baseline.json').read_bytes())
    for row in baseline['files']:
        require(digest((ROOT / row['path']).read_bytes()) == row['sha256'], 'readonly baseline drift: ' + row['path'])
    return len(baseline['files'])


def verification(inventory, contract):
    span_count = validate_spans(inventory)
    second = generate(contract)
    require(encoded(second) == encoded(inventory), 'nondeterministic regeneration')
    negatives = negative_controls(inventory, contract)
    return {'task': contract['task'], 'evidence_kind': 'STATIC_SOURCE_AND_READER_COMMAND',
            'procedure_status': 'EXECUTED', 'exit_status': 0,
            'scope': 'source binding/integrity/reproducibility only',
            'input_files_preserved': frozen_inputs(), 'deterministic_generations': 2,
            'negative_controls': negatives,
            'counts': {'crates': len(inventory['crates']),
                       'original_owners': sum(len(c['original_owners']) for c in inventory['crates']),
                       'selected_archive_members': sum(len(c['selected_members']) for c in inventory['crates']),
                       'sources': len(inventory['sources']), 'lexical_spans': len(inventory['lexical_index']),
                       'verified_utf8_spans': span_count,
                       'local_codec_sites': len(inventory['local_sites']),
                       'local_feature_declarations': len(inventory['local_feature_declarations']),
                       'value_variants': len(inventory['crates'][2]['codec_contract']['value_variants']),
                       'negative_controls': len(negatives)},
            'functional_receipts': 0, 'independent_approval': False,
            'runtime': 'NOT_RUN_OPEN', 'full_g01_closure': False}


def package_manifest():
    return {'task': 'DX100-G01:EXEC-TRANSITIVE-EXTERNAL',
            'parent_contract_sha256': PARENT_SHA, 'external_contract_sha256': EXTERNAL_SHA,
            'files': [{'path': p.relative_to(HERE).as_posix(), 'bytes': p.stat().st_size,
                       'sha256': digest(p.read_bytes())}
                      for p in sorted(HERE.rglob('*')) if p.is_file() and p != HERE / 'manifest.json'],
            'self_excluded': 'manifest.json; report its SHA256 externally',
            'approval': 'NOT_GRANTED_REVIEW_PENDING', 'functional_receipts': 0}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--fetch', action='store_true')
    parser.add_argument('--write', action='store_true')
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    require(sum((args.fetch, args.write, args.check)) == 1, 'choose one mode')
    _, contract = contracts()
    if args.fetch:
        return fetch(contract)
    inventory = generate(contract)
    verify = verification(inventory, contract)
    if args.write:
        (HERE / 'inventory.json').write_bytes(encoded(inventory))
        (HERE / 'verification.json').write_bytes(encoded(verify))
        (HERE / 'manifest.json').write_bytes(encoded(package_manifest()))
        print('WRITE inventory/verification/manifest; ' + json.dumps(verify['counts'], sort_keys=True))
    else:
        validate_inventory(json.loads((HERE / 'inventory.json').read_bytes()), inventory)
        require((HERE / 'inventory.json').read_bytes() == encoded(inventory), 'inventory encoding drift')
        require((HERE / 'verification.json').read_bytes() == encoded(verify), 'verification drift')
        require((HERE / 'manifest.json').read_bytes() == encoded(package_manifest()), 'manifest drift')
        print('CHECK PASS offline readonly; ' + json.dumps(verify['counts'], sort_keys=True))
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception as exc:
        print('OPEN: ' + type(exc).__name__ + ': ' + str(exc), file=sys.stderr)
        sys.exit(1)
