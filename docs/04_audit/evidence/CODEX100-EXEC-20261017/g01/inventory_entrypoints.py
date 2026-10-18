"""Bounded lexical evidence for CLI attributes and tool registration sources.

Preserves unresolved relationships rather than guessing a command graph. It is
not a Rust parser, a reachable-tools oracle, or a functional parity test.
"""
from pathlib import Path
import hashlib
import json
import re

UP = Path('/tmp/cvg-rea-codex-20261017/upstream')
OUT = Path(__file__).resolve().parent
PIN = '8d9f6466ff0294785d56f55b1fe363d132fe4133'

def source(p, text, offset):
    rel = str(p.relative_to(UP))
    line = text[:offset].count('\n')+1
    return {'path': rel, 'sha256': hashlib.sha256(p.read_bytes()).hexdigest(),
            'line': line, 'url': f'https://github.com/openai/codex/blob/{PIN}/{rel}#L{line}'}

def attribute_end(text, start):
    depth, quote, escaped = 0, None, False
    for i in range(start+1, len(text)):
        c = text[i]
        if quote:
            if escaped:
                escaped = False
            elif c == '\\':
                escaped = True
            elif c == quote:
                quote = None
        elif c in ['"', "'"]:
            quote = c
        elif c == '[':
            depth += 1
        elif c == ']':
            depth -= 1
            if depth == 0:
                return i+1
    raise ValueError('Unclosed attribute at '+str(start))

def following_declaration(text, end):
    # Keep source context; never infer ownership from nearest struct/enum.
    tail = text[end:]
    while True:
        match = re.match(r'\s*(?://[^\n]*\n\s*)*', tail)
        tail = tail[match.end():]
        if not tail.startswith('#['):
            break
        tail = tail[attribute_end(tail, 0):]
    return tail.splitlines()[0] if tail else ''

cli_files = set((UP/'codex-rs/cli/src').glob('*.rs'))
for rel in ['codex-rs/exec/src/cli.rs', 'codex-rs/tui/src/cli.rs',
            'codex-rs/cloud-tasks/src/lib.rs', 'codex-rs/utils/cli/src/config_override.rs',
            'codex-rs/utils/cli/src/lib.rs']:
    if (UP/rel).exists():
        cli_files.add(UP/rel)
attributes, reviewed_files = [], []
for p in sorted(cli_files):
    if 'test' in p.stem:
        continue
    text = p.read_text()
    cutoff = re.search(r'^#\[cfg\(test\)\]', text, re.M)
    selected = text[:cutoff.start()] if cutoff else text
    reviewed_files.append({**source(p, text, 0),
        'examined_through_line': selected.count('\n')+1,
        'policy': 'Top-level cfg(test) tail excluded; conditional reachability requires review'})
    for m in re.finditer(r'#\[(clap|command|arg|cfg)\b', selected):
        end = attribute_end(selected, m.start())
        raw = selected[m.start():end]
        attributes.append({'source': source(p,text,m.start()), 'attribute_kind': m[1],
            'attribute': raw, 'following_declaration': following_declaration(selected,end),
            'variant_obligations': [key for key in ['alias','visible_alias','name','hide',
                'default_value','default_value_t','conflicts_with','requires','flatten',
                'subcommand','global','value_enum','value_parser','long','short'] if re.search(r'\b'+key+r'\b',raw)],
            'requirement': 'CDX100-10-01', 'owner': 'DX100-H02',
            'command_graph_resolution': 'PENDING_SOURCE_REVIEW', 'qualification': 'NOT_RUN'})
result = {'commit': PIN, 'kind': 'LEXICAL_ATTRIBUTES_NOT_RESOLVED_COMMAND_GRAPH',
    'files': reviewed_files, 'attributes': attributes,
    'attribute_count': len(attributes), 'functional_receipts': 0,
    'known_unclosed_obligations': [
        'Follow all flattened/imported clap types, nested module and platform sources.',
        'Bind each argument/alias/cfg to actual command and dispatcher; do not count attributes as commands.',
        'Resolve implicit kebab-case names, defaults, value enums, conflicts and requirements.',
        'Review all target OS/architecture branches, hidden commands and arg0 dispatch.',
        'Read command construction/mutations and tests as corroboration, never infer from help alone.'
    ]}
(OUT/'cli-attribute-inventory.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')

plan = UP/'codex-rs/core/src/tools/spec_plan.rs'
registry = UP/'codex-rs/core/src/tools/registry.rs'
tool_files = [plan, registry, UP/'codex-rs/core/src/tools/mod.rs',
              UP/'codex-rs/tools/src/tool_spec.rs']
tool_files += sorted((UP/'codex-rs/core/src/tools').rglob('*spec*.rs'))
tool_rows = []
for p in sorted(set(tool_files)):
    if 'test' in p.stem:
        continue
    text = p.read_text()
    cutoff = re.search(r'^#\[cfg\(test\)\]',text,re.M)
    selected = text[:cutoff.start()] if cutoff else text
    anchors = []
    for m in re.finditer(r'^\s*(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?fn\s+(\w+)|\bregistry\.(register_\w+)|\bFeature::(\w+)',selected,re.M):
        anchors.append({'source': source(p,text,m.start()),
            'function': m[1], 'registration_method': m[2], 'feature_reference': m[3],
            'line_excerpt': selected[m.start():].splitlines()[0].strip()})
    tool_rows.append({'source':source(p,text,0), 'anchors':anchors,
        'scope': 'Function/registration/feature candidates; not semantic reachable-tool inventory'})
tools = {'commit': PIN, 'files': tool_rows, 'functional_receipts': 0,
    'qualification': 'NOT_RUN', 'scope_closure': 'OPEN_G01',
    'reviewed_source_observations': [
        'build_tool_router assembles core, MCP, extensions, exposure policy and finalization.',
        'add_core_tool_sources returns early when managed sandbox ceiling is not met.',
        'Dynamic Function and Namespace tools are registered from supplied specs.',
        'Code Mode exposure/reachability is distinct from registration; wrapper policy can disallow access.'
    ],
    'required_variant_axes': ['tool policy and managed sandbox ceiling', 'model capability',
        'feature stage and enablement', 'selected environment count/readiness',
        'Direct vs CodeMode vs CodeModeOnly', 'MCP namespace/search and trust',
        'dynamic tool schemas and external extension registration', 'multi-agent version/depth',
        'hosted web/image capability', 'cancellation/hook acceptance and side effects'],
    'next_action': 'Resolve registration -> tool name/schema -> executor -> guard/exposure -> requirement; inspect all extension factories and reject silent unmatched candidates.'}
(OUT/'tool-reachability-inventory.json').write_text(json.dumps(tools,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'cli_files':len(reviewed_files),'cli_attributes':len(attributes),
                  'tool_files':len(tool_rows),'functional_receipts':0}))
