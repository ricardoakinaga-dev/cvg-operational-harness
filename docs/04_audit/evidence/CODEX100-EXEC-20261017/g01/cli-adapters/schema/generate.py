"""Bounded source projection of manual CLI adapters; never run Rust/clap."""
from pathlib import Path
import ast
import copy
import hashlib
import json
import re
import subprocess
import sys

OUT = Path(__file__).resolve().parent
ROOT = next(p for p in OUT.parents if (p / 'docs/07_agents/AGENTS.md').exists())
UP = Path('/tmp/cvg-rea-codex-20261017/upstream')
PIN = '8d9f6466ff0294785d56f55b1fe363d132fe4133'
OLD = OUT.parents[1] / 'entrypoints/cli/graph.json'
HELPER = OUT.parents[1] / 'entrypoints/tools/build_tool_graph.py'
MAIN = 'codex-rs/cli/src/main.rs'
EXEC = 'codex-rs/exec/src/cli.rs'
TUI = 'codex-rs/tui/src/cli.rs'
WIN = 'codex-rs/cli/src/sandbox_setup.rs'
SHARED = 'codex-rs/utils/cli/src/shared_options.rs'
CONTRACT = OUT.parent / 'contract.json'


def require(ok, message):
    if not ok:
        raise AssertionError(message)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def encoded(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode()


def read(path):
    return json.loads(path.read_text())


# Only these reviewed, local lexer definitions are evaluated; no module body.
tree = ast.parse(HELPER.read_text())
env = {'re': re}
nodes = [n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name in ['mask_rust', 'balanced']]
require(len(nodes) == 2, 'Reviewed lexer definitions missing')
exec(compile(ast.Module(body=nodes, type_ignores=[]), '<reviewed-local-lexer>', 'exec'), env)
mask_rust, balanced = env['mask_rust'], env['balanced']


def build():
    graph = read(OLD)
    consumed = {}
    loaded = {}

    def load(path):
        if path not in loaded:
            data = (UP / path).read_bytes()
            consumed[path] = {'path': path, 'sha256': sha(data), 'bytes': len(data)}
            text = data.decode()
            loaded[path] = (text, mask_rust(text))
        return loaded[path]

    def ref(path, start, end):
        text, _ = load(path)
        data = text[start:end].encode()
        return {'path': path, 'file_sha256': consumed[path]['sha256'],
                'start_byte': len(text[:start].encode()), 'end_byte_exclusive': len(text[:end].encode()),
                'start_line': text[:start].count('\n') + 1,
                'end_line': text[:end].count('\n') + (not text[:end].endswith('\n')),
                'sha256': sha(data), 'text': data.decode()}

    def block(path, marker, kind='impl'):
        text, mask = load(path)
        hits = list(re.finditer(re.escape(marker), text))
        require(len(hits) == 1, 'Ambiguous/missing source marker: ' + marker)
        start = hits[0].start()
        brace = mask.index('{', start)
        end = balanced(mask, brace, '{', '}')
        return {'kind': kind, 'identity': marker, 'source': ref(path, start, end)}

    def methods(impl):
        source = impl['source']; text = source['text']; mask = mask_rust(text)
        result = {}
        for match in re.finditer(r'\bfn\s+(\w+)\s*\(', mask):
            brace = mask.index('{', match.end())
            end = balanced(mask, brace, '{', '}')
            result[match[1]] = text[match.start():end]
        require(set(result) == ({'augment_args', 'augment_args_for_update'} if impl['identity'].startswith('impl Args')
                               else {'from_arg_matches', 'update_from_arg_matches'}), 'Adapter methods omitted/changed')
        return result

    def mutations(source, owner):
        text = source['text']; mask = mask_rust(text); out = []
        for match in re.finditer(r'\.mut_arg\s*\(', mask):
            paren = mask.index('(', match.start()); end = balanced(mask, paren, '(', ')')
            call = text[match.start():end]
            target = re.match(r'\.mut_arg\(\s*"([^"]+)"\s*,', call)
            require(target is not None, 'Unsupported nonliteral mut_arg selector')
            actions = re.findall(r'\barg\.(global|conflicts_with)\((true|false|"[^"]+")\)', call)
            require(len(actions) == 1, 'Unsupported/ambiguous argument mutation')
            field_id = owner + '.' + target[1]
            require(any(f['id'] == field_id for f in graph['fields']), 'Mutation points at unknown field: ' + field_id)
            out.append({'field_id': field_id, 'method': actions[0][0], 'argument': actions[0][1],
                        'source_expression': call})
        return out

    specifications = [
        (MAIN, 'SessionTuiCli', 'TuiCli', TUI + '::Cli', None),
        (EXEC, 'ExecSharedCliOptions', 'SharedCliOptions', SHARED + '::SharedCliOptions', 'mark_exec_global_args'),
        (TUI, 'TuiSharedCliOptions', 'SharedCliOptions', SHARED + '::SharedCliOptions', 'mark_tui_args'),
        (EXEC, 'ResumeArgs', 'ResumeArgsRaw', EXEC + '::ResumeArgsRaw', None),
    ]
    rows = []
    for path, name, delegate, base_id, helper in specifications:
        owner = path + '::' + name
        old_edge = next(e for e in graph['edges'] if e.get('owner') == owner
                        and e.get('relation') == 'dynamic-effective-clap-schema')
        args = block(path, 'impl Args for ' + name + ' {')
        trait = 'clap::FromArgMatches' if name == 'SessionTuiCli' else 'FromArgMatches'
        conversion = block(path, 'impl ' + trait + ' for ' + name + ' {')
        aug = methods(args); matches = methods(conversion)
        for method in ['augment_args', 'augment_args_for_update']:
            require(delegate + '::' + method + '(cmd)' in aug[method], 'Wrong delegate in ' + name)
        require(delegate + '::from_arg_matches(matches)' in matches['from_arg_matches'], 'Wrong FromArgMatches delegate')
        mutation_source = block(path, 'fn ' + helper + '(', 'helper')['source'] if helper else args['source']
        mods = mutations(mutation_source, base_id)
        if not helper and name == 'SessionTuiCli':
            require(len(mods) == 2 and mods[0] == mods[1], 'Session augment/update mutation differs')
            mods = mods[:1]
        base = next(t for t in graph['types'] if t['id'] == base_id)
        original, _ = load(path)
        if delegate == 'ResumeArgsRaw':
            delegate_binding = {'kind': 'local_declaration', 'source': base['source']}
        else:
            imports = list(re.finditer(r'(?m)^use [^\n]*\b' + delegate + r';', original))
            require(len(imports) == 1, 'Delegate import binding missing or ambiguous')
            delegate_binding = {'kind': 'import', 'source': ref(path, imports[0].start(), imports[0].end())}
        base_fields = [f for f in graph['fields'] if f['owner'] == base_id]
        require(base_fields, 'Delegate fields lost')
        for field in base_fields:
            source = field['source']; text, _ = load(source['path'])
            actual = text.encode()[source['start_byte']:source['end_byte']]
            require(sha(actual) == source['sha256'], 'Delegate field evidence differs from source')
        row = {'owner': owner, 'previous_edge': old_edge, 'delegate_spelling': delegate,
               'delegate_type': base, 'delegate_binding': delegate_binding,
               'delegate_fields': base_fields, 'args_impl': args,
               'from_arg_matches_impl': conversion, 'mutations': mods,
               'mutation_source': mutation_source, 'status': 'SOURCE_ADAPTER_RESOLVED_EFFECTIVE_CLAP_NOT_RUN',
               'qualification': 'NOT_RUN'}
        if name == 'ResumeArgs':
            row['raw_to_domain'] = block(EXEC, 'impl From<ResumeArgsRaw> for ResumeArgs {')
            row['conversion_condition'] = 'raw.last && raw.prompt.is_none()'
            row['true_branch'] = '(None, raw.session_id)'
            row['false_branch'] = '(raw.session_id, raw.prompt)'
            row['unchanged_fields'] = ['last', 'all', 'images']
            require(all(value in row['raw_to_domain']['source']['text'] for value in
                        [row['conversion_condition'], row['true_branch'], row['false_branch']]), 'Resume conversion changed')
            require('*self = ResumeArgsRaw::from_arg_matches(matches).map(Self::from)?;' in matches['update_from_arg_matches'],
                    'Resume update no longer reconstructs domain value')
        else:
            require('self.0.update_from_arg_matches(matches)' in matches['update_from_arg_matches'],
                    'Wrapper update no longer delegates to existing inner value')
        rows.append(row)

    grammar = block(WIN, '#[derive(Debug, Parser)]\n#[command(group(', 'derived_grammar')
    text = grammar['source']['text']; mask = mask_rust(text); fields = []
    for match in re.finditer(r'^\s+(\w+):\s*([^,\n]+),', text, re.M):
        name, rust_type = match.groups()
        # Each of the four bounded fields carries one complete #[arg(...)] block.
        attr_start = text.rfind('#[arg(', 0, match.start())
        require(attr_start >= 0, 'Windows field without argument declaration')
        attr_end = balanced(mask, attr_start + 1, '[', ']')
        require(not mask[attr_end:match.start()].strip(), 'Attribute attached to different Windows field')
        fields.append({'name': name, 'rust_type': rust_type, 'attribute': text[attr_start:attr_end]})
    require([f['name'] for f in fields] == ['elevated_sandbox_level', 'user', 'current_user', 'codex_home'],
            'Windows field census changed')
    main_text, main_mask = load(MAIN)
    start = main_text.index('#[cfg(target_os = "windows")]\n            if let Some(setup_cli)')
    brace = main_mask.index('{', start)
    dispatch = ref(MAIN, start, balanced(main_mask, brace, '{', '}'))
    ordered = ['sandbox_setup::parse_setup_command', 'reject_remote_mode_for_subcommand',
               '.parse_overrides()', 'sandbox_setup::run(', 'return Ok(())']
    positions = [dispatch['text'].index(item) for item in ordered]
    require(positions == sorted(positions), 'Windows setup dispatch ordering changed')
    module_marker = '#[cfg(target_os = "windows")]\nmod sandbox_setup;'
    module_start = main_text.index(module_marker)
    windows = {'owner': WIN + '::SandboxSetupCommand', 'grammar': grammar, 'fields': fields,
               'required_group': {'name': 'sandbox_user', 'members': ['user', 'current_user'], 'required': True},
               'parse_source': block(WIN, 'pub(crate) fn parse_setup_command(', 'function'),
               'level_source': block(WIN, 'fn setup_level(', 'function'),
               'run_source': block(WIN, 'pub(crate) async fn run(', 'function'),
               'effect_source': block(WIN, 'async fn run_elevated(', 'function'),
               'identity_source': block(WIN, 'fn resolve_sandbox_setup_identity(', 'function'),
               'dispatch_source': dispatch, 'dispatch_cfg': 'target_os = "windows"',
               'module_cfg_source': ref(MAIN, module_start, module_start + len(module_marker)),
               'remote_rejection_source': block(MAIN, 'fn reject_remote_mode_for_subcommand(', 'function'),
               'elevated_required_stage': 'setup_level, after clap parsing and before provisioning',
               'effect_boundary': 'source only: provisioning then persist elevated config; neither executed here',
               'qualification': 'NOT_RUN'}

    cases = []
    for last in [False, True]:
        for explicit_prompt in [False, True]:
            for raw_session in [None, 'synthetic-position']:
                cases.append({'id': 'resume-last-' + str(last).lower() + '-prompt-' + str(explicit_prompt).lower()
                              + '-position-' + str(raw_session is not None).lower(),
                              'scope': 'raw_to_domain conversion after parsing', 'last': last,
                              'raw_session_id': raw_session, 'raw_prompt': 'synthetic-prompt' if explicit_prompt else None,
                              'expected_session_id': None if last and not explicit_prompt else raw_session,
                              'expected_prompt': raw_session if last and not explicit_prompt else
                              ('synthetic-prompt' if explicit_prompt else None), 'qualification': 'NOT_RUN'})
    for name, boundary in [
        ('session-last-with-second-positional', 'prompt conflicts_with last'),
        ('exec-global-after-subcommand', 'four fields global in both augment paths'),
        ('tui-approval-conflicts', 'two mutations add conflicts_with approval_policy'),
        ('windows-non-setup-vector', 'parse_setup_command returns None'),
        ('windows-missing-user-choice', 'required sandbox_user clap group'),
        ('windows-both-user-choices', 'mutually conflicting user/current_user'),
        ('windows-user-without-home', 'user requires codex_home'),
        ('windows-missing-elevated', 'setup_level rejects even if clap parsed'),
        ('windows-remote-mode', 'reject remote mode before provisioning'),
        ('windows-provision-write-failure', 'original provisioning/config error; no inferred rollback'),
    ]:
        cases.append({'id': name, 'boundary': boundary, 'qualification': 'NOT_RUN'})
    return {'kind': 'T1_SOURCE_ADAPTER_PROJECTION_NOT_ACCEPTED_CLAP_SCHEMA', 'pin': PIN,
            'contract_sha256': sha(CONTRACT.read_bytes()),
            'previous_graph': {'path': str(OLD.relative_to(ROOT)), 'sha256': sha(OLD.read_bytes())},
            'reader_helper': {'path': str(HELPER.relative_to(ROOT)), 'sha256': sha(HELPER.read_bytes())},
            'adapters': rows, 'windows_setup': windows, 'future_cases': cases,
            'sources': sorted(consumed.values(), key=lambda r: r['path']),
            'functional_receipts': 0, 'full_g01_closure': False,
            'remaining': ['Clap macro expansion and runtime parse equivalence, scalar parser/value enums and cfg evaluation',
                          'arg0 is a separate lane; native effects, tenant authorization and platform comparison not executed',
                          '20 exec-server transitive references, external factories/component closure, G02 binding and G03 reuse']}


def validate(value, fresh):
    require(value == fresh, 'Source projection differs from exact fresh generation')
    require(len(value['adapters']) == 4, 'Missing adapter')
    require(sum(len(r['mutations']) for r in value['adapters']) == 7, 'Mutation census changed')
    require(len(value['windows_setup']['fields']) == 4, 'Windows field census changed')
    require(value['functional_receipts'] == 0 and not value['full_g01_closure'], 'False qualification')


require(subprocess.check_output(['git', '-C', str(UP), 'rev-parse', 'HEAD'], text=True).strip() == PIN, 'Wrong pin')
require(not subprocess.check_output(['git', '-C', str(UP), 'status', '--porcelain'], text=True).strip(), 'Source modified')
fresh = build(); validate(fresh, build())
for row in fresh['sources']:
    blob = subprocess.check_output(['git', '-C', str(UP), 'show', PIN + ':' + row['path']])
    require(sha(blob) == row['sha256'], 'Source differs from pinned Git object')
negatives = []
for name, mutation in [
    ('missing_adapter', lambda v: v['adapters'].pop()),
    ('removed_conflict', lambda v: v['adapters'][0].update(mutations=[])),
    ('wrong_global_field', lambda v: v['adapters'][1]['mutations'][0].update(field_id='unrelated.model')),
    ('lost_update_delegate', lambda v: v['adapters'][1].pop('from_arg_matches_impl')),
    ('wrong_helper_binding', lambda v: v['adapters'][1].update(mutation_source=v['adapters'][2]['mutation_source'])),
    ('wrong_resume_condition', lambda v: v['adapters'][3].update(conversion_condition='raw.last')),
    ('missing_windows_group', lambda v: v['windows_setup'].pop('required_group')),
    ('lost_windows_cfg', lambda v: v['windows_setup'].update(dispatch_cfg='all platforms')),
    ('lost_windows_module_cfg', lambda v: v['windows_setup'].pop('module_cfg_source')),
    ('removed_remote_guard', lambda v: v['windows_setup'].pop('remote_rejection_source')),
    ('false_qualification', lambda v: v.update(functional_receipts=1)),
]:
    altered = copy.deepcopy(fresh); mutation(altered)
    try:
        validate(altered, fresh)
    except AssertionError:
        negatives.append({'name': name, 'result': 'REJECTED'})
    else:
        raise AssertionError('Known-bad projection accepted: ' + name)
result = {'kind': 'T1_SOURCE_REPRODUCTION_ONLY', 'result': 'PASS', 'adapters': 4,
          'unique_mutations': 7, 'windows_fields': 4, 'future_cases': len(fresh['future_cases']),
          'source_git_objects': len(fresh['sources']), 'negative_controls': negatives,
          'functional_receipts': 0, 'full_g01_closure': False}
if '--check' in sys.argv:
    require((OUT / 'inventory.json').read_bytes() == encoded(fresh), 'Inventory regeneration differs')
    require(read(OUT / 'verification.json') == result, 'Verification differs')
    manifest = read(OUT / 'manifest.json')
    actual = {p.name for p in OUT.iterdir() if p.is_file() and p.name != 'manifest.json'}
    require(actual == {r['path'] for r in manifest['files']}, 'Manifest file set differs')
    require(all(sha((OUT / r['path']).read_bytes()) == r['sha256'] for r in manifest['files']), 'Manifest bytes differ')
    require(manifest['contract_sha256'] == sha(CONTRACT.read_bytes()), 'Manifest contract differs')
else:
    (OUT / 'inventory.json').write_bytes(encoded(fresh))
    (OUT / 'verification.json').write_bytes(encoded(result))
    manifest = {'contract_sha256': sha(CONTRACT.read_bytes()), 'pin': PIN,
                'kind': 'T1_SOURCE_PACKAGE_NOT_PARITY',
                'files': [{'path': p.name, 'sha256': sha(p.read_bytes()), 'bytes': p.stat().st_size}
                          for p in sorted(OUT.iterdir()) if p.is_file() and p.name != 'manifest.json']}
    (OUT / 'manifest.json').write_bytes(encoded(manifest))
print(json.dumps(result))
