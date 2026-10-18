#!/usr/bin/env python3
"""Deterministic T1 source evidence. No target import/execute. --check is read-only."""
import argparse
import ast
import copy
import hashlib
import json
from pathlib import Path
import re
import runpy
import subprocess

OUT = Path(__file__).resolve().parent
UP = Path('/tmp/cvg-rea-codex-20261017/upstream')
PIN = '8d9f6466ff0294785d56f55b1fe363d132fe4133'
CONTRACT = OUT.parent / 'contributors-contract.json'
CONTRACT_SHA = '5ee374a5f66e511427808b7d78fc5c764ce697578d05df63ee977f17dd89e41b'
EXPANSION_CONTRACT = OUT.parent / 'contributors-expansion-contract.json'
EXPANSION_SHA = '6b8601c5cdecc6fd01ee379ba72d580f32f0b8f6f63ec15c914b69afd1f5baa8'
PHASE1_HASHES = {'README.md': '933e0e91c6edfa51d39265eb02dac7cb3e345c6404b4d81a6052af90b411d96f', 'claim.json': '04a39b1a541428f8ff04fb62f12c0fbf64460d66c0ddf61354889c5a17151eda', 'development-notes.json': '2d7d7d137af49903961232a7c3cd7dade8074c208586a5186179d1b51793b578', 'handoff.json': '6b02a0e432c466d889adf58a0dea3273924412b459824f77f570fbca5e4a9311', 'inventory.json': '3ce02dd09ce29f3cd0ebf5996b05c5f7f590c8ccb798ac6e34e367f6ad0fc785', 'manifest.json': '181957ff2c799b68cab597677f57b6de0fd0e7a1bd632ba25f1f2cacad29dc7a', 'reader.py': 'c05a1bc24464f999ad1f810256343cd01fedef7154db27853e4b0550c8c1389c', 'verification.json': '23957e3a02368c057b09fb41160ee221e99c095c4a2121150d58dab31f9bcf3b'}
HELPER = OUT.parents[1] / 'entrypoints/tools/build_tool_graph.py'
HELPER_SHA = '4ca3f0f0f09fa632281f6f973ce0b141b390cb1302aaaa9d16e850fbb00aafe9'
API = 'codex-rs/ext/extension-api/src/'
SK = 'codex-rs/ext/skills/src/'
BD = 'codex-rs/ext/agent-message-board/src/'
TL = 'codex-rs/tools/src/'

def digest(data):
    return hashlib.sha256(data).hexdigest()

def encoded(value):
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + '\n').encode()

def blob_oid(raw):
    return hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()

def attest_blob(raw, expected):
    assert blob_oid(raw) == expected, 'Git blob/worktree mismatch'

def git(*args):
    return subprocess.check_output(['git', '-C', str(UP), *args])

# Only these reviewed helper function AST nodes execute. No module-body execution.
def helpers():
    assert digest(HELPER.read_bytes()) == HELPER_SHA, 'reviewed helper binding'
    module = ast.parse(HELPER.read_bytes(), filename=str(HELPER))
    selected = [n for n in module.body if isinstance(n, ast.FunctionDef)
                and n.name in ('mask_rust', 'balanced')]
    assert len(selected) == 2
    env = {'re': re}
    exec(compile(ast.Module(body=selected, type_ignores=[]), str(HELPER), 'exec'), env)
    return env['mask_rust'], env['balanced']

mask_rust, balanced = helpers()

class Reader:
    def __init__(self):
        assert digest(CONTRACT.read_bytes()) == CONTRACT_SHA, 'contract binding'
        assert digest(EXPANSION_CONTRACT.read_bytes()) == EXPANSION_SHA, 'expansion contract binding'
        for name, expected in PHASE1_HASHES.items():
            assert digest((OUT / 'historical/phase1' / ('README.md.txt' if name == 'README.md' else name)).read_bytes()) == expected, ('phase1 archive changed', name)
        self.git_entries = {}
        self.auxiliary = []
        assert git('rev-parse', 'HEAD').decode().strip() == PIN, 'pin binding'
        self.tree = git('rev-parse', PIN + '^{tree}').decode().strip()
        self.texts, self.masks, self.attestations = {}, {}, []
        self.scopes = {}
        self.scope_keys = {}
        for row in git('ls-tree', '-rz', '--full-tree', PIN).split(b'\0'):
            if not row:
                continue
            meta, path = row.split(b'\t', 1)
            mode, kind, oid = meta.decode().split()
            path = path.decode('utf-8')
            self.git_entries[path] = {'mode': mode, 'kind': kind, 'git_blob': oid}
            if kind != 'blob' or not path.endswith('.rs'):
                continue
            raw = (UP / path).read_bytes()
            attest_blob(raw, oid)
            self.texts[path] = raw.decode('utf-8')
            self.attestations.append({'path': path, 'git_blob': oid, 'git_mode': mode,
                                      'sha256': digest(raw), 'bytes': len(raw)})
        self.attestations.sort(key=lambda x: x['path'])
        self.files = {x['path']: x for x in self.attestations}
        # Retain all phase1 scopes and stable evidence IDs, including scopes which
        # were materialized late in the original builder's returned dictionary.
        baseline = json.loads((OUT / 'historical/phase1/inventory.json').read_bytes())
        self.scopes = baseline['evidence']
        for ident, ref in self.scopes.items():
            raw = self.texts[ref['path']].encode('utf-8')
            start = len(raw[:ref['start_byte']].decode('utf-8'))
            end = len(raw[:ref['end_byte']].decode('utf-8'))
            assert raw[ref['start_byte']:ref['end_byte']].decode('utf-8') == ref['text']
            self.scope_keys[(ref['path'], start, end)] = ident

    def extra_source(self, path):
        if path not in self.texts:
            raw = (UP / path).read_bytes()
            entry = self.git_entries[path]
            assert entry['kind'] == 'blob'
            attest_blob(raw, entry['git_blob'])
            self.texts[path] = raw.decode('utf-8')
            record = {'path': path, 'git_blob': entry['git_blob'], 'git_mode': entry['mode'], 'sha256': digest(raw), 'bytes': len(raw)}
            self.files[path] = record
            self.auxiliary.append(record)
        return self.whole(path)

    def mask(self, path):
        if path not in self.masks:
            self.masks[path] = mask_rust(self.texts[path])
        return self.masks[path]

    def ref(self, path, start, end):
        key = (path, start, end)
        if key not in self.scope_keys:
            text = self.texts[path]
            byte_start = len(text[:start].encode('utf-8'))
            raw = text[start:end].encode('utf-8')
            ident = 'E%05d' % (len(self.scopes) + 1)
            self.scope_keys[key] = ident
            self.scopes[ident] = {'path': path, 'start_byte': byte_start,
                'end_byte': byte_start + len(raw), 'line': text[:start].count('\n') + 1,
                'file_sha256': self.files[path]['sha256'], 'git_blob': self.files[path]['git_blob'],
                'span_sha256': digest(raw), 'text': raw.decode('utf-8')}
        return self.scope_keys[key]

    def whole(self, path):
        return self.ref(path, 0, len(self.texts[path]))

    def attributes_start(self, path, start):
        text = self.texts[path]
        # Include visibility and immediately preceding attributes, not unrelated doc prose.
        line_start = text.rfind('\n', 0, start) + 1
        if re.fullmatch(r'\s*(?:pub(?:\([^\n]*?\))?\s+)?', text[line_start:start]):
            start = line_start
        mask = self.mask(path)
        candidates = []
        for m in re.finditer(r'#\[', mask[:start]):
            end = balanced(mask, m.start() + 1, '[', ']')
            if end <= start:
                candidates.append((m.start(), end))
        for left, right in reversed(candidates):
            if mask[right:start].strip():
                break
            start = left
        return start

    def functions(self, path, left=0, right=None):
        text, mask = self.texts[path], self.mask(path)
        right = len(text) if right is None else right
        result = []
        for m in re.finditer(r'\bfn\s+(\w+)\s*(?:<[^{};]*?>)?\s*\(', mask[left:right]):
            start, paren = left + m.start(), left + m.end() - 1
            args_end = balanced(mask, paren, '(', ')')
            next_mark = re.search(r'[;{]', mask[args_end:right])
            assert next_mark, (path, m[1])
            mark = args_end + next_mark.start()
            end = mark + 1 if mask[mark] == ';' else balanced(mask, mark, '{', '}')
            if end > right:
                continue
            start = self.attributes_start(path, start)
            result.append({'name': m[1], 'source': self.ref(path, start, end),
                           'signature': text[start:mark].strip(), '_start': start, '_end': end})
        return result

    def function(self, path, name):
        hits = [x for x in self.functions(path) if x['name'] == name]
        assert len(hits) == 1, (path, name, len(hits))
        return {k: v for k, v in hits[0].items() if not k.startswith('_')}

    def type_item(self, path, name):
        text, mask = self.texts[path], self.mask(path)
        hits = list(re.finditer(r'\b(struct|enum|trait)\s+' + re.escape(name) + r'\b', mask))
        assert len(hits) == 1, (path, name, len(hits))
        m = hits[0]
        start = self.attributes_start(path, m.start())
        mark = re.search(r'[;{]', mask[m.end():])
        assert mark
        pos = m.end() + mark.start()
        end = pos + 1 if mask[pos] == ';' else balanced(mask, pos, '{', '}')
        fields = []
        if m[1] == 'struct' and mask[pos] == '{':
            cursor, depth = pos + 1, 0
            for i in range(cursor, end - 1):
                c = mask[i]
                if c in '<([{':
                    depth += 1
                elif c in '>)]}':
                    depth -= 1
                if c == ',' and depth == 0:
                    chunk = text[cursor:i]
                    field_mask = mask[cursor:i]
                    fm = re.search(r'(?:pub(?:\([^)]*\))?\s+)?(\w+)\s*:\s*([^;]+)$', field_mask)
                    if fm:
                        rust_type = chunk[fm.start(2):fm.end(2)].strip()
                        fields.append({'name': fm[1], 'rust_type': rust_type,
                            'optional': rust_type.startswith('Option<'),
                            'attributes': [chunk[a.start():balanced(field_mask,a.start()+1,'[',']')] for a in re.finditer(r'#\[',field_mask)]})
                    cursor = i + 1
        return {'name': name, 'kind': m[1], 'source': self.ref(path, start, end),
                'fields': fields, 'attributes': re.findall(r'#\[[^\]]*\]', text[start:pos])}

    def impls(self, path, trait):
        text, mask = self.texts[path], self.mask(path)
        pattern = r'\bimpl\b[^;{}]*?\b' + trait + r'(?:\s*<[^{};]*>)?\s+for\s+([^{};]+)\{'
        result = []
        for m in re.finditer(pattern, mask):
            end = balanced(mask, m.end() - 1, '{', '}')
            start = self.attributes_start(path, m.start())
            methods = self.functions(path, m.end(), end - 1)
            result.append({'owner': text[m.start():m.end()].split(' for ', 1)[-1].split('where', 1)[0].strip().rstrip('{').strip(),
                'source': self.ref(path, start, end),
                'methods': [{k: v for k, v in x.items() if not k.startswith('_')} for x in methods],
                '_start': start, '_end': end})
        return result

    def context(self, path, start):
        mask = self.mask(path)
        guards = []
        for m in re.finditer(r'#\[cfg\s*\(', mask[:start]):
            attr_end = balanced(mask, m.start() + 1, '[', ']')
            after = mask[attr_end:]
            decl = re.match(r'\s*(?:pub(?:\([^)]*\))?\s+)?(?:mod|fn|impl|struct|enum)\b[^;{}]*([;{])', after)
            if decl:
                mark = attr_end + decl.end() - 1
                finish = mark + 1 if mask[mark] == ';' else balanced(mask, mark, '{', '}')
                if m.start() <= start < finish:
                    guards.append(self.ref(path, m.start(), attr_end))
        external = []
        if path.endswith('/router_tests.rs'):
            parent = 'codex-rs/core/src/tools/router.rs'
            t = self.texts[parent]
            m = re.search(r'#\[cfg\(test\)\]\s*#\[path = "router_tests.rs"\]\s*mod tests;', t)
            assert m
            external.append(self.ref(parent, m.start(), m.end()))
        integration = '/tests/' in path
        is_test = integration or bool(external) or any('test' in self.scopes[x]['text'] for x in guards)
        return {'classification': 'integration_test_target' if integration else 'cfg_test_module' if is_test else 'production_possible',
                'test_only': is_test, 'cfg_test_only': bool(external) or any('test' in self.scopes[x]['text'] for x in guards), 'cfg_guards': guards, 'module_gate_sources': external,
                'reachability': 'lexical source site; not observed installation/execution'}

    def census(self):
        implementations, registrations, symbols = [], [], []
        for path in sorted(self.texts):
            text = self.texts[path]
            if not re.search(r'ToolContributor|tool_contributor', text):
                continue
            mask = self.mask(path)
            for item in self.impls(path, 'ToolContributor'):
                context = self.context(path, item['_start'])
                implementations.append({'path': path, **{k: v for k, v in item.items() if not k.startswith('_')}, **context})
            for m in re.finditer(r'\.\s*tool_contributor\s*\(', mask):
                end = balanced(mask, m.end() - 1, '(', ')')
                containers = [f for f in self.functions(path) if f['_start'] <= m.start() < f['_end']]
                assert containers, (path, m.start())
                fn = min(containers, key=lambda f: f['_end'] - f['_start'])
                registrations.append({'path': path, 'source': self.ref(path, m.start(), end),
                    'factory_or_callsite': {k: v for k, v in fn.items() if not k.startswith('_')},
                    **self.context(path, m.start())})
            for m in re.finditer(r'\b(?:ToolContributor|tool_contributors?)\b', mask):
                left = text.rfind('\n', 0, m.start()) + 1
                right = text.find('\n', m.end())
                symbols.append({'path': path, 'symbol': m[0], 'source': self.ref(path, left, len(text) if right < 0 else right)})
        return {'implementations': implementations, 'registrations': registrations,
                'symbol_occurrences': symbols,
                'method': 'All Git-tracked UTF-8 .rs blobs at pin; masked comments/literals; generic and qualified impl heads; dot-call registration census. No Rust macro expansion, Cargo feature evaluation, external crates, or alias resolution beyond named ToolContributor sites.'}

    def all_types(self, path):
        names = re.findall(r'\b(?:struct|enum)\s+(\w+)', self.mask(path))
        # Files selected below have unique type names in their production portion.
        return [self.type_item(path, n) for n in dict.fromkeys(names)]

    def executor(self, path, owner):
        hits = [x for x in self.impls(path, 'ToolExecutor') if x['owner'] == owner]
        assert len(hits) == 1, (path, owner, hits)
        item = hits[0]
        return {k: v for k, v in item.items() if not k.startswith('_')}

    def build(self):
        census = self.census()
        registry = {'builder_type': self.type_item(API + 'registry.rs', 'ExtensionRegistryBuilder'),
            'registry_type': self.type_item(API + 'registry.rs', 'ExtensionRegistry'),
            'register': self.function(API + 'registry.rs', 'tool_contributor'),
            'accessor': self.function(API + 'registry.rs', 'tool_contributors'),
            'trait': self.type_item(API + 'contributors.rs', 'ToolContributor'),
            'default_step': self.function(API + 'contributors.rs', 'tools_for_step'),
            'builder_default': self.function(API + 'registry.rs', 'default'),
            'builder_build': self.function(API + 'registry.rs', 'build'),
            'ownership': 'Arc<dyn ToolContributor>; insertion order push, borrowed slice accessor; Send + Sync; ExtensionData session/thread/step. External implementations remain an open interface obligation.'}
        shared = {'api_tool_reexports': self.whole(API + 'lib.rs'),
            'tools_reexports': self.whole(TL + 'lib.rs'),
            'trait_tool_imports': self.ref(API + 'contributors.rs', 0, self.texts[API + 'contributors.rs'].index('mod approval_review;')),
            'executor_trait': self.type_item(TL + 'tool_executor.rs', 'ToolExecutor'),
            'exposure_enum': self.type_item(TL + 'tool_executor.rs', 'ToolExposure'),
            'exposure_flags': self.whole(TL + 'tool_executor.rs'),
            'error_type': self.type_item(TL + 'function_call_error.rs', 'FunctionCallError'),
            'executor_future': self.whole(TL + 'tool_executor.rs'),
            'tool_call': self.whole(TL + 'tool_call.rs'),
            'json_output': self.whole(TL + 'tool_output.rs'),
            'responses_api': self.whole(TL + 'responses_api.rs'),
            'tool_name': self.whole('codex-rs/protocol/src/tool_name.rs')}
        skill_files = ['tools/mod.rs', 'tools/schema.rs', 'tools/list.rs', 'tools/read.rs']
        skill_support = {p: self.whole(SK + p) for p in skill_files}
        skill_types = [t for p in skill_files for t in self.all_types(SK + p)]
        tools = []
        for suffix, owner, args, output in [('list', 'ListTool', 'ListArgs', 'ListResponse'), ('read', 'ReadTool', 'ReadArgs', 'ReadResponse')]:
            path = SK + 'tools/' + suffix + '.rs'
            executor = self.executor(path, owner)
            tool_name = re.search(r'const TOOL_NAME: &str = "([^"]+)";', self.texts[path])[1]
            assert tool_name == suffix
            tools.append({'id': 'skills.' + suffix, 'family': 'skills', 'namespace': 'skills', 'name': tool_name,
                'name_binding': self.ref(path, self.texts[path].index('const TOOL_NAME'), self.texts[path].index(';', self.texts[path].index('const TOOL_NAME')) + 1),
                'executor': executor, 'input_type': args, 'output_type': output,
                'input': self.type_item(path, args), 'output': self.type_item(path, output),
                'schema': {'construction': 'skill_function_tool::<' + args + ', ' + output + '>',
                    'strict': False, 'defer_loading': None, 'output_schema': 'Some(schema::output_schema_for::<O>().into())',
                    'source': self.function(SK + 'tools/mod.rs', 'skill_function_tool'),
                    'generator': self.whole(SK + 'tools/schema.rs')},
                'exposure': 'Direct (ToolExecutor default; preferred before host policy)',
                'preferred_surfaces': {'direct': True, 'deferred': False, 'code_mode': True},
                'parallel': True, 'direct_handle_boundary': 'ToolCall -> parse_args -> context/catalog/provider -> skill_json_output; no separate direct-call capability check in these executor impls',
                'error_contract': {'source': self.function(path, 'handle'),
                    'shared_parse': self.function(SK + 'tools/mod.rs', 'parse_args'),
                    'shared_output': self.function(SK + 'tools/mod.rs', 'skill_json_output'),
                    'variants': ['RespondToModel(String)', 'Fatal(String)']}})
        bspec = BD + 'tools/spec.rs'
        names_match = re.search(r'const NAMES: \[&str; 9\] = \[([\s\S]*?)\];', self.texts[bspec])
        assert names_match
        names = re.findall(r'"([a-z_]+)"', names_match[1])
        mapping = [('create_channel', 'CreateChannel', 'create_channel', 'ChannelSummary'),
            ('get_channels', 'GetChannels', 'list_channels', 'ChannelPage'),
            ('list_threads', 'ListThreads', 'list_threads', 'Page<ThreadSummary>'),
            ('search_posts', 'SearchPosts', 'search_posts', 'Page<PostPreview>'),
            ('read_thread', 'ReadThread', 'read_thread', 'ThreadPage'),
            ('read_post', 'ReadPost', 'read_post', 'PostContent'),
            ('subscribe', 'Subscription', 'set_subscription', 'SubscriptionState'),
            ('unsubscribe', 'Subscription', 'set_subscription', 'SubscriptionState'),
            ('post', 'Post', 'post', 'PostMetadata')]
        assert names == [x[0] for x in mapping]
        field_schemas = {}
        text = self.texts[bspec]
        left = text.index('match *field {')
        opening = text.index('{', left)
        closing = balanced(self.mask(bspec), opening, '{', '}')
        pattern = r'((?:"[^"]+"\s*(?:\|\s*)?)+|_)\s*=>\s*(?:\{\s*)?json!\(\s*(\{)'
        for fm in re.finditer(pattern, text[opening:closing]):
            obj_start = opening + fm.start(2)
            obj_end = balanced(self.mask(bspec), obj_start, '{', '}')
            obj = json.loads(text[obj_start:obj_end])
            labels = re.findall(r'"([^"]+)"', fm[1]) if fm[1] != '_' else ['_']
            for label in labels:
                field_schemas[label] = obj
        assert field_schemas['_'] == {'type': 'string'}
        for name, argtype, method, output in mapping:
            # Each schema match arm is retained exactly, including description/fields/required.
            t = self.texts[bspec]
            m = re.search(r'"' + name + r'"\s*=>\s*\(', t)
            assert m
            end = balanced(self.mask(bspec), m.end() - 1, '(', ')')
            arm = t[m.start():end]
            arrays = re.findall(r'&\[([^\]]*)\]', arm)
            assert len(arrays) == 2
            fields, required = [re.findall(r'"([^"]+)"', a) for a in arrays]
            tools.append({'id': 'agent-message-board.' + name, 'family': 'agent-message-board', 'namespace': 'Option<String> resolved by host at thread startup',
                'name': name, 'name_binding': self.ref(bspec, names_match.start(), names_match.end()),
                'executor': self.executor(BD + 'tools.rs', 'BoardTool'),
                'input_type': argtype, 'input': self.type_item(BD + 'tools/arguments.rs', argtype),
                'output_type': output, 'output': {'backend_method': method, 'api': self.function(BD + 'api.rs', method),
                    'serialization_types': self.whole(BD + 'types.rs')},
                'schema': {'fields': fields, 'required': required, 'strict': False, 'defer_loading': None,
                    'parameters': {'type': 'object', 'properties': {f: field_schemas.get(f, field_schemas['_']) for f in fields}, 'required': required, 'additionalProperties': False},
                    'output_schema': None, 'additionalProperties': False,
                    'arm': self.ref(bspec, m.start(), end), 'constructor': self.function(bspec, 'tool')},
                'exposure': 'Direct (ToolExecutor default; preferred before host policy)',
                'preferred_surfaces': {'direct': True, 'deferred': False, 'code_mode': True},
                'parallel': name in ('get_channels', 'list_threads', 'search_posts', 'read_thread', 'read_post'),
                'direct_handle_boundary': 'ToolCall.function_arguments -> execute/serde -> caller-bound AgentMessageBoard backend -> encode -> budget -> JsonToolOutput.with_success.with_external_context; permissions enforced by backend, not tool exposure',
                'error_contract': {'encode': self.function(BD + 'tools.rs', 'encode'),
                    'model_error': self.function(BD + 'tools.rs', 'model_error'),
                    'permission_denied': self.type_item(BD + 'permissions.rs', 'PermissionDenied'),
                    'permission_projection': self.function(BD + 'permissions.rs', 'model_response'),
                    'variants': ['FunctionCallError::RespondToModel', 'PermissionDenied -> structured error, success=false']}})
        other = []
        for item in census['implementations']:
            if not item['test_only'] and not item['owner'].startswith(('SkillsExtension', 'BoardExtension')):
                other.append({'owner': item['owner'], 'path': item['path'], 'implementation': item['source'],
                    'returned_factory_methods': item['methods'], 'status': 'SOURCE_BOUND_UNEXPANDED_GAP',
                    'gap': 'Contributor and returned executor/factory expressions are bound. Names, transitive schemas/types, gates and executor handles are not expanded by this worker; lead must expand before any full dynamic contributor closure.'})
        added_tools, expanded_families = runpy.run_path(str(OUT / 'expansion.py'))['expand'](self, census)
        tools.extend(added_tools)
        for item in other:
            matches = [f for f in expanded_families if f['owner'] == item['owner']]
            assert len(matches) == 1, item['owner']
            item.update(status='SOURCE_EXPANDED', tool_ids=matches[0]['tool_ids'])
            del item['gap']
        return {'task': 'DX100-G01:EXTENSION-TOOL-CONTRIBUTORS', 'status': 'IMPLEMENTED', 'tier': 'T1',
            'pin': PIN, 'git_tree': self.tree, 'contract_sha256': CONTRACT_SHA,
            'helper': {'path': str(HELPER.relative_to(OUT.parents[3])), 'sha256': digest(HELPER.read_bytes()),
                       'executed_ast_functions_only': ['mask_rust', 'balanced']},
            'expansion_task': 'DX100-G01:EXPAND-ALL-PRODUCTION-CONTRIBUTORS', 'expansion_contract_sha256': EXPANSION_SHA,
            'phase1_archive': {'path': 'historical/phase1', 'sha256': PHASE1_HASHES, 'mapping': [{'original_relative_path': 'docs/04_audit/evidence/CODEX100-EXEC-20261017/g01/dynamic-factories/contributors/' + n, 'archive_path': 'historical/phase1/' + ('README.md.txt' if n == 'README.md' else n), 'sha256': h} for n, h in PHASE1_HASHES.items()]},
            'expanded_families': expanded_families, 'auxiliary_source_attestation': self.auxiliary,
            'source_attestation': self.attestations, 'census': census, 'registry': registry,
            'shared_contracts': shared, 'tools': tools,
            'skills': {'contributor': self.whole(SK + 'extension.rs'),
                'host_install_app_server': self.whole('codex-rs/app-server/src/extensions.rs'),
                'host_install_debug_cli': self.function('codex-rs/cli/src/main.rs', 'run_debug_prompt_input_command'),
                'factory': self.function(SK + 'tools/mod.rs', 'skill_tools'), 'support_sources': skill_support,
                'types': skill_types,
                'gates': 'Requires SkillsThreadState; cloud provider plus cloud_skill_enabled OR step executor query. tools() passes None; tools_for_step derives roots/discovery and selected plugins. Missing state or neither source returns empty.',
                'schema_rules': 'draft2019_09; inline_subschemas=true; input option_add_null_type=false, output=true; only six schema keys copied. ListArgs denies unknown fields; ReadArgs does not declare deny_unknown_fields. No generated schema evaluated.',
                'defaults_and_limits': 'Blank arguments -> {}; MAX_HANDLE_BYTES=2048; MAX_SKILL_RESPONSE_BYTES=512*1024; list page max20; read omits resource for main prompt; cursor validated against snapshot/content, byte boundaries. Exact clauses and remaining constants in support_sources.',
                'effects': 'Catalog/read provider capability use and analytics. Cloud output external context; executor output plain JSON. This source evidence does not authorize provider access.'},
            'board': {'contributor': self.whole(BD + 'extension.rs'),
                'host_install': self.function('codex-rs/core/src/agent_message_board.rs', 'install_agent_message_board'),
                'factory': self.function(BD + 'tools.rs', 'message_board_tools_with_descriptions'),
                'factory_wrapper': self.function(BD + 'tools.rs', 'message_board_tools'),
                'names_source': self.ref(bspec, names_match.start(), names_match.end()),
                'argument_types': self.all_types(BD + 'tools/arguments.rs'),
                'output_types': self.all_types(BD + 'types.rs'),
                'api_types': self.all_types(BD + 'api.rs'),
                'permission_types': self.all_types(BD + 'permissions.rs'),
                'execute': self.function(BD + 'tools.rs', 'execute'),
                'support': self.whole(BD + 'tools.rs'),
                'api': self.type_item(BD + 'api.rs', 'AgentMessageBoard'),
                'custom_page_serialization': self.whole(BD + 'types.rs'),
                'gates': 'Host automatic board requires AgentMessageBoard + MultiAgentV2 features and persistence, in-memory or remote config for ephemeral runtimes; explicit LocalBoardConnection bypasses that automatic-host gate. Binding only after host open returns Some, SessionId/ThreadId parse, board.identity matches expected tree/local connection; failure warns and leaves tools unavailable. Namespace resolver runs at thread startup. No Binding -> empty tools. Per-step descriptions may override; parameters cannot.',
                'defaults_and_limits': 'raw args <=128KiB; output budget min(call budget,8000); page default20 capped50; preview default1000 capped20000; read_post default20000 capped20000; recent_first true; subscribe true; sort Created; offset_chars 0; mutation minimum2048+caller path+target bytes plus description reserve. NonZeroU32 parsing rejects zero; unknown fields denied.',
                'effects': 'create_channel/post/set_subscription are backend mutation boundaries. Host identities and caller paths are supplied outside model arguments. Budget preflight precedes writes. Subscription and post require exactly one destination. Backend membership/permissions obligations do not prove actual enforcement in every external backend.'},
            'other_production_contributors': other,
            'qualification': {'functional_receipts': 0, 'full_g01_closure': False, 'runtime_catalog_closed': False,
                'cvg_grant': False, 'independent_review': 'PENDING_LEAD', 'target_executed': False},
            'limitations': ['Static lexical source evidence only; not native implementation or functional proof.',
                'Arbitrary external ToolContributor implementations are an open interface obligation, not a finite runtime catalog.',
                'All nine source-censused production contributor families have known returned executors expanded; provider/runtime external interfaces and schema values may remain open as qualified per-tool unknowns.',
                'No macro expansion or complete Cargo target/feature reachability proof; test paths and explicit cfg guards are separated.',
                'Host adapter/MCP/dynamic/hosted/core pipeline belongs to lead; upstream preferred exposure is not a CVG capability grant.',
                'Provider/backend internals and third-party serde/schemars behavior not executed; source construction is preserved, generated schema not claimed.'],
            'evidence': self.scopes}


def validate(candidate, expected):
    """Canonical regeneration is the oracle; semantic sections have separate diagnostics."""
    errors = []
    for section in expected:
        if candidate.get(section) != expected[section]:
            errors.append('mismatch:' + section)
    for section in candidate.keys() - expected.keys():
        errors.append('unexpected:' + section)
    return sorted(errors)


def require_source_token(text, token):
    assert token in text, 'required source contract token absent'

def negatives(expected):
    cases = []
    def case(label, mutate, diagnostic):
        bad = copy.deepcopy(expected)
        mutate(bad)
        errors = validate(bad, expected)
        assert diagnostic in errors, (label, errors)
        cases.append({'name': label, 'result': 'REJECTED', 'diagnostic': diagnostic})
    case('missing-contributor', lambda x: x['census']['implementations'].pop(), 'mismatch:census')
    case('missing-registration', lambda x: x['census']['registrations'].pop(), 'mismatch:census')
    case('missing-tool', lambda x: x['tools'].pop(), 'mismatch:tools')
    case('wrong-tool-name', lambda x: x['tools'][0].update(name='fabricated'), 'mismatch:tools')
    case('wrong-namespace', lambda x: x['tools'][0].update(namespace='functions'), 'mismatch:tools')
    case('missing-schema', lambda x: x['tools'][0].pop('schema'), 'mismatch:tools')
    case('wrong-required-field', lambda x: x['tools'][2]['schema']['required'].clear(), 'mismatch:tools')
    case('serde-string-as-output-field', lambda x: x['board']['output_types'][4]['fields'][0].update(name='Option'), 'mismatch:board')
    case('missing-type-reexport-binding', lambda x: x['shared_contracts'].pop('api_tool_reexports'), 'mismatch:shared_contracts')
    case('wrong-input-type', lambda x: x['tools'][0]['input']['fields'][0].update(rust_type='bool'), 'mismatch:tools')
    case('wrong-output-type', lambda x: x['tools'][0].update(output_type='String'), 'mismatch:tools')
    case('missing-error-contract', lambda x: x['tools'][0].pop('error_contract'), 'mismatch:tools')
    test_index = next(i for i, r in enumerate(expected['census']['implementations']) if r['test_only'])
    case('cfg-test-as-production', lambda x: x['census']['implementations'][test_index].update(test_only=False), 'mismatch:census')
    case('wrong-exposure', lambda x: x['tools'][0].update(exposure='Hidden'), 'mismatch:tools')
    case('wrong-serde-rule', lambda x: x['tools'][0]['input'].update(attributes=[]), 'mismatch:tools')
    case('missing-registry-default', lambda x: x['registry'].pop('builder_default'), 'mismatch:registry')
    case('missing-trait-fallback', lambda x: x['registry'].pop('default_step'), 'mismatch:registry')
    case('wrong-preferred-code-mode-surface', lambda x: x['tools'][0]['preferred_surfaces'].update(code_mode=False), 'mismatch:tools')
    case('wrong-defaults', lambda x: x['board'].update(defaults_and_limits='all limits disabled'), 'mismatch:board')
    case('missing-direct-boundary', lambda x: x['tools'][0].pop('direct_handle_boundary'), 'mismatch:tools')
    ref = expected['tools'][0]['name_binding']
    case('wrong-source-byte-span', lambda x: x['evidence'][ref].update(start_byte=x['evidence'][ref]['start_byte']+1), 'mismatch:evidence')
    case('wrong-source-file-hash', lambda x: x['evidence'][ref].update(file_sha256='0'*64), 'mismatch:evidence')
    case('wrong-git-blob', lambda x: x['source_attestation'][0].update(git_blob='0'*40), 'mismatch:source_attestation')
    case('hidden-other-contributor-gap', lambda x: x['other_production_contributors'].clear(), 'mismatch:other_production_contributors')
    for key, value in [('functional_receipts', 1), ('full_g01_closure', True), ('runtime_catalog_closed', True), ('cvg_grant', True), ('independent_review', 'APPROVED')]:
        case('false-qualification-' + key, lambda x, k=key, v=value: x['qualification'].update({k:v}), 'mismatch:qualification')
    for family in ('goal','guardian-conversation-history','history-notes','memories','file-copy','image-generation','web-search'):
        ix = next(i for i,t in enumerate(expected['tools']) if t['family']==family)
        case('expanded-'+family+'-missing-tool', lambda x,i=ix: x['tools'].pop(i), 'mismatch:tools')
        case('expanded-'+family+'-wrong-name', lambda x,i=ix: x['tools'][i].update(name='not_the_tool'), 'mismatch:tools')
        case('expanded-'+family+'-missing-error', lambda x,i=ix: x['tools'][i].pop('error_contract'), 'mismatch:tools')
    memory_ix=next(i for i,t in enumerate(expected['tools']) if t['id']=='memories.add_ad_hoc_note')
    case('truncated-memory-filename-schema-attribute',lambda x:x['tools'][memory_ix]['input']['fields'][0].update(attributes=[]),'mismatch:tools')
    case('false-guardian-static-schema',lambda x:x['tools'][14].update(runtime_schema_closed=True),'mismatch:tools')
    case('missing-expanded-family',lambda x:x['expanded_families'].pop(),'mismatch:expanded_families')
    case('wrong-expansion-contract',lambda x:x.update(expansion_contract_sha256='0'*64),'mismatch:expansion_contract_sha256')
    case('wrong-phase1-archive-digest',lambda x:x['phase1_archive']['sha256'].update({'reader.py':'0'*64}),'mismatch:phase1_archive')
    probes = [
        ('goal-direct-availability','goal.get_goal','direct_handle','if !self.execution_allowed'),
        ('guardian-live-policy','guardian.user_message.search_messages','direct_handle','!requires_mcp_tool_approval_for_mode'),
        ('history-backend-object','history.list_windows','error_contract.backend','arguments.as_object_mut()'),
        ('file-copy-distinct-endpoints','file-copy.multi_env_copy_file','direct_handle','args.source_environment_id == args.target_environment_id'),
        ('image-provider-error','image_gen.imagegen','error_contract.handle','image generation returned no image data'),
        ('memories-io-fatal','memories.list','error_contract.mapping','MemoriesBackendError::Io(_) => FunctionCallError::Fatal'),
        ('web-auth-fatal','web.run','error_contract.handle','FunctionCallError::Fatal'),
    ]
    for label, ident, field, token in probes:
        row=next(t for t in expected['tools'] if t['id']==ident)
        for part in field.split('.'):
            row=row[part]
        source_id=row['source']; text=expected['evidence'][source_id]['text']
        require_source_token(text,token)
        altered=text.replace(token,'__MISSING_SOURCE_CONTRACT__')
        try:
            require_source_token(altered,token)
        except AssertionError as error:
            assert str(error)=='required source contract token absent'
        else:
            raise AssertionError('altered source predicate accepted: '+label)
        cases.append({'name':'source-probe-'+label,'result':'REJECTED','diagnostic':'required source token absent','source':source_id,'required_token':token})
    sample = b'fn source_only() {}\n'
    try:
        attest_blob(sample + b'// drift', blob_oid(sample))
    except AssertionError as error:
        assert str(error) == 'Git blob/worktree mismatch'
        cases.append({'name': 'live-source-byte-drift-in-memory', 'result': 'REJECTED', 'diagnostic': str(error)})
    else:
        raise AssertionError('source drift accepted')
    return cases


def verify(reader, inventory):
    for ref in inventory['evidence'].values():
        raw = (UP / ref['path']).read_bytes()
        fragment = raw[ref['start_byte']:ref['end_byte']]
        assert fragment.decode('utf-8') == ref['text']
        assert digest(fragment) == ref['span_sha256']
        assert digest(raw) == ref['file_sha256']
        assert reader.files[ref['path']]['git_blob'] == ref['git_blob']
    for tool in inventory['tools'][:11]:
        methods = {m['name']: m for m in tool['executor']['methods']}
        assert 'exposure' not in methods, 'unexpected preferred exposure override'
        assert all(key in methods for key in ('tool_name', 'spec', 'handle', 'supports_parallel_tool_calls'))
        if tool['family'] == 'agent-message-board':
            assert tool['schema']['fields'] == [f['name'] for f in tool['input']['fields']]
            assert tool['schema']['required'] == [f['name'] for f in tool['input']['fields'] if not f['optional']]
            parallel_body = inventory['evidence'][methods['supports_parallel_tool_calls']['source']]['text']
            assert tool['parallel'] == ('"' + tool['name'] + '"' in parallel_body)
        else:
            body = inventory['evidence'][methods['supports_parallel_tool_calls']['source']]['text']
            assert re.search(r'\{\s*true\s*\}', body)
    assert 'ToolExposure::Direct' in inventory['evidence'][inventory['shared_contracts']['executor_trait']['source']]['text']
    output_types = {t['name']: t for t in inventory['board']['output_types']}
    channel = {f['name']: f for f in output_types['ChannelSummary']['fields']}
    assert channel['permissions']['rust_type'] == 'Option<ChannelPermissions>'
    assert channel['description']['rust_type'] == 'Option<String>'
    assert channel['permissions']['attributes'] == ['#[serde(default, skip_serializing_if = "Option::is_none")]']
    page = {f['name']: f for f in output_types['ChannelPage']['fields']}
    assert page['board_permissions']['rust_type'] == 'Option<BoardPermissions>'
    response = next(t for t in inventory['skills']['types'] if t['name'] == 'ReadResponse')
    assert next(f for f in response['fields'] if f['name'] == 'skill_root')['rust_type'] == 'Option<String>'
    api_exports = inventory['evidence'][inventory['shared_contracts']['api_tool_reexports']]['text']
    tools_exports = inventory['evidence'][inventory['shared_contracts']['tools_reexports']]['text']
    trait_imports = inventory['evidence'][inventory['shared_contracts']['trait_tool_imports']]['text']
    for name in ('ToolCall', 'ToolExecutor', 'ToolName', 'FunctionCallError'):
        assert 'pub use codex_tools::' + name + ';' in api_exports
    assert 'pub use tool_executor::ToolExecutor;' in tools_exports
    assert 'pub use codex_protocol::ToolName;' in tools_exports
    assert 'use codex_tools::ToolExecutor;' in trait_imports
    assert 'use codex_tools::ToolCall;' in trait_imports
    second = Reader().build()
    assert encoded(second) == encoded(inventory), 'determinism'
    assert len(inventory['tools']) == 32
    assert len(inventory['other_production_contributors']) == 7
    baseline = json.loads((OUT / 'historical/phase1/inventory.json').read_bytes())
    assert inventory['tools'][:11] == baseline['tools'], 'phase1 tools shrunk or altered'
    assert all(inventory['evidence'][k] == v for k,v in baseline['evidence'].items()), 'phase1 evidence shrunk or altered'
    assert len(inventory['expanded_families']) == 9
    assert {f['owner'] for f in inventory['expanded_families']} == {x['owner'] for x in inventory['census']['implementations'] if not x['test_only']}
    assert all(x['status']=='SOURCE_EXPANDED' and x['tool_ids'] for x in inventory['other_production_contributors'])
    assert len({t['id'] for t in inventory['tools']}) == 32
    for f in inventory['expanded_families']:
        assert set(f['tool_ids']) == {t['id'] for t in inventory['tools'] if t['family']==f['family']}
    expected_counts = {'skills':2,'agent-message-board':9,'goal':3,'guardian-conversation-history':2,'history-notes':9,'memories':4,'file-copy':1,'image-generation':1,'web-search':1}
    assert {f:sum(t['family']==f for t in inventory['tools']) for f in expected_counts} == expected_counts
    assert sum(t['preferred_surfaces']['code_mode'] for t in inventory['tools']) == 21
    assert sum(t['parallel'] for t in inventory['tools']) == 21
    web = next(t for t in inventory['tools'] if t['id']=='web.run')
    assert [f['name'] for f in web['input']['fields']] == ['search_query','image_query','open','click','find','screenshot','finance','weather','sports','time','response_length']
    note = next(t for t in inventory['tools'] if t['id']=='memories.add_ad_hoc_note')
    filename = next(f for f in note['input']['fields'] if f['name']=='filename')
    assert filename['attributes'][0].strip().endswith(')]')
    assert 'regex(pattern' in filename['attributes'][0]
    assert not any('UNEXPANDED' in x['status'] for x in inventory['other_production_contributors'])
    checks = ['frozen-contract-sha256', 'pin-commit-and-tree', 'all-tracked-rust-worktree-blobs-match-git',
        'source-wide-impl-registration-and-symbol-census', 'test-production-classification',
        'registry-register-accessor-trait-default', 'skills-contributor-factory-executors-types-schema-handle',
        'board-contributor-nine-names-schema-types-backend-errors-handle', 'preferred-exposure-and-flags-bound',
        'all-nine-production-contributors-expanded', 'exact-utf8-byte-spans-and-file-sha256',
        'deterministic-two-reader-instances', 'qualification-remains-source-only',
        'board-schema-fields-required-match-rust-args', 'executor-parallel-flags-match-source',
        'no-selected-executor-exposure-override-default-bound', 'type-reexport-chain-bound', 'serde-attribute-strings-do-not-become-fields', 'supplemental-expansion-contract-binding',
        'phase1-eight-archived-bytes-and-original-path-map', 'original-eleven-tools-and-836-source-scopes-preserved',
        'all-32-names-factories-schema-input-output-gates-errors-handles', 'eleven-model-only-executors-exclude-code-mode',
        'complete-web-search-11-command-wire-fields', 'complete-memory-filename-regex-attribute']
    return {'status': 'PASS_SOURCE_CHECKS', 'checks': [{'name': x, 'result':'PASS'} for x in checks],
        'negative_controls': negatives(inventory), 'inventory_sha256': digest(encoded(inventory)),
        'counts': {'scanned_rust_blobs': len(reader.attestations), 'evidence_spans': len(inventory['evidence']),
            'implementations': len(inventory['census']['implementations']),
            'production_implementations': sum(not x['test_only'] for x in inventory['census']['implementations']),
            'test_implementations': sum(x['test_only'] for x in inventory['census']['implementations']),
            'registrations': len(inventory['census']['registrations']),
            'production_registrations': sum(not x['test_only'] for x in inventory['census']['registrations']),
            'test_registrations': sum(x['test_only'] for x in inventory['census']['registrations']),
            'symbol_occurrences': len(inventory['census']['symbol_occurrences']),
            'expanded_tools': len(inventory['tools']), 'other_production_gaps': sum(x['status']!='SOURCE_EXPANDED' for x in inventory['other_production_contributors']),
            'expanded_production_families':len(inventory['expanded_families']), 'phase1_archived_files':8,
            'new_tools_after_phase1':len(inventory['tools'])-11, 'auxiliary_source_files':len(reader.auxiliary),
            'model_only_tools':sum(not x['preferred_surfaces']['code_mode'] for x in inventory['tools']),
            'parallel_tools':sum(x['parallel'] for x in inventory['tools']),
            'positive_checks': len(checks), 'negative_controls': len(negatives(inventory))},
        'functional_receipts': 0, 'full_g01_closure': False, 'independent_review': 'PENDING_LEAD'}


def handoff(inventory, verification):
    return {'task': inventory['task'], 'state': 'IMPLEMENTED', 'tier': 'T1',
        'contract_sha256': CONTRACT_SHA, 'expansion_contract_sha256': EXPANSION_SHA,
        'phase1_archive':inventory['phase1_archive'], 'inventory_sha256': digest(encoded(inventory)),
        'verification_sha256': digest(encoded(verification)), 'manifest': 'manifest.json',
        'counts': verification['counts'], 'tool_ids': [t['id'] for t in inventory['tools']],
        'integration_root_keys': list(inventory.keys()),
        'qualification': inventory['qualification'], 'limitations': inventory['limitations'],
        'next_action': 'Lead integrates owned contributor inventory with pipelines and assigns independent fresh-context critic; at most two reworks. No self-approved DONE.',
        'shared_ledger_deltas': {'runtime_state': 'T1 contributor source evidence IMPLEMENTED; independent review pending; zero functional receipts and G01 open.',
            'execution_log': 'Rebuilt Git-bound Rust contributor/registration census and all32 tool source chains across nine production families; deterministic reader and negatives executed; no target code executed.',
            'backlog': 'DX100-G01:EXTENSION-TOOL-CONTRIBUTORS implemented with supplemental expansion contract; all nine production families expanded; no full G01 closure.'},
        'writes': 'Only g01/dynamic-factories/contributors/**; shared ledgers/coordination/root contract/pipelines readonly.',
        'descendants': 0, 'functional_receipts': 0, 'full_g01_closure': False}


def manifest():
    names = ['expansion.py', 'claim.json', 'reader.py', 'inventory.json', 'verification.json', 'README.md', 'handoff.json', 'development-notes.json']
    names += ['historical/phase1/' + ('README.md.txt' if n=='README.md' else n) for n in PHASE1_HASHES]
    return {'contract': {'path': '../contributors-contract.json', 'sha256': CONTRACT_SHA},
            'expansion_contract': {'path':'../contributors-expansion-contract.json','sha256':EXPANSION_SHA},
            'files': [{'path': n, 'sha256': digest((OUT / n).read_bytes()), 'bytes': (OUT / n).stat().st_size} for n in names],
            'pin': PIN, 'self_excluded': True}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='read-only regeneration and manifest verification')
    parser.add_argument('--freeze', action='store_true', help='write owned outputs and manifest; format README first')
    args = parser.parse_args()
    assert args.check != args.freeze, 'choose exactly one of --check or --freeze'
    reader = Reader()
    inventory = reader.build()
    verification = verify(reader, inventory)
    transfer = handoff(inventory, verification)
    if args.check:
        assert not validate(json.loads((OUT / 'inventory.json').read_bytes()), inventory), 'inventory mismatch'
        assert (OUT / 'inventory.json').read_bytes() == encoded(inventory), 'inventory byte mismatch'
        assert (OUT / 'verification.json').read_bytes() == encoded(verification), 'verification mismatch'
        assert (OUT / 'handoff.json').read_bytes() == encoded(transfer), 'handoff mismatch'
        assert (OUT / 'manifest.json').read_bytes() == encoded(manifest()), 'manifest mismatch'
    else:
        (OUT / 'inventory.json').write_bytes(encoded(inventory))
        (OUT / 'verification.json').write_bytes(encoded(verification))
        (OUT / 'handoff.json').write_bytes(encoded(transfer))
        (OUT / 'manifest.json').write_bytes(encoded(manifest()))
    print(json.dumps({'result': 'PASS', 'mode': 'check-readonly' if args.check else 'freeze-owned-only',
        'counts': verification['counts'], 'contract_sha256': CONTRACT_SHA, 'expansion_contract_sha256': EXPANSION_SHA,
        'manifest_sha256': digest((OUT / 'manifest.json').read_bytes())}, sort_keys=True))

if __name__ == '__main__':
    main()
