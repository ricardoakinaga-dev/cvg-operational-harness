"""T1 exec-server method/direction/dispatch graph; never runs target code."""
from pathlib import Path
import ast
import collections
import hashlib
import json
import re
import subprocess

OUT=Path(__file__).resolve().parent
ROOT=next(p for p in OUT.parents if (p/'docs/07_agents/AGENTS.md').is_file())
G01=OUT.parent
UP=Path('/tmp/cvg-rea-codex-20261017/upstream')
PIN='8d9f6466ff0294785d56f55b1fe363d132fe4133'
REGISTRY='codex-rs/exec-server/src/server/registry.rs'
HANDLER='codex-rs/exec-server/src/server/handler.rs'
RPC='codex-rs/exec-server/src/rpc.rs'
CLIENT='codex-rs/exec-server/src/client.rs'
HELPER=G01/'entrypoints/tools/build_tool_graph.py'

def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def write(p,v):p.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n')
def read(p):return json.loads(p.read_text())
env={'UP':UP,'PIN':PIN,'cache':{},'re':re,'sha':digest}
tree=ast.parse(HELPER.read_text())
definitions=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in ['mask_rust','balanced','load','ref','functions','function']]
exec(compile(ast.Module(body=definitions,type_ignores=[]),'<reviewed-static-reader>','exec'),env)
load,ref,functions,balanced=map(env.get,['load','ref','functions','balanced'])

def named(path,name,occurrence=None):
    rows=[r for r in functions(path) if r['name']==name]
    assert rows,(path,name)
    if occurrence is None:assert len(rows)==1,(path,name,len(rows))
    i=0 if occurrence is None else occurrence;row=rows[i]
    result=ref(path,row['start'],row['end'])
    result.update(function=name,occurrence=i,match_count=len(rows),header=load(path)[0][row['start']:row['body_start']])
    return result

def anchor(path,marker,after=9,before=6,occurrence=None):
    text,_=load(path);hits=[m.start() for m in re.finditer(re.escape(marker),text)]
    assert hits,(path,marker)
    if occurrence is None:assert len(hits)==1,(path,marker,len(hits))
    i=hits[0 if occurrence is None else occurrence]
    lines=text.splitlines(keepends=True);number=text[:i].count('\n');start=sum(map(len,lines[:max(0,number-before)]));end=sum(map(len,lines[:number+after+1]))
    result=ref(path,start,end);result.update(marker=marker,marker_line=number+1);return result

def result_type(header):
    match=re.search(r'->\s*Result\s*<',header)
    assert match,header
    start=match.end();depth=0
    for i in range(start,len(header)):
        if header[i]=='<':depth+=1
        elif header[i]=='>':
            if depth==0:return header[start:i].strip()
            depth-=1
        elif header[i]==',' and depth==0:return header[start:i].strip()
    raise AssertionError('Unclosed Result type')

assert subprocess.check_output(['git','-C',str(UP),'rev-parse','HEAD'],text=True).strip()==PIN
assert not subprocess.check_output(['git','-C',str(UP),'status','--porcelain'],text=True).strip()
constants={}
for p in sorted((UP/'codex-rs/exec-server-protocol/src').glob('*.rs')):
    text=p.read_text()
    for m in re.finditer(r'^pub const (\w*METHOD): &str = "([^"]+)";',text,re.M):
        constants[m[1]]={'method':m[2],'source':ref(str(p.relative_to(UP)),m.start(),m.end())}
assert len(constants)==32
catalog=read(ROOT/'docs/03_build/tracking/codex100_catalog_v1.json')
requirements={r['id']:r for r in catalog['requirements']}
text,masked=load(REGISTRY);routes={}
for m in re.finditer(r'\brouter\.(request(?:_with_id|_with_trace)?|notification)\s*\(\s*(\w+METHOD)\s*,',masked):
    opening=masked.index('(',m.start());end=balanced(masked,opening,'(',')');fragment=text[m.start():end]
    typed=re.search(r'\b_?params:\s*([\w:]+|\(\))',fragment)
    calls=re.findall(r'\bhandler\s*\.\s*(\w+)\s*\(',fragment)
    assert typed and len(calls)==1,(m[2],typed,calls)
    target=named(HANDLER,calls[0]);output=result_type(target['header'])
    routes[m[2]]={'kind':'CONTROLLER_TO_EXECUTOR_REQUEST' if m[1]!='notification' else 'CONTROLLER_TO_EXECUTOR_NOTIFICATION',
        'registry_api':m[1],'wire_params_type':typed[1],'handler':target,'handler_result_type':output,
        'wire_response_type':None if m[1]=='notification' else 'HttpRequestResponse' if m[2]=='HTTP_REQUEST_METHOD' else output,
        'registry_source':ref(REGISTRY,m.start(),end),
        'response_semantics':'NONE_NOTIFICATION' if m[1]=='notification' else 'HANDLER_SENDS_HEADER_RESPONSE_BEFORE_BODY_STREAM; router unit Ok produces no duplicate response' if m[1]=='request_with_id' else 'ROUTER_SERIALIZES_HANDLER_RESULT_OR_ERROR',
        'wire_to_domain_conversion':'try_into_request(resolve_filesystem_sandbox)' if 'try_into_request' in fragment else 'WireExecParams.into()' if m[2]=='EXEC_METHOD' else 'NONE_IN_REGISTRY',
        'requires_initialized_session':calls[0] not in ['initialize','initialized'],
        'state_cases':['before_initialize','after_initialize_before_initialized','attached_and_initialized','resumed_by_other_connection','malformed_params','handler_error','connection_loss_before_or_after_effect'],
        'qualification':'NOT_RUN'}
assert len(routes)==26

outgoing={
 'EXEC_OUTPUT_DELTA_METHOD':('ExecOutputDeltaNotification','codex-rs/exec-server/src/local_process.rs','.notify(crate::protocol::EXEC_OUTPUT_DELTA_METHOD, &notification)',
      ['seq order/duplicate/gap','stdout vs stderr','empty/base64/oversized chunk','unknown process','disconnect and late tail output']),
 'EXEC_EXITED_METHOD':('ExecExitedNotification','codex-rs/exec-server/src/local_process.rs','.notify(crate::protocol::EXEC_EXITED_METHOD, &notification)',
      ['exit code null/value','legacy sandboxDenied omitted','seq and pending tail output','unknown process','transport loss']),
 'EXEC_CLOSED_METHOD':('ExecClosedNotification','codex-rs/exec-server/src/local_process.rs','.notify(EXEC_CLOSED_METHOD, &notification)',
      ['closed arrives before output/exited','terminal release only after ordered delivery','duplicate/unknown process','retained replay/retirement and recovery']),
 'HTTP_REQUEST_BODY_DELTA_METHOD':('HttpRequestBodyDeltaNotification','codex-rs/exec-server/src/client/http_response_body_stream.rs','.notify(HTTP_REQUEST_BODY_DELTA_METHOD, &delta)',
      ['header response before body setup','request-local IDs and replacement','seq/eof/error fields','channel cap and size limits','drop/disconnect and late deltas']),
 'NETWORK_POLICY_DECISION_METHOD':('NetworkPolicyDecisionNotification','codex-rs/exec-server/src/local_process.rs','notifications.try_notify(NETWORK_POLICY_DECISION_METHOD, &notification)',
      ['malformed payload ignored','unknown process/no audit context ignored','validated reason/host/process caps','best-effort audit event vs authority response','protocol values and policyOverride'])
}
for constant,(payload,path,marker,cases) in outgoing.items():
    routes[constant]={'kind':'EXECUTOR_TO_CONTROLLER_NOTIFICATION','wire_params_type':payload,'wire_response_type':None,
       'sender_source':anchor(path,marker),'receiver_source':named(CLIENT,'handle_server_notification'),
       'state_cases':cases,'qualification':'NOT_RUN'}
routes['NETWORK_POLICY_REQUEST_METHOD']={'kind':'EXECUTOR_TO_CONTROLLER_REQUEST','wire_params_type':'NetworkPolicyRequestParams','wire_response_type':'NetworkPolicyRequestResponse',
    'sender_source':named('codex-rs/exec-server/src/network_policy_decisions.rs','network_policy_decider'),
    'receiver_source':anchor('codex-rs/exec-server/src/client_recovery.rs','if request.method != NETWORK_POLICY_REQUEST_METHOD',after=90,before=4),
    'receiver_response_source':anchor('codex-rs/exec-server/src/client_recovery.rs','.respond(request_id, &NetworkPolicyRequestResponse { decision })',after=11,before=120),
    'response_source':named('codex-rs/exec-server/src/rpc_server_requests.rs','complete'),
    'state_cases':['host empty/control/whitespace/253-byte cap','missing controller sender','timeout plus transport margin','process shutdown cancellation','allow/deny/ask and reason validation','malformed/unknown-process request','duplicate/invalid request ID and reverse request concurrency'],
    'qualification':'NOT_RUN'}
assert routes.keys()==constants.keys()

operations=[]
for constant,binding in constants.items():
    rid='CDX100-EXEC-RPC-'+binding['method'].replace('/','.')
    assert rid in requirements,rid
    row={'requirement':rid,'owner':requirements[rid]['owner'],'method':binding['method'],'constant':constant,
         'method_source':binding['source'],**routes[constant]}
    if constant=='HTTP_REQUEST_METHOD':row['wire_response_type_source']=named('codex-rs/exec-server/src/client/rpc_http_client.rs','http_request',0)
    operations.append(row)

generic={
 'protocol_wire':anchor('codex-rs/exec-server-protocol/src/rpc.rs','pub struct JSONRPCRequest',after=40,before=3),
 'wire_dialect':anchor('codex-rs/exec-server-protocol/src/rpc.rs','dialect, which omits',after=3,before=1),
 'params_decode':named(RPC,'decode_params'),
 'request_adapter':named(RPC,'request_with_trace'),
 'deferred_response_adapter':named(RPC,'request_with_id'),
 'notification_adapter':named(RPC,'notification'),
 'filesystem_sandbox_resolution':named(REGISTRY,'resolve_filesystem_sandbox'),
 'initialization_guard':named(HANDLER,'require_initialized_for'),
 'attachment_guard':named(HANDLER,'require_session_attached'),
 'initialize_transition':named(HANDLER,'initialize'),
 'initialized_transition':named(HANDLER,'initialized'),
 'notification_dispatch':named('codex-rs/exec-server/src/server/request_dispatcher.rs','handle_notification'),
 'request_dispatch':named('codex-rs/exec-server/src/server/request_dispatcher.rs','dispatch_request'),
 'request_admission':named('codex-rs/exec-server/src/server/request_dispatcher.rs','dispatch_request'),
 'reverse_request_timeout':named('codex-rs/exec-server/src/rpc_server_requests.rs','call_with_timeout'),
 'outbound_notification_limiter':named('codex-rs/exec-server/src/client_inbound_request_limit.rs','client_inbound_message_exceeded_limit'),
 'network_audit_validation':named('codex-rs/exec-server/src/client/network_policy_audit.rs','emit_network_policy_decision'),
}
errors=[named(RPC,name) for name in ['invalid_request','method_not_found','invalid_params','internal_error']]
result={'pin':PIN,'kind':'BOUNDED_SOURCE_FLOW_GRAPH_NOT_RUNTIME_QUALIFICATION','operations':operations,
 'counts':dict(collections.Counter(r['kind'] for r in operations)),
 'generic_sources':generic,'error_constructors':errors,'reader_helper':{'path':str(HELPER.relative_to(ROOT)),'sha256':digest(HELPER)},
 'semantic_notes':['Request/notification serialization omits jsonrpc version field; the version constant does not add it.',
  'Absent params become null; empty-object decode retries as null for unit/compatible legacy paths.',
  'Most operations require initialize, initialized and current attached connection; failed initial attachment can reset the initialize latch.',
  'Filesystem Wire-to-domain conversion resolves caller sandbox context before the handler; this is not CVG tenant/grant authorization proof.',
  'Network policy request is reverse traffic; network policy decision notification is an audit event, not its response.',
  'HTTP handler returns unit internally but sends HttpRequestResponse and starts body streaming after enqueue; router does not emit a second unit response.'],
 'functional_receipts':0,'full_g01_closure':False,
 'remaining':['Type inventory joins and custom codecs/transitive types','Direct effect implementations, replay/retention/resource bounds and platform/source-specific behavioral cases','Authenticated controller/tenant and native CVG governance; reference executable binding in G02']}
write(OUT/'flows.json',result)
print(json.dumps({'operations':len(operations),'counts':result['counts'],'functional_receipts':0}))
