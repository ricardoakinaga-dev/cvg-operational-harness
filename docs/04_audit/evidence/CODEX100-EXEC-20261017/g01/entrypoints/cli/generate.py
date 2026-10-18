#!/usr/bin/env python3
"""Bounded Rust source evidence, standard library only. Never imports/runs target code."""
import argparse
import copy
import hashlib
import json
from pathlib import Path
import re
import sys
import tomllib

HERE = Path(__file__).resolve().parent
CONTRACT = HERE.parent / 'cli-contract.json'
PIN = '8d9f6466ff0294785d56f55b1fe363d132fe4133'
CONTRACT_SHA = '511bf568773140f269b715ab8c1df8be3c055a792f3f89923891df8bbba2b97e'
MAIN = 'codex-rs/cli/src/main.rs'
# Curated terminal calls inside the REAL root dispatch match, not policy/profile matches.
CALLS = {
 'Agents': ['run_interactive_tui'], 'TcpTunnel': ['codex_tcp_tunnel::run'],
 'Exec': ['codex_exec::run_main'], 'Review': ['codex_exec::run_main'],
 'Login': ['run_login_status', 'run_login_with_device_code', 'run_login_with_api_key', 'run_login_with_access_token', 'run_login_with_chatgpt'],
 'Logout': ['run_logout'], 'Mcp': ['mcp_cli.run'],
 'Plugin': ['plugin_cmd::run_plugin_add', 'plugin_cmd::run_plugin_list', 'marketplace_cli.run', 'plugin_cmd::run_plugin_remove'],
 'AppServer': ['codex_app_server::run_main_with_transport_options', 'print_app_server_daemon_output', 'codex_app_server_daemon::bootstrap', 'codex_app_server_protocol::generate_internal_json_schema'],
 'RemoteControl': ['remote_control_cmd::run'], 'App': ['app_cmd::run_app'],
 'Completion': ['print_completion'], 'Update': ['run_update_command'], 'Doctor': ['doctor::run_doctor'],
 'Sandbox': ['sandbox_setup::run', 'command.run', 'codex_cli::run_command_under_seatbelt', 'codex_cli::run_command_under_landlock', 'codex_cli::run_command_under_windows_sandbox'],
 'Debug': ['run_debug_models_command', 'run_debug_app_server_command', 'run_debug_prompt_input_command', 'run_debug_trace_reduce_command', 'run_debug_clear_memories_command'],
 'Execpolicy': ['run_execpolicycheck'], 'Apply': ['run_apply_command'],
 'Resume': ['run_interactive_tui'], 'Queue': ['queue_cmd::run_queue_command'],
 'Archive': ['run_session_archive_cli_command'], 'Delete': ['run_session_archive_cli_command'],
 'MigrateRollouts': ['migrate_rollouts::run'], 'Unarchive': ['run_session_archive_cli_command'],
 'Fork': ['run_interactive_tui'], 'Cloud': ['codex_cloud_tasks::run_main'],
 'ResponsesApiProxy': ['codex_responses_api_proxy::run_main'], 'StdioToUds': ['codex_stdio_to_uds::run'],
 'ExecServer': ['cmd.run'], 'Features': ['enable_feature_in_config', 'disable_feature_in_config'],
}
# Curated external type paths. Every used mapping requires import/reexport + declaration anchors.
EXTERNAL = {
 'codex_exec::Cli': ('exec', 'cli', 'Cli'),
 'codex_exec::ReviewArgs': ('exec', 'cli', 'ReviewArgs'),
 'codex_tui::Cli': ('tui', 'cli', 'Cli'),
 'codex_cloud_tasks::Cli': ('cloud-tasks', 'cli', 'Cli'),
 'codex_utils_cli::CliConfigOverrides': ('utils/cli', 'config_override', 'CliConfigOverrides'),
 'codex_utils_cli::SharedCliOptions': ('utils/cli', 'shared_options', 'SharedCliOptions'),
 'codex_execpolicy::ExecPolicyCheckCommand': ('execpolicy', 'execpolicycheck', 'ExecPolicyCheckCommand'),
 'codex_app_server::AppServerCodeModeHostArgs': ('app-server', 'code_mode_host', 'AppServerCodeModeHostArgs'),
 'codex_tcp_tunnel::Args': ('tcp-tunnel', 'lib', 'Args'),
 'codex_websocket_auth::WebsocketAuthArgs': ('websocket-auth', 'lib', 'WebsocketAuthArgs'),
 'codex_chatgpt::apply_command::ApplyCommand': ('chatgpt', 'apply_command', 'ApplyCommand'),
 'codex_responses_api_proxy::Args': ('responses-api-proxy', 'lib', 'Args'),
 'codex_cli::SeatbeltCommand': ('cli', 'lib', 'SeatbeltCommand'),
 'codex_cli::LandlockCommand': ('cli', 'lib', 'LandlockCommand'),
 'codex_cli::WindowsCommand': ('cli', 'lib', 'WindowsCommand'),
}
MANUAL = {
 ('codex-rs/tui/src/cli.rs', 'TuiSharedCliOptions'): ('SharedCliOptions', 'mark_tui_args(SharedCliOptions::augment_args(cmd))', 'delegates SharedCliOptions; mark_tui_args mutates dangerously_bypass_approvals_and_sandbox and auto_review conflicts_with approval_policy'),
 (MAIN, 'SessionTuiCli'): ('TuiCli', 'TuiCli::augment_args(cmd).mut_arg', 'delegates TuiCli args; mutates prompt conflict with last; FromArgMatches wraps TuiCli'),
 ('codex-rs/exec/src/cli.rs', 'ExecSharedCliOptions'): ('SharedCliOptions', 'mark_exec_global_args(SharedCliOptions::augment_args(cmd))', 'delegates SharedCliOptions; dynamic global(true) for model, dangerously_bypass_approvals_and_sandbox, bypass_hook_trust, worktree'),
 ('codex-rs/exec/src/cli.rs', 'ResumeArgs'): ('ResumeArgsRaw', 'ResumeArgsRaw::augment_args(cmd)', 'CLI fields owned by ResumeArgsRaw; conversion reinterprets session_id as prompt when last and no explicit prompt'),
}
LIMITS = [
 'Static pinned source only: no clap expansion, target compilation/execution, help observation, application tests, network, install or runtime qualification.',
 'Graph starts at MultitoolCli/Subcommand; follows tuple payload, flatten, subcommand, conditional type aliases and four curated manual Args adapters. Scalar value enums/parsers and transitive runtime callees are outside the command graph.',
 'cfg/cfg_attr remain symbolic, never platform-evaluated. Direct attributes and resolution-path/module conditions are retained; inherited visibility/availability requires the full edge path.',
 'Argument ownership is declaration ownership. Flatten is an edge, not duplicated fields. skip is not a CLI argument. Ordinary data fields of manual Args wrappers are not treated as derived positional arguments.',
 'Root dispatch is curated and anchored to the actual main match with verified call tokens. Nested dispatch candidates are source match/if-let arms with executable bodies; no reachability/type-check claim. Missing candidates are explicitly unresolved.',
 'Dynamic/manual clap mutations are recorded as unresolved effective-schema edges even where delegation is source-proven. Default interactive None branch and Windows sandbox setup parse are separately anchored.',
 'Rust reader is a bounded delimiter/token reader, not rustc/syn: top-level declarations, simple use imports and explicit external reexports only. Unsupported/ambiguous references remain unresolved, never nearest-name guesses.',
]

def sha(data):
    return hashlib.sha256(data).hexdigest()

def dump(obj):
    return json.dumps(obj, ensure_ascii=False, indent=2) + '\n'

# Strings/chars/raw strings and nested comments are atomic; delimiters in them cannot own fields.
TOKEN = re.compile(r'''r(\#*)"|//[^\n]*|/\*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\\n])'|[A-Za-z_][A-Za-z_0-9]*|::|=>|->|[^\s]''')

class Source:
    def __init__(self, path, text):
        self.path, self.text = path, text
        self.t = []
        pos = 0
        while pos < len(text):
            m = TOKEN.search(text, pos)
            if not m:
                break
            v, end = m.group(), m.end()
            if v == '/*':
                depth = 1
                while depth:
                    n = re.search(r'/\*|\*/', text[end:])
                    if not n:
                        raise ValueError('unterminated comment')
                    depth += 1 if n.group() == '/*' else -1
                    end += n.end()
            elif m.group(1) is not None:
                close = '"' + m.group(1)
                q = text.find(close, end)
                if q < 0:
                    raise ValueError('unterminated raw string')
                end = q + len(close)
                self.t.append((text[m.start():end], m.start(), end))
            elif not v.startswith('//'):
                self.t.append((v, m.start(), end))
            pos = end
        self._arms = None
        self.pairs = {}
        stack = []
        self.depths = []
        for i, (v, _, _) in enumerate(self.t):
            self.depths.append(len(stack))
            if v in ('(', '[', '{'):
                stack.append((v, i))
            elif v in (')', ']', '}'):
                opening, j = stack.pop()
                if (opening, v) not in [('(', ')'), ('[', ']'), ('{', '}')]:
                    raise ValueError(f'delimiter mismatch {path}:{i}')
                self.pairs[j] = i
                self.pairs[i] = j
        if stack:
            raise ValueError('unclosed delimiters: ' + path)
        self.defs = {}
        for i, (v, _, _) in enumerate(self.t):
            if v not in ('struct', 'enum', 'type') or self.depths[i] != 0:
                continue
            name = self.t[i+1][0]
            j = i+2
            while self.t[j][0] not in ('{', '(', ';', '='):
                j += 1
            if v == 'type':
                end = j
                while self.t[end][0] != ';':
                    end += 1
            else:
                end = self.pairs[j] if self.t[j][0] in ('{', '(') else j
            a = self.before_attrs(i)
            d = dict(kind=v, name=name, start=a, keyword=i, body=j, end=end)
            self.defs.setdefault(name, []).append(d)

    def before_attrs(self, i):
        j = i-1
        if j >= 0 and self.t[j][0] == ')':
            j = self.pairs[j]-1
        if j >= 0 and self.t[j][0] == 'pub':
            j -= 1
        start = j+1
        while j >= 1 and self.t[j][0] == ']' and self.t[self.pairs[j]-1][0] == '#':
            start = self.pairs[j]-1
            j = start-1
        return start

    def raw(self, a, b):
        return self.text[self.t[a][1]:self.t[b-1][2]] if a < b else ''

    def anchor(self, a, b):
        start = self.t[a][1]
        end = self.t[b-1][2]
        first = self.text.count('\n', 0, start)+1
        last = self.text.count('\n', 0, end)+1
        lines = self.text[start:end].splitlines()
        numbered = [dict(line=first+i, text=line) for i, line in enumerate(lines)]
        return dict(path=self.path, start_byte=len(self.text[:start].encode()), end_byte=len(self.text[:end].encode()),
                    start_line=first, end_line=last, sha256=sha(self.text[start:end].encode()),
                    excerpt=numbered if len(lines) <= 18 else numbered[:12]+numbered[-6:],
                    excerpt_truncated=len(lines)>18)

    def attrs(self, a, b):
        out = []
        while a+1 < b and self.t[a][0] == '#' and self.t[a+1][0] == '[':
            end = self.pairs[a+1]+1
            out.append(dict(text=self.raw(a, end), source=self.anchor(a, end)))
            a = end
        return out, a

    def split(self, a, b):
        out, start, angle = [], a, 0
        while a < b:
            v = self.t[a][0]
            if v in ('(', '[', '{'):
                a = self.pairs[a]+1
                continue
            if v == '<':
                angle += 1
            if v == '>':
                angle -= 1
            if v == ',' and angle == 0:
                if start < a:
                    out.append((start, a))
                start = a+1
            a += 1
        if start < b:
            out.append((start, b))
        return out

    def find_tokens(self, needle, a=0, b=None):
        values = [v for v, _, _ in self.t]
        nt = [m.group() for m in TOKEN.finditer(needle)]
        return [i for i in range(a, (len(values) if b is None else b)-len(nt)+1)
                if values[i:i+len(nt)] == nt]

    def arms(self):
        """All match arms, retaining real bodies; no references in matches! or declarations."""
        if self._arms is not None:
            return self._arms
        out = []
        for i, (v, _, _) in enumerate(self.t):
            if v != 'match':
                continue
            j = i+1
            while j < len(self.t) and self.t[j][0] not in ('{', ';'):
                if self.t[j][0] in ('(', '['):
                    j = self.pairs[j]
                j += 1
            if j == len(self.t) or self.t[j][0] != '{':
                continue
            stop = self.pairs[j]
            cur = j+1
            while cur < stop:
                if self.t[cur][0] == ',':
                    cur += 1
                    continue
                p, eq = cur, cur
                while eq < stop and self.t[eq][0] != '=>':
                    if self.t[eq][0] in ('(', '[', '{'):
                        eq = self.pairs[eq]
                    eq += 1
                if eq >= stop:
                    break
                end = eq+1
                # block-expression arms need no comma; match-expression arms end after their block.
                if self.t[end][0] == '{':
                    end = self.pairs[end]+1
                else:
                    while end < stop and self.t[end][0] != ',':
                        if self.t[end][0] in ('(', '[', '{'):
                            end = self.pairs[end]
                        end += 1
                out.append(dict(match=i, match_body=j, pattern=(p, eq), body=(eq+1, end), span=(p, end)))
                cur = end
        self._arms = out
        return out


def properties(attrs):
    """Keys only at immediate clap/arg/command level: strings cannot become skip/flatten."""
    result = {}
    for attribute in attrs:
        src = Source('attribute', attribute['text'])
        if len(src.t)<5 or src.t[2][0] not in ('clap','command','arg') or src.t[3][0]!='(':
            continue
        for a,b in src.split(4,src.pairs[3]):
            key = src.t[a][0]
            value = src.raw(a+2,b) if a+1<b and src.t[a+1][0]=='=' else True
            result.setdefault(key,[]).append(value)
    return result


def word_name(name):
    return re.sub(r'([a-z0-9])([A-Z])', r'\1-\2', re.sub(r'([A-Z]+)([A-Z][a-z])', r'\1-\2', name)).replace('_', '-').lower()


def literal(value):
    if isinstance(value,str) and value.startswith('"'):
        return json.loads(value)
    if isinstance(value,str) and value.startswith("'") and value.endswith("'"):
        return value[1:-1]
    return value


def meta(attrs, name):
    props = properties(attrs)
    explicit = props.get('name',[None])[-1]
    aliases = []
    for key in ('alias','visible_alias','aliases','visible_aliases'):
        for value in props.get(key,[]):
            aliases += [dict(name=literal(x),visible=key.startswith('visible')) for x in re.findall(r'"(?:\\.|[^"\\])*"',value)]
    return dict(cli_name=literal(explicit) if explicit else word_name(name),
                name_origin='literal' if explicit else 'clap default kebab-case (static derivation)',
                aliases=aliases,hidden=props.get('hide',[])==['true'],
                cfg=[a['text'] for a in attrs if re.match(r'#\[cfg(?:_attr)?\b',a['text'])])


def argument_meta(attrs,name,kind):
    props = properties(attrs)
    result = dict(properties=props)
    if kind=='arg':
        result.update(long=literal(props['long'][-1]) if 'long' in props and props['long'][-1] is not True else word_name(name) if 'long' in props else None,
                      short=literal(props['short'][-1]) if 'short' in props and props['short'][-1] is not True else name[0] if 'short' in props else None,
                      positional='long' not in props and 'short' not in props,
                      aliases=meta(attrs,name)['aliases'],hidden=meta(attrs,name)['hidden'])
    return result

class Builder:
    def __init__(self, upstream, overrides=None):
        self.upstream = upstream
        self.overrides = overrides or {}
        self.sources = {}
        self.types, self.variants, self.fields, self.edges = {}, [], [], []
        self.package_bindings = {}

    def source(self, path):
        if path not in self.sources:
            text = self.overrides[path] if path in self.overrides else (self.upstream/path).read_bytes().decode('utf-8')
            self.sources[path] = Source(path, text)
        return self.sources[path]

    def resolve(self, s, typename, trail=None):
        trail = [] if trail is None else trail
        typename = re.sub(r'\s+', '', typename)
        for wrapper in ['Option', 'Box']:
            if typename.startswith(wrapper+'<') and typename.endswith('>'):
                return self.resolve(s, typename[len(wrapper)+1:-1], trail)
        if typename in s.defs:
            return [(s, d, trail) for d in s.defs[typename]]
        # Simple imports are bound to exact source tokens and cannot pick nearest type globally.
        for m in re.finditer(r'(?m)^use\s+([\w:]+)(?:\s+as\s+(\w+))?\s*;', s.text):
            qualified, alias = m.groups()
            if typename == (alias or qualified.split('::')[-1]):
                hits = s.find_tokens(m.group())
                proof = trail+[s.anchor(hits[0], hits[0]+len(Source('import', m.group()).t))]
                return self.resolve(s, qualified, proof)
        if typename in EXTERNAL:
            crate, module, name = EXTERNAL[typename]
            manifest_path = f'codex-rs/{crate}/Cargo.toml'
            manifest_bytes = (self.upstream/manifest_path).read_bytes()
            package = tomllib.loads(manifest_bytes.decode())
            package_name = package['package']['name']
            crate_name = package.get('lib',{}).get('name',package_name.replace('-','_'))
            if typename.split('::')[0]!=crate_name:
                raise ValueError('curated crate identity mismatch '+typename)
            self.package_bindings[manifest_path] = dict(path=manifest_path,sha256=sha(manifest_bytes),bytes=len(manifest_bytes),rust_crate=crate_name,package_name=package_name)
            target = self.source(f'codex-rs/{crate}/src/{module}.rs')
            if module != 'lib' and len(typename.split('::')) == 2:
                lib = self.source(f'codex-rs/{crate}/src/lib.rs')
                hit = re.search(r'(?m)^pub use (?:crate::)?'+re.escape(module)+'::'+name+r';', lib.text)
                if not hit:
                    raise ValueError('unproved curated reexport '+typename)
                ts = lib.find_tokens(hit.group())[0]
                trail += [lib.anchor(ts, ts+len(Source('reexport', hit.group()).t))]
            if module!='lib' and len(typename.split('::'))>2:
                lib = self.source(f'codex-rs/{crate}/src/lib.rs')
                hits = lib.find_tokens('pub mod '+module+';')
                if not hits:
                    raise ValueError('unproved public module '+typename)
                trail += [lib.anchor(hits[0],hits[0]+4)]
            return [(target, d, trail) for d in target.defs.get(name, [])]
        # Same CLI binary module; main.rs's crate root is distinct from codex_cli lib.rs.
        parts = typename.split('::')
        if parts[0] == 'crate':
            parts = parts[1:]
            if len(parts)==1 and s.path.startswith('codex-rs/cli/src/'):
                root = self.source(MAIN)
                return [(root,d,trail) for d in root.defs.get(parts[0],[])]
        if len(parts) == 2 and s.path.startswith('codex-rs/cli/src/'):
            path = 'codex-rs/cli/src/'+parts[0]+'.rs'
            if (self.upstream/path).is_file():
                target = self.source(path)
                # Module declaration is source evidence, including module cfg.
                root = self.source(MAIN)
                pos = root.find_tokens('mod '+parts[0]+';')
                if pos:
                    a = root.before_attrs(pos[0])
                    trail += [root.anchor(a, pos[0]+3)]
                return [(target, d, trail) for d in target.defs.get(parts[1], [])]
        return []

    def edge(self, owner, relation, s, typename, anchor):
        targets = self.resolve(s, typename)
        e = dict(owner=owner, relation=relation, rust_type=typename, source=anchor, targets=[])
        for target, d, proof in targets:
            tid = self.add_type(target, d)
            e['targets'].append(dict(type=tid, resolution_sources=proof,
                                     cfg=self.types[tid]['cfg']))
        e['status'] = 'resolved-source' if targets else 'unresolved'
        if not targets:
            e['reason'] = 'Unsupported, dynamic, external or ambiguous reference; no guessed ownership.'
        self.edges.append(e)

    def add_fields(self, s, owner, a, b, derived, tuple_fields=False):
        for index, (start, end) in enumerate(s.split(a, b)):
            attrs, p = s.attrs(start, end)
            if s.t[p][0] == 'pub':
                p += 1
                if s.t[p][0] == '(':
                    p = s.pairs[p]+1
            if tuple_fields:
                name, ty_start = str(index), p
            else:
                name = s.t[p][0]
                if p+1 >= end or s.t[p+1][0] != ':':
                    raise ValueError(f'unparsed field {owner} {s.raw(start,end)}')
                ty_start = p+2
            typename = s.raw(ty_start, end)
            raw = '\n'.join(x['text'] for x in attrs)
            props = properties(attrs)
            kind = next((k for k in ['skip', 'flatten', 'subcommand'] if k in props), None)
            if not kind:
                kind = 'arg' if re.search(r'#\[(arg|clap)\b', raw) or derived else 'manual-data-field'
            fid = owner+'.'+name
            f = dict(id=fid, owner=owner, name=name, rust_type=typename, binding=kind,
                     attributes=attrs, argument=argument_meta(attrs,name,kind), cfg=meta(attrs,name)['cfg'], source=s.anchor(start,end))
            self.fields.append(f)
            if kind in ('flatten', 'subcommand'):
                self.edge(fid, kind, s, typename, f['source'])

    def add_type(self, s, d):
        tid = s.path+'::'+d['name']
        if len(s.defs[d['name']]) > 1:
            tid += '@'+str(s.t[d['keyword']][1])
        if tid in self.types:
            return tid
        attrs, _ = s.attrs(d['start'], d['keyword'])
        raw = '\n'.join(x['text'] for x in attrs)
        derive_names = ['Parser','Args','Subcommand']
        derive_names += re.findall(r'(?m)^use clap::(?:Args|Parser|Subcommand) as (\w+);', s.text)
        derived = bool(re.search(r'\b(?:'+ '|'.join(derive_names) +r')\b', raw))
        node = dict(id=tid, name=d['name'], kind=d['kind'], attributes=attrs,
                    cfg=meta(attrs,d['name'])['cfg'], clap_derive=derived,
                    source=s.anchor(d['start'], d['end']+1))
        self.types[tid] = node
        j, end = d['body'], d['end']
        if d['kind'] == 'type':
            self.edge(tid, 'conditional-type-alias', s, s.raw(j+1,end), node['source'])
        elif d['kind'] == 'struct':
            self.add_fields(s, tid, j+1, end, derived, s.t[j][0] == '(')
        elif d['kind'] == 'enum':
            for a,b in s.split(j+1,end):
                va, p = s.attrs(a,b)
                name = s.t[p][0]
                vid = tid+'::'+name
                v = dict(id=vid, owner=tid, rust_variant=name, attributes=va,
                         source=s.anchor(a,b), **meta(va,name))
                self.variants.append(v)
                if p+1 < b and s.t[p+1][0] == '(':
                    for x,y in s.split(p+2,s.pairs[p+1]):
                        self.edge(vid,'tuple-payload',s,s.raw(x,y),s.anchor(x,y))
                elif p+1 < b and s.t[p+1][0] == '{':
                    self.add_fields(s, vid, p+2, s.pairs[p+1], True)
                else:
                    v['payload'] = 'unit'
        if (s.path,d['name']) in MANUAL:
            target, needle, note = MANUAL[(s.path,d['name'])]
            hits = s.find_tokens(needle)
            if not hits:
                raise ValueError('manual adapter anchor missing '+tid)
            evidence = s.anchor(hits[0], hits[0]+len(list(TOKEN.finditer(needle))))
            adapter_sources = []
            for i,(value,_,_) in enumerate(s.t):
                if value not in ('impl','fn') or s.depths[i]!=0:
                    continue
                end = i+1
                while end<len(s.t) and s.t[end][0] not in ('{',';'):
                    end += 1
                header = s.raw(i,end)
                helpers = {'SessionTuiCli':[], 'ExecSharedCliOptions':['mark_exec_global_args'], 'TuiSharedCliOptions':['mark_tui_args'], 'ResumeArgs':[]}
                if re.search(r'\b'+d['name']+r'\b',header) or any(re.search(r'\b'+h+r'\b',header) for h in helpers[d['name']]):
                    adapter_sources.append(s.anchor(i,s.pairs[end]+1))
            node['manual_adapter_sources'] = adapter_sources
            self.edge(tid,'manual-Args-delegation',s,target,evidence)
            self.edges.append(dict(owner=tid, relation='dynamic-effective-clap-schema', targets=[], status='unresolved',
                                   reason=note+'; no macro expansion/effective schema execution.', source=evidence, adapter_sources=adapter_sources))
        return tid

    def build(self):
        s = self.source(MAIN)
        root_cli = self.add_type(s, s.defs['MultitoolCli'][0])
        root_enum = MAIN+'::Subcommand'
        roots = [v for v in self.variants if v['owner'] == root_enum]
        names = {v['rust_variant'] for v in roots}
        if names != set(CALLS):
            raise ValueError('root inventory mismatch: '+str(sorted(names ^ set(CALLS))))
        arms = s.arms()
        # Actual dispatch is the match whose first pattern is None | Some(Subcommand::Agents(_)).
        candidates = [a for a in arms if s.raw(*a['pattern']).startswith('None | Some(Subcommand::Agents(_)')]
        if len(candidates) != 1:
            raise ValueError('actual root dispatch not uniquely found')
        match_id = candidates[0]['match']
        dispatch_arms = [a for a in arms if a['match'] == match_id]
        for root in roots:
            variant = root['rust_variant']
            found = [a for a in dispatch_arms if re.search(r'(?<![\w:])Subcommand::'+variant+r'\b', s.raw(*a['pattern']))]
            if len(found) != 1:
                raise ValueError('missing/ambiguous real root dispatch '+variant)
            arm = found[0]
            targets = []
            for call in CALLS[variant]:
                hits = s.find_tokens(call+'(', *arm['body'])
                if not hits:
                    raise ValueError('missing real call '+variant+':'+call)
                n = len(list(TOKEN.finditer(call+'(')))
                targets.append(dict(call=call, source=s.anchor(hits[0], s.pairs[hits[0]+n-1]+1)))
            root['dispatch'] = dict(status='resolved-source', pattern=s.raw(*arm['pattern']),
                                    source=s.anchor(*arm['span']), calls=targets)
        nested = [v for v in self.variants if v['owner'] != root_enum]
        # For nested enums retain body-bearing match arms; do not confuse matches! references or type declarations with dispatch.
        runtime_paths = list(self.sources)
        runtime_paths += ['codex-rs/exec/src/lib.rs','codex-rs/cloud-tasks/src/lib.rs']
        for path in dict.fromkeys(runtime_paths):
            self.source(path)
        for v in nested:
            enum = self.types[v['owner']]['name']
            path = self.types[v['owner']]['source']['path']
            search_sources = [self.source(path)]
            if path != MAIN and path.startswith('codex-rs/cli/src/'):
                search_sources.append(s)
            elif path.endswith('/cli.rs'):
                search_sources.append(self.source(path.replace('/cli.rs','/lib.rs')))
            refs = []
            for src in dict.fromkeys(search_sources):
                for arm in src.arms():
                    pattern = src.raw(*arm['pattern'])
                    labels = [enum]
                    labels += re.findall(r'(?m)^use (?:crate::)?cli::'+re.escape(enum)+r' as (\w+);', src.text)
                    if any(re.search(r'(?<![\w])'+re.escape(label)+'::'+v['rust_variant']+r'\b', pattern) for label in labels):
                        refs.append(dict(pattern=pattern, source=src.anchor(*arm['span'])))
            if enum=='SandboxSubcommand' and v['rust_variant']=='Uninstall':
                hits = s.find_tokens('if let Some(SandboxSubcommand::Uninstall(command)) = subcommand')
                for h in hits:
                    block = h+len(list(TOKEN.finditer('if let Some(SandboxSubcommand::Uninstall(command)) = subcommand')))
                    refs.append(dict(pattern='if let Some(SandboxSubcommand::Uninstall(command)) = subcommand',source=s.anchor(h,s.pairs[block]+1)))
            v['dispatch'] = dict(status='source-arm-candidates' if refs else 'unresolved', candidates=refs)
            if not refs:
                v['dispatch']['reason'] = 'No qualified body-bearing match arm in bounded owner/main/library search; if-let, Self, aliases or indirect dispatch may require curated resolution.'
        default = candidates[0]
        default_branch = dict(pattern=s.raw(*default['pattern']), source=s.anchor(*default['span']),
                              note='None shares Agents root dispatch to run_interactive_tui; selection guards/config transformations are source only.')
        setup_hits = s.find_tokens('sandbox_setup::parse_setup_command(')
        dynamic = dict(status='unresolved', owner=MAIN+'::SandboxCommand', source=s.anchor(setup_hits[0],s.pairs[setup_hits[0]+3]+1),
                       reason='Windows sandbox setup is detected from host trailing command vector, not a SandboxSubcommand variant; dynamic command grammar outside derived tree.')
        sources = [dict(path=p,sha256=sha(src.text.encode()),bytes=len(src.text.encode())) for p,src in sorted(self.sources.items())]
        sources += [{k:v for k,v in m.items() if k in ('path','sha256','bytes')} for m in self.package_bindings.values()]
        sources.sort(key=lambda x:x['path'])
        graph = dict(schema='cvg.cli-source-graph.v1', task='DX100-G01:CLI-ENTRYPOINT-GRAPH', status='IMPLEMENTED',
                     contract_sha256=CONTRACT_SHA, pin=PIN, upstream=str(self.upstream),
                     root_cli=root_cli, root_enum=root_enum, default_dispatch=default_branch, dynamic_entries=[dynamic],
                     package_bindings=sorted(self.package_bindings.values(),key=lambda n:n['path']),
                     types=sorted(self.types.values(),key=lambda n:n['id']),
                     variants=sorted(self.variants,key=lambda n:n['id']), fields=sorted(self.fields,key=lambda n:n['id']),
                     edges=sorted(self.edges,key=lambda n:(n['owner'],n['relation'])), sources=sources, limitations=LIMITS)
        graph['counts'] = dict(root_variants=len(roots),root_dispatch_resolved=len(roots),types=len(self.types),
                               nested_variants=len(nested),fields=len(self.fields),edges=len(self.edges),sources=len(sources),
                               unresolved_edges=sum(e['status']=='unresolved' for e in self.edges),
                               nested_dispatch_unresolved=sum(v['dispatch']['status']=='unresolved' for v in nested),
                               dynamic_entries_unresolved=1)
        return graph


def semantic_signature(g):
    """Ignore hashes/excerpts: negative controls must trip semantics, not merely source hashing."""
    return {v['rust_variant']: {k:v[k] for k in ['cli_name','aliases','hidden','cfg','dispatch'] if k != 'dispatch'} |
            {'dispatch_calls':[c['call'] for c in v['dispatch']['calls']]}
            for v in g['variants'] if v['owner']==g['root_enum']}


def verify_graph(graph, expected):
    if graph != expected:
        raise ValueError('graph differs from static regeneration (source/semantic/ownership binding)')
    ids = {n['id'] for k in ('types','variants','fields') for n in graph[k]}
    for f in graph['fields']:
        if f['owner'] not in ids:
            raise ValueError('orphan field '+f['id'])
    for e in graph['edges']:
        if e['owner'] not in ids or any(t['type'] not in ids for t in e['targets']):
            raise ValueError('orphan graph edge')
    if len(ids)!=sum(len(graph[k]) for k in ('types','variants','fields')):
        raise ValueError('duplicate node ID')
    fields = {f['id']:f for f in graph['fields']}
    invariant_fields = {
      MAIN+'::ReviewCommand.args': ('flatten',MAIN+'::ReviewCommand'),
      MAIN+'::LoginCommand.config_overrides': ('skip',MAIN+'::LoginCommand'),
      MAIN+'::AppServerDaemonSubcommand::Update.from_cli': ('arg',MAIN+'::AppServerDaemonSubcommand::Update'),
      'codex-rs/exec/src/cli.rs::Cli.skip_git_repo_check': ('arg','codex-rs/exec/src/cli.rs::Cli'),
      'codex-rs/tui/src/cli.rs::Cli.config_overrides': ('skip','codex-rs/tui/src/cli.rs::Cli'),
      'codex-rs/exec/src/cli.rs::ResumeArgs.session_id': ('manual-data-field','codex-rs/exec/src/cli.rs::ResumeArgs'),
    }
    for fid,(binding,owner) in invariant_fields.items():
        if fields[fid]['binding']!=binding or fields[fid]['owner']!=owner:
            raise ValueError('frozen field ownership/binding regression '+fid)
    review_edges = [e for e in graph['edges'] if e['owner']==MAIN+'::ReviewCommand.args']
    if [t['type'] for e in review_edges for t in e['targets']]!=['codex-rs/exec/src/cli.rs::ReviewArgs']:
        raise ValueError('imported ReviewArgs binding regression')
    host_aliases = [t for t in graph['types'] if t['name']=='HostSandboxArgs']
    if len(host_aliases)!=4 or any(not t['cfg'] for t in host_aliases):
        raise ValueError('conditional host alias regression')
    roots = [v for v in graph['variants'] if v['owner']==graph['root_enum']]
    if len(roots)!=30 or any(v['dispatch']['status']!='resolved-source' for v in roots):
        raise ValueError('root dispatch coverage invalid')


def known_bad(upstream, baseline):
    text = (upstream/MAIN).read_text()
    mutations = {
      'root-removal': ('    Update,\n', ''),
      'alias-loss': ('#[clap(visible_alias = "e")]', '#[clap()]'),
      'cfg-loss': ('    #[cfg(any(target_os = "macos", target_os = "windows"))]\n    App(app_cmd::AppCommand),', '    App(app_cmd::AppCommand),'),
      'dispatch-loss': ('Some(Subcommand::Exec(mut exec_cli)) =>', 'Some(Subcommand::RemovedExec(mut exec_cli)) =>'),
    }
    results = []
    for name,(old,new) in mutations.items():
        if text.count(old)!=1:
            raise ValueError('negative mutation must be unique '+name)
        try:
            altered = Builder(upstream,{MAIN:text.replace(old,new,1)}).build()
            rejected = semantic_signature(altered)!=semantic_signature(baseline)
            reason = 'root semantic signature changed (hash-independent)'
        except ValueError as exc:
            rejected,reason=True,str(exc)
        if not rejected:
            raise ValueError('known-bad escaped '+name)
        results.append(dict(control=name,result='REJECTED',reason=reason,in_memory_only=True))
    # Tamper graph independently of source parser; ownership and missing dispatch must fail too.
    for name,mutate in [
      ('artifact-root-removal',lambda g:g['variants'].remove(next(v for v in g['variants'] if v['owner']==g['root_enum']))),
      ('artifact-dispatch-loss',lambda g:next(v for v in g['variants'] if v['owner']==g['root_enum']).pop('dispatch')),
      ('artifact-owner-swap',lambda g:g['fields'][0].update(owner='wrong-owner'))]:
        damaged = copy.deepcopy(baseline)
        mutate(damaged)
        try:
            verify_graph(damaged,baseline)
        except ValueError:
            results.append(dict(control=name,result='REJECTED',in_memory_only=True))
        else:
            raise ValueError('known-bad escaped '+name)
    return results


def verify_bindings(graph,upstream):
    raw = {s['path']:(upstream/s['path']).read_bytes() for s in graph['sources']}
    seen = set()
    def visit(obj):
        if isinstance(obj,dict):
            if {'path','start_byte','end_byte','sha256','excerpt'} <= obj.keys():
                key = (obj['path'],obj['start_byte'],obj['end_byte'])
                if key not in seen:
                    data = raw[obj['path']]
                    piece = data[obj['start_byte']:obj['end_byte']]
                    first = data[:obj['start_byte']].count(b'\n')+1
                    last = data[:obj['end_byte']].count(b'\n')+1
                    lines = piece.decode().splitlines()
                    if sha(piece)!=obj['sha256'] or first!=obj['start_line'] or last!=obj['end_line']:
                        raise ValueError('source excerpt binding drift '+str(key))
                    full = [dict(line=first+i,text=line) for i,line in enumerate(lines)]
                    excerpt = full if len(full)<=18 else full[:12]+full[-6:]
                    if obj['excerpt']!=excerpt or obj['excerpt_truncated']!=(len(full)>18):
                        raise ValueError('source excerpt text drift '+str(key))
                    seen.add(key)
            for v in obj.values():
                visit(v)
        elif isinstance(obj,list):
            for v in obj:
                visit(v)
    visit(graph)
    tree = json.loads((HERE/'pin-tree.json').read_text())
    if tree['pin']!=PIN or set(raw)!={b['path'] for b in tree['blobs']}:
        raise ValueError('pin tree source inventory mismatch')
    for blob in tree['blobs']:
        data = raw[blob['path']]
        oid = hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()
        if oid!=blob['oid']:
            raise ValueError('source differs from pinned Git blob '+blob['path'])
    return len(seen)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check',action='store_true',help='read-only regeneration/integrity and negative controls')
    parser.add_argument('--upstream',type=Path,default=Path('/tmp/cvg-rea-codex-20261017/upstream'))
    args = parser.parse_args()
    if sha(CONTRACT.read_bytes())!=CONTRACT_SHA:
        raise ValueError('frozen contract drift')
    contract = json.loads(CONTRACT.read_text())
    if contract['pin']!=PIN:
        raise ValueError('pin mismatch')
    upstream = args.upstream.resolve()
    # .git HEAD is only a metadata check; source file digests below bind actual inputs.
    head_path = upstream/'.git/HEAD'
    head = head_path.read_text().strip()
    if head.startswith('ref: '):
        head = (upstream/'.git'/head[5:]).read_text().strip()
    if head!=PIN:
        raise ValueError('upstream HEAD is not frozen pin')
    graph = Builder(upstream).build()
    verify_graph(graph,graph)
    bound_excerpts = verify_bindings(graph,upstream)
    negatives = known_bad(upstream,graph)
    checks = dict(schema='cvg.cli-source-checks.v1',status='IMPLEMENTED',contract_sha256=CONTRACT_SHA,
                  bound_excerpts=bound_excerpts, checks=[dict(name=n,result='PASS') for n in ['pinned-source-blobs','frozen-contract','pinned-HEAD','source-graph-regeneration','all-root-real-dispatch','field-owner-references','frozen-owner-shape-regressions','bounded-source-bindings']],
                  known_bad=negatives,counts=graph['counts'],not_run=['target execution','application tests','runtime qualification','independent review (Lead-owned)'])
    if args.check:
        verify_graph(json.loads((HERE/'graph.json').read_text()),graph)
        if json.loads((HERE/'checks.json').read_text())!=checks:
            raise ValueError('check report drift')
        manifest = json.loads((HERE/'manifest.json').read_text())
        if manifest['contract_sha256']!=CONTRACT_SHA or manifest['sources']!=graph['sources'] or manifest['pin']!=PIN or manifest['counts']!=graph['counts'] or manifest['status']!='IMPLEMENTED':
            raise ValueError('manifest source/contract drift')
        files = {p.name for p in HERE.iterdir() if p.is_file() and p.name!='manifest.json'}
        if files!={a['path'] for a in manifest['artifacts']}:
            raise ValueError('manifest artifact inventory drift')
        for entry in manifest['artifacts']:
            if sha((HERE/entry['path']).read_bytes())!=entry['sha256'] or (HERE/entry['path']).stat().st_size!=entry['bytes']:
                raise ValueError('manifest artifact drift '+entry['path'])
        print(dump(dict(result='PASS_STATIC_ONLY',counts=graph['counts'],negative_controls=len(negatives),manifest_sha256=sha((HERE/'manifest.json').read_bytes()))),end='')
    else:
        (HERE/'graph.json').write_text(dump(graph))
        (HERE/'checks.json').write_text(dump(checks))
        artifacts = [dict(path=p.name,sha256=sha(p.read_bytes()),bytes=p.stat().st_size) for p in sorted(HERE.iterdir()) if p.is_file() and p.name!='manifest.json']
        manifest = dict(schema='cvg.cli-source-manifest.v1',task=contract['task'],status='IMPLEMENTED',
                        contract_sha256=CONTRACT_SHA,pin=PIN,counts=graph['counts'],artifacts=artifacts,sources=graph['sources'],
                        validity='Static evidence only. Lead integrates, reviews and owns ledgers/claims; no G01 closure or approval.')
        (HERE/'manifest.json').write_text(dump(manifest))
        print(dump(graph['counts']),end='')

if __name__=='__main__':
    try:
        main()
    except (ValueError,KeyError,IndexError,OSError) as exc:
        print('FAIL: '+str(exc),file=sys.stderr)
        sys.exit(1)
