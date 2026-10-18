from pathlib import Path
import datetime, hashlib, json, re, subprocess

ROOT = Path('/home/ricardo/Área de trabalho/cvg-operational-harness')
OUT = ROOT / 'docs/04_audit/evidence/CODEX100-EXEC-20261017/g04/full-native-spec/wire-scout'
PIN = Path('/tmp/cvg-rea-codex-20261017/upstream')
HEAD = '8d9f6466ff0294785d56f55b1fe363d132fe4133'
db = json.loads((OUT / 'sources-initial.json').read_text())
src = {s['id']: s for s in db['sources']}
raw = {k: (OUT / v['snapshot']).read_bytes() for k,v in src.items()}
lines = {k: v.decode().splitlines() for k,v in raw.items()}
sha = lambda b: hashlib.sha256(b).hexdigest()
def dump(name, data):
    (OUT/name).write_text(json.dumps(data, ensure_ascii=False, indent=2)+'\n')

# Finite selected ranges, not an inventory of the whole protocol.
rs = {
 'S02': [(504,506),(2833,2867)], 'S06': [(1,len(lines['S06']))],
 'S07': [(1,len(lines['S07']))], 'S08': [(1,len(lines['S08']))],
 'S09': [(1,len(lines['S09']))], 'S10': [(1,88)],
 'S11': [(226,242),(499,563),(858,862),(1057,1079),(1757,1772),(1793,1831),(1950,1996),(2080,2099)],
 'S12': [(47,166),(185,222),(341,488),(497,525),(1679,1723),(2024,2030)],
 'S13': [(30,38),(154,310),(353,365),(369,489),(559,582)],
 'S14': [(234,373),(1222,1229),(1345,1355),(1423,1453),(1665,1696)],
 'S16': [(28,89),(201,294),(383,437)],
 'S17': [(56,225)],
 'S18': [(112,247),(750,760),(976,991)], 'S19': [(1,38)],
 'S20': [(912,942)], 'S21': [(1636,1669),(2934,3026),(3841,3898)],
 'S22': [(505,735),(1622,1683)], 'S23': [(27,84)], 'S24': [(15,40)],
 'S25': [(159,205),(1014,1147),(1217,1233),(1336,1362),(1581,1595)],
 'S26': [(904,908)], 'S27': [(10,75)], 'S28': [(531,550)],
 'S29': [(199,306)], 'S30': [(76,110)],
 'S31': [(160,203),(835,988)], 'S32': [(364,420)],
}
assert len(src) <= 35
assert sum(map(len, rs.values())) <= 60, sum(map(len,rs.values()))
spans=[]
for sid,ranges in rs.items():
    physical=raw[sid].splitlines(keepends=True)
    for start,end in ranges:
        assert 1<=start<=end<=len(physical),(sid,start,end)
        b=b''.join(physical[start-1:end])
        spans.append({'id':f'{sid}:{start}-{end}','source':sid,'start_line':start,'end_line_inclusive':end,
          'byte_start':sum(map(len,physical[:start-1])), 'bytes':len(b),'sha256':sha(b)})
def cite(sid, start):
    matches=[s['id'] for s in spans if s['source']==sid and s['start_line']<=start<=s['end_line_inclusive']]
    assert len(matches)==1,(sid,start,matches)
    return matches[0]
def camel(s):
    return re.sub(r'_([a-z])',lambda m:m[1].upper(),s)
def block(sid,symbol,kind='struct'):
    t=lines[sid]; start=next(i for i,l in enumerate(t) if re.search(r'pub '+kind+' '+symbol+r'\b',l))
    balance=0
    for end in range(start,len(t)):
        balance+=t[end].count('{')-t[end].count('}')
        if balance==0: break
    return start,end
def fields(sid,symbol,variant=None):
    start,end=block(sid,symbol,'enum' if variant else 'struct')
    t=lines[sid]; camel_fields=True
    if variant:
        start=next(i for i in range(start,end) if re.match(r'\s*'+variant+r'\s*\{',t[i]))
        bal=0
        for z in range(start,end+1):
            bal+=t[z].count('{')-t[z].count('}')
            if bal==0: break
        end=z
        camel_fields=symbol!='UserInput'
    rows=[]; attrs=[]; docs=[]
    for i in range(start+1,end):
        l=t[i].strip()
        m=re.match(r'(?:pub )?(\w+): (.+),$',l)
        if m:
            name,typ=m.groups(); a=' '.join(attrs); optional=typ.startswith('Option<')
            default=bool(re.search(r'\bdefault\b',a)); skip=bool(re.search(r'skip_serializing_if',a)); special='deserialize_double_option' in a
            exp=re.findall(r'#\[experimental\((.*?)\)\]',a)
            null=optional
            missing='None' if optional else ('Default::default()' if default else 'REJECT missing field')
            if special: missing='outer None: inherit; explicit null: Some(None): clear; value: Some(Some(value))'
            flat='serde(flatten)' in a
            rows.append({'wire_name':None if flat else camel(name) if camel_fields else name,'rust_type':typ,
              'wire_presence':'flattened union, not an image key' if flat else 'conditional on serde skip predicate' if skip else 'serialized field present (nullable if Option), subject to runtime experimental filtering',
              'flattened_shape':'ImageReference: url:String OR fileId:String; no image wrapper property' if flat else None,
              'decode_missing':missing,'decode_null':('accepted; clear' if special else 'accepted as None') if null else 'REJECT null',
              'serialize_none_or_default':('omit according to skip predicate' if skip else 'emit null' if optional else 'emit value, including default'),
              'experimental_attribute':exp,'serde_attributes':' '.join(x for x in attrs if 'ts(' not in x),
              'source_line':i+1,'notes':' '.join(docs)})
            attrs=[];docs=[]
        elif l.startswith('///'): docs.append(l[3:].strip())
        elif l.startswith('#[') or (attrs and l and not l.startswith('//')): attrs.append(l)
    if symbol=='Thread':
        for row in rows:
            row['decode_missing']='NOT_ASSERTED: output descriptor; custom Thread compatibility Deserialize outside selected range'
            row['decode_null']='NOT_ASSERTED: output descriptor; use rust_type for nullability of serialized field'
    return {'source_symbol':symbol+('::'+variant if variant else ''),'citation':cite(sid,start+1),
      'serialization':'camelCase fields' if camel_fields else 'enum rename_all affects variant tag; these variant fields retain snake_case unless explicitly renamed',
      'fields':rows}

types={}
for sid,names in {
 'S23':['InitializeParams','ClientInfo','InitializeCapabilities','InitializeResponse'],
 'S12':['ThreadStartParams','ThreadStartResponse','ThreadResumeParams','ThreadResumeResponse','ThreadResumeInitialTurnsPageParams','ThreadReadParams','ThreadReadResponse','ThreadStartedNotification'],
 'S13':['TurnToolOutput','TurnStartParams','TurnStartResponse','TurnInterruptParams','TurnInterruptResponse','ByteRange','TextElement','TurnStartedNotification','TurnCompletedNotification'],
 'S14':['ItemStartedNotification','ItemCompletedNotification','AgentMessageDeltaNotification','DynamicToolCallParams','DynamicToolCallResponse'],
 'S16':['Thread','Turn','TurnError'],
 'S27':['DynamicToolFunctionSpec','DynamicToolNamespaceSpec'],
}.items():
    for symbol in names: types[symbol]=fields(sid,symbol)
for symbol, sid, variants in [('UserInput','S13',['Text','Image','LocalImage','Audio','LocalAudio','Skill','Mention']),('ThreadItem','S14',['UserMessage','AgentMessage','DynamicToolCall'])]:
    for variant in variants: types[f'{symbol}.{variant}']=fields(sid,symbol,variant)

def method(name,params,result,source,paths,lifecycle):
    return {'method':name,'direction':'client -> server','request_params':params,'response_result':result,
      'citations':[source],'native_paths':paths,'lifecycle_and_limitations':lifecycle,'status':'SOURCE_BOUND / PROPOSED_MAPPING / NOT_IMPLEMENTED / NOT_RUN'}
def path(p,status): return {'path':p,'status':status}
PROP='PROPOSED path only; Lead must settle physical package/export in SPEC0239; no file created'
adapter='packages/harness/src/codex-app-server/'
methods=[
 method('initialize','InitializeParams','InitializeResponse',cite('S11',500),[path(adapter+'connection.ts',PROP)],
   'Connection OnceLock state. Validate clientInfo.name as HeaderValue before commit; repeated initialize => -32600 Already initialized. Commit does not await initialized notification. Response environment fields must be truthful for CVG and require explicit comparison rule; no invented protocolVersion.'),
 method('thread/start','ThreadStartParams','ThreadStartResponse',cite('S11',552),[path(adapter+'threads.ts',PROP),path('packages/harness/src/session/events.ts','EXISTING validators only; not a thread store or opening API')],
   'Create durable thread/session binding under trusted composition, not RPC id. Source sends response then thread/started; turns empty. Root options carry model/policy/sandbox configuration, not CVG grants. UUIDv7 thread id, sessionId is separately tree-scoped. Ephemeral/historyMode/environments and unsupported options cannot silently become defaults.'),
 method('thread/read','ThreadReadParams','ThreadReadResponse',cite('S11',858),[path(adapter+'threads.ts',PROP),path('packages/harness/src/session/events.ts','EXISTING SessionEventRead cursor validation, distinct from thread/read')],
   'Read metadata and optional history; default includeTurns=false. Parses ThreadId; persisted plus optional live state. No new execution, model call or effect. readState is a read receipt, not CVG delivery ACK. require existing native tenant/ownership binding before lookup.'),
 method('thread/resume','ThreadResumeParams','ThreadResumeResponse',cite('S11',558),[path(adapter+'threads.ts',PROP),path('packages/harness/src/iterative-runtime.ts','EXISTING execute/resume consumer; durable owner integration is Lead scope')],
   'Attach/resume live or cold persisted thread; not institutional approval decision and not event-delivery replay. path/history are experimental alternative sources, with path precedence rules; unsupported here, not file access grants. excludeTurns defaults false. Pagination cursors refer to turns/items list methods outside this selection. Closing thread and sandbox+permissions are errors; do not collapse into a successful restart.'),
 method('turn/start','TurnStartParams','TurnStartResponse',cite('S11',1057),[path(adapter+'turns.ts',PROP),path('packages/harness/src/iterative-runtime.ts','EXISTING IterativeGovernedRuntime.execute'),path('packages/harness/src/iterative-dispatch.ts','EXISTING dispatchTool/dispatchRespond/composeResponse')],
   'Start OR steer active turn. Response is inProgress, items=[], itemsView=notLoaded, error/timestamps=null, not final model result. threadId+input required; toolOutput cannot accompany nonempty input, and toolOutput.name cannot be empty. Full active-turn steering remains unsupported until Lead explicitly implements or disposes divergence. No implicit new execution on duplicate RPC id.'),
 method('turn/interrupt','TurnInterruptParams','TurnInterruptResponse',cite('S11',1075),[path(adapter+'turns.ts',PROP),path('packages/harness/src/iterative-runtime.ts','EXISTING runtime consumes cancellation; durable execution authority/ACK is Lead scope')],
   'Both string ids required; empty turnId has special startup-cancel semantics. Nonempty id mismatch/no active turn => -32600. Normal response {} is deferred until pending requests are drained on TurnAborted OR TurnComplete. Therefore {} does not prove interrupt won, durable ACK, rollback or interrupted terminal. Native durable terminal ordering must decide and preserve confirmed effects.'),
]
notifs=[]
for name,typ,sid,line,module,why in [
 ('thread/started','ThreadStartedNotification','S12',2028,'threads.ts','Emit after durable opening and response scheduling; thread.turns=[]; persisted identity, truthful metadata.'),
 ('turn/started','TurnStartedNotification','S13',562,'events.ts','Native accepted/started execution -> turn inProgress, items=[], itemsView=notLoaded; retain same turn and rootTurnId.'),
 ('item/started','ItemStartedNotification','S14',1348,'events.ts','Persist item identity and lifecycle time before publication; item payload is tagged ThreadItem; not authorization or effect confirmation.'),
 ('item/agentMessage/delta','AgentMessageDeltaNotification','S14',1448,'events.ts','Pass admitted nonterminal provider text to delta under one itemId before terminal release; arguments/tool proposals do not invoke registry bodies. No slicing a completed response.'),
 ('item/completed','ItemCompletedNotification','S14',1426,'events.ts','Authoritative admitted item and lifecycle completion time; success of a tool result is not approval authority. Keep itemId stable across events/history/restart.'),
 ('turn/completed','TurnCompletedNotification','S13',579,'events.ts','One persisted native terminal -> completed/interrupted/failed under approved mapping. Reference includes last agent message as summary or items=[]/notLoaded, not full turn history. Nonterminal wait and uncertain settlement cannot be fabricated as success.'),
]:
    notifs.append({'method':name,'direction':'server -> client notification','params':typ,'citation':cite(sid,line),
      'native_paths':[path(adapter+module,PROP),path('packages/harness/src/session/events.ts','EXISTING validation; catalog/event additions require Lead contract')],
      'mapping_proposal':why,'ack':'none','status':'SOURCE_BOUND / PROPOSED / NOT_RUN'})

errors=[
 {'condition':'typed ClientRequest decode failure, unknown method or wrong params','code':-32600,'message':'Invalid request: {serde error}','data':'absent by helper; actual deserializer text is source/version dependent','citation':cite('S18',112)},
 {'condition':'known ordinary request before initialize','code':-32600,'message':'Not initialized','citation':cite('S18',984)},
 {'condition':'duplicate initialize','code':-32600,'message':'Already initialized','citation':cite('S17',71)},
 {'condition':'invalid client name','code':-32600,'message':"Invalid clientInfo.name: '{name}'. Must be a valid HTTP header value.",'citation':cite('S17',100)},
 {'condition':'experimental API required but not opted in','code':-32600,'message':'experimental_required_message(reason); exact helper text NOT_RESOLVED in bounded selection','citation':cite('S18',987)},
 {'condition':'oversize turn text (character count, not byte count)','code':-32602,'message':'Input exceeds the maximum length of {MAX_USER_INPUT_TEXT_CHARS} characters.','data':['input_error_code=input_too_large','max_chars','actual_chars'],'constant_value':'NOT_RESOLVED imported constant; do not invent numeric cap','citation':cite('S22',505)},
 {'condition':'interrupt targets another active turn','code':-32600,'message':'expected active turn id {turn_id} but found {active_turn_id}','citation':cite('S22',1641)},
 {'condition':'interrupt on terminal/inactive turn','code':-32600,'message':'no active turn to interrupt','citation':cite('S22',1648)},
 {'condition':'interrupt submission failed','code':-32603,'message':'failed to interrupt {startup|turn}: {err}','citation':cite('S22',1679)},
 {'condition':'server draining in turn submission','code':-32600,'message':'Server is draining; retry after reconnecting','data':{'reason':'serverShuttingDown'},'citation':cite('S19',10)},
]

risks=[
 {'id':'W01','severity':'CRITICAL','topic':'approval pause/resume','fact':'PRD0030 requires native institutional decision; selected thread/resume is thread lifecycle; client server-request response is not that authority. Native applyResume checks checkpoint and pendingApprovalId.',
  'proposal':'Retain PENDING as turn.status=inProgress and thread.status={type:active,activeFlags:[waitingOnApproval]}; expose institutional state/decision through separate authorized CVG surface. Poll thread/read if limited to selected notifications; do not invent approval notification or forge command/file approval. Native exact binding/attempt/fence checks remain mandatory. Reject/hold unadmitted wire approval replies; never write approvals from them.',
  'citations':[cite('S06',29),cite('S12',1683),cite('S31',171)]},
 {'id':'W02','severity':'CRITICAL','topic':'responseIntent vs responseText','fact':'dispatchRespond prioritizes trimmed responseText; only otherwise composes nonempty responseIntent. composeResponse calls runModelCall with purpose RESPONSE, context run.input.context; prose saying use observations is not evidence of full tool-result admission.',
  'proposal':'Map only admitted final answer to agentMessage. Qualify direct responseText separately. For responseIntent require actual model-bound full admitted result per PAR0224; no summaries, synthetic call or swapped result. Root snapshot is not proof of a different owner candidate.',
  'citations':[cite('S31',841),cite('S31',939),cite('S06',45)]},
 {'id':'W03','severity':'CRITICAL','topic':'incremental nonterminal text','fact':'Selected provider API is execute -> Promise<ProviderResult> with complete text. Reference forwards AgentMessageContentDelta as notification independently from completion.',
  'proposal':'Lead must add governed incremental provider/runtime event path. Preserve item identity, admission/cancel/deadline/budget and first cause; persist before publication under bounded queue. Hold synthetic terminal until first delta observed. Do not claim current complete-result API satisfies CQ06.',
  'citations':[cite('S30',105),cite('S32',364),cite('S06',32)]},
 {'id':'W04','severity':'CRITICAL','topic':'persistence/replay','fact':'RPC id is transport correlation; notifications lack eventId/sequence/ACK/cursor. emittedAtMs is emission time. thread/read/resume hydrate history; backwards cursors are for other list methods, not CVG delivery ACK. SessionEventRead has afterSequence and limit.',
  'proposal':'Maintain durable native event->wire projection and resource-id bindings, retaining original payload/time across replay. Native cursor/ACK lives on separately versioned CVG API. Reconnecting Codex client initializes then thread/resume/read for history and future notifications; no claim of exact missing-delta replay or cross-process pending RPC continuation absent additional approved contract. Lead owns persistence transactions/DDL and delivery semantics.',
  'citations':[cite('S10',46),cite('S11',2084),cite('S12',476),cite('S29',283)]},
 {'id':'W05','severity':'HIGH','topic':'native tools vs client dynamic tool execution','fact':'Reference item/tool/call delegates tool execution to client after canonical DynamicToolCall start. CQ02/CQ04/CQ05 require registry/policy/approval and bodies native.',
  'proposal':'Use native registry execution; never solicit client tool success as proof of native execution. Optional dynamicToolCall item lifecycle for native READ/WRITE is a GOVERNED projection only, pending explicit rule. Do not emit item/tool/call for those bodies. Command/file-change approvals are outside this native registry path; no server approval request is required for the selected journey. External dynamic tool execution remains UNSUPPORTED/NOT_RUN.',
  'citations':[cite('S11',1828),cite('S25',1099),cite('S06',27)]},
 {'id':'W06','severity':'HIGH','topic':'active turn steering / startup interrupt','fact':'turn/start may return existing turn via Steered; empty turnId interrupts startup; interrupt {} also returned on TurnComplete.',
  'proposal':'Lead must implement source behavior or keep variants unsupported with explicit qualification disposition; do not claim one request=one new turn or every interrupt ACK=interrupted. Preserve native commit order and effect facts.',
  'citations':[cite('S22',685),cite('S22',1628),cite('S25',190)]},
 {'id':'W07','severity':'HIGH','topic':'required metadata, branding, profiles and narrowing','fact':'Thread and Start/Resume responses carry required environment/model/policy/source/history fields with nullable values; no generic SDK result substitutes them.',
  'proposal':'Populate truthful composition-bound facts and native persistent metadata. Fields without honest mapping stay unsupported, not fabricated OpenAI branding/configuration. Non-null unknown tagged variants and smaller input domains retain NOT_RUN obligations. Literal vs governed comparator rules require explicit approval.',
  'citations':[cite('S16',204),cite('S12',188),cite('S08',15)]},
 {'id':'W08','severity':'HIGH','topic':'uncertain settlement and nonterminal waits','fact':'Wire TurnStatus has only completed/interrupted/failed/inProgress. There is no uncertain or waitingApproval terminal variant.',
  'proposal':'Do not flatten native UNKNOWN/UNCERTAIN into successful/failed confirmed effect. Keep authoritative settlement and first cause on CVG surface; wait uses inProgress plus activeFlags when known. Exact terminal/error projection for uncertain outcomes remains Lead decision/rule, unqualified until settled.',
  'citations':[cite('S13',33),cite('S12',1683),cite('S06',70)]},
]

oracle=json.loads(raw['S09'])
observations=[]
for case in oracle['cases']:
    if 'request' not in case: continue
    response=case['response_frame']['message']
    entry={'case':case['case'],'method':case['request']['method'],'rpc_id':response['id'],'frame_sha256':case['response_frame']['sha256']}
    if 'error' in response:
        entry['error_code']=response['error']['code']
        entry['message']=response['error']['message'] if case['request']['method']!='cvg.synthetic.unknown' else response['error']['message'][:65]+'… (full captured bytes in S09)'
    else: entry['result_keys']=list(response['result'])
    observations.append(entry)

contract={
 'task':'DX100-G04:SPECIFY-FULL-NATIVE-JOURNEY','role':'read-only wire scout','status':'COMPLETED_FACTUAL_INPUT_AND_PROPOSAL / NOT_APPROVED / NOT_IMPLEMENTED',
 'parent_task_sha256':src['S07']['initial_sha256'],'reference_pin':HEAD,
 'scope':{'client_methods':[m['method'] for m in methods],'client_notifications':['initialized'],'server_notifications':[n['method'] for n in notifs],
   'conditional_server_requests':['item/tool/call (shape only; unnecessary for native registry journey)'],
   'approval_server_requests':'NOT_REQUIRED_BY_SELECTED_NATIVE_JOURNEY; command/file/permissions review variants not designed or claimed',
   'preserved_program':{'functional_obligations':487,'CVG_controls':22,'families':22,'cards':49,'phases':10,'CQ01_to_CQ14':'NOT_RUN'},
   'parity_claim':False,'functional_receipts':0,'runtime_or_network_execution':False},
 'serialization_rules':{
   'authority':'Rust serde and actual selected handlers; TS/Schemars annotations recorded separately, not decode authority',
   'request':{'required':{'id':'untagged String OR signed i64 exact [-9223372036854775808,9223372036854775807]','method':'string'},'optional':{'params':'JSON value, missing/null => None at generic envelope, but selected typed methods require object params','trace':'W3cTraceContext; nested validation NOT_RESOLVED here'},'jsonrpc':'neither sent nor required; unknown-field runtime behavior beyond fixture NOT_RUN','citation':cite('S10',46)},
   'response':{'success':'{id,result}', 'error':'{id,error:{code:i64,message:string,data?:JSON}}','data_none':'omit','same_id':'exact variant/value, distinguish string 7 vs integer 7; no Number rounding or integer->string rewrite','citation':cite('S10',69)},
   'notification':{'client_initialized':'{"method":"initialized"}; unit variant, no params/id/response','server':'{method,params,emittedAtMs?}; emittedAtMs i64, omitted when None; current sender supplies it','timestamp_units':'emittedAtMs/item lifecycle = milliseconds; Thread/Turn epoch fields = seconds; durationMs = milliseconds','citations':[cite('S11',1757),cite('S11',2084),cite('S26',904)]},
   'field_semantics':'Option<T> normally decodes missing/null as None and serializes None as null unless skip; booleans with serde(default) accept missing=false, reject null; per-field special serializer/predicate retained below. Structs generally accept unknown fields absent deny_unknown_fields; unsupported fields still require explicit admission/qualification disposition.',
   'field_filtering':'Descriptors below give Rust type serialization. Experimental stripping/transport media redaction are separate runtime concerns; cross-connection output filtering and exact outgoing omission of all nested experimental values NOT_QUALIFIED.',
   'notable_input_key':'UserInput::Text serializes text_elements, not textElements: enum rename_all does not rename fields; TextElement is separately camelCase.',
 },
 'types':types,
 'selected_tagged_variants':{
   'ThreadStatus':{'tag':'type','variants':{'notLoaded':{},'idle':{},'systemError':{},'active':{'activeFlags':'required array of waitingOnApproval | waitingOnUserInput'}},'citation':cite('S12',1683)},
   'TurnStatus':{'wire_strings':['completed','interrupted','failed','inProgress'],'citation':cite('S13',33)},
   'TurnItemsView':{'wire_strings':['notLoaded','summary','full'],'default':'full','citation':cite('S16',415)},
   'ThreadHistoryMode':{'wire_strings':['legacy','paginated'],'default':'legacy','citation':cite('S16',78)},
   'ThreadStartSource':{'wire_strings':['startup','clear'],'citation':cite('S12',50)},
   'ThreadItem':{'tag':'type','selected_variants':['userMessage','agentMessage','dynamicToolCall'],'other_variants':'UNSUPPORTED/NOT_PROJECTED in this selected proposal; remain required program obligations. No invented command/file/MCP/plan/reasoning/media result.', 'citation':cite('S14',238)},
   'DynamicToolCallStatus':{'wire_strings':['inProgress','completed','failed'],'citation':cite('S14',1225)},
   'DynamicToolCallOutputContentItem':{'tag':'type','variants':{'inputText':{'text':'required String'},'inputImage':{'imageUrl':'required String'},'inputAudio':{'audioUrl':'required String'}},'native_journey':'only faithful text result considered; media NOT_PROJECTED','citation':cite('S14',1689)},
   'DynamicToolSpec':{'tag':'type','variants':{'function':'DynamicToolFunctionSpec','namespace':'DynamicToolNamespaceSpec'},'namespace_tools':'type:function + DynamicToolFunctionSpec','legacy_decoder':'ThreadStartParams custom deserializer also accepts legacy forms; legacy normalization NOT_RESOLVED/NOT_SUPPORTED, no blanket decode parity','citation':cite('S27',13)},
   'UserInput':{'tag':'type','variants':['text','image','localImage','audio','localAudio','skill','mention'],'image_union':'ImageReference untagged {url:String} or {fileId:String}; exact decoder range S13:437-448 retained','selected_projection':'text; nontext unsupported until native equivalent established','citation':cite('S13',455)},
   'nested_unresolved':['AskForApproval','ApprovalsReviewer','SandboxMode','SandboxPolicy','ActivePermissionProfile','ReasoningEffort','ReasoningSummary','CollaborationMode','Personality','MultiAgentMode','CyberAccessProgram','SelectedCapabilityRoot','ThreadEnvironment','GitInfo','ThreadReadState','ThreadSource custom strings','SessionSource subAgent payload','MessagePhase non-null','MemoryCitation non-null','AgentMessageDelivery non-null','AsyncUserInputQuestion non-null','CodexErrorInfo non-null','MisalignmentErrorDetails non-null','ResponseItem imported history','FunctionCallOutputBody toolOutput','TurnsPage dependencies beyond selected cursors']},
 'identifiers':{
   'rpc':'connection + direction + variant(string/i64) + exact id; correlation only, no principal or idempotency authority',
   'thread':'Thread.id opaque string, generated UUIDv7 in reference; separate persistent native binding (tenant/session/composition); do not substitute RPC id',
   'session':'Thread.sessionId groups session tree; not necessarily Thread.id; singleton native journey may choose one-to-one only as explicit projection rule',
   'turn':'Turn.id generated UUIDv7; rootTurnId nullable lineage, not ownership; turn/start steering preserves existing id',
   'item':'ThreadItem.id stable across started/delta/completed; delta.itemId and tool.callId refer to their item, not server-request id',
   'native_event':'CVG sequence/eventId/schemaFingerprint are distinct durable identity; never inject as required Codex fields',
   'citations':[cite('S10',17),cite('S16',204),cite('S16',386),cite('S14',1448),cite('S14',1668),cite('S29',248)]},
 'connection_and_capabilities':{
   'initialize':'per-connection OnceLock; HeaderValue validation precedes commit, repeated concurrent commit has one winner in source; no execution proof of races',
   'initialized':'logging only in process_notification, does not mutate initialization state or get ACK',
   'connection_scoped':['experimentalApi','optOutNotificationMethods (exact method names)','requestAttestation','clientInfo name/version','negotiated MCP extensions'],
   'process_scoped':['explicitGatewayOauth opt-in sticky across later connections','default originator/residency/user-agent process metadata'],
   'not_grants':['clientInfo','trace','experimentalApi','approvalPolicy','permissions','selectedCapabilityRoots','outputSchema'],
   'serialization_scope':'initialize/thread/start None; thread/read,turn/start,turn/interrupt per threadId; thread/resume threadId or path scope. This is request ordering scope, not durable ownership/fencing.',
   'citations':[cite('S17',71),cite('S17',98),cite('S17',153),cite('S18',176),cite('S18',750),cite('S11',552),cite('S11',1057)]},
 'methods':methods,'notifications':notifs,
 'conditional_dynamic_tool_request':{'method':'item/tool/call','direction':'server -> client request','params':'DynamicToolCallParams','result':'DynamicToolCallResponse','id':'own server-request correlation; distinct from callId/threadId/turnId','needed_for_PRD0030':False,'reason':'Native registry tool execution is required; unsolicited client execution would change authority and proof. Optional future external-tool variant requires separate contract. Shape included to prevent conflation, no body or approval mapping implemented.','citations':[cite('S11',1828),cite('S14',1668),cite('S25',1099)]},
 'errors':{'selected_examples':errors,'helper_constants':{'INVALID_REQUEST':-32600,'METHOD_NOT_FOUND':-32601,'INVALID_PARAMS':-32602,'INTERNAL':-32603,'OVERLOADED':-32001},'citation':cite('S19',3),
   'limitations':'Constants do not establish every dispatch outcome. Unknown method observed as -32600, not automatically -32601. Thread/store/provider/config/fence errors not fully enumerated; preserve raw first cause and mark unqualified, never invent numeric codes. ErrorNotification is outside selected notifications; failed turn error lives in TurnError.'},
 'reference_observations':{'citation':cite('S09',1),'counts':oracle['counts'],'RPC_cases':observations,'scope':'Existing captured fixture only; no new execution. CLI help and advertised discriminants do not prove selected thread/turn paths, stream, approval, persistence or native equivalence. No reference/CVG normalization approved.'},
 'critical_incompatibilities':risks,
 'concrete_projection_proposal':{
   'status':'PROPOSED_GOVERNED_RULE / NOT_APPROVED / NOT_IMPLEMENTED / NOT_RUN',
   'native_path_prefix':adapter,'physical_paths':'recommendation only; Lead owns canonical export/package/store/DDL selection',
   'sequence':['initialize -> truthful CVG environment metadata; initialized is notification only',
     'thread/start -> native durable thread/session binding -> ThreadStartResponse then thread/started',
     'turn/start text -> native execution -> response Turn(inProgress,notLoaded,[]) plus turn/started',
     'native READ -> registry/policy/budget -> real result -> admitted observations/context; proposed dynamicToolCall lifecycle is governed-only because body is native, no item/tool/call',
     'WRITE waits -> turn remains inProgress; thread/read status.activeFlags=[waitingOnApproval]; institutional decision on native CVG port; guarded resume exact bindings; no wire response mutates approval',
     'responseIntent -> governed RESPONSE call with full admitted result; responseText -> direct final provenance, separate case',
     'incremental provider text -> durable native event -> item/started agentMessage -> deltas before terminal -> item/completed; errors retain first cause',
     'native persisted terminal -> turn/completed, summary last agentMessage only or notLoaded empty; interrupt {} is only correlated response',
     'new connection -> initialize -> thread/resume/read from durable views; CVG replay/ACK separate. Never infer delivery acknowledgment from snapshot.'],
   'exact_success_example':{'method':'item/agentMessage/delta','params':{'threadId':'<persisted-thread-id>','turnId':'<persisted-turn-id>','itemId':'<stable-agent-item-id>','delta':'<admitted provider text fragment>'},'emittedAtMs':'<original persisted emission epoch ms, i64>'},
   'example_status':'symbolic payload, not a capture; no provider/tool result invented',
   'source_chain':[cite('S13',170),cite('S14',1448),cite('S25',1014),cite('S32',364),cite('S29',248)],
   'unsupported_policy':'Do not silently drop unsupported params, ignore their semantics or synthesize successful output; explicit NOT_SUPPORTED/NOT_RUN qualification disposition is required. Exact compatible error for each variant is NOT_RESOLVED; cannot claim literal wire parity.'},
 'handoff':{'last_completed_action':'Finite exact selected wire boundary with field descriptors, tagged variants, lifecycle/errors and honest native projection proposal archived',
   'next_action':'Lead resolves W01-W08 in SPEC0239, settles physical paths and persistence/stream contracts, freezes candidate for independent review and applicable gate; no runtime BUILD authority inherited',
   'backlog_delta':'FN02 source-bound proposal available; all CQ01-14 and 487+22 obligations retain existing status/owners, no functional credit',
   'shared_ledgers':'Not edited per delegated write-only boundary and coordination rule5; Lead may incorporate this handoff'}
}
dump('wire-contract.json',contract)
print(json.dumps({'sources':len(src),'cited_spans':len(spans),'type_descriptors':len(types),'field_count':sum(len(v['fields']) for v in types.values()),'methods':len(methods),'notifications':len(notifs)}))
dump('ranges-initial.json',{'spans':spans})
