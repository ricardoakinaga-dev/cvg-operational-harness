"""T1 source graph: registration -> executor/name/spec -> exposure guards.

The bounded lexer masks Rust literals/comments and balances delimiters. It is
not a Rust compiler. Source expressions and unresolved runtime families remain
explicit. No target module is loaded, compiled, or executed.
"""
from pathlib import Path
import collections
import hashlib
import json
import re
import subprocess

OUT = Path(__file__).resolve().parent
UP = Path('/tmp/cvg-rea-codex-20261017/upstream')
PIN = '8d9f6466ff0294785d56f55b1fe363d132fe4133'
PLAN = 'codex-rs/core/src/tools/spec_plan.rs'
REGISTRY = 'codex-rs/core/src/tools/registry.rs'
HANDLERS = 'codex-rs/core/src/tools/handlers/'
CODEMODE = 'codex-rs/core/src/tools/code_mode/'

def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()

def mask_rust(text):
    chars = list(text)
    i = 0
    while i < len(text):
        end = None
        if text.startswith('//', i):
            end = text.find('\n', i)
            if end < 0: end = len(text)
        elif text.startswith('/*', i):
            depth, j = 1, i+2
            while depth and j < len(text):
                if text.startswith('/*',j): depth += 1; j += 2
                elif text.startswith('*/',j): depth -= 1; j += 2
                else: j += 1
            assert depth == 0, 'Unclosed comment'
            end = j
        else:
            raw = re.match(r'(?:br|r)(#*)"', text[i:])
            if raw:
                close = '"'+raw[1]
                j = text.find(close,i+len(raw[0]))
                assert j >= 0, 'Unclosed raw string'
                end = j+len(close)
            elif text[i] == '"':
                j = i+1
                while j < len(text):
                    if text[j] == '\\': j += 2
                    elif text[j] == '"': break
                    else: j += 1
                assert j < len(text), 'Unclosed string'
                end = j+1
            elif text[i] == "'":
                char = re.match(r"'(?:[^'\\\n]|\\(?:u\{[0-9a-fA-F]+\}|x[0-9a-fA-F]{2}|.))'",text[i:])
                if char: end = i+len(char[0])
        if end is not None:
            for j in range(i,end):
                if chars[j] != '\n': chars[j] = ' '
            i = end
        else: i += 1
    return ''.join(chars)

def balanced(mask, start, opening, closing):
    assert mask[start] == opening
    depth = 0
    for i in range(start,len(mask)):
        if mask[i] == opening: depth += 1
        elif mask[i] == closing:
            depth -= 1
            if depth == 0: return i+1
    raise AssertionError('Unclosed '+opening)

cache = {}
def load(path):
    if path not in cache:
        text = (UP/path).read_text()
        cache[path] = (text,mask_rust(text))
    return cache[path]

def ref(path,start,end=None):
    text,_ = load(path)
    line = text[:start].count('\n')+1
    result = {'path':path,'sha256':sha(UP/path),'line':line,
              'start_offset':start,
              'url':f'https://github.com/openai/codex/blob/{PIN}/{path}#L{line}'}
    if end is not None: result['excerpt'] = text[start:end];result['end_offset'] = end
    return result

def functions(path,start=0,end=None):
    text,mask = load(path)
    end = len(text) if end is None else end
    result = []
    for m in re.finditer(r'\b(?:async\s+)?fn\s+(\w+)\s*(?:<[^{};]*?>)?\s*\(',mask[start:end]):
        offset = start+m.start(); paren = start+m.end()-1
        args_end = balanced(mask,paren,'(',')')
        brace = mask.find('{',args_end,end)
        semi = mask.find(';',args_end,end)
        if brace < 0 or (semi >= 0 and semi < brace): continue
        finish = balanced(mask,brace,'{','}')
        if finish <= end: result.append({'name':m[1],'start':offset,'body_start':brace,'end':finish})
    return result

def function(path,name):
    hits = [r for r in functions(path) if r['name']==name]
    assert len(hits)==1,(path,name,len(hits))
    row = hits[0]
    return ref(path,row['start'],row['end'])

assert subprocess.check_output(['git','-C',str(UP),'rev-parse','HEAD'],text=True).strip()==PIN
assert not subprocess.check_output(['git','-C',str(UP),'status','--porcelain'],text=True).strip()

# Explicit binding of imported aliases/reexports. The source impl is verified
# below; handler names alone never serve as evidence of a tool implementation.
bindings = {}
def bind(alias,path,impl,requirement):
    bindings[alias] = {'path':path,'impl_type':impl,'requirement':requirement}
for alias,module,requirement in [
    ('ExecCommandHandler','unified_exec/exec_command','CDX100-06-01'),
    ('WriteStdinHandler','unified_exec/write_stdin','CDX100-06-04'),
    ('ListMcpResourcesHandler','mcp_resource/list_mcp_resources','CDX100-13-03'),
    ('ListMcpResourceTemplatesHandler','mcp_resource/list_mcp_resource_templates','CDX100-13-03'),
    ('ReadMcpResourceHandler','mcp_resource/read_mcp_resource','CDX100-13-03'),
    ('PlanHandler','plan','CDX100-15-03'),
    ('WaitForEnvironmentHandler','wait_for_environment','CDX100-18-06'),
    ('RequestUserInputHandler','request_user_input','CDX100-15-06'),
    ('RequestUserInputAsyncHandler','request_user_input_async','CDX100-15-06'),
    ('SendMessageToUserAsyncHandler','send_message_to_user_async','CDX100-15-06'),
    ('RequestPermissionsHandler','request_permissions','CDX100-07-03'),
    ('NewContextWindowHandler','new_context_window','CDX100-03-06'),
    ('GetContextRemainingHandler','get_context_remaining','CDX100-03-06'),
    ('CurrentTimeHandler','current_time','CDX100-01-01'),
    ('SleepHandler','sleep','CDX100-01-05'),
    ('ListAvailablePluginsToInstallHandler','list_available_plugins_to_install','CDX100-11-03'),
    ('RequestPluginInstallHandler','request_plugin_install','CDX100-11-03'),
    ('ApplyPatchHandler','apply_patch','CDX100-05-03'),
    ('TestSyncHandler','test_sync','CDX100-01-01'),
    ('ViewImageHandler','view_image','CDX100-19-01'),
    ('DynamicToolHandler','dynamic','CDX100-11-08'),
    ('ToolSearchHandler','tool_search','CDX100-22-03'),
    ('ExtensionToolAdapter','extension_tools','CDX100-11-07'),
]: bind(alias,HANDLERS+module+'.rs',alias,requirement)
for alias,module,requirement in [
    ('SpawnAgentHandler','spawn','CDX100-14-01'),
    ('SendInputHandler','send_input','CDX100-14-03'),
    ('ResumeAgentHandler','resume_agent','CDX100-14-05'),
    ('WaitAgentHandler','wait','CDX100-14-04'),
    ('CloseAgentHandler','close_agent','CDX100-14-05')
]: bind(alias,HANDLERS+'multi_agents/'+module+'.rs','Handler',requirement)
for alias,module,requirement in [
    ('SpawnAgentHandlerV2','spawn','CDX100-14-01'),
    ('SendMessageHandlerV2','send_message','CDX100-14-03'),
    ('FollowupTaskHandlerV2','followup_task','CDX100-14-03'),
    ('WaitAgentHandlerV2','wait','CDX100-14-04'),
    ('InterruptAgentHandler','interrupt_agent','CDX100-15-05'),
    ('ListAgentsHandlerV2','list_agents','CDX100-14-04')
]: bind(alias,HANDLERS+'multi_agents_v2/'+module+'.rs','Handler',requirement)
bind('CodeModeExecuteHandler',CODEMODE+'execute_handler.rs','CodeModeExecuteHandler','CDX100-22-01')
bind('CodeModeWaitHandler',CODEMODE+'wait_handler.rs','CodeModeWaitHandler','CDX100-22-02')

constant_index = collections.defaultdict(list)
helper_index = collections.defaultdict(list)
scanfiles = set((UP/'codex-rs/core/src/tools').rglob('*.rs'))
scanfiles |= set((UP/'codex-rs/code-mode-protocol/src').rglob('*.rs'))
scanfiles |= set((UP/'codex-rs/tools/src').rglob('*.rs'))
for p in sorted(scanfiles):
    if p.name.endswith('_tests.rs') or 'tests' in p.parts: continue
    rel = str(p.relative_to(UP)); text,mask = load(rel)
    cutoff = re.search(r'^#\[cfg\(test\)\]\s*\n(?:mod tests|#\[path)',text,re.M)
    limit = cutoff.start() if cutoff else len(text)
    for m in re.finditer(r'\bconst\s+(\w+):\s*&str\s*=\s*"([^"\n]*)"\s*;',text[:limit]):
        constant_index[m[1]].append({'value':m[2],'source':ref(rel,m.start(),m.end())})
    for row in functions(rel,end=limit):
        if row['name'].startswith('create_'):
            helper_index[row['name']].append(ref(rel,row['start'],row['end']))

# Locate repository from evidence path without relying on cwd.
ROOT = OUT.parents[6]
catalog = json.loads((ROOT/'docs/03_build/tracking/codex100_catalog_v1.json').read_text())
requirements = {r['id']:r for r in catalog['requirements']}
tools = {}
for alias,binding in bindings.items():
    path = binding['path']; text,mask = load(path)
    pattern = r'\bimpl\s+ToolExecutor\s*<[^{}]+?>\s+for\s+'+re.escape(binding['impl_type'])+r'\s*\{'
    hits = list(re.finditer(pattern,mask))
    assert len(hits)==1,(alias,path,'impl',len(hits))
    start=hits[0].start(); brace=hits[0].end()-1
    finish=balanced(mask,brace,'{','}')
    methods = {r['name']:ref(path,r['start'],r['end']) for r in functions(path,start,finish)}
    assert {'tool_name','spec','handle'}<=methods.keys(),(alias,list(methods))
    name_body=methods['tool_name']['excerpt']
    name_expr=re.search(r'ToolName::(plain|namespaced)\(([^)]+)\)',name_body)
    resolved_name=None; constant_sources=[]
    if name_expr:
        parts=[]
        for token in name_expr[2].split(','):
            token=token.strip()
            if token.startswith('"') and token.endswith('"'): parts.append(json.loads(token))
            else:
                candidates=constant_index.get(token,[])
                local=[v for v in candidates if v['source']['path']==path]
                candidates=local or candidates
                if len(candidates)==1: parts.append(candidates[0]['value']);constant_sources.append(candidates[0]['source'])
                else: parts.append(None)
        if all(v is not None for v in parts): resolved_name={'namespace':parts[0] if name_expr[1]=='namespaced' else None,'name':parts[-1]}
    helpers=[]
    for name in sorted(set(re.findall(r'\b(create_\w+)\s*\(',methods['spec']['excerpt']))):
        hits=helper_index.get(name,[])
        helpers.append({'name':name,'candidates':hits,'resolution':'UNIQUE_SOURCE_FUNCTION' if len(hits)==1 else 'OPEN_NOT_UNIQUE_OR_EXTERNAL'})
    rid=binding['requirement'];assert rid in requirements,rid
    tools[alias]={'handler_alias':alias,'impl_type':binding['impl_type'],'implementation':ref(path,start),
       'tool_name_expression':name_body,'resolved_base_name':resolved_name,'constant_sources':constant_sources,
       'name_resolution':'STATIC_BASE_NAME' if resolved_name else 'OPEN_RUNTIME_OR_UNRESOLVED_EXPRESSION',
       'methods':methods,'schema_factory_functions':helpers,'requirement':rid,'owner':requirements[rid]['owner'],
       'runtime_qualification':'NOT_RUN','coverage':'SOURCE_IMPL_BINDING; schema fields/delegated effects need separate expansion',
       'requirement_relationship':'PROPOSED_SUPPORTING_SURFACE; this handler alone does not cover or qualify the parent requirement'}
    if alias.endswith('V2') or alias=='InterruptAgentHandler':
        tools[alias]['effective_namespace']='Runtime multi_agent_v2.tool_namespace via multi_agent_v2_handler wrapper; base plain name is not effective wire namespace.'

guards = {
 'add_shell_tools': 'Core startup sandbox ceiling; ShellTool enabled; model shell_type not Disabled; require_unified_exec satisfied. UnifiedExec selects resumable+stdin versus one-shot. Options depend on tty, permission approval exposure and environment count/OS.',
 'add_mcp_resource_tools': 'Core startup sandbox ceiling; has MCP servers OR effective ToolMode is CodeModeOnly. Model-access checks in resource executor remain separate.',
 'add_core_utility_tools': 'Core startup sandbox ceiling plus per-handler predicate in full function; features/config/model/root-agent/environment conditions are preserved as source, not assumed true.',
 'add_collaboration_tools': 'Core startup sandbox ceiling and collab_tools_enabled. V1 checks spawn-depth and search exposure. V2 checks native-tools/model agent-path compatibility, direct-message disable, optional wait, namespace and model catalog overrides.',
 'register_code_mode_executors': 'Effective CodeMode or CodeModeOnly. Reachable nested tools separately pass code_mode_tools and exec-wrapper policy; registration alone does not grant indirect execution.',
 'append_dynamic_tool_runtimes': 'Runtime Function or Namespace specs must construct a DynamicToolHandler successfully; registered external with registry policy/collision checks. Input namespace/schema set is open-ended.',
 'append_extension_tool_executors': 'Runtime extension contributors provide executors; hosted web/run checked against provider/model/feature + web mode; image_gen/imagegen checked by image_generation_available. Registry external policy applies.',
 'append_tool_search_executor': 'Caller-selected exposure plus DeferredToolWorldState source-listing configuration; cache produces ToolSearchHandler. Caller guards in finalize_tool_router remain required.',
 'append_source_tools': 'Prepared runtime source tools carry exposure; registry external policy, reserved-name and collision checks apply. Concrete input tool set is runtime data.'
}
utility_predicates = {
 'PlanHandler':'config.update_plan_enabled',
 'WaitForEnvironmentHandler':'Feature::DeferredExecutor; config supplies optional tool description',
 'RequestUserInputHandler':'config.experimental_request_user_input_enabled; DirectModelOnly',
 'RequestUserInputAsyncHandler':'experimental_request_user_input_enabled AND root agent AND (model advertises request_user_input_async OR legacy send_user_message_async); DirectModelOnly',
 'SendMessageToUserAsyncHandler':'root agent AND (SendMessageToUserAsync feature OR model advertises send_message_to_user_async); DirectModelOnly',
 'RequestPermissionsHandler':'Feature::RequestPermissionsTool',
 'NewContextWindowHandler':'Feature::TokenBudget; DirectModelOnly',
 'GetContextRemainingHandler':'Feature::TokenBudget',
 'CurrentTimeHandler':'Feature::CurrentTimeReminder OR model advertises clock',
 'SleepHandler':'Feature::SleepTool AND (AlwaysOn OR ModelDriven with current-time reminder sleep_tool option/model clock); preserve exact branch semantics in guard_source',
 'ListAvailablePluginsToInstallHandler':'ToolSuggest AND Apps AND Plugins features; nonempty candidates; presentation ListTool',
 'RequestPluginInstallHandler':'ToolSuggest AND Apps AND Plugins features; nonempty candidates',
 'ApplyPatchHandler':'model apply_patch_tool_type is_some; environment count changes schema',
 'TestSyncHandler':'model experimental_supported_tools contains test_sync_tool; internal/test purpose does not imply cfg(test)',
 'ViewImageHandler':'Feature::ViewImage; model original-image capability, unified image budget and environment count change schema'
}
plan_text,plan_mask=load(PLAN); plan_functions=functions(PLAN)
sites=[]
site_pattern=r'\bregistry\s*\.\s*(add|add_with_exposure|register_trusted|register_trusted_with_exposure|prepend_trusted|register_external|register_external_with_exposure)\s*\('
for m in re.finditer(site_pattern,plan_mask):
    finish=balanced(plan_mask,m.end()-1,'(',')')
    enclosing=[r for r in plan_functions if r['body_start']<m.start()<r['end']]
    assert enclosing,('No enclosing function',m.start())
    caller=min(enclosing,key=lambda r:r['end']-r['start'])['name']
    expression=plan_text[m.start():finish]
    aliases=[name for name in tools if re.search(r'\b'+re.escape(name)+r'\b',expression)]
    if not aliases:
        aliases={
          'append_dynamic_tool_runtimes':['DynamicToolHandler'],
          'append_extension_tool_executors':['ExtensionToolAdapter'],
          'append_tool_search_executor':['ToolSearchHandler'],
          'register_code_mode_executors':['CodeModeExecuteHandler'],
          'append_source_tools':[]
        }.get(caller,[])
    assert caller in guards,('Unreviewed registration family',caller)
    assert aliases or caller=='append_source_tools',('Unresolved static handler',caller,expression)
    sites.append({'id':'TOOL-REG-'+str(len(sites)+1).zfill(3),'source':ref(PLAN,m.start(),finish),
        'caller':caller,'registration_method':m[1],'handler_bindings':aliases,
        'resolution':'BOUND_STATIC_IMPL' if aliases else 'EXPLICIT_RUNTIME_INPUT_FAMILY',
        'guard_summary':guards[caller],'guard_source':function(PLAN,caller),
        'per_handler_predicates':{alias:utility_predicates[alias] for alias in aliases if alias in utility_predicates},
        'global_registry_guard':REGISTRY,'runtime_qualification':'NOT_RUN'})

policy_functions=['register_trusted_with_exposure','prepend_trusted','register_external_with_exposure']
exposure_functions=['effective_tool_mode','requested_tool_mode']
exposure=[function('codex-rs/core/src/tools/mod.rs',name) for name in exposure_functions]
for name in ['collab_tools_enabled','multi_agent_v2_enabled','required_child_management_tool_names',
             'tool_suggest_enabled','standalone_web_search_enabled','image_generation_available',
             'build_tool_router','build_core_tool_registry','finalize_tool_router','extension_tool_executors',
             'apply_mcp_tool_exposure_policy','build_model_visible_specs','is_directly_visible',
             'code_mode_tools','is_excluded_from_code_mode','spec_for_model_request','hosted_model_tool_specs']:
    exposure.append(function(PLAN,name))

used={alias for site in sites for alias in site['handler_bindings']}
assert used==set(tools),('Binding not connected to registration',set(tools)-used)
result={'commit':PIN,'scope':'All direct registry mutations in spec_plan.rs; statically bound core handlers, explicit runtime families and source guard functions. Not all upstream tools/extensions or behavioral closure.',
 'registration_site_count':len(sites),'handler_binding_count':len(tools),'registration_sites':sites,
 'handler_bindings':tools,'registry_policy_functions':[function(REGISTRY,name) for name in policy_functions],
 'dispatch_boundary_functions':[function(REGISTRY,name) for name in ['dispatch_any_with_state','handle_any_tool']],
 'multi_agent_v2_wrapper':function('codex-rs/core/src/tools/multi_agent_tool.rs','multi_agent_v2_handler'),
 'exposure_and_factory_functions':exposure,
 'known_open_edges':['MCP runtime tool contributor set and each external extension factory/hosted schema.',
 'Full input/output field/default/error variants and delegated helper paths for each executor.',
 'All branch reachability on source-bound executable, actual policy grants, hooks, cancellation and side effects.',
 'Runtime namespaces/catalog overrides, code-mode callbacks and source dynamic schema reconciliation.'],
 'functional_receipts':0,'full_g01_closure':False,'scope_review':'REQUIRES_INDEPENDENT_REVIEW'}
(OUT/'tool-graph.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'registration_sites':len(sites),'handler_bindings':len(tools),'static_names':sum(bool(r['resolved_base_name']) for r in tools.values()),'functional_receipts':0}))
