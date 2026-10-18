#!/usr/bin/env python3
"""Offline, source-only Rust inventory for the exact parent T1 contract.

No Rust parser/build/codegen is executed. The deliberately bounded lexer retains
source and rejects unhandled field syntax rather than inventing JSON Schema.
"""
import argparse
import hashlib
import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
DEFAULT_ROOT = Path('/tmp/cvg-rea-codex-20261017/upstream')
PIN = '8d9f6466ff0294785d56f55b1fe363d132fe4133'
PREFIX = 'codex-rs/exec-server-protocol/src/'
TOKEN = re.compile(r'''//[^\n]*|/\*.*?\*/|r(\#*)".*?"\1|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])'|r\#\w+|[A-Za-z_]\w*|\d+|::|->|=>|[^\s]''', re.S)
BUILTINS = set('String str bool u8 u16 u32 u64 u128 usize i8 i16 i32 i64 i128 isize f32 f64 Vec Option Result HashMap Arc Box Self NonZeroUsize'.split())
CODEC_FILES = {'codex-rs/file-system/src/exec_permission_profile_serde.rs': 'codex_file_system::exec_permission_profile_serde'}

# Explicitly selected imported source definitions, not a claim of closure.
EXTERNAL = {
    'codex_utils_path_uri': ('utils/path-uri/src/lib.rs', ['PathUri']),
    'codex_file_system': ('file-system/src/lib.rs', [
        'FileSystemSandboxContext', 'WireFileSystemSandboxContext',
        'WireFileSystemPolicyContext', 'WindowsSandboxSelection', 'WalkOptions',
        'WalkOutcome', 'WalkEntry', 'WalkEntryKind', 'WalkError',
        'ExecPermissionProfile', 'ExecManagedFileSystemPermissions',
        'ExecFileSystemSandboxEntry', 'ExecFileSystemPath']),
    'codex_network_proxy.remote_config': ('network-proxy/src/remote_config.rs', [
        'RemoteNetworkProxyLaunchConfig', 'RemoteNetworkProxyConfig']),
    'codex_network_proxy.proxy': ('network-proxy/src/proxy.rs', ['ManagedNetworkSandboxContext']),
    'codex_network_proxy.runtime': ('network-proxy/src/runtime.rs', ['NetworkProxyAuditMetadata']),
    'codex_protocol.thread_id': ('protocol/src/thread_id.rs', ['ThreadId']),
    'codex_protocol.protocol': ('protocol/src/protocol.rs', ['W3cTraceContext', 'Product']),
    'codex_protocol.config_types': ('protocol/src/config_types.rs', ['ShellEnvironmentPolicyInherit']),
    'codex_protocol.capabilities': ('protocol/src/capabilities.rs', ['SelectedCapabilityRoot']),
    'codex_skills.model': ('skills/src/model.rs', ['SkillDependencies', 'SkillPolicy', 'SkillToolDependency']),
}


def digest(data):
    return hashlib.sha256(data if isinstance(data, bytes) else data.encode()).hexdigest()


def encoded(obj):
    return (json.dumps(obj, ensure_ascii=False, sort_keys=True, indent=2) + '\n').encode()


def serde_directives(attrs):
    """Lossless directive fragments, not interpreted accepted JSON."""
    result = []
    for attr in attrs:
        match = re.fullmatch(r'#\[serde\((.*)\)\]', attr, re.S)
        if match:
            # Current selected attributes have no nested serde expressions.
            result.extend(x.strip() for x in re.split(r',(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)', match[1]))
    return result


class Source:
    def __init__(self, path, data):
        self.path, self.data = path, data
        self.text = data.decode('utf-8')
        self.tokens = [(m.group(), m.start(), m.end()) for m in TOKEN.finditer(self.text)
                       if not m.group().startswith(('//', '/*'))]
        self.v = [x[0] for x in self.tokens]

    def raw(self, a, b):
        return self.text[self.tokens[a][1]:self.tokens[b-1][2]] if b > a else ''

    def evidence(self, a, b):
        start, end = self.tokens[a][1], self.tokens[b-1][2]
        raw = self.text[start:end]
        return {'path': self.path, 'file_sha256': digest(self.data),
                'start_byte': len(self.text[:start].encode()),
                'end_byte_exclusive': len(self.text[:end].encode()),
                'start_line': self.text.count('\n', 0, start)+1,
                'end_line': self.text.count('\n', 0, end)+1,
                'sha256': digest(raw), 'text': raw}

    def close(self, i):
        pairs = {'(': ')', '[': ']', '{': '}'}
        stack = [pairs[self.v[i]]]
        j = i+1
        while stack and j < len(self.v):
            if self.v[j] in pairs:
                stack.append(pairs[self.v[j]])
            elif self.v[j] == stack[-1]:
                stack.pop()
            j += 1
        if stack:
            raise ValueError(f'unbalanced delimiters {self.path}:{i}')
        return j

    def attrs(self, i, end):
        attrs = []
        while i+1 < end and self.v[i:i+2] == ['#', '[']:
            j = self.close(i+1)
            attrs.append(self.raw(i, j)); i = j
        return attrs, i

    def parts(self, a, b):
        start, i, angle = a, a, 0
        while i < b:
            t = self.v[i]
            if t in ('(', '[', '{'):
                i = self.close(i); continue
            if t == '<':
                angle += 1
            elif t == '>' and angle:
                angle -= 1
            if t == ',' and angle == 0:
                if i > start:
                    yield start, i
                start = i+1
            i += 1
        if start < b:
            yield start, b

    def fields(self, a, b, owner, tuple_fields=False):
        fields = []
        for n, (start, end) in enumerate(self.parts(a, b)):
            attrs, i = self.attrs(start, end)
            visibility = 'private'
            if self.v[i] == 'pub':
                j = self.close(i+1) if i+1 < end and self.v[i+1] == '(' else i+1
                visibility = self.raw(i, j); i = j
            if tuple_fields:
                name, typ = str(n), self.raw(i, end)
            else:
                if i+1 >= end or self.v[i+1] != ':':
                    raise ValueError(f'unhandled field {self.path}: {self.raw(start,end)}')
                name, typ = self.v[i], self.raw(i+2, end)
            fields.append({'id': owner+'::field:'+name, 'owner': owner, 'name': name,
                           'rust_type': typ, 'visibility': visibility, 'attributes': attrs,
                           'serde_attributes': [x for x in attrs if x.startswith('#[serde')],
                           'source': self.evidence(start, end)})
        return fields

    def scan(self, module, a=0, b=None, inherited_cfg=()):
        """Read module items; implementation/function bodies never become types."""
        if b is None:
            b = len(self.v)
        items, i = [], a
        while i < b:
            start = i
            attrs, i = self.attrs(i, b)
            if i >= b:
                break
            visibility = 'private'
            if self.v[i] == 'pub':
                j = self.close(i+1) if i+1 < b and self.v[i+1] == '(' else i+1
                visibility = self.raw(i, j); i = j
            kind = self.v[i]
            if kind == ';':
                i += 1; continue
            j = i+1
            while j < b and self.v[j] not in ('{', ';'):
                if self.v[j] in ('(', '['):
                    j = self.close(j)
                else:
                    j += 1
            if j == b:
                raise ValueError(f'unterminated item {self.path}:{self.v[i:i+5]}')
            end = self.close(j) if self.v[j] == '{' else j+1
            cfg = list(inherited_cfg) + [x for x in attrs if x.startswith('#[cfg')]
            is_test = any(re.search(r'cfg\s*\(\s*test\s*\)', x) for x in cfg)
            name = self.v[i+1] if i+1 < b else ''
            rec = {'kind': kind, 'name': name, 'module': module,
                   'visibility': visibility, 'attributes': attrs, 'cfg': cfg,
                   'source': self.evidence(start, end), '_a': i, '_j': j, '_end': end}
            if not is_test:
                if kind in ('struct', 'enum', 'type', 'fn', 'impl', 'const', 'use', 'macro_rules', 'mod') or (i+1 < b and self.v[i+1] == '!'):
                    items.append(rec)
                if kind == 'mod' and self.v[j] == '{':
                    items.extend(self.scan(module+'::'+name, j+1, end-1, cfg))
            i = end
        return items


def type_id(module, name):
    return 'rust:'+module+'::'+name


def declaration(src, rec, imported=False):
    a, j, end = rec['_a'], rec['_j'], rec['_end']
    out = {k: v for k, v in rec.items() if not k.startswith('_')}
    out['id'] = type_id(rec['module'], rec['name'])
    out['scope'] = 'representative_imported' if imported else 'local'
    out['serde_attributes'] = [x for x in rec['attributes'] if x.startswith('#[serde')]
    out['serde_directives'] = serde_directives(out['attributes'])
    out['fields'], out['variants'] = [], []
    if rec['kind'] == 'type':
        equal = src.v.index('=', a, end)
        out['alias_target'] = src.raw(equal+1, end-1)
    elif rec['kind'] == 'struct':
        # Tuple bodies occur before the terminating semicolon, named bodies at j.
        k = a+2
        while k < j and src.v[k] != '(':
            k += 1
        if k < j:
            out['shape'] = 'tuple'
            out['fields'] = src.fields(k+1, src.close(k)-1, out['id'], True)
        elif src.v[j] == '{':
            out['shape'] = 'named'
            out['fields'] = src.fields(j+1, end-1, out['id'])
        else:
            out['shape'] = 'unit'
    else:
        for start, stop in src.parts(j+1, end-1):
            attrs, k = src.attrs(start, stop)
            name = src.v[k]
            owner = out['id']+'::variant:'+name
            variant = {'id': owner, 'owner': out['id'], 'name': name,
                       'attributes': attrs, 'serde_attributes': [x for x in attrs if x.startswith('#[serde')],
                       'serde_directives': serde_directives(attrs),
                       'source': src.evidence(start, stop), 'fields': []}
            if k+1 < stop and src.v[k+1] in ('(', '{'):
                variant['shape'] = 'tuple' if src.v[k+1] == '(' else 'named'
                variant['fields'] = src.fields(k+2, src.close(k+1)-1, owner, src.v[k+1] == '(')
            else:
                variant['shape'] = 'unit'
            out['variants'].append(variant)
    derive = ' '.join(x for x in out['attributes'] if x.startswith('#[derive'))
    out['serde_derives'] = [n for n in ('Serialize', 'Deserialize') if re.search(r'\b'+n+r'\b', derive)]
    out['rust_default'] = {'derived': bool(re.search(r'\bDefault\b', derive)),
                           'variant_ids': [v['id'] for v in out['variants'] if '#[default]' in v['attributes']]}
    if imported:
        out['contract_role'] = 'imported_source_definition'
    elif rec['name'].startswith('Wire'):
        out['contract_role'] = 'wire_ingress'
    elif rec['name'] in ('ExecParams',) or (rec['name'].startswith('Fs') and rec['name'].endswith('Params') and any(f['name'] == 'sandbox' for f in out['fields'])) or rec['name'] in ('CapabilityRootDiscoverRequest', 'CapabilityRootsDiscoverParams'):
        out['contract_role'] = 'domain_request_with_distinct_wire_ingress'
    elif rec['kind'] == 'type':
        out['contract_role'] = 'type_alias_follow_target'
    elif not out['serde_derives']:
        out['contract_role'] = 'domain_only_or_custom_codec'
    else:
        out['contract_role'] = 'shared_serializable_contract'
    return out


def clean(rec):
    return {k: v for k, v in rec.items() if not k.startswith('_')}


def build(root=DEFAULT_ROOT, overrides=None):
    overrides = overrides or {}
    sources, scans = {}, {}

    def read(path, module):
        data = overrides.get(path, (root/path).read_bytes())
        s = Source(path, data)
        sources[path], scans[path] = s, s.scan(module)
        return s

    local_paths = sorted(str(p.relative_to(root)) for p in (root/PREFIX).glob('*.rs'))
    for path in local_paths:
        read(path, 'codex_exec_server_protocol'+('::'+Path(path).stem if Path(path).stem != 'lib' else ''))
    for module, (path, names) in EXTERNAL.items():
        read('codex-rs/'+path, module.replace('.', '::'))
    for path, module in CODEC_FILES.items():
        read(path, module)
    types = []
    for path in local_paths:
        for rec in scans[path]:
            # Dedicated *_tests.rs inputs are bound and excluded, never public API.
            if not path.endswith('_tests.rs') and rec['kind'] in ('struct', 'enum', 'type') and rec['visibility'] == 'pub':
                types.append(declaration(sources[path], rec))
            elif not path.endswith('_tests.rs') and rec['kind'] in ('struct', 'enum', 'type') and rec['name'] in ('BoundedValueSeed', 'BoundedValueVisitor'):
                private = declaration(sources[path], rec)
                private['scope'] = 'local_codec_support'
                private['contract_role'] = 'private_custom_deserializer_support'
                types.append(private)
    for module, (path, names) in EXTERNAL.items():
        path = 'codex-rs/'+path
        for name in names:
            matches = [r for r in scans[path] if r['name'] == name and r['kind'] in ('struct', 'enum', 'type')]
            if len(matches) != 1:
                raise ValueError(f'import selection not unique: {module}::{name}: {len(matches)}')
            types.append(declaration(sources[path], matches[0], True))

    # Every selected declaration keeps impl bodies: custom serde, Default,
    # conversion, validation and constructors remain evidence, never executed.
    supports = []
    for path, recs in scans.items():
        if path.endswith('_tests.rs'):
            continue
        src = sources[path]
        for rec in recs:
            header = src.raw(rec['_a'], rec['_j'])
            owners = [t['id'] for t in types if t['source']['path'] == path
                      and re.search(r'\b'+re.escape(t['name'])+r'\b', header)] if rec['kind'] == 'impl' else []
            local = path in local_paths
            helper = (local or path in CODEC_FILES) and rec['kind'] in ('fn', 'const', 'macro_rules', 'mod')
            macro = local and rec['kind'] == 'impl_wire_filesystem_request'
            codec = rec['kind'] == 'mod' and rec['name'] == 'exec_permission_profile_serde'
            if owners or helper or macro or codec:
                out = clean(rec)
                # Span component distinguishes overloaded/generic impls without order-based IDs.
                out['id'] = 'source:'+path+':'+str(out['source']['start_byte'])
                out['owners'] = owners
                out['purpose'] = 'impl_evidence' if owners else 'codec_module' if codec or rec['name'] == 'base64_bytes' else 'local_helper_or_constant_or_macro'
                supports.append(out)
    # Name resolution is lexical and explicit. No arbitrary global name matching.
    local_by_name = {t['name']: t['id'] for t in types if t['scope'].startswith('local')}
    imported = {t['name']: t['id'] for t in types if t['scope'] == 'representative_imported'}
    imports = []
    for path, recs in scans.items():
        for rec in recs:
            if rec['kind'] == 'use':
                imports.append({'module': rec['module'], 'source': rec['source'],
                                'visibility': rec['visibility']})

    def resolve(expr, typ):
        refs = []
        for m in re.finditer(r"(?<![\w'])\b(?:r#)?[A-Za-z_]\w*(?:::(?:r#)?[A-Za-z_]\w*)*", expr):
            symbol = m.group()
            if symbol in ('mut', 'dyn', 'impl', 'const', 'pub', 'crate') or (symbol[0].islower() and symbol not in BUILTINS and '::' not in symbol):
                continue
            name = symbol.split('::')[-1]
            module = typ['module']
            matching = [i for i in imports if i['module'] == module and re.search(r'::'+re.escape(name)+r'\s*;', i['source']['text'])]
            import_paths = [re.sub(r'^(?:pub\s+)?use\s+|;\s*$', '', i['source']['text']) for i in matching]
            target = None
            if name == 'Self':
                target = typ['id']
            elif symbol in ('serde_json::Value', 'serde_json::Map', 'serde_json::Number'):
                pass
            elif name in local_by_name and (typ['scope'] == 'local' and (symbol.startswith('crate::') or any(x.startswith('crate::') for x in import_paths) or local_by_name[name].startswith('rust:'+module+'::'))):
                target = local_by_name[name]
            elif name in imported and (matching or '::' in symbol or imported[name].startswith('rust:'+module+'::')):
                target = imported[name]
            status = 'bound_definition' if target else 'standard_primitive_or_container' if name in BUILTINS and (not import_paths or all(x.startswith('std::') for x in import_paths)) else 'unresolved_import_or_transitive'
            refs.append({'symbol': symbol, 'target_id': target, 'resolution': status,
                         'import_paths': import_paths})
        return refs

    for typ in types:
        typ['support_ids'] = [s['id'] for s in supports if typ['id'] in s['owners']]
        for field in typ['fields'] + [f for v in typ['variants'] for f in v['fields']]:
            field['type_references'] = resolve(field['rust_type'], typ)
            field['serde_directives'] = serde_directives(field['attributes'])
            default = next((d for d in field['serde_directives'] if d == 'default' or d.startswith('default =')), None)
            field['deserialization_default'] = {'directive': default,
                'kind': 'named_helper' if default and '=' in default else 'trait_Default' if default else 'implicit_Option_none' if field['rust_type'].startswith('Option<') else 'no_explicit_default',
                'helper_ids': []}
            for directive in field['serde_directives']:
                match = re.match(r'(default|with|serialize_with|deserialize_with)\s*=\s*"([^"]+)"', directive)
                if match:
                    helper_name = match[2]
                    helper_ids = [s['id'] for s in supports if s['name'] == helper_name and s['module'] == typ['module']]
                    # Imported codecs may be a separate module source.
                    helper_ids += [s['id'] for s in supports if s['module'] == typ['module']+'::'+helper_name]
                    field.setdefault('serde_helpers', []).append({'directive': match[1], 'symbol': helper_name,
                        'support_ids': helper_ids, 'status': 'bound_source' if helper_ids else 'unresolved_helper'})
                    if match[1] == 'default':
                        field['deserialization_default']['helper_ids'] = helper_ids
        if 'alias_target' in typ:
            typ['type_references'] = resolve(typ['alias_target'], typ)
    conversions = []
    for typ in types:
        if typ['scope'] == 'local' and typ['name'].startswith('Wire'):
            domain = typ['name'][4:]
            if domain not in local_by_name:
                raise ValueError('unbound wire/domain pair '+domain)
            records = [s['id'] for s in supports if typ['id'] in s['owners'] or
                       (s['kind'] in ('macro_rules', 'impl_wire_filesystem_request') and typ['name'] in s['source']['text']) or
                       (s['kind'] == 'macro_rules' and s['name'] == '!' and 'impl_wire_filesystem_request' in s['source']['text'] and typ['name'].startswith('WireFs'))]
            conversions.append({'wire_id': typ['id'], 'domain_id': local_by_name[domain],
                                'evidence_ids': records,
                                'semantic_status': 'SOURCE_ONLY; ingress resolution is distinct from domain deserialization'})
    unknowns = []
    for typ in types:
        fields = typ['fields']+[f for v in typ['variants'] for f in v['fields']]
        for owner, refs in [(f['id'], f['type_references']) for f in fields]+[(typ['id'], typ.get('type_references', []))]:
            for ref in refs:
                if ref['resolution'] == 'unresolved_import_or_transitive':
                    unknowns.append({'owner': owner, **ref})
    input_sources = [{'path': path, 'sha256': digest(src.data), 'bytes': len(src.data),
                      'role': 'local_protocol_test_source_excluded' if path.endswith('_tests.rs') else 'local_protocol_source' if path in local_paths else 'representative_imported_source'} for path, src in sorted(sources.items())]
    contract_data = (HERE.parent/'types-contract.json').read_bytes()
    contract = json.loads(contract_data)
    if contract['pin'] != PIN or contract['write_scope'] != 'g01/exec-server/types/**' or contract['task'] != 'DX100-G01:EXEC-WIRE-TYPES':
        raise ValueError('parent contract identity drift')
    codec_notes = {
        'ByteChunk': ('transparent_field_codec', 'Transparent Arc<Vec<u8>> uses base64_bytes: serialize_str(STANDARD.encode); deserialize String then STANDARD.decode. No accepted-byte grammar inferred from JSON Schema; base64 dependency validation is not executed.'),
        'ProcessId': ('transparent_string_id', 'Transparent String; constructors retain arbitrary strings. Logical protocol key, not OS PID; handler validation belongs to Lead.'),
        'RequestId': ('untagged_string_or_i64', 'Derived untagged String or i64; numeric bounds follow i64, not arbitrary JSON numbers.'),
        'ThreadId': ('custom_uuid_string', 'Serialize collect_str(uuid); deserialize String then Uuid::parse_str. Generated IDs are v7; deserializer does not enforce v7. UUID crate grammar remains external.'),
        'PathUri': ('custom_file_uri_string', 'Serialize canonical URL string; deserialize String then PathUri::parse. File-URI validation/canonicalization in impl evidence; Url dependency grammar and host/platform branches are not executed. String JsonSchema does not express this codec.'),
        'JSONRPCMessage': ('custom_bounded_dispatch', 'Serialize untagged. Custom Deserialize first bounds values to 256*1024 nodes, requires object, dispatches method+id / method / result / error in that order. Duplicate map keys are rejected in ordinary object visitor; serde_json private number/raw wrappers take special paths. No jsonrpc version member emitted by envelopes.'),
        'FileSystemSandboxContext': ('domain_permission_profile_codec', 'permissions uses exec_permission_profile_serde via ExecPermissionProfile; required domain cwd is not equivalent to optional wire cwd. Source includes conversion impls; unresolved policy types remain explicit.'),
        'WireFileSystemSandboxContext': ('wire_optional_cwd_context', 'Wire permissions are ExecPermissionProfile, cwd Option<PathUri>, policyContext private wire type. Conversion into_context resolves a supplied cwd; do not treat domain derive as ingress contract.'),
    }
    codecs = [{'type_id': t['id'], 'class': codec_notes[t['name']][0],
               'constraints': codec_notes[t['name']][1], 'evidence_support_ids': t['support_ids'],
               'evidence_type_id': t['id'], 'status': 'STATIC_SOURCE_ONLY'}
              for t in types if t['name'] in codec_notes]
    return {'format': 'exec-server-rust-source-inventory/v1', 'pin': PIN,
            'contract': {'path': '../types-contract.json', 'sha256': digest(contract_data), 'task': contract['task']},
            'evidence_kind': 'STATIC_SOURCE; not accepted-JSON schema or runtime proof',
            'closure': 'BOUNDED_REPRESENTATIVE_IMPORTS_NOT_FULL_TRANSITIVE_CLOSURE',
            'span_convention': 'UTF-8 byte offsets [start,end), 1-based inclusive lines; exact text SHA256',
            'sources': input_sources, 'types': sorted(types, key=lambda t:t['id']),
            'imports': imports, 'support': supports, 'wire_domain_pairs': conversions,
            'codec_contracts': codecs,
            'schema_constraints': [
                'This inventory schema describes Rust evidence records, never accepted target JSON.',
                'serde attributes/directives are retained separately at container, variant and field sites; no cfg or macro expansion.',
                'serde_derives records derives only; support impls and field helpers carry custom codec evidence.',
                'deserialization_default is lexical metadata. Derived Rust Default is distinct from serde(default); Option omission differs from skip_serializing_if.',
                'No extra-field rejection, nullability, accepted paths, numeric coercion or validation is inferred from type names or exported schemas.',
                'Source-only support retains non-codec impls too; references inside function bodies are not a closed type graph.'
            ],
            'unresolved_references': unknowns,
            'counts': {'local_types': sum(t['scope'] == 'local' for t in types),
                       'imported_types': sum(t['scope'] == 'representative_imported' for t in types),
                       'private_codec_types': sum(t['scope'] == 'local_codec_support' for t in types),
                       'fields': sum(len(t['fields'])+sum(len(v['fields']) for v in t['variants']) for t in types),
                       'variants': sum(len(t['variants']) for t in types),
                       'support_records': len(supports), 'wire_domain_pairs': len(conversions),
                       'unresolved_references': len(unknowns)}}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--upstream', type=Path, default=DEFAULT_ROOT)
    p.add_argument('--check', action='store_true', help='compare bytes, read-only')
    args = p.parse_args()
    result = encoded(build(args.upstream))
    dest = HERE/'inventory.json'
    if args.check:
        if dest.read_bytes() != result:
            raise SystemExit('FAIL: inventory differs from source generation')
        print('PASS: deterministic inventory matches source')
    else:
        dest.write_bytes(result)
        print(json.dumps({'inventory_sha256': digest(result), 'counts': json.loads(result)['counts']}))


if __name__ == '__main__':
    main()
