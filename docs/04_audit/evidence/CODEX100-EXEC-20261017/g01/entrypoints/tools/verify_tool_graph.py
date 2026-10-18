"""Integrity and counterfactual checks for a bounded T1 source graph."""
from pathlib import Path
import ast
import copy
import hashlib
import json
import re

OUT=Path(__file__).resolve().parent
UP=Path('/tmp/cvg-rea-codex-20261017/upstream')

def require(value,message):
    if not value: raise AssertionError(message)

def validate(graph):
    require(graph['functional_receipts']==0 and graph['full_g01_closure'] is False,'False parity closure')
    sites=graph['registration_sites'];tools=graph['handler_bindings']
    require(graph['registration_site_count']==len(sites)==39,'Missing registration site')
    require(graph['handler_binding_count']==len(tools)==36,'Missing handler')
    require(graph['test_only_registration_sites']==1 and graph['non_test_textual_registration_sites']==38,'Compile-time scope count wrong')
    require(len({r['id'] for r in sites})==39,'Duplicate site ID')
    used={name for r in sites for name in r['handler_bindings']}
    require(used==tools.keys(),'Dangling/disconnected binding')
    for r in sites:
        require(r['guard_source']['excerpt'] and r['guard_summary'],'Missing guard')
        require(r['handler_bindings'] or r['caller']=='append_source_tools','Hidden unmatched static site')
        require(r['runtime_qualification']=='NOT_RUN','False qualification')
        expression=r['source']['excerpt']
        direct={alias for alias in tools if re.search(r'\b'+re.escape(alias)+r'\b',expression)}
        indirect={'append_source_tools':set(),'register_code_mode_executors':{'CodeModeExecuteHandler'},
                  'append_dynamic_tool_runtimes':{'DynamicToolHandler'},
                  'append_extension_tool_executors':{'ExtensionToolAdapter'},
                  'append_tool_search_executor':{'ToolSearchHandler'}}
        expected=direct or indirect.get(r['caller'],set())
        require(set(r['handler_bindings'])==expected,'Registration expression/handler mismatch: '+r['id'])
        expected_predicates={alias:UTILITY_PREDICATES[alias] for alias in expected if alias in UTILITY_PREDICATES}
        require(r['per_handler_predicates']==expected_predicates,'Per-handler guard omission/change: '+r['id'])
        cfg=[v['excerpt'].replace(' ','') for v in r['guard_source']['compile_time_guards']]
        test_only=r['caller']=='append_source_tools'
        require(('#[cfg(test)]' in cfg)==test_only,'Function cfg(test) guard lost')
        require((r['compile_time_classification']=='TEST_ONLY_CFG_TEST')==test_only,'Test-only classification lost')
        core=r['caller'] in ['add_shell_tools','add_mcp_resource_tools','add_core_utility_tools','add_collaboration_tools']
        require(bool(r['inherited_guard_sources'])==core,'Inherited guard link missing')
        if core:
            excerpt=r['inherited_guard_sources'][0]['excerpt']
            require('require_managed_sandbox' in excerpt and 'turn_environments().any' in excerpt,'Thread/all-environment startup ceiling missing')
    for name,row in tools.items():
        require({'tool_name','spec','handle'}<=row['methods'].keys(),'Missing executor boundary: '+name)
        require(row['runtime_qualification']=='NOT_RUN','False handler qualification')
    require(tools['CurrentTimeHandler']['resolved_base_name']=={'namespace':'clock','name':'curr_time'},'Clock namespace/name lost')
    require(tools['SleepHandler']['resolved_base_name']=={'namespace':'clock','name':'sleep'},'Sleep namespace/name lost')
    require(tools['SpawnAgentHandler']['resolved_base_name']['namespace']=='multi_agent_v1','V1 namespace lost')
    require('tool_namespace' in tools['SpawnAgentHandlerV2']['effective_namespace'],'V2 runtime namespace lost')
    require({n for n,r in tools.items() if r['resolved_base_name'] is None}=={'DynamicToolHandler','ExtensionToolAdapter'},'Unexplained unresolved names')
    require(len([r for r in sites if 'ExecCommandHandler' in r['handler_bindings']])==2,'Unified/one-shot distinction lost')
    require(any('one_shot' in r['source']['excerpt'] for r in sites),'One-shot constructor missing')
    require('reserved name' in graph['registry_policy_functions'][2]['excerpt'],'External reserved-name guard lost')
    paths={};excerpts=0
    def visit(value):
        nonlocal excerpts
        if isinstance(value,dict):
            if {'path','sha256','line','start_offset'}<=value.keys():
                p=UP/value['path'];text=p.read_text()
                require(hashlib.sha256(p.read_bytes()).hexdigest()==value['sha256'],'Source digest drift: '+value['path'])
                require(text[:value['start_offset']].count('\n')+1==value['line'],'Source line mismatch')
                if 'excerpt' in value:
                    require(text[value['start_offset']:value['end_offset']]==value['excerpt'],'Excerpt mismatch')
                    excerpts+=1
                paths[value['path']]=value['sha256']
            for v in value.values(): visit(v)
        elif isinstance(value,list):
            for v in value:visit(v)
    visit(graph)
    # Independent textual check against this pinned file: any extra registry
    # mutation must be reconciled rather than hidden by a current graph count.
    plan=(UP/'codex-rs/core/src/tools/spec_plan.rs').read_text()
    source_calls=list(re.finditer(r'\bregistry\s*\.\s*(?:add|add_with_exposure|register_trusted|register_trusted_with_exposure|prepend_trusted|register_external|register_external_with_exposure)\s*\(',plan))
    require({m.start() for m in source_calls}=={r['source']['start_offset'] for r in sites},'Source registration coverage drift')
    return {'source_files':len(paths),'excerpts':excerpts,'sites':39,'handlers':36}

tree=ast.parse((OUT/'build_tool_graph.py').read_text())
UTILITY_PREDICATES=next(ast.literal_eval(n.value) for n in tree.body if isinstance(n,ast.Assign)
                        and any(isinstance(t,ast.Name) and t.id=='utility_predicates' for t in n.targets))
graph=json.loads((OUT/'tool-graph.json').read_text())
result=validate(graph)
negative=[]
for name,mutate in [
    ('removed_registration',lambda g:g['registration_sites'].pop()),
    ('removed_handler_impl',lambda g:g['handler_bindings']['PlanHandler']['methods'].pop('handle')),
    ('lost_namespace',lambda g:g['handler_bindings']['CurrentTimeHandler']['resolved_base_name'].update(namespace=None)),
    ('invented_qualification',lambda g:g['handler_bindings']['PlanHandler'].update(runtime_qualification='PASS_CURRENT')),
    ('swapped_registration_bindings',lambda g:(g['registration_sites'][9].update(handler_bindings=['SleepHandler']),g['registration_sites'][18].update(handler_bindings=['PlanHandler']))),
    ('erased_handler_predicates',lambda g:g['registration_sites'][9].update(per_handler_predicates={})),
    ('erased_compile_time_guard',lambda g:g['registration_sites'][0]['guard_source'].update(compile_time_guards=[])),
    ('erased_inherited_guard',lambda g:g['registration_sites'][3].update(inherited_guard_sources=[])),
]:
    bad=copy.deepcopy(graph);mutate(bad)
    try:validate(bad)
    except AssertionError as error:negative.append({'name':name,'result':'REJECTED','reason':str(error)})
    else:raise AssertionError('Known-bad graph accepted: '+name)

# Exercise only our masking/balancing helper definitions, not target code or
# the generator body. Literals/comments containing fake functions must not win.
selected=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in ['mask_rust','balanced']]
env={'re':re};exec(compile(ast.Module(body=selected,type_ignores=[]),'<source-lexer-probe>','exec'),env)
fixture='// registry.add(Fake);\nfn real() { let s = r#"} registry.add(Fake)"#; /* { /* } */ } */ registry.add(Real); }'
masked=env['mask_rust'](fixture)
require(masked.count('registry.add')==1,'Lexer included literal/comment registration')
start=masked.index('{');require(env['balanced'](masked,start,'{','}')==len(masked),'Brace mask broken')
result.update(kind='T1_STATIC_GRAPH_VERIFICATION_NOT_FUNCTIONAL_PARITY',negative_controls=negative,
              lexical_probe='PASS',functional_receipts=0,full_g01_closure=False)
(OUT/'verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(result,ensure_ascii=False))
