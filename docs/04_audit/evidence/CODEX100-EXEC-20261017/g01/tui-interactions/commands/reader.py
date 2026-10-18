"""Offline pinned-source slash-command bindings. Never imports target modules."""
from pathlib import Path
import collections
import copy
import hashlib
import importlib.util
import json
import re
import subprocess
import sys

sys.dont_write_bytecode = True
OUT = Path(__file__).resolve().parent
E = OUT.parents[2]
ROOT = next(p for p in OUT.parents if (p / 'docs/07_agents/AGENTS.md').exists())
UP = Path('/tmp/cvg-rea-codex-20261017/upstream')
PIN = '8d9f6466ff0294785d56f55b1fe363d132fe4133'
PREFIX = 'codex-rs/tui/src/'
HELPER = E / 'g01/entrypoints/cli/generate.py'
SL = PREFIX + 'slash_command.rs'
DISPATCH = PREFIX + 'chatwidget/slash_dispatch.rs'
HELPERS = PREFIX + 'bottom_pane/slash_commands.rs'
COMPOSER = PREFIX + 'bottom_pane/chat_composer.rs'


def require(ok, message):
    if not ok:
        raise AssertionError(message)


def sha(b):
    return hashlib.sha256(b).hexdigest()


def encoded(v):
    return (json.dumps(v, ensure_ascii=False, indent=2) + '\n').encode()


reviewed = json.loads((E / 'g01/entrypoints/manifest.json').read_text())
expected = next(r['sha256'] for r in reviewed['files'] if r['path'] == str(HELPER.relative_to(ROOT)))
require(sha(HELPER.read_bytes()) == expected, 'Prior helper changed')
spec = importlib.util.spec_from_file_location('reviewed_tui_command_lexer', HELPER)
cli = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cli)
# Local extension; the historical helper remains untouched. Strings containing
# backslash-newline and braces, byte/C raw strings and Unicode chars are atomic.
cli.TOKEN = re.compile(r'''(?:br|cr|r)(\#*)"|//[^\n]*|/\*|(?:b|c)?"(?:\\.|[^"\\])*"|b?'(?:\\u\{[0-9a-fA-F_]+\}|\\x[0-9a-fA-F]{2}|\\.|[^'\\\n])'|r\#[A-Za-z_]\w*|[A-Za-z_]\w*|::|=>|->|[^\s]''', re.S)


def span(s, a, b):
    raw = s.text.encode()
    start = len(s.text[:s.t[a][1]].encode())
    end = len(s.text[:s.t[b-1][2]].encode())
    return {'path': s.path, 'file_sha256': sha(raw), 'start_byte': start,
            'end_byte_exclusive': end, 'sha256': sha(raw[start:end]),
            'start_line': raw[:start].count(b'\n')+1,
            'end_line': raw[:end].count(b'\n')+1, 'text': raw[start:end].decode()}


def functions(s):
    rows = []
    for i, (word, _, _) in enumerate(s.t):
        if word != 'fn' or i+2 >= len(s.t) or not re.fullmatch(r'[A-Za-z_]\w*', s.t[i+1][0]):
            continue
        j = i+2
        while j < len(s.t) and s.t[j][0] not in ['{', ';']:
            if s.t[j][0] in ['(', '[']:
                j = s.pairs[j]
            j += 1
        if j == len(s.t) or s.t[j][0] != '{':
            continue
        a = s.before_attrs(i)
        # Include async/unsafe/const qualifiers in the bounded source record.
        while a > 0 and s.t[a-1][0] in ['async', 'unsafe', 'const', 'pub']:
            a -= 1
        rows.append({'name': s.t[i+1][0], 'start': a, 'body': j,
                     'end': s.pairs[j]+1, 'source': span(s, a, s.pairs[j]+1)})
    return rows


def refs(s, a, b, typename):
    return sorted({s.t[i+2][0] for i in range(a, b-2)
                   if [s.t[i][0], s.t[i+1][0]] == [typename, '::']})


def self_calls(s, a, b):
    return sorted({s.t[i+2][0] for i in range(a, b-3)
                   if [s.t[i][0], s.t[i+1][0], s.t[i+3][0]] == ['self', '.', '(']})


def select_match(s, f, expression):
    rows = [r for r in s.arms() if f['body'] < r['match'] < f['end']
            and s.raw(r['match']+1, r['match_body']).strip() == expression
            and s.depths[r['match']] == s.depths[f['body']]+1]
    require(rows, 'Missing direct match '+f['name'])
    return [{'pattern': s.raw(*r['pattern']), 'body': s.raw(*r['body']),
             'variants': refs(s, *r['pattern'], 'SlashCommand'),
             'events': refs(s, *r['body'], 'AppEvent'),
             'simple_self_call_candidates': self_calls(s, *r['body']),
             'source': span(s, *r['span'])} for r in rows]


def project(texts):
    sources = {p: cli.Source(p, t) for p, t in texts.items()}
    s = sources[SL]
    d = s.defs['SlashCommand'][0]
    enum_attrs, _ = s.attrs(d['start'], d['keyword'])
    fns = functions(s)
    method_names = ['description', 'command', 'supports_inline_args',
                    'available_in_side_conversation', 'requires_dispatch_validation',
                    'available_when_thread_unavailable', 'available_during_task', 'is_visible',
                    'built_in_slash_commands']
    methods = {n: next(f for f in fns if f['name'] == n) for n in method_names}
    desc = select_match(s, methods['description'], 'self')
    task = select_match(s, methods['available_during_task'], 'self')
    visible = select_match(s, methods['is_visible'], 'self')
    variants = []
    for a, b in s.split(d['body']+1, d['end']):
        attrs, name = s.attrs(a, b)
        v = s.t[name][0]
        require(name+1 == b, 'Unexpected slash payload: '+v)
        explicit = []
        for attr in attrs:
            for key, value in re.findall(r'(serialize|to_string)\s*=\s*"([^"]*)"', attr['text']):
                explicit.append({'key': key, 'value': value})
        avail = {}
        for n in ['supports_inline_args', 'available_in_side_conversation',
                  'requires_dispatch_validation', 'available_when_thread_unavailable']:
            f = methods[n]
            body = s.raw(f['body']+1, f['end']-1)
            require(body.strip().startswith('matches!'), 'Unsupported availability projection')
            avail[n] = {'source_literal_membership': v in refs(s, f['body'], f['end'], 'SlashCommand'),
                        'method': n, 'status': 'SOURCE_MATCHES_MEMBERSHIP_NOT_EXECUTED'}
        variants.append({'variant': v, 'presentation_order': len(variants),
                         'attributes': attrs, 'source': span(s, a, b),
                         'spelling': {'kebab_case_candidate': cli.word_name(v),
                                      'explicit_strum_attributes': explicit,
                                      'status': 'STRUM_EXPANSION_AND_RUNTIME_PARSE_OPEN'},
                         'availability_memberships': avail,
                         'description_arm_indexes': [i for i, r in enumerate(desc) if v in r['variants']],
                         'task_arm_indexes': [i for i, r in enumerate(task) if v in r['variants']],
                         'visibility_arm_indexes': [i for i, r in enumerate(visible) if v in r['variants'] or r['pattern'].strip() == '_']})
    ds = sources[DISPATCH]
    dfs = functions(ds)
    bare_fn = next(f for f in dfs if f['name'] == 'dispatch_command_from_source')
    args_fn = next(f for f in dfs if f['name'] == 'dispatch_prepared_command_with_args')
    bare = select_match(ds, bare_fn, 'cmd')
    inline = select_match(ds, args_fn, 'cmd')
    for v in variants:
        v['bare_dispatch_arm_indexes'] = [i for i, r in enumerate(bare) if v['variant'] in r['variants']]
        v['inline_dispatch_arm_indexes'] = [i for i, r in enumerate(inline) if v['variant'] in r['variants']]
        v['inline_fallback_arm_indexes'] = [i for i, r in enumerate(inline) if r['pattern'].strip() == '_']
        v['dispatch_status'] = 'SOURCE_BARE_ARM_BOUND_INLINE_EXPLICIT_OR_FALLBACK; runtime gates OPEN'
    composer_names = ['parent_owned_command_is_allowed', 'slash_input', 'slash_commands_enabled',
                      'try_dispatch_bare_slash_command', 'try_dispatch_slash_command_with_args',
                      'prepare_inline_args_submission', 'reject_slash_command_if_unavailable',
                      'stage_slash_command_history', 'stage_selected_slash_command_history',
                      'stage_slash_command_history_text', 'record_pending_slash_command_history',
                      'handle_parent_owned_submission', 'update_slash_command_catalog']
    selected = []
    for p, source in sources.items():
        for f in functions(source):
            # Entire production dispatch/helper/service-tier/input files are preserved
            # as source bodies. In mixed composer/enum files only explicit names.
            if p == COMPOSER and f['name'] not in composer_names:
                continue
            if p == SL and f['name'] not in method_names:
                continue
            # Test module remains in Git/file census; not used as production body.
            test_decl = re.search(r'#\[cfg\(test\)\]\s*mod tests\b', source.text)
            if test_decl and source.t[f['start']][1] >= test_decl.start():
                continue
            selected.append({'name': f['name'], 'source': f['source'],
                             'simple_self_call_candidates': self_calls(source, f['body'], f['end']),
                             'app_event_literal_candidates': refs(source, f['body'], f['end'], 'AppEvent')})
    hs = sources[HELPERS]
    flags = hs.defs['BuiltinCommandFlags'][0]
    flagrows = []
    for a, b in hs.split(flags['body']+1, flags['end']):
        colon = next(i for i in range(a,b) if hs.t[i][0] == ':')
        flagrows.append({'name': hs.t[colon-1][0], 'source': span(hs, a, b)})
    lookup = next(r for r in selected if r['name'] == 'find_builtin_command')['source']['text']
    alias_syntax = {'prefix_literals': re.findall(r"strip_prefix\(('(?:\\.|[^'\\])*')\)", lookup),
                    'suffix_literals': re.findall(r'strip_suffix\(("(?:\\.|[^"\\])*")\)', lookup),
                    'byte_predicates': re.findall(r"byte\s*==\s*(b'(?:\\.|[^'\\])*')", lookup),
                    'lookup_flag_overrides': re.findall(r'(\w+)\s*:\s*(true|false|Some\(""\))', lookup)}
    return {'variants': variants, 'enum_attributes': enum_attrs,
            'enum_source': span(s, d['start'], d['end']+1),
            'description_arms': desc, 'task_availability_arms': task, 'visibility_arms': visible,
            'bare_dispatch_arms': bare, 'inline_dispatch_arms': inline,
            'source_bodies': selected, 'builtin_flag_fields': flagrows,
            'lookup_alias_and_override_syntax': alias_syntax,
            'dynamic_command_declarations': [{'name': n, 'source': span(hs, hs.defs[n][0]['start'], hs.defs[n][0]['end']+1)}
                                              for n in ['ServiceTierCommand', 'SlashCommandItem', 'BuiltinCommandFlags']]}


def build():
    require(subprocess.check_output(['git', '-C', str(UP), 'rev-parse', 'HEAD']).decode().strip() == PIN, 'Wrong pin')
    require(not subprocess.check_output(['git', '-C', str(UP), 'status', '--porcelain']).strip(), 'Dirty target')
    tree = {}
    for row in subprocess.check_output(['git', '-C', str(UP), 'ls-tree', '-r', '-z', PIN]).split(b'\0'):
        if row:
            header, path = row.split(b'\t', 1)
            mode, kind, oid = header.decode().split()
            tree[path.decode()] = {'mode': mode, 'kind': kind, 'git_blob': oid}
    selected_paths = [SL, DISPATCH, HELPERS, COMPOSER,
                      PREFIX+'chatwidget/service_tiers.rs', PREFIX+'bottom_pane/prompt_args.rs',
                      PREFIX+'bottom_pane/chat_composer/slash_input.rs']
    # Explicit paths come from real module declarations; never synthesize a missing file.
    require(all(p in tree for p in selected_paths), 'Missing selected source')
    identities = {}
    def load(p):
        raw = (UP/p).read_bytes()
        require(hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest() == tree[p]['git_blob'], 'Git source differs')
        identities[p] = {'path': p, **tree[p], 'sha256': sha(raw), 'bytes': len(raw)}
        return raw.decode()
    texts = {p: load(p) for p in selected_paths}
    data = project(texts)
    require(len(data['variants']) == 65, 'Slash census differs')
    require(all(r['description_arm_indexes'] and r['task_arm_indexes'] and r['visibility_arm_indexes'] and r['bare_dispatch_arm_indexes'] for r in data['variants']), 'Unbound slash variant')
    wanted = sorted({name for r in data['bare_dispatch_arms']+data['inline_dispatch_arms']
                     for name in r['simple_self_call_candidates']})
    candidates = collections.defaultdict(list)
    # A name-indexed definition is a candidate, not a Rust type-resolved call edge.
    # All source files participate, including test-looking names; no name-based omission.
    for p in sorted(tree):
        if not p.startswith(PREFIX) or not p.endswith('.rs'):
            continue
        text = (UP/p).read_text()
        if not any(re.search(r'\bfn\s+'+re.escape(n)+r'\b', text) for n in wanted):
            continue
        source = cli.Source(p, load(p))
        for f in functions(source):
            if f['name'] in wanted:
                candidates[f['name']].append({'source': f['source'],
                    'status': 'NAME_ONLY_DEFINITION_CANDIDATE; impl ownership, cfg, macros and runtime OPEN'})
    data['handler_definition_candidates'] = [{'name': n, 'definitions': candidates[n],
        'status': 'SOURCE_NAME_CANDIDATES_NOT_TYPE_RESOLVED' if candidates[n] else 'OPEN_NO_SIMPLE_TUI_DEFINITION'} for n in wanted]
    data.update({'kind': 'T1_PINNED_SLASH_SOURCE_BINDINGS_NOT_EXECUTED_COMMANDS', 'pin': PIN,
        'contract_sha256': sha((OUT.parent/'contract.json').read_bytes()), 'helper_sha256': sha(HELPER.read_bytes()),
        'sources': [identities[p] for p in sorted(identities)],
        'dynamic_families': [
            {'id': 'SERVICE_TIER_COMMANDS', 'source_paths': [HELPERS, PREFIX+'chatwidget/service_tiers.rs'],
             'status': 'MANDATORY_DYNAMIC_VARIANTS_OPEN',
             'rule': 'model catalog commands after Model; feature gate, exact lookup, side conversation rejection; no finite model/account tier set inferred'},
            {'id': 'GOAL_EXTRA_O_ALIAS', 'source_paths': [HELPERS], 'status': 'MANDATORY_ALIAS_FAMILY_NOT_RUNTIME_TESTED',
             'rule': 'find_builtin_command recognizes g + one-or-more byte o + al after derived lookup'}],
        'limits': [
            'Visibility, popup filtering, exact-name lookup, composer staging, dispatch validation and effects are separate source stages.',
            'Enum spelling is an attribute/default candidate; Strum macro expansion and parser runtime remain OPEN.',
            'Full dispatcher source bodies preserve pre-match gates, inline empty fallback, queued/live distinctions and all branch-local guards.',
            'Definition candidates cover simple self.method(...) calls in command arms only. Other receivers/chains/macros/traits/external calls remain visible in source bodies and OPEN; not a complete callgraph.',
            'Per-file classification and module cfg come from the separate scope census. A matching function name or AppEvent literal never proves production reachability.',
            'No Rust, Cargo, terminal, network, model, provider or app execution; no CVG grant by accepting a slash command.'],
        'functional_receipts': 0, 'full_g01_closure': False})
    return data, texts


def main():
    fresh, texts = build()
    require(fresh == build()[0], 'Nondeterministic extraction')
    negatives = []
    for name, mutation in [
        ('lost_command', lambda x: x['variants'].pop()),
        ('lost_alias', lambda x: next(r for r in x['variants'] if r['variant']=='Pets')['spelling'].update(explicit_strum_attributes=[])),
        ('lost_dispatch', lambda x: x['bare_dispatch_arms'].pop()),
        ('lost_availability', lambda x: x['task_availability_arms'].pop()),
        ('lost_pre_dispatch_gate', lambda x: next(r for r in x['source_bodies'] if r['name']=='slash_command_blocked_by_active_task')['source'].update(text='true')),
        ('lost_dynamic_tier', lambda x: x['dynamic_families'].pop(0)),
        ('false_receipt', lambda x: x.update(functional_receipts=1)),
    ]:
        bad = copy.deepcopy(fresh)
        mutation(bad)
        require(bad != fresh, 'Ineffective negative '+name)
        negatives.append({'id': name, 'result': 'REJECTED_BY_EXACT_REGENERATION'})
    original = project(texts)
    for name, path, old, new in [
        ('alias_source', SL, 'serialize = "pet"', 'serialize = "pet_control"'),
        ('availability_source', SL, 'SlashCommand::Export\n            | SlashCommand::Keymap', 'SlashCommand::Export\n            | SlashCommand::Model'),
        ('dispatch_source', DISPATCH, 'self.dispatch_command(cmd);', 'self.dispatch_command_control(cmd);'),
        ('goal_alias_source', HELPERS, "strip_prefix('g')", "strip_prefix('z')"),
        ('lookup_gate_source', HELPERS, 'token_activity_command_enabled: true,', 'token_activity_command_enabled: false,'),
        ('composer_stage_source', COMPOSER, 'self.stage_slash_command_history(&command);', 'self.stage_slash_command_history_control(&command);'),
    ]:
        require(old in texts[path], 'Missing source negative '+name)
        changed = dict(texts)
        changed[path] = changed[path].replace(old, new, 1)
        projected = project(changed)
        if name == 'alias_source':
            signature = lambda x: [(v['variant'], v['spelling']['explicit_strum_attributes']) for v in x['variants']]
        elif name == 'availability_source':
            signature = lambda x: [(r['variants'], r['body']) for r in x['task_availability_arms']]
        elif name in ['goal_alias_source', 'lookup_gate_source']:
            signature = lambda x: x['lookup_alias_and_override_syntax']
        else:
            function_name = 'handle_slash_command_dispatch' if name == 'dispatch_source' else 'try_dispatch_bare_slash_command'
            signature = lambda x: [r['simple_self_call_candidates'] for r in x['source_bodies'] if r['name'] == function_name]
        require(signature(projected) != signature(original), 'Semantic projection invisible '+name)
        negatives.append({'id': name, 'result': 'SOURCE_MUTATION_DETECTED_WITHOUT_WRITING_UPSTREAM'})
    report = {'result': 'PASS', 'kind': 'T1_SOURCE_BINDING_ONLY',
        'counts': {'variants': len(fresh['variants']), 'bare_dispatch_arms': len(fresh['bare_dispatch_arms']),
                   'inline_dispatch_arms': len(fresh['inline_dispatch_arms']),
                   'source_bodies': len(fresh['source_bodies']), 'handler_names': len(fresh['handler_definition_candidates']),
                   'handler_definition_candidates': sum(len(r['definitions']) for r in fresh['handler_definition_candidates']),
                   'source_files': len(fresh['sources']), 'builtin_flags': len(fresh['builtin_flag_fields']),
                   'mandatory_dynamic_families': len(fresh['dynamic_families'])},
        'negative_controls': negatives, 'functional_receipts': 0, 'full_g01_closure': False}
    for name, value in [('inventory.json', fresh), ('verification.json', report)]:
        if '--check' in sys.argv:
            require((OUT/name).read_bytes() == encoded(value), 'Regeneration differs: '+name)
        else:
            (OUT/name).write_bytes(encoded(value))
    print(json.dumps(report))


if __name__ == '__main__':
    main()
