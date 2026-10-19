#!/usr/bin/env python3
"""Offline, stdlib-only lexical evidence reader. Never imports or executes the target.

Only Git plumbing is executed. Rust is tokenized, not parsed/expanded/compiled.
No other audit helper is imported. Byte ranges are half-open UTF-8 ranges.
"""
import argparse
import bisect
import copy
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[6]
E = HERE.parents[2]
UPSTREAM = Path('/tmp/cvg-rea-codex-20261017/upstream')
PIN = '8d9f6466ff0294785d56f55b1fe363d132fe4133'
PARENT_SHA = '710377abb6a48e79df476cc2dac089a12be702f3104e7d79cc3494d083074fb4'
OWNER = 'DX100-U01'
TASK = 'DX100-G01:TUI-KEYMAP-VIEW-SURFACES'
TUI = 'codex-rs/tui/src/'
CONFIG = 'codex-rs/config/src/tui_keymap.rs'
CATALOG = 'docs/03_build/tracking/codex100_catalog_v1.json'

# Discovery selectors are scope hints, never production/test exclusion rules.
# All matched tracked .rs files, including tests, are retained.
FAMILIES = {
    'keymap': ('keymap', 'key_hint', 'key_binding', 'bottom_pane/textarea'),
    'panes': ('bottom_pane/', 'config_panel', 'keymap_setup/', 'app/agents_overview'),
    'composer': ('bottom_pane/chat_composer', 'bottom_pane/textarea', 'bottom_pane/footer', 'bottom_pane/mod.rs'),
    'mentions': ('bottom_pane/mentions', 'bottom_pane/file_search', 'bottom_pane/skill', 'bottom_pane/plugin', 'bottom_pane/connector', 'mention_codec', 'task_mentions', 'file_search', 'chatwidget/image_submission'),
    'paste': ('bottom_pane/paste', 'clipboard_', 'bottom_pane/chat_composer'),
    'selection': ('text_selection', 'rendered_selection', 'tui/selection', 'footer_selection'),
    'terminal': ('tui.rs', 'tui/', 'terminal_', 'custom_terminal', 'transcript_mode', 'inline_mode', 'raw_output'),
    'render': ('render/', 'markdown', 'streaming/', 'history_cell', 'insert_history', 'transcript_', 'pager_overlay', 'thread_transcript', 'exec_cell', 'app/history_ui', 'app/owned_transcript', 'app/render', 'app/transcript'),
    'status_theme': ('status', 'terminal_title', 'terminal_palette', 'terminal_program_status', 'theme_', 'render/highlight', 'render/model_themes', 'bottom_pane/status', 'bottom_pane/title', 'bottom_pane/effort_status'),
    'export_recap': ('chatwidget/transcript_export', 'chatwidget/recap', 'chatwidget/tests/copy_export', 'app/recap', 'app/transcript_export', 'clipboard_copy', 'thread_transcript'),
    'agents_side': ('multi_agents', 'agent', 'multi_agent', 'side_', 'app/agent', 'app/side', 'chatwidget/agent', 'chatwidget/side'),
    'accessibility_stream': ('screen_reader', 'motion', 'bottom_pane/chat_composer', 'streaming/', 'transcript_view', 'thread_transcript', 'pager_overlay/transcript', 'chatwidget/stream', 'chatwidget/transcript', 'startup_draft', 'app/owned_transcript'),
    'media': ('transcript_image', 'image', 'audio', 'voice', 'chatwidget/image', 'chatwidget/realtime', 'realtime', 'pets/image_protocol'),
    'integration_roots': ('lib.rs', 'app.rs', 'chatwidget.rs'),
}
REQUIREMENTS = {
    'CDX100-17-01': ['panes', 'composer', 'keymap'],
    'CDX100-17-02': ['mentions', 'paste', 'composer', 'media'],
    'CDX100-17-03': ['terminal', 'render', 'selection'],
    'CDX100-17-04': ['keymap', 'paste', 'selection'],
    'CDX100-17-05': ['status_theme'],
    'CDX100-17-06': ['export_recap', 'selection'],
    'CDX100-17-07': ['agents_side', 'panes'],
    'CDX100-17-09': ['accessibility_stream', 'composer', 'render'],
}
ANCHORS = {
    'CDX100-17-01': [('bottom_pane/chat_composer.rs','prepare_inline_args_submission'),('bottom_pane/chat_composer.rs','sync_command_popup'),('bottom_pane/mod.rs','show_selection_view')],
    'CDX100-17-02': [('bottom_pane/chat_composer.rs','handle_key_event_with_file_popup'),('bottom_pane/chat_composer.rs','set_mentions_v2_enabled'),('bottom_pane/chat_composer.rs','handle_paste_image_path'),('bottom_pane/chat_composer.rs','flush_paste_burst_if_due')],
    'CDX100-17-03': [('tui.rs','set_modes'),('tui.rs','restore'),('tui.rs','set_owned_screen'),('transcript_mode.rs','resolve'),('pager_overlay/transcript.rs','sync_live_tail')],
    'CDX100-17-04': [('keymap.rs','from_config'),('keymap.rs','built_in_defaults'),('keymap.rs','resolve_bindings_with_global_fallback'),('keymap.rs','validate_conflicts'),('keymap/chords.rs','validate_chord_conflicts'),('clipboard_copy.rs','copy_to_clipboard')],
    'CDX100-17-05': [('status/card.rs','new_status_output'),('terminal_title.rs','set_terminal_title'),('theme_picker.rs','build_theme_picker_params')],
    'CDX100-17-06': [('chatwidget/transcript_export.rs','show_transcript_export_popup'),('app/transcript_export.rs','export_transcript'),('app/transcript_export.rs','write_transcript'),('chatwidget/recap.rs','show_recap_loading')],
    'CDX100-17-07': [('app/agents_overview_view.rs','handle_key_event'),('app/agents_overview_view.rs','activate'),('app/side.rs','toggle_side_conversation'),('multi_agents.rs','previous_agent_shortcut_matches')],
    'CDX100-17-09': [('screen_reader.rs','initialize'),('bottom_pane/chat_composer.rs','set_task_running'),('bottom_pane/chat_composer.rs','current_text_with_pending'),('chatwidget.rs','has_active_agent_stream'),('pager_overlay/transcript.rs','sync_live_tail')],
}
ENTRY = re.compile(r'new|default|init|config|key|input|paste|submit|queue|parse|valid|resolv|normaliz|render|draw|display|history|stream|tail|transcript|select|mention|search|popup|show|hide|push|pop|view|pane|complete|dismiss|cancel|interrupt|flush|tick|update|resize|scroll|raw|owned|screen|restore|handoff|drop|copy|export|recap|agent|side|image|audio|voice|status|theme|title|motion|animation|cursor|draft|text|binding|chord|leader|vim|frame|event|handle|activate|enabled|focus')
LIMITS = [
    'Lexical declarations/reference/consumerCandidate are not runtime reachability or a compiled module graph.',
    'Macro expansion, effective key matching, dynamic/generic dispatch, aliases and evaluated CFG remain OPEN.',
    'File names containing tests are hints only; cfg/test attributes and lexical ancestors are evidence, incoming module CFG remains OPEN pending Lead scope join.',
    'Selected source families and entry/lifecycle methods are bounded; widget bodies are not a complete callgraph. Unselected paths remain in readonly recon, not discarded.',
    'Terminal/platform/clipboard/media/renderer/provider effects and accessibility are NOT_RUN; source does not establish useful outcomes.',
    '65 SlashCommand dispatch and 291 AppEvent census belong to other lanes; named references here are join candidates only.',
    'Native full goal, catalog 487+22 NOT_RUN, six SDK gaps, five external/runtime dependency limits and mandatory G02/G03/G04 remain OPEN.',
    'Zero functional receipts, no full G01 closure, no parity/release grant, no autoapproval; independent critic pending.',
]
RAW_STRING = re.compile(r'(?:br|cr|r)(#*)"')
CHAR = re.compile(r"(?:b)?'(?:\\(?:u\{[0-9a-fA-F_]+\}|x[0-9a-fA-F]{2}|.)|[^'\\\n])'")
RAW_IDENT = re.compile(r'r#[A-Za-z_]\w*')


def sha(data):
    return hashlib.sha256(data).hexdigest()


def encode(obj):
    return (json.dumps(obj, ensure_ascii=False, sort_keys=True, indent=2) + '\n').encode()


def git(*args):
    return subprocess.run(['git', '-C', str(UPSTREAM), *args], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE).stdout


def load(path):
    return json.loads(path.read_bytes())


def sid(prefix, *parts):
    return prefix + ':' + sha('\0'.join(map(str, parts)).encode())[:24]


def tokens(text):
    """Rust lexical scanner: nested comments, raw/normal strings, chars/lifetimes.

    Returns (spelling,start-character,end-character). Strings are single tokens;
    comments are skipped. Unknown punctuation remains a token, never excluded.
    """
    result = []
    i = 0
    while i < len(text):
        start = i
        if text[i].isspace():
            i += 1
            continue
        if text.startswith('//', i):
            end = text.find('\n', i)
            i = len(text) if end < 0 else end
            continue
        if text.startswith('/*', i):
            i += 2
            depth = 1
            while i < len(text) and depth:
                if text.startswith('/*', i):
                    depth += 1
                    i += 2
                elif text.startswith('*/', i):
                    depth -= 1
                    i += 2
                else:
                    i += 1
            if depth:
                raise ValueError('unclosed Rust comment')
            continue
        raw = RAW_STRING.match(text,i)
        if raw:
            close = '"' + raw[1]
            end = text.find(close, raw.end())
            if end < 0:
                raise ValueError('unclosed Rust raw string')
            i = end + len(close)
        elif text[i] == '"' or (text[i:i+2] in ('b"', 'c"')):
            i += 2 if text[i] != '"' else 1
            while i < len(text):
                if text[i] == '\\':
                    i += 2
                elif text[i] == '"':
                    i += 1
                    break
                else:
                    i += 1
        elif CHAR.match(text,i):
            i = CHAR.match(text,i).end()
        elif RAW_IDENT.match(text,i):
            i = RAW_IDENT.match(text,i).end()
        elif text[i].isalpha() or text[i] == '_':
            i += 1
            while i < len(text) and (text[i].isalnum() or text[i] == '_'):
                i += 1
        else:
            i += 1
        result.append((text[start:i], start, i))
    return result


def pairs(ts):
    stack, out = [], {}
    for i, (s, _, _) in enumerate(ts):
        if s in ('(', '[', '{'):
            stack.append((s, i))
        elif s in (')', ']', '}'):
            if not stack or stack[-1][0] != {')': '(', ']': '[', '}': '{'}[s]:
                raise ValueError('unbalanced Rust delimiter')
            _, j = stack.pop()
            out[j], out[i] = i, j
    if stack:
        raise ValueError('unclosed Rust delimiter')
    return out


class Source:
    def __init__(self, path, data, blob):
        self.path, self.data, self.blob = path, data, blob
        self.file_sha256 = sha(data)
        self.text = data.decode('utf-8', errors='strict')
        self.offsets = [0]
        for c in self.text:
            self.offsets.append(self.offsets[-1] + len(c.encode('utf-8')))
        self.lines = [-1] + [m.start() for m in re.finditer('\n', self.text)]
        self.ts = tokens(self.text)
        self.ps = pairs(self.ts)
        self.records = {}

    def span(self, a, b):
        x, y = self.offsets[a], self.offsets[b]
        key = sid('span', self.path, x, y)
        self.records[key] = dict(id=key, path=self.path, git_blob=self.blob,
                                 file_sha256=self.file_sha256, start_byte=x,
                                 end_byte_exclusive=y, start_line=bisect.bisect_left(self.lines, a),
                                 end_line=bisect.bisect_left(self.lines, max(a, b-1)),
                                 sha256=sha(self.data[x:y]), text=self.text[a:b])
        return key

    def token_span(self, a, b):
        return self.span(self.ts[a][1], self.ts[b-1][2])

    def attributes(self, i):
        # Strip visibility/modifier tokens, then adjacent outer attributes.
        k = i
        while k > 0:
            if self.ts[k-1][0] in ('pub', 'async', 'unsafe', 'default', 'const', 'extern'):
                k -= 1
            elif self.ts[k-1][0] == ')' and self.ps.get(k-1, 0) > 0 and self.ts[self.ps[k-1]-1][0] == 'pub':
                k = self.ps[k-1]-1
            else:
                break
        result = []
        while k > 1 and self.ts[k-1][0] == ']':
            start = self.ps[k-1]
            if self.ts[start-1][0] != '#':
                break
            result.append(self.token_span(start-1, k))
            k = start-1
        return list(reversed(result))

    def items(self):
        result = []
        for i, (s, _, _) in enumerate(self.ts):
            if s not in ('fn', 'impl', 'trait', 'struct', 'enum', 'mod', 'macro_rules'):
                continue
            if s == 'fn' and (i+1 >= len(self.ts) or not re.fullmatch(r'(?:r#)?[A-Za-z_]\w*', self.ts[i+1][0])):
                continue  # fn type, not declaration
            j = i+1
            while j < len(self.ts):
                if self.ts[j][0] in ('{', ';'):
                    break
                if self.ts[j][0] in ('(', '['):
                    j = self.ps[j]+1
                else:
                    j += 1
            if j >= len(self.ts):
                continue
            end = self.ps[j]+1 if self.ts[j][0] == '{' else j+1
            name = self.ts[i+2][0] if s == 'macro_rules' else self.ts[i+1][0]
            header = self.text[self.ts[i][1]:self.ts[j][1]].strip()
            if s == 'impl':
                name = header
            result.append(dict(kind=s, name=name, begin=i, body=j, end=end,
                               attrs=self.attributes(i), header=header))
        return result


def macro_calls(src, name):
    out = []
    for i, t in enumerate(src.ts[:-2]):
        if t[0] == name and src.ts[i+1][0] == '!' and src.ts[i+2][0] in ('{', '[', '('):
            j = src.ps[i+2]
            out.append((i, i+3, j, src.token_span(i, j+1)))
    return out


def parse_action_catalog(src):
    out, unknown = [], []
    for _, start, end, ref in macro_calls(src, 'define_keymap_actions'):
        i = start
        while i < end:
            if i+2 >= end or not src.ts[i+1][0].startswith('"') or src.ts[i+2][0] != '{':
                unknown.append(src.token_span(i, end)); break
            context, label = src.ts[i][0], src.ts[i+1][0]
            stop = src.ps[i+2]
            j = i+3
            while j < stop:
                first, action = j, src.ts[j][0]
                j += 1
                feature = None
                if src.ts[j][0] == '[':
                    feature = src.text[src.ts[j][1]:src.ts[src.ps[j]][2]]
                    j = src.ps[j]+1
                if [t[0] for t in src.ts[j:j+2]] != ['=', '>'] or not src.ts[j+2][0].startswith('"'):
                    unknown.append(src.token_span(first, stop)); break
                description = src.ts[j+2][0]
                j += 3
                if j < stop and src.ts[j][0] == ',': j += 1
                out.append(dict(id='action:'+context+'.'+action, context=context,
                                context_label_literal=label, action=action,
                                feature_literal=feature, description_literal=description,
                                source=src.token_span(first, j), macro_source=ref,
                                classification='declaration', effective_availability='OPEN'))
            i = stop+1
    return out, unknown


def parse_runtime_bindings(src):
    out, unknown = [], []
    for _, start, end, ref in macro_calls(src, 'define_runtime_action_bindings'):
        i = start
        while i < end:
            first = i
            # context literal => Context, runtime_group, config_group [actions]
            if i+9 >= end or [t[0] for t in src.ts[i+1:i+3]] != ['=', '>'] or src.ts[i+8][0] != '[':
                unknown.append(src.token_span(i, end)); break
            context, context_id, group, config_group = [src.ts[k][0] for k in (i,i+3,i+5,i+7)]
            stop = src.ps[i+8]
            j = i+9
            while j < stop:
                begin, action = j, src.ts[j][0]
                j += 1
                modifier = None
                if [t[0] for t in src.ts[j:j+2]] == ['=', '>']:
                    modifier = src.ts[j+2][0]; j += 3
                if j < stop and src.ts[j][0] == ',': j += 1
                plain_context = json.loads(context)
                out.append(dict(id='runtime-action:'+plain_context+'.'+action,
                                action_join_id='action:'+plain_context+'.'+action,
                                context=plain_context, context_id=context_id,
                                runtime_group=group, config_group=config_group,
                                action=action, modifier=modifier,
                                source=src.token_span(begin,j), group_source=src.token_span(first,stop+1),
                                macro_source=ref, classification='declaration', reachability='OPEN'))
            i = stop+1
            if i < end and src.ts[i][0] == ',': i += 1
    return out, unknown


def local_context(src, item, items):
    containers = [x for x in items if x is not item and x['begin'] < item['begin'] < x['end'] and x['end'] >= item['end']]
    contexts = [dict(kind=x['kind'], header=x['header'], attributes=x['attrs'],
                     source=src.token_span(x['begin'],x['body']+1)) for x in containers]
    attrs = item['attrs'] + [r for x in containers for r in x['attrs']]
    texts = [src.records[r]['text'] for r in attrs]
    test = any(re.fullmatch(r'#\[\s*(?:(?:tokio|test_case)\s*::\s*)?test(?:\s*\([^]]*\))?\s*\]',t) or re.fullmatch(r'#\[\s*cfg\s*\(\s*test\s*\)\s*\]',t) for t in texts)
    test_expression=any(re.search(r'\btest\b',t) for t in texts)
    return dict(lexical_ancestors=contexts, attributes=item['attrs'],
                disposition='explicit_test_or_test_cfg_candidate' if test else ('test_cfg_expression_unresolved' if test_expression else 'declaration_cfg_inheritance_OPEN'),
                inherited_module_cfg='OPEN_JOIN_LEAD_SCOPE', filename_test_hint=bool(re.search('test',src.path)))


def read_inputs():
    if sha((HERE.parent/'contract.json').read_bytes()) != PARENT_SHA:
        raise ValueError('parent contract drift')
    vc = load(HERE.parent/'views-contract.json')
    if vc['parent_contract_sha256'] != PARENT_SHA or vc['pin'] != PIN:
        raise ValueError('views contract identity mismatch')
    pc = load(HERE.parent/'contract.json')
    refs = []
    for row in pc['inputs']:
        data = (E/row['path']).read_bytes()
        if sha(data) != row['sha256']: raise ValueError('parent input drift: '+row['path'])
        refs.append(dict(path=row['path'],sha256=sha(data)))
    for path in [HERE.parent/'contract.json', HERE.parent/'views-contract.json', ROOT/CATALOG,
                 E/'g01/component-surfaces/integration.json',E/'g01/exec-transitive/integration.json']:
        refs.append(dict(path=str(path.relative_to(ROOT)),sha256=sha(path.read_bytes())))
    cat = load(ROOT/CATALOG)
    if cat['functional_denominator'] != 487 or cat['mandatory_cvg_controls'] != 22:
        raise ValueError('catalog denominator changed')
    req = [r for r in cat['requirements'] if r['owner']==OWNER and r['kind']=='FUNCTIONAL_PARITY']
    if sorted(r['id'] for r in req) != sorted(REQUIREMENTS): raise ValueError('U01 owners changed')
    if any(r['status']!='NOT_RUN' for r in cat['requirements']): raise ValueError('catalog qualification drift')
    return refs, cat, req


def collect():
    if git('rev-parse','HEAD').decode().strip()!=PIN: raise ValueError('upstream pin drift')
    entries = {}
    for row in git('ls-tree','-r','-z',PIN).split(b'\0'):
        if row:
            meta, path = row.split(b'\t',1)
            entries[path.decode()] = meta.decode().split()[2]
    recon = load(E/'next-tui-interactions-recon.json')
    all_tui = sorted(p for p in entries if p.startswith(TUI) and p.endswith('.rs'))
    if all_tui != sorted(recon['all_tui_rs_paths']) or len(all_tui)!=1131:
        raise ValueError('readonly recon mismatch')
    chosen = {}
    for path in all_tui:
        relative = path[len(TUI):]
        fs = [f for f, prefixes in FAMILIES.items() if any(relative.startswith(prefix) for prefix in prefixes)]
        # Full pane implementor discovery only, not the Lead's module census.
        data = (UPSTREAM/path).read_bytes()
        if re.search(rb'\bimpl\s+(?:crate::bottom_pane::)?BottomPaneView\s+for\b',data):
            if 'panes' not in fs: fs.append('panes')
        if fs:
            chosen[path] = (data, entries[path], sorted(fs))
    chosen[CONFIG] = ((UPSTREAM/CONFIG).read_bytes(),entries[CONFIG],['keymap'])
    # Git object identity is checked without invoking target utilities.
    for path,(data,blob,_) in chosen.items():
        expected = hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()
        if expected!=blob: raise ValueError('working source differs from Git blob: '+path)
    return chosen


def build(chosen, refs, cat, req):
    sources, files, symbols, macros, defaults, config_fields = {}, [], [], [], [], []
    default_fields=[]
    symbol_ordinals = {}
    actions, runtime, unknowns, references, policy_refs = [], [], [], [], []
    family_files = {f: [] for f in FAMILIES}
    family_symbols = {f: [] for f in FAMILIES}
    for path, (data, blob, fs) in sorted(chosen.items()):
        src = Source(path,data,blob)
        items = src.items()
        required_names={name for anchors in ANCHORS.values() for relative,name in anchors if TUI+relative==path}
        declarations = []
        for item in items:
            kind, name = item['kind'],item['name']
            # Methods retained by entry/lifecycle name; every impl/trait is retained.
            selected = kind in ('impl','trait','macro_rules','struct','enum') or (kind=='fn' and (ENTRY.search(name) or name in required_names))
            if not selected: continue
            a,b = item['begin'],item['end']
            ordinal_key=(path,kind,item['header'])
            ordinal=symbol_ordinals.get(ordinal_key,0)
            symbol_ordinals[ordinal_key]=ordinal+1
            key = sid('symbol',path,kind,item['header'],ordinal)
            is_pane = kind=='impl' and 'BottomPaneView' in item['header']
            source_ref = src.token_span(a,b) if kind in ('fn','macro_rules','trait','struct','enum') else src.token_span(a,item['body']+1)
            record = dict(id=key, path=path, kind=kind, name=name, header=item['header'],
                          source=source_ref, context=local_context(src,item,items),
                          families=fs, classification='declaration', runtime_reachability='OPEN',
                          lead_scope_join_id='scope:'+path, pane_implementation_candidate=is_pane)
            record['source_role']='effectSourceCandidate' if kind=='fn' and name in ('copy_to_clipboard','copy_to_clipboard_with','write_transcript','export_transcript','set_terminal_title','set_modes','restore','osc52_copy','arboard_copy','initialize_file') else ('inputLifecycleSourceCandidate' if kind=='fn' else 'declaration')
            symbols.append(record); declarations.append(key)
            for f in fs: family_symbols[f].append(key)
            if kind=='macro_rules': macros.append(dict(id=sid('macro',path,name),name=name,source=source_ref, expansion='OPEN'))
            if kind=='fn' and name in ('built_in_defaults','from_config','resolve_bindings','resolve_bindings_with_global_fallback','parse_keybinding','parse_bindings','validate_conflicts','validate_chord_conflicts','normalize_keybinding_spec','normalize_key_stroke'):
                policy_refs.append(dict(symbol_id=key,name=name,source=source_ref, claim='source_declaration_only'))
            if path==CONFIG and kind=='struct':
                for k in range(item['body']+1,b-1):
                    if src.ts[k][0]=='pub' and k+2<b and src.ts[k+2][0]==':':
                        j=k+3
                        while j<b and src.ts[j][0] not in (',','}'): j+=1
                        config_fields.append(dict(id='config-field:'+name+'.'+src.ts[k+1][0],struct=name,field=src.ts[k+1][0],source=src.token_span(k,j),attributes=src.attributes(k)))
        # Retain reference sites with exact span/context, no AppEvent full census.
        for i in range(len(src.ts)-3):
            if src.ts[i][0] in ('AppEvent','SlashCommand') and [t[0] for t in src.ts[i+1:i+3]]==[':',':']:
                name=src.ts[i+3][0]
                containers=[x for x in items if x['begin']<=i<x['end'] and x['kind']=='fn']
                c=min(containers,key=lambda x:x['end']-x['begin']) if containers else None
                after=i+4
                if after<len(src.ts) and src.ts[after][0] in ('{','('): after=src.ps[after]+1
                sender=i>1 and src.ts[i-1][0]=='(' and src.ts[i-2][0] in ('send','send_replace','try_send')
                pattern=[t[0] for t in src.ts[after:after+2]]==['=','>']
                references.append(dict(id=sid('reference',path,src.ts[i][1]),kind=src.ts[i][0],name=name,
                                       join_id=src.ts[i][0]+':'+name,source=src.token_span(i,i+4),
                                       classification='lexicalReference', enclosing_function=c['header'] if c else None,
                                       source_role='senderConstructionCandidate' if sender else ('consumerPatternCandidate' if pattern else 'unresolvedReferenceCandidate'),
                                       containing_expression_source=src.token_span(i,after),
                                       reachability='OPEN',owner=OWNER))
        if path==TUI+'keymap_setup/actions.rs':
            actions,u=parse_action_catalog(src); unknowns.extend(dict(kind='action_macro_fragment',source=r,status='OPEN') for r in u)
        if path==TUI+'keymap/bindings.rs':
            runtime,u=parse_runtime_bindings(src); unknowns.extend(dict(kind='runtime_binding_macro_fragment',source=r,status='OPEN') for r in u)
        if path==TUI+'keymap.rs':
            default_item=next(x for x in items if x['kind']=='fn' and x['name']=='built_in_defaults')
            for k in range(default_item['body']+1,default_item['end']-2):
                if not re.fullmatch(r'[A-Za-z_]\w*',src.ts[k][0]) or src.ts[k+1][0]!=':' or src.ts[k+2][0]==':': continue
                if k>0 and src.ts[k-1][0]==':': continue
                enclosing=[n for n in range(default_item['body'],k) if src.ts[n][0]=='{' and src.ps[n]>k]
                parent=max(enclosing)
                j=k+2
                while j<src.ps[parent] and src.ts[j][0]!=',':
                    j=src.ps[j]+1 if src.ts[j][0] in ('{','[','(') else j+1
                default_fields.append(dict(id='default-field:'+src.ts[parent-1][0]+'.'+src.ts[k][0],
                                           struct_literal=src.ts[parent-1][0],field=src.ts[k][0],
                                           source=src.token_span(k,j),effective_default='OPEN'))
            for _,start,end,ref in macro_calls(src,'default_bindings'):
                if not default_item['begin']<=start<default_item['end']: continue
                before=start-3
                field=src.ts[before-2][0] if before>1 and src.ts[before-1][0]==':' else 'OPEN'
                # Find nearest enclosing struct literal to retain context exactly.
                containers=[k for k in range(default_item['body'],before) if src.ts[k][0]=='{' and src.ps[k]>end]
                parent=max(containers) if containers else default_item['body']
                group=src.ts[parent-1][0]
                defaults.append(dict(id='default:'+group+'.'+field,struct_literal=group,field=field,
                                     binding_expression_source=ref,
                                     expressions=[src.ts[k][0] for k in range(start,end)],effective_binding='OPEN'))
        # Calls to declarative resolving macros retain overrides and literal args.
        resolutions=[]
        for macro in ('resolve_local','resolve_with_global','default_binding','default_bindings','required_feature','configured_binding_slot','runtime_group_mut','define_keymap_actions','define_runtime_action_bindings'):
            for _,start,end,ref in macro_calls(src,macro):
                resolutions.append(dict(macro=macro,source=ref,args_tokens=[t[0] for t in src.ts[start:end]],effective_expansion='OPEN'))
        if resolutions:
            files_resolutions=resolutions
        else: files_resolutions=[]
        # CFG/helper dependencies are syntactic source sites, not evaluated.
        cfg=[]; imports=[]
        for i,t in enumerate(src.ts):
            if t[0]=='#' and i+1<len(src.ts) and src.ts[i+1][0]=='[':
                j=src.ps[i+1]
                if any(x[0] in ('cfg','cfg_attr','test') for x in src.ts[i+2:j]): cfg.append(src.token_span(i,j+1))
            if t[0]=='cfg' and i+2<len(src.ts) and src.ts[i+1][0]=='!' and src.ts[i+2][0]=='(':
                cfg.append(src.token_span(i,src.ps[i+2]+1))
            if t[0]=='use':
                j=i+1
                while j<len(src.ts) and src.ts[j][0]!=';': j+=1
                if j<len(src.ts): imports.append(src.token_span(i,j+1))
        for f in fs: family_files[f].append(path)
        file_id='source-file:'+path
        files.append(dict(id=file_id,path=path,git_blob=blob,sha256=sha(data),bytes=len(data),families=fs,
                          selected_symbols=declarations,cfg_sources=cfg,helper_import_sources=imports,
                          macro_calls=resolutions,lead_scope_join_id='scope:'+path,
                          disposition='retained_source_with_inherited_module_cfg_OPEN',filename_test_hint='test' in path,
                          unselected_function_count=sum(x['kind']=='fn' and not (ENTRY.search(x['name']) or x['name'] in required_names) for x in items)))
        sources.update(src.records)
    joins=[]
    action_ids={r['id'] for r in actions}; runtime_ids={r['action_join_id'] for r in runtime}
    for r in actions:
        joins.append(dict(id='keymap-join:'+r['context']+'.'+r['action'],action_id=r['id'],
                          runtime_action_id='runtime-action:'+r['context']+'.'+r['action'] if r['id'] in runtime_ids else None,
                          disposition='lexical_identity_join' if r['id'] in runtime_ids else 'OPEN_specialized_chord_or_missing_runtime_inventory'))
    for r in runtime:
        if r['action_join_id'] not in action_ids:
            unknowns.append(dict(id=r['id'],kind='runtime_action_without_UI_catalog_entry',source=r['source'],status='OPEN',modifier=r['modifier']))
    family_rows=[]
    for f in FAMILIES:
        family_rows.append(dict(id='view-family:'+f,selectors=list(FAMILIES[f]),files=family_files[f],symbols=family_symbols[f],
                                disposition='SOURCE_ENTRY_FAMILY_BOUND_RUNTIME_OPEN',owner=OWNER,
                                future_variant_family_id='DX100-U01:views:'+f,qualification='NOT_RUN'))
    req_rows=[]
    entry_bindings=[]
    for r in sorted(req,key=lambda x:x['id']):
        for relative,name in ANCHORS[r['id']]:
            found=[s for s in symbols if s['path']==TUI+relative and s['kind']=='fn' and s['name']==name]
            entry_bindings.append(dict(id='view-entry:'+r['id']+':'+relative+':'+name,requirement_id=r['id'],owner=OWNER,
                                       path=TUI+relative,symbol=name,symbol_ids=[s['id'] for s in found],source_refs=[s['source'] for s in found],
                                       classification='declaration',disposition='SOURCE_BOUND_RUNTIME_OPEN' if found else 'OPEN_MISSING_NAMED_ANCHOR',
                                       runtime_reachability='OPEN'))
        req_rows.append(dict(id=r['id'],title=r['title'],owner=OWNER,status=r['status'],receipt=r['receipt'],
                             reference_validation=r['reference_validation'],cvg_validation=r['cvg_validation'],
                             family_ids=['view-family:'+f for f in REQUIREMENTS[r['id']]],
                             disposition='SOURCE_BOUND_FUNCTIONAL_ORACLE_OPEN',
                             external_lane_join='commands:SlashCommand' if r['id']=='CDX100-17-01' else None))
    counts=dict(selected_files=len(files),symbols=len(symbols),source_spans=len(sources),macros=len(macros),
                keymap_catalog_actions=len(actions),runtime_actions=len(runtime),declared_default_binding_entries=len(defaults),
                default_field_expressions=len(default_fields),config_fields=len(config_fields),pane_impl_candidates=sum(r['pane_implementation_candidate'] for r in symbols),
                explicit_test_context_symbols=sum(r['context']['disposition']=='explicit_test_or_test_cfg_candidate' for r in symbols),
                lexical_crosslane_references=len(references),source_families=len(family_rows),requirements=len(req_rows),
                explicit_entry_bindings=len(entry_bindings),missing_named_anchors=sum(not r['source_refs'] for r in entry_bindings),
                open_fragments_or_joins=len(unknowns),functional_receipts=0)
    gap_rows=load(E/'g01/component-surfaces/integration.json')['mandatory_open_variants']
    external_rows=load(E/'g01/exec-transitive/integration.json')['external_runtime_and_dependency_limits']
    if len(gap_rows)!=6 or len(external_rows)!=5: raise ValueError('mandatory gap/dependency limits changed')
    return dict(schema_version=1,task=TASK,status='IMPLEMENTED',review_status='PENDING_INDEPENDENT_CRITIC',tier='T1',pin=PIN,
                parent_contract_sha256=PARENT_SHA,contract_sha256=sha((HERE.parent/'views-contract.json').read_bytes()),
                inputs=refs,counts=counts,files=files,symbols=symbols,macros=macros,keymap_actions=actions,
                runtime_actions=runtime,declared_default_bindings=defaults,default_field_expressions=default_fields,config_fields=config_fields,keymap_policy_sources=policy_refs,
                action_joins=joins,source_families=family_rows,requirements=req_rows,entry_surface_bindings=entry_bindings,crosslane_references=references,
                unknowns=unknowns,sources=[sources[k] for k in sorted(sources)],limits=LIMITS,
                mandatory_readonly_sdk_gaps=gap_rows,mandatory_readonly_external_runtime_limits=external_rows,
                catalog_preservation=dict(functional=487,controls=22,status='NOT_RUN',full_native_goal='MANDATORY_OPEN',
                                          sdk_gaps=6,external_runtime_dependency_limits=5,mandatory_gates=['DX100-G02','DX100-G03','DX100-G04']),
                functional_receipts=0,full_g01_closure=False,full_codex_parity_claim=False,autoapproval=False)


def check_equal(actual, expected):
    if encode(actual)!=encode(expected): raise ValueError('artifact differs from deterministic source reconstruction')


def verify(inv, chosen, refs, cat, req):
    for span in inv['sources']:
        raw=chosen[span['path']][0];a,b=span['start_byte'],span['end_byte_exclusive']
        if raw[a:b].decode('utf-8')!=span['text'] or sha(raw[a:b])!=span['sha256']: raise ValueError('span bytes/digest mismatch')
        if span['start_line']!=raw[:a].count(b'\n')+1 or span['end_line']!=raw[:max(a,b-1)].count(b'\n')+1: raise ValueError('span line mismatch')
    # Actual negative mutations are in-memory only; no upstream file is changed.
    negatives=[]
    def bad(label, mutate):
        altered=copy.deepcopy(inv)
        mutate(altered)
        try: check_equal(altered,inv)
        except ValueError: negatives.append(dict(id=label,expected='REJECT',observed='REJECT'))
        else: raise ValueError('negative accepted: '+label)
    bad('omit_requirement',lambda x:x['requirements'].pop())
    bad('omit_action',lambda x:x['keymap_actions'].pop())
    bad('action_field',lambda x:x['keymap_actions'][0].update(action='fabricated'))
    bad('feature_availability',lambda x:x['keymap_actions'][0].update(effective_availability='PASS'))
    bad('binding_context',lambda x:x['runtime_actions'][0].update(context='fabricated'))
    bad('binding_runtime_only',lambda x:x['runtime_actions'][0].update(modifier='fabricated'))
    bad('default',lambda x:x['declared_default_bindings'][0].update(expressions=['fabricated']))
    bad('owner',lambda x:x['requirements'][0].update(owner='DX100-U99'))
    bad('cfg',lambda x:x['files'][0].update(cfg_sources=[] if x['files'][0]['cfg_sources'] else ['fabricated']))
    bad('false_runtime_claim',lambda x:x['symbols'][0].update(runtime_reachability='PASS'))
    bad('false_qualification',lambda x:x.update(functional_receipts=1,full_g01_closure=True))
    bad('span_digest',lambda x:x['sources'][0].update(sha256='0'*64))
    bad('unknown_drop',lambda x:x['unknowns'].pop())
    bad('parent_contract',lambda x:x.update(parent_contract_sha256='0'*64))
    bad('fake_catalog_pass',lambda x:x['catalog_preservation'].update(status='PASS'))
    bad('entry_binding_omission',lambda x:x['entry_surface_bindings'].pop())
    bad('SDK_gap_omission',lambda x:x['mandatory_readonly_sdk_gaps'].pop())
    bad('external_limit_omission',lambda x:x['mandatory_readonly_external_runtime_limits'].pop())
    # Semantic source controls exercise the same parsers used by reconstruction.
    semantic=[]
    for name,path,old,new,projection in [
        ('source_action',TUI+'keymap_setup/actions.rs',b'open_agents =>',b'fake_agents =>','keymap_actions'),
        ('source_feature',TUI+'keymap_setup/actions.rs',b'[FastMode]',b'[OtherMode]','keymap_actions'),
        ('source_binding',TUI+'keymap/bindings.rs',b'open_agents,',b'fake_agents,','runtime_actions'),
        ('source_default',TUI+'keymap.rs',b'KeyCode::F(3)',b'KeyCode::F(23)','declared_default_bindings'),
        ('source_cfg',TUI+'tui.rs',b'#[cfg(windows)]',b'#[cfg(any(windows, unix))]','files'),
        ('source_config_field',CONFIG,b'pub struct TuiGlobalKeymap',b'pub struct ChangedGlobalKeymap','config_fields'),
    ]:
        data,blob,fs=chosen[path]
        if old not in data: raise ValueError('mutation anchor missing: '+name)
        changed={path:(data.replace(old,new,1),blob,fs)}
        baseline_inv=build({path:chosen[path]},refs,cat,req)
        changed_inv=build(changed,refs,cat,req)
        def semantic_value(v):
            rows=v[projection]
            if projection=='keymap_actions': return [(r['context'],r['action'],r['feature_literal']) for r in rows]
            if projection=='runtime_actions': return [(r['context'],r['action'],r['modifier']) for r in rows]
            if projection=='declared_default_bindings': return [(r['struct_literal'],r['field'],r['expressions']) for r in rows]
            if projection=='config_fields': return [(r['struct'],r['field']) for r in rows]
            if projection=='files':
                spans={r['id']:r['text'] for r in v['sources']}
                return [[spans[s] for s in r['cfg_sources']] for r in rows]
            raise ValueError('unhandled semantic projection')
        if semantic_value(changed_inv)==semantic_value(baseline_inv): raise ValueError('source mutation undetected: '+name)
        semantic.append(dict(id=name,expected='CHANGE_DETECTED',observed='CHANGE_DETECTED',projection=projection,
                             original_file_sha256=sha(data),mutant_file_sha256=sha(changed[path][0]),
                             mutation_old=old.decode(),mutation_new=new.decode(),target_written=False,
                             semantic_before=semantic_value(baseline_inv),semantic_after=semantic_value(changed_inv)))
    # Scanner fixtures include raw strings, nested comments, Unicode, lifetimes.
    fixture='/* outer /* fn bogus() {} */ */ fn actual(\'a: char) { let s = r###"fn fake() {"###; let c = \'é\'; }'
    ts=tokens(fixture); pairs(ts)
    if [ts[i+1][0] for i,t in enumerate(ts[:-1]) if t[0]=='fn']!=['actual']: raise ValueError('scanner fixture')
    continuation='const S: &str = "a'+chr(92)+'\n{ not code }"; const B: &[u8] = br#"{ raw }"#; const C: char = '+"'"+chr(92)+"u{1f600}'; const D: &str = cr##\"fn fake() {\"##; fn r#real() {}"
    cts=tokens(continuation);pairs(cts)
    if [cts[i+1][0] for i,t in enumerate(cts[:-1]) if t[0]=='fn']!=['r#real']: raise ValueError('backslash-newline/raw-byte-C/Unicode/raw-identifier scanner fixture')
    return dict(schema_version=1,task=TASK,kind='OFFLINE_LEXICAL_READER_VERIFICATION_NOT_FUNCTIONAL_QUALIFICATION',
                deterministic_twice=True,git_blob_identity_checked=len(chosen),utf8_spans_checked=len(inv['sources']),
                artifact_negatives=negatives,semantic_source_negatives=semantic,scanner_fixture='PASS',
                backslash_newline_raw_byte_C_Unicode_raw_identifier_fixture='PASS',
                target_writes=0,target_imports=0,target_execution=0,network=0,children=0,
                functional_receipts=0,independent_critic='PENDING',contract_sha256=inv['contract_sha256'])


def manifest():
    files=[]
    for path in sorted(HERE.rglob('*')):
        if path.is_symlink(): raise ValueError('symlink in own evidence')
        if path.is_file() and path!=HERE/'manifest.json':
            files.append(dict(path=path.relative_to(HERE).as_posix(),bytes=path.stat().st_size,sha256=sha(path.read_bytes())))
    return dict(schema_version=1,task=TASK,contract_sha256=sha((HERE.parent/'views-contract.json').read_bytes()),
                parent_contract_sha256=PARENT_SHA,pin=PIN,files=files,
                strict=True,self_exclusion='manifest.json only; SHA-256 reported externally to avoid circular self-hash',
                status='IMPLEMENTED',review='PENDING_INDEPENDENT_CRITIC',functional_receipts=0)


def links():
    found=[]
    for p in sorted(HERE.glob('*.md')):
        for m in re.finditer(r'\[[^\]]+\]\(([^)]+)\)',p.read_text()):
            target=m[1].strip('<>')
            if '://' in target: raise ValueError('own links must be offline local links')
            path=target.split('#',1)[0]
            if path and not (p.parent/path).resolve().exists(): raise ValueError('broken own link: '+target)
            found.append(dict(file=p.name,target=target))
    if not found: raise ValueError('own Markdown links absent')
    print(json.dumps(dict(own_markdown_links='PASS',links=found),ensure_ascii=False))


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--build',action='store_true')
    p.add_argument('--check',action='store_true')
    p.add_argument('--seal',action='store_true')
    p.add_argument('--links',action='store_true')
    args=p.parse_args()
    if sum((args.build,args.check,args.seal,args.links))!=1: p.error('select one operation')
    if args.links: links(); return
    refs,cat,req=read_inputs()
    if args.seal:
        # Sealing alone grants no validation. --check reconstructs and checks all
        # sources, negatives and the strict manifest after the final seal.
        if not (HERE/'inventory.json').exists() or not (HERE/'verification.json').exists(): raise ValueError('generated evidence absent')
        (HERE/'manifest.json').write_bytes(encode(manifest()))
        print(json.dumps(dict(sealed=True,manifest_sha256=sha((HERE/'manifest.json').read_bytes()))));return
    chosen=collect()
    inv=build(chosen,refs,cat,req)
    inv2=build(chosen,refs,cat,req)
    check_equal(inv,inv2)
    ver=verify(inv,chosen,refs,cat,req)
    if args.build:
        (HERE/'inventory.json').write_bytes(encode(inv))
        (HERE/'verification.json').write_bytes(encode(ver))
    else:
        check_equal(load(HERE/'inventory.json'),inv)
        check_equal(load(HERE/'verification.json'),ver)
        if not (HERE/'manifest.json').exists(): raise ValueError('strict manifest absent')
        check_equal(load(HERE/'manifest.json'),manifest())
        expected_manifest=manifest()
        for label in ('omit','add','digest','bytes'):
            mutant=copy.deepcopy(expected_manifest)
            if label=='omit': mutant['files'].pop()
            elif label=='add': mutant['files'].append(dict(path='phantom',bytes=0,sha256='0'*64))
            elif label=='digest': mutant['files'][0]['sha256']='0'*64
            else: mutant['files'][0]['bytes']+=1
            try: check_equal(mutant,expected_manifest)
            except ValueError: pass
            else: raise ValueError('strict manifest negative accepted: '+label)
    print(json.dumps(dict(operation='build' if args.build else 'check',result='PASS',counts=inv['counts'],
                          artifact_negatives=len(ver['artifact_negatives']),semantic_source_negatives=len(ver['semantic_source_negatives']),
                          strict_manifest_negatives=4 if args.check else 'NOT_APPLICABLE_BEFORE_SEAL',
                          manifest_sha256=sha((HERE/'manifest.json').read_bytes()) if (HERE/'manifest.json').exists() else None)))


if __name__=='__main__':
    try: main()
    except (ValueError,KeyError,OSError,subprocess.CalledProcessError) as exc:
        print(type(exc).__name__+': '+str(exc),file=sys.stderr)
        sys.exit(1)
