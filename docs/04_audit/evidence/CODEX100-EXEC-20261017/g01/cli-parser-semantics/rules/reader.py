"""Offline CLI argument/parser source rules; never executes target parsers."""
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
HELPER = E/'g01/entrypoints/cli/generate.py'
GRAPH = E/'g01/entrypoints/cli/graph.json'
ADAPTER = E/'g01/cli-adapters/schema/inventory.json'
MAIN = 'codex-rs/cli/src/main.rs'
CONFIG = 'codex-rs/utils/cli/src/config_override.rs'
SHARED = 'codex-rs/utils/cli/src/shared_options.rs'
RECIPE = {
 'RedactedHostUrlParser': {'functions': [('codex-rs/app-server/src/code_mode_host.rs','parse_ref'),('codex-rs/app-server/src/code_mode_host.rs','parse_host_url')],
   'boundary': 'TypedValueParser plus local URL validation; URL crate grammar/runtime OPEN.',
   'rules': ['OsStr must be UTF8; InvalidUtf8 error has fixed text.', 'http/https with host required; fragment, credentials, non-root path and query rejected.', 'Errors are constructed with Error::raw/with_cmd rather than echoing the supplied argument.']},
 'parse_absolute_path': {'functions': [('codex-rs/cli/src/lib.rs','parse_absolute_path')],
   'boundary': 'AbsolutePathBuf::relative_to_current_dir; OS/cwd/filesystem semantics OPEN.',
   'rules': ['Relative input is resolved against cwd; name alone does not mean absolute-only input.', 'Error text includes invalid path and delegated error.']},
 'parse_socket_path': {'functions': [(MAIN,'parse_socket_path')],
   'boundary': 'AbsolutePathBuf::relative_to_current_dir; no socket connection or filesystem call executed.',
   'rules': ['Relative path is resolved against cwd.', 'Failure adds failed-to-resolve-socket-path context.']},
 'parse_env_pair': {'functions': [('codex-rs/cli/src/mcp_cmd.rs','parse_env_pair')],
   'boundary': 'Local parser source only; environment variables are never read or written.',
   'rules': ['Split only at first equals; trim key; reject missing equals or empty trimmed key.', 'Value is retained without trimming, including empty value and additional equals.']},
 'clap::builder::StringValueParser::new().map(RedactedString::from)': {'functions': [],
   'boundary': 'Explicit Clap StringValueParser mapping to RedactedString; dependency parsing/redaction runtime remains OPEN.',
   'rules': ['Preserve explicit mapping expression; do not substitute implicit string parser.']},
 'clap::value_parser!(u64).range(1..)': {'functions': [],
   'boundary': 'Clap numeric parser macro and range; expansion/overflow/error grammar OPEN.',
   'rules': ['Declared u64 parser restricts lower range to one; macro is not expanded by this reader.']},
 'ThreadId::from_string': {'functions': [('codex-rs/protocol/src/thread_id.rs','from_string')],
   'boundary': 'Delegates Uuid::parse_str; authenticated UUID source contract retained in prior exec-transitive package; runtime OPEN.',
   'rules': ['Thread ID input uses UUID parser and does not enforce UUIDv7 creation policy.']},
 'NonEmptyStringValueParser::new()': {'functions': [],
   'boundary': 'Explicit Clap library parser; whitespace/UTF8/accepted string grammar require executable reference.',
   'rules': ['Record non-empty parser selection without inventing trim or whitespace rejection.']},
 'parse_attempts': {'functions': [('codex-rs/cloud-tasks/src/cli.rs','parse_attempts')],
   'boundary': 'usize parse plus local inclusive range; machine width/numeric library runtime OPEN.',
   'rules': ['Parse usize; retain distinct invalid-integer and out-of-range errors.', 'Source range is inclusive 1 through 4.']},
 'parse_limit': {'functions': [('codex-rs/cloud-tasks/src/cli.rs','parse_limit')],
   'boundary': 'i64 parse plus local inclusive range; numeric grammar/runtime OPEN.',
   'rules': ['Parse i64; retain distinct invalid-integer and out-of-range errors.', 'Source range is inclusive 1 through 20.']},
}
EXTRA_FUNCTIONS = {
 CONFIG: ['parse_overrides','parse_toml_value','canonicalize_override_key','prepend_root_overrides'],
 SHARED: ['take_auto_review_config_overrides','inherit_exec_root_options','apply_subcommand_overrides'],
 MAIN: ['prepend_config_flags','to_overrides','validate_feature','resolve_remote_endpoint',
        'reject_remote_mode_for_subcommand','reject_unsupported_worktree_for_subcommand',
        'reject_root_strict_config_for_subcommand','reject_strict_config_for_app_server_subcommand',
        'reject_remote_mode_for_app_server_subcommand'],
 'codex-rs/cli/src/sandbox_setup.rs': ['parse_setup_command','setup_level'],
 'codex-rs/features/src/lib.rs': ['is_known_feature_key','feature_for_key'],
 'codex-rs/features/src/legacy.rs': ['feature_for_key'],
 'codex-rs/tui/src/lib.rs': ['resolve_remote_addr','remote_addr_supports_auth_token'],
}


def require(ok, message):
    if not ok: raise AssertionError(message)


def read(path):
    return json.loads(path.read_text())


def sha(data):
    return hashlib.sha256(data).hexdigest()


def encoded(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode()


def property_syntax(attributes):
    """Keep full immediate expressions, including group(...) call arguments."""
    result = {}
    for attribute in attributes:
        src = cli.Source('attribute-expression',attribute['text'])
        if len(src.t)<5 or src.t[2][0] not in ['clap','command','arg'] or src.t[3][0]!='(':continue
        for a,b in src.split(4,src.pairs[3]):
            result.setdefault(src.t[a][0],[]).append(src.raw(a,b))
    return result


prior = read(E/'g01/entrypoints/manifest.json')
record = next(r for r in prior['files'] if r['path'] == str(HELPER.relative_to(ROOT)))
require(sha(HELPER.read_bytes()) == record['sha256'], 'Reviewed source reader differs')
spec = importlib.util.spec_from_file_location('reviewed_cli_source_reader', HELPER)
cli = importlib.util.module_from_spec(spec); spec.loader.exec_module(cli)


def build(overrides=None):
    overrides = overrides or {}; sources = {}; cache = {}; parsed = {}
    tree = {}
    for entry in subprocess.check_output(['git','-C',str(UP),'ls-tree','-r','-z',PIN]).split(b'\0'):
        if entry:
            header, path = entry.split(b'\t',1); mode, kind, oid = header.decode().split()
            tree[path.decode()] = {'mode':mode,'git_blob':oid}
    require(subprocess.check_output(['git','-C',str(UP),'rev-parse','HEAD']).decode().strip() == PIN, 'Wrong pin')
    require(not subprocess.check_output(['git','-C',str(UP),'status','--porcelain']).strip(), 'Upstream modified')

    def load(path):
        if path not in cache:
            require(path in tree and tree[path]['mode'] in ['100644','100755'], 'Nonregular/untracked source')
            original = (UP/path).read_bytes()
            require(hashlib.sha1(b'blob '+str(len(original)).encode()+b'\0'+original).hexdigest() == tree[path]['git_blob'], 'Wrong Git object')
            cache[path] = overrides.get(path,original)
            sources[path] = {'path':path,'sha256':sha(cache[path]),'bytes':len(cache[path]),**tree[path]}
        return cache[path]

    def span(path, start, end):
        raw = load(path); require(0 <= start <= end <= len(raw),'Span bounds')
        return {'path':path,'file_sha256':sha(raw),'start_byte':start,'end_byte_exclusive':end,
                'start_line':raw[:start].count(b'\n')+1,
                'end_line':max(raw[:start].count(b'\n')+1,raw[:end].count(b'\n')+(not raw[:end].endswith(b'\n'))),
                'sha256':sha(raw[start:end]),'text':raw[start:end].decode()}

    def source(path):
        if path not in parsed: parsed[path] = cli.Source(path,load(path).decode())
        return parsed[path]

    def token_span(s,a,b):
        return span(s.path,len(s.text[:s.t[a][1]].encode()),len(s.text[:s.t[b-1][2]].encode()))

    def functions(s):
        found = []
        for i,(value,_,_) in enumerate(s.t):
            if value != 'fn' or i+1 >= len(s.t): continue
            # Only free functions and direct impl methods; nested tests/helpers are not selected as APIs.
            if s.depths[i] > 1: continue
            name = s.t[i+1][0]; j = i+2
            if not re.fullmatch(r'[A-Za-z_]\w*',name):continue
            while j < len(s.t) and s.t[j][0] not in ['{',';']:
                if s.t[j][0] in ['(','[']: j = s.pairs[j]+1
                else: j += 1
            require(j < len(s.t),'Function body missing')
            end = s.pairs[j]+1 if s.t[j][0] == '{' else j+1
            a = s.before_attrs(i)
            found.append({'name':name,'depth':s.depths[i],'start':a,'body':j,'end':end})
        return found

    graph = read(GRAPH); adapters = read(ADAPTER)
    require(len(graph['fields']) == 305 and len(graph['types']) == 105 and len(graph['variants']) == 82,'Historical census differs')
    fields = []; explicit = []
    for f in graph['fields']:
        r = f['source']; raw = load(r['path']); original = (UP/r['path']).read_bytes()
        require(sha(original[r['start_byte']:r['end_byte']]) == r['sha256'],'Historical field source differs')
        field_text = raw[r['start_byte']:r['end_byte']].decode()
        fs = cli.Source('field-fragment',field_text); attrs,_ = fs.attrs(0,len(fs.t))
        props = cli.properties(attrs)
        require(props == f['argument']['properties'],'Reparsed argument properties differ: '+f['id'])
        row = {'id':f['id'],'historical_field':f,'raw_properties':props,
               'lossless_property_syntax':property_syntax(attrs),
               'explicit_defaults':{k:v for k,v in props.items() if k.startswith('default')},
               'relations':{k:v for k,v in props.items() if k.startswith(('requires','conflicts','overrides'))},
               'parser_expressions':props.get('value_parser',[]),
               'classification':f['binding'].upper()+'_DECLARATION_NOT_EFFECTIVE_CLAP_SCHEMA',
               'source':span(r['path'],r['start_byte'],r['end_byte']), 'qualification':'NOT_RUN'}
        fields.append(row)
        for expr in row['parser_expressions']:
            require(expr in RECIPE,'Unclassified explicit parser: '+expr)
            explicit.append({'field_id':f['id'],'expression':expr,'recipe_id':'parser:'+expr,'qualification':'NOT_RUN'})
    require(len(explicit) == 14 and {p['expression'] for p in explicit} == set(RECIPE),'Parser census differs')
    metadata = []
    for kind,rows in [('type',graph['types']),('variant',graph['variants'])]:
        for row in rows:
            for attr in row['attributes']:
                r=attr['source']; raw=load(r['path']); original=(UP/r['path']).read_bytes()
                require(sha(original[r['start_byte']:r['end_byte']])==r['sha256'],'Historical metadata source differs')
                require(raw[r['start_byte']:r['end_byte']].decode()==attr['text'],'Type/variant attribute changed')
            metadata.append({'id':row['id'],'kind':kind,'raw_properties':cli.properties(row['attributes']),
                             'lossless_property_syntax':property_syntax(row['attributes']),
                             'cfg':row.get('cfg',[]),'historical_attributes':row['attributes'],
                             'qualification':'NOT_RUN'})

    bodies = {}; pending = []
    def pick_function(path,name,why):
        s = source(path); found = [r for r in functions(s) if r['name'] == name]
        require(len(found) == 1,'Function ambiguous/missing: '+path+'::'+name+' '+str(len(found)))
        rec = found[0]; bid = 'fn:'+path+'::'+name
        if bid not in bodies:
            bodies[bid] = {'id':bid,'name':name,'depth':rec['depth'],'reasons':[why],
                           'source':token_span(s,rec['start'],rec['end'])}
            pending.append((path,rec,bid))
        elif why not in bodies[bid]['reasons']: bodies[bid]['reasons'].append(why)
        return bid
    recipes = []
    for expr,recipe in RECIPE.items():
        ids = [pick_function(path,name,'parser:'+expr) for path,name in recipe['functions']]
        recipes.append({'id':'parser:'+expr,'expression':expr,'source_function_ids':ids,
                        'source_rules':recipe['rules'],'boundary':recipe['boundary'],'runtime_status':'NOT_RUN_OPEN'})
    for path,names in EXTRA_FUNCTIONS.items():
        for name in names: pick_function(path,name,'config_or_postparse_source_boundary')
    typed_source=source('codex-rs/app-server/src/code_mode_host.rs')
    hits=typed_source.find_tokens('impl TypedValueParser for RedactedHostUrlParser')
    require(len(hits)==1,'Typed parser impl ambiguous')
    begin=hits[0];body=begin
    while typed_source.t[body][0]!='{':body+=1
    typed_declarations=[{'id':'typed-parser:RedactedHostUrlParser',
                         'impl_source':token_span(typed_source,begin,typed_source.pairs[body]+1),
                         'type_declaration':token_span(typed_source,typed_source.defs['RedactedHostUrlParser'][0]['start'],
                                                       typed_source.defs['RedactedHostUrlParser'][0]['end']+1),
                         'qualification':'NOT_RUN'}]
    # Follow only uniquely named bare same-file free-function calls; external/method callgraphs remain OPEN.
    while pending:
        path,rec,bid = pending.pop(0); s = source(path)
        for candidate in functions(s):
            if candidate['depth'] != 0: continue
            for i in range(rec['body']+1,rec['end']-1):
                if s.t[i][0] == candidate['name'] and s.t[i+1][0] == '(' and s.t[i-1][0] not in ['.','::','fn']:
                    pick_function(path,candidate['name'],'same_file_bare_call_from:'+bid); break

    ws = adapters['windows_setup']; s = source('codex-rs/cli/src/sandbox_setup.rs')
    definition = s.defs['SandboxSetupCommand']; require(len(definition)==1,'Windows grammar ambiguous')
    definition = definition[0]; windows = []
    for a,b in s.split(definition['body']+1,definition['end']):
        attrs,k = s.attrs(a,b); name = s.t[k][0]
        require(s.t[k+1][0] == ':','Unhandled Windows field')
        windows.append({'id':s.path+'::SandboxSetupCommand.'+name,'name':name,'rust_type':s.raw(k+2,b),
                        'binding':'manual-windows-derived-arg','raw_properties':cli.properties(attrs),
                        'lossless_property_syntax':property_syntax(attrs),
                        'source':token_span(s,a,b),'qualification':'NOT_RUN'})
    require([(w['name'],w['rust_type']) for w in windows] == [(w['name'],w['rust_type']) for w in ws['fields']], 'Windows fields differ')
    windows_grammar = {'source':token_span(s,definition['start'],definition['end']+1),
                       'raw_properties':cli.properties(s.attrs(definition['start'],definition['keyword'])[0]),
                       'lossless_property_syntax':property_syntax(s.attrs(definition['start'],definition['keyword'])[0]),
                       'selector_boundary':ws['parse_source'],
                       'dispatch_cfg':ws['dispatch_cfg'],'dispatch_source':ws['dispatch_source'],
                       'module_cfg_source':ws['module_cfg_source'],'required_group':ws['required_group'],
                       'postparse_level_validation':ws['level_source'],
                       'elevated_required_stage':ws['elevated_required_stage'],
                       'effect_boundary':ws['effect_boundary'],
                       'qualification':'NOT_RUN'}
    manual = [{'owner':a['owner'],'delegate_type':a['delegate_type'],'delegate_fields':a['delegate_fields'],
               'mutations':a['mutations'],'args_impl':a['args_impl'],'from_arg_matches_impl':a['from_arg_matches_impl'],
               'raw_to_domain':a.get('raw_to_domain'),'qualification':'NOT_RUN'} for a in adapters['adapters']]
    # Preserve complete registry/legacy source context instead of guessing the accepted feature-key set.
    feature_context = [span(path,0,len(load(path))) for path in ['codex-rs/features/src/lib.rs','codex-rs/features/src/legacy.rs']]
    return {'kind':'T1_CLI_ARGUMENT_AND_EXPLICIT_PARSER_SOURCE_RULES','pin':PIN,
            'contract_sha256':sha((OUT.parent/'contract.json').read_bytes()), 'reader_helper_sha256':sha(HELPER.read_bytes()),
            'graph_sha256':sha(GRAPH.read_bytes()),'adapter_sha256':sha(ADAPTER.read_bytes()),
            'fields':fields,'command_and_variant_metadata':metadata,'explicit_parser_bindings':explicit,
            'typed_parser_declarations':typed_declarations,
            'parser_recipes':recipes,'source_functions':sorted(bodies.values(),key=lambda r:r['id']),
            'windows_fields':windows,'windows_grammar':windows_grammar,'manual_adapters':manual,
            'config_and_postparse_contracts':[
                {'id':'CONFIG-OVERRIDES','rules':['First equals only; key and value trimmed; missing equals/empty key reject.',
                 'TOML sentinel table parse; fallback strips edge single/double quotes into a string.',
                 'Dotted key text remains a string here; later configuration-layer path semantics are a separate boundary.',
                 'use_legacy_landlock canonicalizes to features.use_legacy_landlock; root overrides prepended with lower precedence.'],
                 'sources':[r['id'] for r in bodies.values() if r['source']['path']==CONFIG], 'qualification':'NOT_RUN'},
                {'id':'SHARED-OPTIONS','rules':['Retain root/subcommand override/inheritance and auto-review rewrite bodies; source acceptance never grants CVG bypass.'],
                 'sources':[r['id'] for r in bodies.values() if r['source']['path']==SHARED], 'qualification':'NOT_RUN'},
                {'id':'FEATURES-REMOTE-WORKTREE-STRICT','rules':['Keep local postparse validation separate from argument syntax.',
                 'Known-feature lookup includes canonical/legacy registry; endpoint/auth/worktree/strict-config rejection has source rules, not measured runtime behavior.'],
                 'sources':[r['id'] for r in bodies.values() if r['source']['path'] in [MAIN,'codex-rs/tui/src/lib.rs']], 'qualification':'NOT_RUN'}],
            'feature_registry_source_context':feature_context,
            'sources':sorted(sources.values(),key=lambda r:r['path']),
            'counts':{'historical_fields':len(fields),'binding_classes':dict(collections.Counter(f['historical_field']['binding'] for f in fields)),
                      'command_type_metadata':105,'variant_metadata':82,'explicit_parser_fields':len(explicit),
                      'distinct_parser_expressions':len(recipes),'source_function_bodies':len(bodies),
                      'windows_additional_fields':len(windows),'manual_adapters':len(manual)},
            'limits':['No actual Clap expansion/accepted grammar, cfg evaluation, reference execution or target parser execution.',
                      'Function bodies and uniquely named bare same-file helper calls are evidence, not a complete runtime callgraph.',
                      'Defaults/properties remain raw source expressions; no Boolean/Option/requiredness inference is treated as execution proof.',
                      'Standard/external parser grammars, TOML/URL/UUID, platform/cwd/env behaviors require future executable oracles.',
                      'All six SDK/package gaps, five prior external limits, TUI/effects and G02/G03/G04 remain mandatory.'],
            'functional_receipts':0,'full_g01_closure':False}


def main():
    fresh = build(); require(fresh == build(),'Nondeterministic source rules')
    negatives = []
    for name,mutation in [
        ('lost_field',lambda v:v['fields'].pop()),
        ('lost_ignored_field',lambda v:v.update(fields=[f for f in v['fields'] if f['historical_field']['binding']!='skip'])),
        ('lost_explicit_parser',lambda v:v['explicit_parser_bindings'].pop()),
        ('lost_default',lambda v:next(f for f in v['fields'] if f['explicit_defaults']).update(explicit_defaults={})),
        ('lost_relation',lambda v:next(f for f in v['fields'] if f['relations']).update(relations={})),
        ('lost_variant_metadata',lambda v:v['command_and_variant_metadata'].pop()),
        ('lost_cfg',lambda v:next(r for r in v['command_and_variant_metadata'] if r['cfg']).update(cfg=[])),
        ('lost_declared_alias',lambda v:next(f for f in v['fields'] if 'alias' in f['raw_properties'])['raw_properties'].pop('alias')),
        ('lost_windows_field',lambda v:v['windows_fields'].pop()),
        ('lost_group_call_arguments',lambda v:v['windows_grammar'].update(lossless_property_syntax={})),
        ('lost_typed_impl_associated_type',lambda v:v.update(typed_parser_declarations=[])),
        ('lost_manual_mutation',lambda v:next(a for a in v['manual_adapters'] if a['mutations'])['mutations'].pop()),
        ('lost_parser_error_body',lambda v:v['source_functions'].pop()),
        ('false_runtime_qualification',lambda v:v['parser_recipes'][0].update(runtime_status='QUALIFIED')),
        ('false_full_closure',lambda v:v.update(full_g01_closure=True)),
    ]:
        bad = copy.deepcopy(fresh); mutation(bad)
        try: require(bad==fresh,'Rejected mutated parser evidence')
        except AssertionError: negatives.append({'id':name,'result':'REJECTED'})
        else: raise AssertionError('Accepted known-bad parser evidence')
    for name,path,old,new,fn in [
        ('input_attempt_range','codex-rs/cloud-tasks/src/cli.rs',b'(1..=4).contains',b'(2..=4).contains','parse_attempts'),
        ('input_env_trim','codex-rs/cli/src/mcp_cmd.rs',b'.map(str::trim)',b'.map(str::to_owned)','parse_env_pair'),
        ('input_config_alias',CONFIG,b'features.use_legacy_landlock',b'features.use_legacy_landlocked','canonicalize_override_key'),
    ]:
        raw=(UP/path).read_bytes();require(old in raw,'Input mutation anchor missing')
        changed=build({path:raw.replace(old,new,1)})
        a=[b['source']['text'] for b in fresh['source_functions'] if b['name']==fn and b['source']['path']==path]
        b=[b['source']['text'] for b in changed['source_functions'] if b['name']==fn and b['source']['path']==path]
        require(a and a!=b,'Input source semantics invisible: '+name)
        negatives.append({'id':name,'result':'REJECTED_BY_EXTRACTED_FUNCTION_CONTENT'})
    path=SHARED;raw=(UP/path).read_bytes();old=b'alias = "yolo"';new=b'alias = "yolx"'
    require(old in raw,'Alias mutation anchor missing')
    try:build({path:raw.replace(old,new,1)})
    except AssertionError as exc:
        require('Reparsed argument properties differ' in str(exc),'Unexpected alias rejection')
        negatives.append({'id':'input_argument_alias','result':'REJECTED_FAIL_CLOSED_ON_PARSED_PROPERTY'})
    else:raise AssertionError('Changed argument alias silently accepted')
    report={'result':'PASS','kind':'SOURCE_RULE_REPRODUCTION_NOT_PARSER_RUNTIME','counts':fresh['counts'],
            'negative_controls':negatives,'functional_receipts':0,'full_g01_closure':False}
    for name,value in [('inventory.json',fresh),('verification.json',report)]:
        if '--check' in sys.argv:require((OUT/name).read_bytes()==encoded(value),'Regeneration differs: '+name)
        else:(OUT/name).write_bytes(encoded(value))
    print(json.dumps(report))


if __name__=='__main__':main()
