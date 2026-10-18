"""Source-only expansion of the frozen exec-server field/alias unknowns.

Imports only the prior reviewed local audit reader, never target modules.
Resolution is lexical and scoped; unresolved/ambiguous names remain explicit.
"""
from pathlib import Path
import collections
import copy
import hashlib
import importlib.util
import json
import re
import subprocess
import sys
import tomllib

sys.dont_write_bytecode = True
OUT = Path(__file__).resolve().parent
E = OUT.parents[2]
ROOT = next(p for p in OUT.parents if (p / 'docs/07_agents/AGENTS.md').exists())
UP = Path('/tmp/cvg-rea-codex-20261017/upstream')
PIN = '8d9f6466ff0294785d56f55b1fe363d132fe4133'
PARENT = E / 'g01/exec-server/types/inventory.json'
HELPER = E / 'g01/exec-server/types/generate.py'
CONTRACT = OUT.parent / 'contract.json'
RECON = E / 'next-exec-transitive-recon.json'
CRATES = {'codex_protocol': 'codex-rs/protocol', 'codex_network_proxy': 'codex-rs/network-proxy',
          'codex_file_system': 'codex-rs/file-system',
          'codex_exec_server_protocol': 'codex-rs/exec-server-protocol',
          'codex_utils_path_uri': 'codex-rs/utils/path-uri',
          'codex_utils_absolute_path': 'codex-rs/utils/absolute-path'}
STANDARD = set('String str bool char u8 u16 u32 u64 u128 usize i8 i16 i32 i64 i128 isize f32 f64 '
               'Vec Option Result HashMap HashSet BTreeMap BTreeSet Arc Box Cow NonZeroUsize Path PathBuf'.split())
EXTERNAL = {'serde_json::Value', 'serde_json::Number', 'serde_json::Map', 'url::Url', 'uuid::Uuid'}
IDENT = re.compile(r"(?<![\w'])\b(?:r#)?[A-Za-z_]\w*(?:::(?:r#)?[A-Za-z_]\w*)*")


def require(ok, message):
    if not ok:
        raise AssertionError(message)


def read(path):
    return json.loads(path.read_text())


def sha(data):
    return hashlib.sha256(data).hexdigest()


def encoded(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode()


prior_manifest = read(E / 'g01/exec-server/manifest.json')
helper_record = next(r for r in prior_manifest['files'] if r['path'] == str(HELPER.relative_to(ROOT)))
require(sha(HELPER.read_bytes()) == helper_record['sha256'], 'Prior reviewed reader differs')
spec = importlib.util.spec_from_file_location('reviewed_exec_source_reader', HELPER)
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


def build(overrides=None):
    overrides = overrides or {}
    tree = {}
    for record in subprocess.check_output(['git', '-C', str(UP), 'ls-tree', '-r', '-z', PIN]).split(b'\0'):
        if record:
            header, path = record.split(b'\t', 1); mode, kind, oid = header.decode().split()
            tree[path.decode()] = {'mode': mode, 'kind': kind, 'git_blob': oid}
    require(subprocess.check_output(['git', '-C', str(UP), 'rev-parse', 'HEAD']).decode().strip() == PIN,
            'Wrong source pin')
    require(not subprocess.check_output(['git', '-C', str(UP), 'status', '--porcelain']).strip(), 'Upstream dirty')
    sources = {}; scans = {}; data_cache = {}; source_modules = {}

    def load(path):
        require(path in tree and tree[path]['mode'] in ['100644', '100755'], 'Untracked/nonregular source: ' + path)
        if path not in data_cache:
            original = (UP / path).read_bytes()
            require(hashlib.sha1(b'blob ' + str(len(original)).encode() + b'\0' + original).hexdigest()
                    == tree[path]['git_blob'], 'Git blob mismatch: ' + path)
            data_cache[path] = overrides.get(path, original)
            sources[path] = {'path': path, 'sha256': sha(data_cache[path]), 'bytes': len(data_cache[path]), **tree[path]}
        return data_cache[path]

    for crate, directory in CRATES.items():
        manifest = tomllib.loads(load(directory + '/Cargo.toml').decode())
        actual_name = manifest.get('lib', {}).get('name', manifest['package']['name'].replace('-', '_'))
        require(actual_name == crate, 'Crate name differs')
    parent = read(PARENT); parent_types = {t['id']: t for t in parent['types']}
    by_qualified_parent = {t['id'][5:]: t['id'] for t in parent['types']}
    original_refs = parent['unresolved_references']
    require(len(parent_types) == 137 and len(original_refs) == 20, 'Historical input differs')
    selected = {}; queue = []; edges = []; supports = {}; helper_gaps = []

    def scan_file(path, module):
        if path not in scans:
            src = audit.Source(path, load(path)); sources[path]['source_module'] = module
            scans[path] = (src, src.scan(module)); source_modules[path] = module
        return scans[path]

    def get_module(module):
        crate, *parts = module.split('::')
        if crate not in CRATES:
            return None
        base = CRATES[crate] + '/src/'
        # Inline modules can already have been scanned from their enclosing file.
        for path, (src, records) in scans.items():
            if any(r['module'] == module for r in records):
                return path, src, records
        candidates = [base + '/'.join(parts) + '.rs', base + '/'.join(parts) + '/mod.rs'] if parts else [base + 'lib.rs']
        existing = [p for p in candidates if p in tree]
        if len(existing) != 1:
            return None
        path = existing[0]; src, records = scan_file(path, module)
        return path, src, records

    def use_parts(expr, prefix=''):
        expr = expr.strip()
        if '{' not in expr:
            return [prefix + expr]
        start = expr.index('{'); end = expr.rfind('}'); head = expr[:start]
        require(end >= start and not expr[end+1:].strip(), 'Unhandled use group: ' + expr)
        inner = expr[start+1:end]; chunks = []; depth = 0; begin = 0
        for i, char in enumerate(inner):
            if char == '{': depth += 1
            elif char == '}': depth -= 1
            elif char == ',' and depth == 0:
                chunks.append(inner[begin:i]); begin = i+1
        chunks.append(inner[begin:])
        return [p for chunk in chunks if chunk.strip() for p in use_parts(chunk, prefix + head)]

    def imports(module):
        context = get_module(module)
        if not context:
            return []
        result = []
        for rec in context[2]:
            if rec['kind'] == 'use' and rec['module'] == module:
                match = re.search(r'\buse\s+(.+);\s*$', rec['source']['text'], re.S)
                require(match is not None, 'Unhandled use spelling')
                for expr in use_parts(match[1]):
                    parts = re.split(r'\s+as\s+', expr)
                    path = parts[0].strip(); alias = parts[-1].strip().split('::')[-1]
                    result.append({'path': path, 'alias': alias, 'cfg': rec['cfg'], 'source': rec['source']})
        return result

    def normalize(path, module):
        bits = path.split('::')
        if bits[0] == 'crate': bits = [module.split('::')[0]] + bits[1:]
        elif bits[0] == 'self': bits = module.split('::') + bits[1:]
        elif bits[0] == 'super':
            root = module.split('::')
            while bits and bits[0] == 'super': root = root[:-1]; bits = bits[1:]
            bits = root + bits
        elif bits[0] not in CRATES and bits[0] not in ['std', 'core', 'alloc', 'serde_json', 'url', 'uuid']:
            bits = module.split('::') + bits
        return '::'.join(bits)

    def pick(qualified, why, trail=()):
        if qualified in by_qualified_parent:
            return {'status': 'BOUND_PRIOR_SELECTED_TYPE', 'target_id': by_qualified_parent[qualified]}
        if qualified in EXTERNAL:
            return {'status': 'BOUND_EXTERNAL_SOURCE_CONTRACT_PENDING_JOIN', 'external_type': qualified}
        if qualified.startswith(('std::', 'core::', 'alloc::')):
            return {'status': 'STANDARD_LIBRARY_SOURCE_BOUNDARY_NOT_EXECUTED', 'qualified': qualified}
        if qualified in trail:
            return {'status': 'OPEN_REEXPORT_CYCLE', 'qualified': qualified, 'trail': list(trail)}
        module, _, name = qualified.rpartition('::'); context = get_module(module)
        if not context:
            return {'status': 'OPEN_UNAVAILABLE_OR_AMBIGUOUS_MODULE', 'qualified': qualified}
        path, src, records = context
        found = [r for r in records if r['module'] == module and r['name'] == name
                 and r['kind'] in ['struct', 'enum', 'type']]
        if len(found) == 1:
            rec = found[0]; tid = 'rust:' + qualified
            if tid not in selected:
                typ = audit.declaration(src, rec, True); typ['scope'] = 'transitive_selected_source'
                typ['selection_reasons'] = [why]; typ['support_ids'] = []
                typ['contract_role'] = 'TRANSITIVE_SOURCE_DECLARATION_NOT_ACCEPTED_JSON_OR_GRANT'
                selected[tid] = typ; queue.append(tid)
            elif why not in selected[tid]['selection_reasons']:
                selected[tid]['selection_reasons'].append(why)
            return {'status': 'BOUND_TRANSITIVE_SOURCE_TYPE', 'target_id': tid}
        if len(found) > 1:
            return {'status': 'OPEN_CFG_OR_NAME_AMBIGUITY', 'qualified': qualified,
                    'candidates': [r['source'] for r in found]}
        bindings = [i for i in imports(module) if i['alias'] == name]
        if len(bindings) == 1:
            binding = bindings[0]
            if binding['cfg']:
                return {'status': 'OPEN_CFG_IMPORT', 'qualified': qualified, 'source': binding['source']}
            result = pick(normalize(binding['path'], module), why, trail + (qualified,))
            return {**result, 'reexport_evidence': result.get('reexport_evidence', []) + [binding['source']]}
        return {'status': 'OPEN_NO_UNIQUE_DECLARATION_OR_REEXPORT', 'qualified': qualified,
                'import_candidates': bindings}

    def resolve(expr, module, why, self_id=None):
        result = []
        for match in IDENT.finditer(expr):
            symbol = match.group()
            if symbol in ['mut', 'dyn', 'impl', 'const', 'pub', 'crate'] or (symbol[0].islower() and '::' not in symbol and symbol not in STANDARD):
                continue
            name = symbol.split('::')[-1]
            if name == 'Self' and self_id:
                bound = {'status': 'BOUND_SELF', 'target_id': self_id}
            else:
                bindings = [i for i in imports(module) if i['alias'] == symbol]
                if len(bindings) == 1:
                    binding = bindings[0]
                    bound = pick(normalize(binding['path'], module), why)
                    bound = {**bound, 'import_evidence': binding['source'], 'import_cfg': binding['cfg']}
                    if binding['cfg']:
                        bound['status'] = 'OPEN_CFG_IMPORT_WITH_CANDIDATE'
                elif len(bindings) > 1:
                    bound = {'status': 'OPEN_IMPORT_AMBIGUITY', 'imports': bindings}
                elif symbol in STANDARD:
                    bound = {'status': 'STANDARD_PRIMITIVE_OR_CONTAINER_SYNTAX', 'symbol': symbol}
                else:
                    bound = pick(normalize(symbol, module), why)
            result.append({'symbol': symbol, **bound})
        return result

    def fields(typ):
        return typ['fields'] + [f for v in typ['variants'] for f in v['fields']]

    original_bindings = []
    for ref in original_refs:
        parent_id = ref['owner'].split('::field:')[0].split('::variant:')[0]
        require(parent_id in parent_types, 'Unknown historical owner')
        typ = parent_types[parent_id]
        targets = resolve(ref['symbol'], typ['module'], ref['owner'], typ['id'])
        require(len(targets) == 1, 'Original reference not singular')
        original_bindings.append({'original': ref, 'owner_type': parent_id, 'binding': targets[0]})

    # Custom codecs have private helper types not exposed in the public enum shape.
    codec_links = []
    seen_support = set()
    while queue:
        tid = queue.pop(0); typ = selected[tid]; path = typ['source']['path']
        src, records = scans[path]
        for field in fields(typ):
            field['type_references'] = resolve(field['rust_type'], typ['module'], field['id'], tid)
            field['serde_directives'] = audit.serde_directives(field['attributes'])
            default = next((d for d in field['serde_directives'] if d == 'default' or d.startswith('default =')), None)
            field['deserialization_default'] = {'directive': default, 'kind': 'named_helper' if default and '=' in default
                else 'trait_Default' if default else 'implicit_Option_none' if field['rust_type'].startswith('Option<') else 'no_explicit_default'}
            edges.extend({'owner': field['id'], **r} for r in field['type_references'])
            for directive in field['serde_directives']:
                match = re.match(r'(default|with|serialize_with|deserialize_with)\s*=\s*"([^"]+)"', directive)
                if match:
                    named = [r for r in records if r['module'] == typ['module'] and r['name'] == match[2]]
                    if not named:
                        helper_gaps.append({'owner': field['id'], 'helper': match[2], 'status': 'OPEN_SERDE_HELPER'})
                    for helper in named:
                        key = 'source:' + path + ':' + str(helper['source']['start_byte'])
                        supports.setdefault(key, {**audit.clean(helper), 'id': key, 'owners': []})
                        if tid not in supports[key]['owners']: supports[key]['owners'].append(tid)
                        typ['support_ids'].append(key)
                        # Types referenced by a named deserializer are scoped source candidates.
                        for rec in records:
                            if rec['kind'] in ['struct', 'enum', 'type'] and rec['module'] == typ['module'] and re.search(r'\b' + re.escape(rec['name']) + r'\b', helper['source']['text']):
                                found = pick(rec['module'] + '::' + rec['name'], key)
                                codec_links.append({'owner': tid, 'support': key, **found})
        if 'alias_target' in typ:
            typ['type_references'] = resolve(typ['alias_target'], typ['module'], tid, tid)
            edges.extend({'owner': tid, **r} for r in typ['type_references'])
        relevant = [r for r in records if r['kind'] == 'impl' and r['module'] == typ['module']
                    and re.search(r'\b' + re.escape(typ['name']) + r'\b', src.raw(r['_a'], r['_j']))]
        helper_queue = []
        for rec in relevant:
            key = 'source:' + path + ':' + str(rec['source']['start_byte'])
            supports.setdefault(key, {**audit.clean(rec), 'id': key, 'owners': []})
            if tid not in supports[key]['owners']: supports[key]['owners'].append(tid)
            typ['support_ids'].append(key); helper_queue.append((key, rec))
            header = src.raw(rec['_a'], rec['_j'])
            if re.search(r'\b(?:Serialize|Deserialize)\b', header):
                for candidate in records:
                    if candidate['module'] == typ['module'] and candidate['kind'] in ['struct', 'enum', 'type'] and re.search(r'\b' + re.escape(candidate['name']) + r'\b', rec['source']['text']):
                        found = pick(candidate['module'] + '::' + candidate['name'], key)
                        codec_links.append({'owner': tid, 'support': key, **found})
        # Preserve same-module helper function bodies mentioned by associated impls.
        while helper_queue:
            key, rec = helper_queue.pop(0)
            if key in seen_support: continue
            seen_support.add(key)
            for helper in records:
                if helper['module'] == typ['module'] and helper['kind'] in ['fn', 'const'] and re.search(r'\b' + re.escape(helper['name']) + r'\b', rec['source']['text']):
                    helper_key = 'source:' + path + ':' + str(helper['source']['start_byte'])
                    supports.setdefault(helper_key, {**audit.clean(helper), 'id': helper_key, 'owners': []})
                    if tid not in supports[helper_key]['owners']: supports[helper_key]['owners'].append(tid)
                    typ['support_ids'].append(helper_key); helper_queue.append((helper_key, helper))
        typ['support_ids'] = sorted(set(typ['support_ids']))

    # Every scanned source's imports stay as exact evidence; body graphs remain open.
    all_imports = []
    for path, (src, recs) in sorted(scans.items()):
        all_imports.extend(audit.clean(r) for r in recs if r['kind'] == 'use')
    open_refs = [r for r in edges if r['status'].startswith('OPEN')]
    original_open = [r for r in original_bindings if r['binding']['status'].startswith('OPEN')]
    require(not original_open, 'A historical internal/external reference is still unbound: ' + str(original_open))
    require(len({r['original']['symbol'] for r in original_bindings}) == 14, 'Historical symbol omission')
    return {'kind': 'T1_EXEC_TRANSITIVE_SOURCE_GRAPH_NOT_RUNTIME_PROOF', 'pin': PIN,
            'contract_sha256': sha(CONTRACT.read_bytes()), 'prior_reader_sha256': sha(HELPER.read_bytes()),
            'parent_inventory_sha256': sha(PARENT.read_bytes()), 'recon_sha256': sha(RECON.read_bytes()),
            'original_reference_bindings': original_bindings, 'types': sorted(selected.values(), key=lambda t: t['id']),
            'field_alias_reference_edges': edges, 'codec_private_type_links': codec_links,
            'support': sorted(supports.values(), key=lambda r: r['id']), 'imports': all_imports,
            'remaining_open_references': open_refs, 'remaining_open_helpers': helper_gaps,
            'sources': sorted(sources.values(), key=lambda r: r['path']),
            'counts': {'historical_references': len(original_bindings), 'historical_symbols': 14,
                       'added_selected_types': len(selected), 'fields': sum(len(fields(t)) for t in selected.values()),
                       'variants': sum(len(t['variants']) for t in selected.values()), 'reference_edges': len(edges),
                       'private_codec_links': len(codec_links), 'support_bodies': len(supports),
                       'remaining_open_references': len(open_refs), 'remaining_open_helpers': len(helper_gaps)},
            'limits': ['Field/alias and selected same-file custom-serde helper source graph only; no compiler semantic/cfg/feature/macro resolution.',
                       'Associated impl headers may mention an owner as conversion input/output, not solely the receiver.',
                       'Impl/helper body runtime call/type dependencies are retained as source, not a closed arbitrary call graph.',
                       'Standard-library and external-crate serialization/platform behavior need future functional oracles.',
                       'Lexical default metadata does not prove accepted nullability, extra-field, coercion or CVG grant.',
                       'All six mandatory SDK/package gaps and scalar/cfg/TUI/platform/effect/G02/G03/G04 remain open.'],
            'functional_receipts': 0, 'full_g01_closure': False}


def main():
    fresh = build(); require(fresh == build(), 'Generation nondeterministic')
    negatives = []
    for name, mutation in [
        ('lost_original_reference', lambda v: v['original_reference_bindings'].pop()),
        ('lost_selected_type', lambda v: v['types'].pop()),
        ('lost_private_codec', lambda v: v.update(codec_private_type_links=[])),
        ('lost_field', lambda v: next(t for t in v['types'] if t['fields'])['fields'].pop()),
        ('lost_serde_alias', lambda v: next(a for t in v['types'] for a in t['variants'] if any('alias' in s for s in a['serde_directives'])).update(serde_directives=[])),
        ('lost_default', lambda v: next(t for t in v['types'] if t['rust_default']['derived']).update(rust_default={})),
        ('lost_conversion_body', lambda v: v['support'].pop()),
        ('unbound_as_builtin', lambda v: v['original_reference_bindings'][0]['binding'].update(status='STANDARD_PRIMITIVE')),
        ('false_functional_qualification', lambda v: v.update(functional_receipts=1)),
    ]:
        bad = copy.deepcopy(fresh); mutation(bad)
        try: require(bad == fresh, 'Rejected mutated source graph')
        except AssertionError: negatives.append({'id': name, 'result': 'REJECTED'})
        else: raise AssertionError('Known-bad graph accepted: ' + name)
    # Mutation of actual input text must change a parsed directive/variant/body,
    # not merely its file digest. No source on disk is modified.
    mutations = [
        ('input_serde_alias', 'codex-rs/protocol/src/permissions.rs', b'alias = "none"', b'alias = "legacy_none"',
         lambda v: [(t['id'], [(x['id'], x['serde_directives']) for x in t['variants']]) for t in v['types']]),
        ('input_default_variant', 'codex-rs/protocol/src/sandbox.rs', b'    #[default]\n    NoOverride,', b'    NoOverride,',
         lambda v: [(t['id'], t['rust_default']) for t in v['types']]),
        ('input_legacy_network_default', 'codex-rs/protocol/src/models.rs', b'.unwrap_or(false)', b'.unwrap_or(true)',
         lambda v: [x['source']['text'] for x in v['support']
                    if 'impl From<LegacyPermissionProfile> for PermissionProfile' in x['source']['text']]),
    ]
    for name, path, old, new, semantic_projection in mutations:
        raw = (UP / path).read_bytes(); require(old in raw, 'Mutation anchor missing')
        changed = build({path: raw.replace(old, new, 1)})
        require(semantic_projection(changed) != semantic_projection(fresh), 'Input mutation invisible: ' + name)
        negatives.append({'id': name, 'result': 'REJECTED_BY_SOURCE_EXTRACTION'})
    for name, path, old, new in [
        ('input_missing_declaration', 'codex-rs/protocol/src/sandbox.rs',
         b'pub enum SandboxOverride {', b'pub enum SandboxOverrideRenamed {'),
        ('input_missing_import', 'codex-rs/network-proxy/src/remote_config.rs',
         b'use crate::NetworkMode;', b'use crate::NetworkModeMissing;'),
        ('input_cfg_import', 'codex-rs/network-proxy/src/remote_config.rs',
         b'use crate::NetworkMode;', b'#[cfg(windows)]\nuse crate::NetworkMode;'),
    ]:
        raw = (UP / path).read_bytes(); require(old in raw, 'Resolution mutation anchor missing')
        try: build({path: raw.replace(old, new, 1)})
        except AssertionError as exc:
            require('historical internal/external reference is still unbound' in str(exc), 'Unexpected failure: ' + str(exc))
            negatives.append({'id': name, 'result': 'REJECTED_FAIL_CLOSED'})
        else: raise AssertionError('Source resolution mutation silently accepted: ' + name)
    report = {'result': 'PASS', 'kind': 'STATIC_SOURCE_GRAPH_REPRODUCTION_ONLY', 'counts': fresh['counts'],
              'negative_controls': negatives, 'functional_receipts': 0, 'full_g01_closure': False}
    for name, data in [('inventory.json', fresh), ('verification.json', report)]:
        if '--check' in sys.argv:
            require((OUT / name).read_bytes() == encoded(data), name + ' regeneration differs')
        else: (OUT / name).write_bytes(encoded(data))
    print(json.dumps(report))


if __name__ == '__main__':
    main()
