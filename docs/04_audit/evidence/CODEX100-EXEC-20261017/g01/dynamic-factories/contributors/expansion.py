"""Owned, stdlib-only expansion of the seven additional source contributors.
Executed only by reader.py; never imports or executes upstream code.
"""
import json
import re

EXT = 'codex-rs/ext/'


def expand(r, census):
    tools, families = [], []
    by_owner = {x['owner']: x for x in census['implementations'] if not x['test_only']}

    def fn(path, name):
        return r.function(path, name)

    def const(path, name):
        text = r.texts[path]
        m = re.search(r'\bconst\s+' + name + r'\s*:[^=;]+?=\s*("(?:\\.|[^"\\])*")\s*;', text)
        assert m, (path, name)
        return {'value': json.loads(m[1]), 'source': r.ref(path, m.start(), m.end())}

    def method(executor, name):
        matches = [m for m in executor['methods'] if m['name'] == name]
        assert len(matches) == 1, (executor['owner'], name)
        return matches[0]

    def tool(family, ident, namespace, name, owner, path, input_contract, output_contract,
             schema, parallel, gates, defaults, errors, boundary, sources, exposure=None):
        executor = r.executor(path, owner)
        methods = {m['name']: m for m in executor['methods']}
        actual_exposure = 'Direct'
        if 'exposure' in methods:
            body = r.scopes[methods['exposure']['source']]['text']
            actual_exposure = re.search(r'ToolExposure::(\w+)', body)[1]
        assert exposure is None or exposure == actual_exposure
        if 'supports_parallel_tool_calls' not in methods:
            assert parallel is False, 'parallel default must be false'
        else:
            parallel_body = r.scopes[methods['supports_parallel_tool_calls']['source']]['text']
            if re.search(r'\{\s*true\s*\}', parallel_body):
                assert parallel is True
            elif family == 'goal':
                assert 'matches!(self.kind, GoalToolKind::Get)' in parallel_body
                assert parallel == (name == 'get_goal')
            elif family == 'history-notes':
                assert 'self.action.supports_parallel_tool_calls()' in parallel_body
                action_methods = [m for m in r.functions(path) if m['name']=='supports_parallel_tool_calls' and '(self)' in m['signature']]
                assert len(action_methods)==1
                action_body=r.scopes[action_methods[0]['source']]['text']
                assert '!matches!(self, Self::NotesAppendToFile | Self::NotesWriteFile)' in action_body
                assert parallel == (schema['action_variant'] not in ('NotesAppendToFile','NotesWriteFile'))
            else:
                raise AssertionError('unbound parallel expression: '+ident)
        schema = {'strict': False, 'defer_loading': None, 'output_schema': None, **schema}
        row = {'id': ident, 'family': family, 'namespace': namespace, 'name': name,
            'name_binding': method(executor, 'tool_name')['source'], 'executor': executor,
            'input': input_contract, 'output': output_contract,
            'input_type': input_contract['name'], 'output_type': output_contract['name'],
            'schema': schema, 'exposure': actual_exposure + (' (explicit override)' if 'exposure' in methods else ' (ToolExecutor default)'),
            'preferred_surfaces': {'direct': actual_exposure in ('Direct', 'DirectModelOnly'),
                'deferred': actual_exposure in ('Deferred', 'DeferredModelOnly'),
                'code_mode': actual_exposure in ('Direct', 'Deferred', 'CodeModeOnly')},
            'parallel': parallel, 'parallel_source': methods.get('supports_parallel_tool_calls', {'source':'shared ToolExecutor default false'})['source'],
            'gate_contract': gates, 'defaults_and_limits': defaults, 'error_contract': errors,
            'direct_handle_boundary': boundary, 'direct_handle': method(executor, 'handle'),
            'support_sources': sources, 'runtime_schema_closed': False, 'input_schema_origin':'runtime MCP' if family=='guardian-conversation-history' else 'fixed source construction, not executed'}
        tools.append(row)
        return row

    def family(owner, name, ids, sources, unknowns):
        impl = by_owner[owner]
        regs = [x for x in census['registrations'] if x['path'] == impl['path']]
        if owner == 'ConversationHistoryTools':
            regs = [x for x in census['registrations'] if x['path'].endswith('guardian-v2/src/sync_reviewer/mod.rs')]
        assert len(regs) == 1, (owner, regs)
        families.append({'family': name, 'owner': owner, 'status': 'SOURCE_EXPANDED',
            'implementation': impl['source'], 'factory_methods': impl['methods'],
            'registration': regs[0]['source'], 'registration_factory': regs[0]['factory_or_callsite'],
            'tool_ids': ids, 'support_sources': sources, 'qualified_unknowns': unknowns})

    family('SkillsExtension<C>', 'skills', ['skills.list','skills.read'],
           {'contributor':r.whole(EXT+'skills/src/extension.rs'),'factory':fn(EXT+'skills/src/tools/mod.rs','skill_tools')},
           ['Provider catalogs/resources and host capabilities remain runtime values; original phase1 tool chains retained byte-semantically.'])
    board_names = ['create_channel','get_channels','list_threads','search_posts','read_thread','read_post','subscribe','unsubscribe','post']
    family('BoardExtension<C>', 'agent-message-board', ['agent-message-board.'+n for n in board_names],
           {'contributor':r.whole(EXT+'agent-message-board/src/extension.rs'),'factory':fn(EXT+'agent-message-board/src/tools.rs','message_board_tools_with_descriptions')},
           ['Backend storage/membership and host-resolved namespace remain runtime obligations; original phase1 tool chains retained.'])

    # Persisted goals: three kind-dispatched executors; visibility != execution allowed.
    base = EXT + 'goal/src/'
    path = base + 'tool.rs'
    support = {n: r.whole(base + n) for n in ('tool.rs', 'spec.rs', 'runtime.rs', 'extension.rs')}
    protocol = 'codex-rs/protocol/src/protocol.rs'
    goal_output = r.type_item(path, 'GoalToolResponse')
    goal_output['transitive_types'] = [r.type_item(protocol, n) for n in ('ThreadGoal', 'ThreadGoalStatus')]
    goal_output['serialization'] = fn(path, 'goal_response')
    for kind, cname, specfn, args in [('get', 'GET_GOAL_TOOL_NAME', 'create_get_goal_tool', None),
            ('create', 'CREATE_GOAL_TOOL_NAME', 'create_create_goal_tool', 'CreateGoalRequest'),
            ('update', 'UPDATE_GOAL_TOOL_NAME', 'create_update_goal_tool', 'UpdateGoalArgs')]:
        name = const(base + 'spec.rs', cname)
        input_contract = r.type_item(path, args) if args else {'name':'function-argument payload without JSON decoding',
            'source':fn(path, 'handle_get')['source'], 'note':'Advertised empty object; handle_get only checks function payload variant, not JSON/object keys.'}
        tool('goal', 'goal.' + name['value'], None, name['value'], 'GoalToolExecutor', path,
            input_contract, goal_output, {'constructor':fn(base+'spec.rs',specfn), 'name_constant':name}, kind == 'get',
            {'summary':'Runtime handle and tools_visible required for construction; tool.execution_allowed derives tools_available. Direct handle refuses nonpersistent execution before kind dispatch.',
             'visibility':fn(base+'runtime.rs','tools_visible'), 'availability':fn(base+'runtime.rs','tools_available'),
             'runtime_lookup':fn(base+'extension.rs','goal_runtime_handle')},
            {'summary':'Constructor execution_allowed=true, then contributor overwrites it. Create trims objective, validates, uses request.token_budget.or(max_goal_token_budget); budgets positive and <= maximum. Update permits Complete/Blocked/Paused; no runtime check of three-turn prose requirement. Goal response camelCase; remaining_tokens clamp at zero; completion budget hint only on complete update.',
             'budget_validation':fn(path,'validate_goal_budget'), 'response_constructor_source':support['tool.rs']},
            {'variants':['RespondToModel','Fatal'], 'direct_dispatch':fn(path,'handle'), 'kind_handle':fn(path,'handle_'+kind),
             'parse':fn(path,'parse_arguments'), 'serialize':fn(path,'goal_response'),
             'accounting':fn(path,'account_active_goal_progress')},
            'ToolCall -> execution_allowed -> handle_'+kind+' -> persistent thread_goals DB/accounting/events/metrics -> GoalToolResponse JSON; database/provider effects not executed.', support)
    family('GoalExtension<C>', 'goal', [t['id'] for t in tools if t['family']=='goal'], support,
           ['StateRuntime DB/accounting/backend scheduling behavior is source-bound at calls, not observed; semantic user-intent instructions are not proven by runtime parsing.'])

    # Guardian history: fixed known names, runtime MCP specs and live parent gates.
    base = EXT + 'guardian-v2/src/sync_reviewer/'
    path = 'codex-rs/core/src/mcp_tool_call/conversation_history.rs'
    support = {'contributor':r.whole(base+'conversation_history.rs'), 'registration_host':r.whole(base+'mod.rs'),
        'factory':fn(path,'conversation_history_tools'), 'live_binding':fn(path,'history_binding'),
        'core_export':r.whole('codex-rs/core/src/guardian_review.rs'),
        'spec_conversion':fn('codex-rs/tools/src/responses_api.rs','mcp_tool_to_responses_api_tool'),
        'spec_projection':fn('codex-rs/tools/src/responses_api.rs','tool_definition_to_responses_api_tool'),
        'mcp_schema_parser':r.whole('codex-rs/tools/src/mcp_tool.rs')}
    outpath = 'codex-rs/core/src/tools/context.rs'
    output = r.type_item(outpath, 'McpToolOutput')
    output['output_impls'] = [{k:v for k,v in x.items() if not k.startswith('_')} for x in r.impls(outpath,'ToolOutput') if x['owner']=='McpToolOutput']
    for name in ('search_messages','read_messages'):
        assert '"'+name+'"' in r.scopes[support['factory']['source']]['text']
        tool('guardian-conversation-history','guardian.user_message.'+name,'user_message',name,'HistoryTool',path,
            {'name':'serde_json::Value / current rmcp::Tool.inputSchema','source':fn(path,'handle')['source'],
             'qualified_unknown':'Actual schema properties/types are supplied by the current hosted Apps MCP binding. No frozen input schema is available in this source slice.'},
            output, {'construction':'mcp_tool_to_responses_api_tool(prepared.tool_info().tool, schema_max_bytes=None)',
                'constructor':support['spec_conversion'], 'factory':support['factory'], 'projection':support['spec_projection'], 'strict':False,
                'defer_loading':None, 'output_schema':'Some(ToolOutputSchema::from_mcp_output_schema(runtime optional schema))', 'qualified_unknown':'Concrete MCP input/output schemas and annotations are runtime external values.'},
            True, {'summary':'Registration feature in isolated reviewer; parent upgrade; Apps + GuardianConversationHistoryTools features; current live MCP binding; prepared host-owned Apps tool; enabled app policy; approval-required calls fail closed. Every handle reacquires binding/policy/auth; no second Apps connection.',
                'factory':support['factory'],'live_binding':support['live_binding'],'handle':fn(path,'handle')},
            {'summary':'Contributor max_output_tokens defaults4000, configurable NonZeroUsize. Effective cap=min(prepared output cap, reviewer cap), then lower of caller truncation policy and token cap. Missing parent/factory failures yield no tools at turn start.', 'source':support['contributor']},
            {'variants':['anyhow -> FunctionCallError::RespondToModel'], 'source':fn(path,'handle')},
            'ToolCall -> parent live binding -> function JSON Value -> hosted Apps/app enabled/approval gate -> prepared.call -> McpToolOutput with metadata capture false and reviewer truncation; this is a sensitive external backend boundary.',support,'DirectModelOnly')
    family('ConversationHistoryTools','guardian-conversation-history',[t['id'] for t in tools if t['family']=='guardian-conversation-history'],support,
           ['Known executor identities are expanded; concrete MCP schemas, annotations, account/authorization and remote result values remain runtime external.'])

    # History/notes: every action in ALL has its own namespace, name and schema arm.
    base = EXT + 'history-notes/src/'
    path = base+'tools.rs'
    support = {'tools':r.whole(path),'contributor':r.whole(base+'extension.rs'),'backend':r.whole(base+'backend.rs')}
    text = r.texts[path]
    actions = re.search(r'const ALL: \[Self; 9\] = \[([\s\S]*?)\];',text)
    assert actions
    variants = re.findall(r'Self::(\w+)',actions[1]); assert len(variants)==9
    def variant_strings(function):
        return dict(re.findall(r'Self::(\w+)\s*=>\s*"([^"]+)"',r.scopes[fn(path,function)['source']]['text']))
    names, endpoints = variant_strings('name'), variant_strings('endpoint')
    namespace_sources = {n:const(path,n) for n in ('HISTORY_NAMESPACE','NOTES_NAMESPACE')}
    namespace_map = {}
    for nm in re.finditer(r'((?:Self::\w+\s*(?:\|\s*)?)+)=>\s*([A-Z_]+)',r.scopes[fn(path,'namespace')['source']]['text']):
        for variant in re.findall(r'Self::(\w+)',nm[1]):
            namespace_map[variant] = nm[2]
    assert set(namespace_map)==set(variants)
    description_constant = const(path,'HISTORY_AGENT_NAME_DESCRIPTION')['value']
    for variant in variants:
        name=names[variant]; namespace=namespace_sources[namespace_map[variant]]['value']
        match = re.search(r'Self::'+variant+r'\s*=>\s*json!\(\s*\{',text)
        assert match
        left=text.index('{',match.start()); depth=0; right=None
        for i in range(left,len(text)):
            if r.mask(path)[i]=='{':depth+=1
            elif r.mask(path)[i]=='}':
                depth-=1
                if depth==0:right=i+1;break
        assert right
        literal=text[left:right].replace('HISTORY_AGENT_NAME_DESCRIPTION',json.dumps(description_constant))
        schema=json.loads(literal)
        tool('history-notes',namespace+'.'+name,namespace,name,'HistoryNotesTool',path,
            {'name':'serde_json::Value object','schema_fields':list(schema['properties']), 'source':fn(path,'handle_call')['source'],
             'note':'Local executor parses Value; backend rejects nonobject, injects authoritative context; remote service owns operation validation/defaults.'},
            {'name':'HistoryNotesToolOutput','type':r.type_item(path,'HistoryNotesToolOutput'),'output_impl':support['tools'],
             'qualified_unknown':'Remote operation JSON shapes are not statically typed; encrypted_output/images transformations are source-bound.'},
            {'parameters':schema,'arm':r.ref(path,match.start(),right),'constructor':fn(path,'spec'),'action_variant':variant,
             'namespace_source':namespace_sources[namespace_map[variant]]},
            variant not in ('NotesAppendToFile','NotesWriteFile'),
            {'summary':'Requires token_budget.use_history_notes_extension, OpenAI provider and current auth uses Codex backend; constructor also requires HistoryNotesAgentIdentity and stored config. Identity from session AgentPath; host updates config/remove state.', 'source':support['contributor']},
            {'summary':'Blank args -> {}; backend injects context(session_id,current_agent_name), timeout35s, encrypted-argument header on search/write endpoints; truncation policy forwarded via header. Omitted operation defaults are backend-owned; descriptions specify current-agent paths, read/write visibility, 1,000,000 UTF-8 byte file cap; these are advertised remote obligations, not local enforcement.', 'backend':support['backend'], 'tools':support['tools']},
            {'variants':['RespondToModel on JSON/backend/image errors'], 'call':fn(path,'handle_call'),
             'backend':fn(base+'backend.rs','call'),'output_transform':support['tools']},
            'ToolCall -> raw function args -> JSON Value -> HistoryNotesBackend.call('+endpoints[variant]+') with host context -> HistoryNotesToolOutput; separates images before logged JSON, supports encrypted content, blocks code-mode exposure.',support,'DirectModelOnly')
        tools[-1]['endpoint']=endpoints[variant]
    family('HistoryNotesExtension','history-notes',[t['id'] for t in tools if t['family']=='history-notes'],support,
           ['Remote API object schemas, semantic defaults, encryption and storage behavior are external obligations; local conversions/headers/endpoints are bound. Source description strings are evidence, not instructions for CVG or this worker.'])

    # Dedicated memory tools: typed backend response schemas, common error mapping.
    base=EXT+'memories/src/'
    support={n:r.whole(base+n) for n in ('lib.rs','extension.rs','backend.rs','schema.rs','tools/mod.rs')}
    for suffix,owner,argtype,outtype,cname,parallel in [
        ('ad_hoc_note','AddAdHocNoteTool<B>','AddAdHocNoteArgs','AddAdHocMemoryNoteResponse','ADD_AD_HOC_NOTE_TOOL_NAME',False),
        ('list','ListTool<B>','ListArgs','ListMemoriesResponse','LIST_TOOL_NAME',True),
        ('read','ReadTool<B>','ReadArgs','ReadMemoryResponse','READ_TOOL_NAME',True),
        ('search','SearchTool<B>','SearchArgs','SearchMemoriesResponse','SEARCH_TOOL_NAME',True)]:
        path=base+'tools/'+suffix+'.rs';name=const(base+'lib.rs',cname);namespace=const(base+'lib.rs','MEMORY_TOOLS_NAMESPACE')
        source={**support,'executor':r.whole(path)}
        tool('memories',namespace['value']+'.'+name['value'],namespace['value'],name['value'],owner,path,
            r.type_item(path,argtype),r.type_item(base+'backend.rs',outtype),
            {'construction':'memory_function_tool::<'+argtype+','+outtype+'>', 'constructor':fn(base+'tools/mod.rs','memory_function_tool'),
             'generator':support['schema.rs'],'name_constant':name,'namespace_constant':namespace,
             'output_schema':'Some(output_schema_for::<O>())'},parallel,
            {'summary':'Thread config exists AND enabled (Feature::MemoryTool && config.memories.use_memories) AND config.memories.dedicated_tools; LocalMemoriesBackend root under codex_home/version directory; generic backend is Clone+Send+Sync. These tool handlers do not separately check prose user-intent instructions.', 'source':support['extension.rs']},
            {'summary':'Blank args -> {}; unknown fields denied. list max_results default/cap2000; read line_offset default1, max_tokens20000; search match Any/context_lines0/case_sensitive true/normalized false/max_results default-cap200; max_results clamped1..max. Ad-hoc filename regex/length and nonempty note advertised by schemars; backend validates runtime request.',
             'constants':support['lib.rs'],'handle':fn(path,'handle_call'),'request_conversion':fn(path,'into_request') if suffix=='search' else None},
            {'variants':['RespondToModel for invalid-path/cursor/filename/notfound/offset/query/note/match errors','Fatal for MemoriesBackendError::Io'],
             'mapping':fn(base+'tools/mod.rs','backend_error_to_function_call'),'type':r.type_item(base+'backend.rs','MemoriesBackendError'),
             'handle':fn(path,'handle_call')},
            'ToolCall -> parse_args -> typed backend request -> backend.'+('add_ad_hoc_note' if suffix=='ad_hoc_note' else suffix)+' -> metrics -> common error map -> JsonToolOutput; ad-hoc note is a write boundary.',source)
    memory_support_types=r.all_types(base+'backend.rs')
    family('MemoriesExtension','memories',[t['id'] for t in tools if t['family']=='memories'],
           {**support,'factory':fn(base+'tools/mod.rs','memory_tools'),'backend_trait':r.type_item(base+'backend.rs','MemoriesBackend'),'backend_types':memory_support_types},
           ['Generic backend implementations and local filesystem operations are not executed; backend call/typed/error contracts are expanded.'])

    # File copying: same executor regardless of selected endpoints, endpoint fs grants captured.
    base=EXT+'multi-env-copy-file/src/';path=base+'tool.rs';name=const(path,'TOOL_NAME')
    support={'tool':r.whole(path),'contributor':r.whole(base+'extension.rs')}
    tool('file-copy','file-copy.'+name['value'],None,name['value'],'CopyFileTool',path,
        r.type_item(path,'CopyFileArgs'),{'name':'JsonToolOutput {bytes_copied}','source':fn(path,'handle')['source']},
        {'constructor':fn(path,'spec'),'name_constant':name,'additionalProperties':False,
         'required':['source_environment_id','source_path','target_environment_id','target_path']},False,
        {'summary':'Host installs after MultiEnvCopyFile flag (host source from phase1 app-server/debug CLI). Direct handle requires distinct environment IDs, selected endpoint existence and absolute path convention; uses environment.fs() bound to each endpoint policy/current grants.', 'source':fn(path,'handle')},
        {'summary':'All four string arguments required; deny_unknown_fields; no fallback environment/path; streaming read->write, legacy target may buffer. Failed/interrupted copies can leave truncated/partially written destination. Bytes remain outside model context.', 'source':support['tool']},
        {'variants':['RespondToModel for parse, endpoint/path and I/O failures'], 'source':fn(path,'handle'), 'redaction':'I/O kind only; avoids executor URL credential strings.'},
        'ToolCall -> CopyFileArgs -> resolve two host-bound fs endpoints -> read_file_stream -> write_file_stream -> bytes_copied JSON; partial external filesystem effects possible.',support)
    family('FileCopyExtension','file-copy',[tools[-1]['id']],support,['Actual endpoint filesystem grants/streaming/partial-write behavior is a host/executor obligation, not observed.'])

    # Image generation/editing: all entry modes return one native executor.
    base=EXT+'image-generation/src/';path=base+'tool.rs';name=const(base+'lib.rs','IMAGEGEN_TOOL_NAME');namespace=const(base+'lib.rs','IMAGE_GEN_NAMESPACE')
    support={n:r.whole(base+n) for n in ('lib.rs','extension.rs','tool.rs','backend.rs','artifact.rs')}
    support['description']=r.extra_source('codex-rs/ext/image-generation/imagegen_description.md')
    tool('image-generation',namespace['value']+'.'+name['value'],namespace['value'],name['value'],'ImageGenerationTool',path,
        r.type_item(path,'ImagegenArgs'),{'name':'GeneratedImageOutput','type':r.type_item(path,'GeneratedImageOutput'),'output_impl':support['tool.rs']},
        {'constructor':fn(path,'imagegen_tool_spec'),'name_constant':name,'namespace_constant':namespace,'description':support['description'],
         'construction':'schemars draft2019_09 inline_subschemas=true; retain properties/required/type/additionalProperties; output_schema=None'},False,
        {'summary':'Stored ImageGenerationExtensionConfig.available and supported OpenAI/auth provider; direct parsing denies unknown fields and checks edit-source exclusivity/count/environment images. Config availability and actual provider/auth are separate.', 'source':support['extension.rs'],'request':fn(path,'request_for_call_args')},
        {'summary':'transparent_background serde default false => Opaque, true=>Transparent; no references=>generate; paths or last1..5 images=>edit, mutually exclusive. Model gpt-image-2, size auto, quality Auto, n None. Executor saved output cap32MiB and bounded base64; best-effort save/upload failures fall back inline. save_root branch uses LOCAL_FS sandbox None upstream, not CVG authority.',
         'request':fn(path,'request_for_call_args'),'save':fn(path,'save_image_generation_result')},
        {'variants':['RespondToModel for input/read/request/provider failures and empty image data'], 'handle':fn(path,'handle_call'),
         'parse':fn(path,'parse_args'),'input':fn(path,'request_for_call_args'),'usage_limit':fn(path,'usage_limit_failure')},
        'ToolCall -> ImagegenArgs -> generate/edit request and input file/history reads -> CodexImagesBackend -> image lifecycle events -> optional file save/attachment upload -> GeneratedImageOutput; network/filesystem/attachment effects not executed.',support,'Direct')
    family('ImageGenerationExtension','image-generation',[tools[-1]['id']],support,
           ['Provider/API/image codecs, filesystem/attachment executors and returned pixels are not observed. Upstream LOCAL_FS sandbox None save branch is source evidence, never a CVG grant.'])

    # Standalone web: complete SearchCommands wire types; schema is not compacted.
    base=EXT+'web-search/src/';path=base+'tool.rs';name=const(path,'RUN_TOOL_NAME');namespace=const(path,'WEB_NAMESPACE')
    api='codex-rs/codex-api/src/search.rs'
    support={n:r.whole(base+n) for n in ('extension.rs','tool.rs','schema.rs','output.rs','history.rs')}
    support['description']=r.extra_source('codex-rs/ext/web-search/web_run_description.md')
    support['api_search_types']=r.whole(api)
    support['all_search_types']=r.all_types(api)
    tool('web-search',namespace['value']+'.'+name['value'],namespace['value'],name['value'],'WebSearchTool',path,
        r.type_item(api,'SearchCommands'),{'name':'SearchOutput','type':r.type_item(base+'output.rs','SearchOutput'),'output_impl':support['output.rs'],
         'response_type':r.type_item(api,'SearchResponse')},
        {'constructor':fn(path,'spec'),'name_constant':name,'namespace_constant':namespace,'generator':fn(base+'schema.rs','commands_schema'),
         'construction':'schemars SearchCommands draft2019_09 inline_subschemas=true option_add_null_type=false; six keys retained; parse_tool_input_schema_without_compaction preserves descriptions/metadata.',
         'description':support['description']},True,
        {'summary':'Stored config.available requires supported provider and web mode !=Disabled; core decides selection via feature/model metadata in lead pipeline. search_settings sets allowed_callers Direct; external_web_access false for Disabled/Cached, indexed mode for Indexed, true for Live. Provider/auth resolved on each call.',
         'source':support['extension.rs']},
        {'summary':'Blank args -> SearchCommands::default(); all11 command members optional; no command required in local handler. Request reasoning None; recent_input history; max_output_tokens from caller truncation budget with saturating conversion. No local default response_length assigned; server owns omitted command defaults. Output is external-context plain text; telemetry logs placeholder.',
         'parse':fn(path,'parse_commands'),'handle':fn(path,'handle_call'),'settings':fn(base+'extension.rs','search_settings')},
        {'variants':['RespondToModel on argument JSON parse','Fatal on provider/auth/transport/search failures'],
         'parse':fn(path,'parse_commands'),'handle':fn(path,'handle_call')},
        'ToolCall -> SearchCommands -> resolve provider/auth/transport -> SearchClient.search -> lifecycle events/results metrics -> SearchOutput text; remote search/finance/weather/sports/time operations are provider boundaries, not local effects observed.',support,'Direct')
    family('WebSearchExtension','web-search',[tools[-1]['id']],support,
           ['Remote search command semantics, service defaults/results and provider authorization remain external; all local command wire types, spec construction, output and direct error paths are expanded.'])
    assert len(tools)==21
    assert len(families)==9
    return tools, families
