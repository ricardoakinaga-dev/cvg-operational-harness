#!/usr/bin/env python3
"""Read-only verification; --record writes only this lane's report/manifest.

All negative source controls are in-memory. No target process is started.
"""
import sys
sys.dont_write_bytecode = True
import argparse
import copy
import datetime
import json
import re
from pathlib import Path
import generate as g


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def types_by_name(inv):
    return {t['name']: t for t in inv['types']}


def fields(typ):
    return typ['fields']+[f for v in typ['variants'] for f in v['fields']]


def semantic(inv):
    """Ignore hashes/spans: controls must change extracted contract content."""
    def strip(obj):
        if isinstance(obj, dict):
            return {k: strip(v) for k, v in obj.items() if k not in ('source', 'support_ids', 'helper_ids')}
        if isinstance(obj, list):
            return [strip(x) for x in obj]
        return obj
    return strip(inv['types'])


def evidence_walk(obj, root):
    checked = 0
    if isinstance(obj, dict):
        if {'path', 'file_sha256', 'start_byte', 'end_byte_exclusive', 'text'} <= obj.keys():
            data = (root/obj['path']).read_bytes()
            raw = data[obj['start_byte']:obj['end_byte_exclusive']]
            require(g.digest(data) == obj['file_sha256'], 'file hash '+obj['path'])
            require(raw == obj['text'].encode(), 'source span '+obj['path'])
            require(g.digest(raw) == obj['sha256'], 'span hash '+obj['path'])
            require(data[:obj['start_byte']].count(b'\n')+1 == obj['start_line'], 'start line')
            require(data[:obj['end_byte_exclusive']].count(b'\n')+1 == obj['end_line'], 'end line')
            return 1
        for value in obj.values():
            checked += evidence_walk(value, root)
    elif isinstance(obj, list):
        for value in obj:
            checked += evidence_walk(value, root)
    return checked


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--upstream', type=Path, default=g.DEFAULT_ROOT)
    parser.add_argument('--record', action='store_true')
    args = parser.parse_args()
    root = args.upstream.resolve()
    checks = []

    def check(name, fn):
        detail = fn()
        checks.append({'id': name, 'status': 'PASS', 'detail': detail})

    inventory_bytes = (g.HERE/'inventory.json').read_bytes()
    inv = json.loads(inventory_bytes)
    baseline = g.build(root)
    names = types_by_name(inv)

    def reproduce():
        require(g.encoded(baseline) == inventory_bytes, 'regeneration mismatch')
        require(g.encoded(g.build(root)) == inventory_bytes, 'second generation mismatch')
        return 'two independent in-memory generations match exact inventory bytes'
    check('T1-01-reproduction', reproduce)

    def identity():
        gitdir = root/'.git'
        if gitdir.is_file():
            gitdir = (root/gitdir.read_text().split(':', 1)[1].strip()).resolve()
        head = (gitdir/'HEAD').read_text().strip()
        if head.startswith('ref: '):
            ref = head[5:]
            if (gitdir/ref).exists():
                head = (gitdir/ref).read_text().strip()
            else:
                matches = [line.split()[0] for line in (gitdir/'packed-refs').read_text().splitlines() if line.endswith(' '+ref)]
                require(len(matches) == 1, 'HEAD ref unavailable'); head = matches[0]
        require(head == g.PIN == inv['pin'], 'pin metadata drift')
        require(g.digest((g.HERE.parent/'types-contract.json').read_bytes()) == inv['contract']['sha256'], 'contract hash drift')
        return 'Git HEAD metadata matches pin; contract bytes match; source bytes bound separately (not Git tree attestation)'
    check('T1-02-pin-contract', identity)

    def coverage():
        # Independent line-based census, restricted to these pinned flat modules.
        # cfg(test) tail is excluded, matching actual source module placement.
        expected = set()
        for src in inv['sources']:
            path = src['path']
            if not path.startswith(g.PREFIX) or path.endswith('_tests.rs'):
                continue
            text = (root/path).read_text().split('#[cfg(test)]', 1)[0]
            mod = 'codex_exec_server_protocol'+('::'+Path(path).stem if Path(path).stem != 'lib' else '')
            for kind, name in re.findall(r'^pub (struct|enum|type)\s+(\w+)', text, re.M):
                expected.add((g.type_id(mod, name), kind))
        actual = {(t['id'], t['kind']) for t in inv['types'] if t['scope'] == 'local'}
        require(expected == actual and len(actual) == 109, 'public census mismatch')
        require({s['path'] for s in inv['sources'] if s['path'].startswith(g.PREFIX)} == {str(p.relative_to(root)) for p in (root/g.PREFIX).glob('*.rs')}, 'source file census mismatch')
        return '109 public declarations, 10 local *.rs inputs, dedicated and inline test API excluded'
    check('T1-03-independent-public-census', coverage)
    check('T1-04-exact-source-spans', lambda: {'checked_evidence_records': evidence_walk(inv, root)})

    def integrity():
        ids = {t['id'] for t in inv['types']}
        require(len(ids) == len(inv['types']), 'duplicate type IDs')
        support_ids = {s['id'] for s in inv['support']}
        field_ids = set()
        for typ in inv['types']:
            require(set(typ['support_ids']) <= support_ids, 'dangling support')
            for f in fields(typ):
                require(f['id'] not in field_ids, 'duplicate field ID'); field_ids.add(f['id'])
                require(f['owner'] == typ['id'] or f['owner'] in {v['id'] for v in typ['variants']}, 'field owner')
                for ref in f['type_references']:
                    require(ref['target_id'] is None or ref['target_id'] in ids, 'dangling field reference')
                for helper in f.get('serde_helpers', []):
                    require(helper['status'] == 'bound_source' and set(helper['support_ids']) <= support_ids, 'helper binding')
            for ref in typ.get('type_references', []):
                require(ref['target_id'] is None or ref['target_id'] in ids, 'dangling alias reference')
        return {'unique_types': len(ids), 'unique_fields': len(field_ids), 'all_helper_bindings': 'bound'}
    check('T1-05-owner-reference-integrity', integrity)

    def anchors():
        def field(t, f):
            return next(x for x in names[t]['fields'] if x['name'] == f)
        require(field('WireExecParams', 'sandbox')['rust_type'] == 'Option<WireFileSystemSandboxContext>', 'wire sandbox')
        require(field('ExecParams', 'sandbox')['rust_type'] == 'Option<FileSystemSandboxContext>', 'domain sandbox')
        require(field('WireExecParams', 'process_id')['visibility'] == 'private', 'private fields dropped')
        require(field('WireFileSystemSandboxContext', 'cwd')['rust_type'] == 'Option<PathUri>', 'wire cwd')
        require(field('FileSystemSandboxContext', 'cwd')['rust_type'] == 'PathUri', 'domain cwd')
        require(names['FsWalkResponse']['type_references'][0]['target_id'] == names['WalkOutcome']['id'], 'alias resolution')
        require(field('ExecutorCapabilityDiscoveryV2Snapshot', 'result')['type_references'][0]['target_id'] is None, 'prelude Result shadowed by rpc alias')
        require(field('JSONRPCResponse', 'result')['type_references'][0]['target_id'] == names['Result']['id'], 'rpc Result alias missing')
        require('rename = "bodyBase64"' in field('HttpRequestParams', 'body')['serde_directives'], 'HTTP rename')
        require(names['FsOpenMode']['rust_default']['variant_ids'] == [names['FsOpenMode']['id']+'::variant:Read'], 'enum default')
        require(field('EnvironmentInfo', 'executor_version')['deserialization_default']['helper_ids'], 'helper default absent')
        require(len(inv['wire_domain_pairs']) == 13 and all(x['evidence_ids'] for x in inv['wire_domain_pairs']), 'conversion evidence')
        require(len(inv['codec_contracts']) == 8, 'codec classes')
        return 'wire/domain cwd, private fields, Result scope, alias import, rename, enum/helper defaults, 13 conversions, 8 codec classes'
    check('T1-06-contract-anchors', anchors)

    # Mutate real source bytes in memory; make sure extracted content changes
    # independently of hashes, offsets and source-record deletion detection.
    path = g.PREFIX+'protocol.rs'
    original = (root/path).read_bytes()

    def source_negative(name, old, new, predicate):
        require(old in original, 'negative fixture no longer applies: '+name)
        changed = g.build(root, {path: original.replace(old, new, 1)})
        require(predicate(changed), 'negative was invisible semantically: '+name)
        require(g.encoded(changed) != inventory_bytes, 'source negative accepted: '+name)
        return 'REJECTED; regenerated contract content differs, not merely source hashes'

    deleted = names['WriteResponse']['source']['text'].encode()
    check('NEG-source-type-deletion', lambda: source_negative('delete', deleted, b'', lambda x: 'WriteResponse' not in types_by_name(x)))
    wire = names['WireExecParams']['source']['text'].encode()
    wire_field = wire.replace(b'    sandbox: Option<WireFileSystemSandboxContext>,\n', b'')
    check('NEG-source-private-field-deletion', lambda: source_negative('field', wire, wire_field,
        lambda x: 'sandbox' not in {f['name'] for f in types_by_name(x)['WireExecParams']['fields']} and semantic(x) != semantic(inv)))
    http = names['HttpRequestParams']['source']['text'].encode()
    check('NEG-source-serde-rename', lambda: source_negative('serde', http, http.replace(b'bodyBase64', b'wrongBody'),
        lambda x: any('wrongBody' in d for f in types_by_name(x)['HttpRequestParams']['fields'] for d in f['serde_directives'])))
    check('NEG-source-default-helper-body', lambda: source_negative('default', b'"0.0.0".to_string()', b'"9.9.9".to_string()',
        lambda x: any('"9.9.9".to_string()' in s['source']['text'] for s in x['support'] if s['name'] == 'unknown_executor_version')))
    byte = names['ByteChunk']['source']['text'].encode()
    check('NEG-source-codec-attribute', lambda: source_negative('codec', byte, byte.replace(b'with = "base64_bytes"', b'with = "wrong_codec"'),
        lambda x: any(h['status'] == 'unresolved_helper' for f in types_by_name(x)['ByteChunk']['fields'] for h in f.get('serde_helpers', []))))

    def artifact_negatives():
        bads = []
        bad = copy.deepcopy(inv); bad['types'] = [t for t in bad['types'] if t['name'] != 'WireExecParams']; bads.append(('type removal', bad))
        bad = copy.deepcopy(inv); types_by_name(bad)['WireExecParams']['fields'].pop(); bads.append(('field removal', bad))
        bad = copy.deepcopy(inv); types_by_name(bad)['HttpRequestParams']['fields'][3]['serde_directives'] = []; bads.append(('serde removal', bad))
        bad = copy.deepcopy(inv)
        helper = next(s for s in bad['support'] if s['name'] == 'unknown_executor_version')
        helper['source']['text'] = helper['source']['text'].replace('0.0.0', '9.9.9'); bads.append(('default body tamper', bad))
        for label, bad in bads:
            require(g.encoded(bad) != g.encoded(baseline), 'artifact negative accepted '+label)
        return {'rejected_artifact_mutations': [x[0] for x in bads], 'method': 'compare freshly regenerated complete inventory; report/manifest do not authorize changed artifacts'}
    check('NEG-artifact-deletion-field-serde-default', artifact_negatives)

    # Manifest check is separate from regeneration and does not trust report PASS.
    contract_sha = g.digest((g.HERE.parent/'types-contract.json').read_bytes())
    if not args.record:
        manifest = json.loads((g.HERE/'manifest.json').read_bytes())
        require(manifest['contract']['sha256'] == contract_sha, 'manifest contract')
        require(manifest['pin'] == g.PIN, 'manifest pin')
        expected_files = {p.name for p in g.HERE.iterdir() if p.is_file() and p.name != 'manifest.json'}
        require(expected_files == {f['path'] for f in manifest['files']}, 'manifest file set')
        for f in manifest['files']:
            require(g.digest((g.HERE/f['path']).read_bytes()) == f['sha256'], 'manifest digest '+f['path'])
        require(manifest['sources'] == inv['sources'], 'manifest source set')
        checks.append({'id': 'T1-07-manifest', 'status': 'PASS', 'detail': 'file set, contract, pin and every artifact digest match'})
    report = {'task': inv['contract']['task'], 'status': 'IMPLEMENTED',
              'procedure_status': 'EXECUTED', 'evidence_kind': 'STATIC_INVENTORY_TOOLING',
              'exit_status': 0, 'observed_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'freshness': 'CURRENT_AT_OBSERVATION', 'independent_review': 'PENDING_LEAD_AND_CRITIC',
              'contract_sha256': contract_sha, 'inventory_sha256': g.digest(inventory_bytes),
              'counts': inv['counts'], 'checks': checks,
              'limits': ['not target/application tests or target execution', 'not runtime/parity/G01 completion',
                         'representative imported types, not full transitive closure',
                         'Git HEAD metadata and source hashes, not Git object tree attestation',
                         'bounded lexical parser; no macro/cfg expansion or Rust semantic typechecking']}
    if args.record:
        # A recording run emits report before hashing it; manifest never hashes itself.
        (g.HERE/'verification.json').write_bytes(g.encoded(report))
        files = sorted(p for p in g.HERE.iterdir() if p.is_file() and p.name != 'manifest.json')
        manifest = {'format': 'exec-server-types-manifest/v1', 'task': inv['contract']['task'],
                    'pin': g.PIN, 'contract': inv['contract'], 'sources': inv['sources'],
                    'self_hash_policy': 'manifest excluded; digest reported out-of-band to Lead',
                    'files': [{'path': p.name, 'sha256': g.digest(p.read_bytes()), 'bytes': p.stat().st_size} for p in files]}
        (g.HERE/'manifest.json').write_bytes(g.encoded(manifest))
    print(json.dumps({'status': 'PASS', 'checks': len(checks), 'counts': inv['counts'],
                      'negative_groups': len([c for c in checks if c['id'].startswith('NEG')]),
                      'inventory_sha256': g.digest(inventory_bytes), 'contract_sha256': contract_sha,
                      'manifest_sha256': g.digest((g.HERE/'manifest.json').read_bytes())}))


if __name__ == '__main__':
    main()
