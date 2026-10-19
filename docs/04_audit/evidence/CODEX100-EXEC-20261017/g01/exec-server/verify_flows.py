"""Verify bounded exec-server source bindings, not target/CVG runtime behavior."""
from pathlib import Path
import ast
import collections
import copy
import hashlib
import json
import re

OUT=Path(__file__).resolve().parent
UP=Path('/tmp/cvg-rea-codex-20261017/upstream')
ROOT=next(p for p in OUT.parents if (p/'docs/07_agents/AGENTS.md').is_file())
COUNTS={'CONTROLLER_TO_EXECUTOR_REQUEST':25,'CONTROLLER_TO_EXECUTOR_NOTIFICATION':1,'EXECUTOR_TO_CONTROLLER_NOTIFICATION':5,'EXECUTOR_TO_CONTROLLER_REQUEST':1}
REQUIRED_GENERIC={
 'protocol_wire':('codex-rs/exec-server-protocol/src/rpc.rs','@pub struct JSONRPCRequest'),
 'wire_dialect':('codex-rs/exec-server-protocol/src/rpc.rs','@dialect, which omits'),
 'params_decode':('codex-rs/exec-server/src/rpc.rs','decode_params'),
 'request_adapter':('codex-rs/exec-server/src/rpc.rs','request_with_trace'),
 'deferred_response_adapter':('codex-rs/exec-server/src/rpc.rs','request_with_id'),
 'notification_adapter':('codex-rs/exec-server/src/rpc.rs','notification'),
 'filesystem_sandbox_resolution':('codex-rs/exec-server/src/server/registry.rs','resolve_filesystem_sandbox'),
 'initialization_guard':('codex-rs/exec-server/src/server/handler.rs','require_initialized_for'),
 'attachment_guard':('codex-rs/exec-server/src/server/handler.rs','require_session_attached'),
 'initialize_transition':('codex-rs/exec-server/src/server/handler.rs','initialize'),
 'initialized_transition':('codex-rs/exec-server/src/server/handler.rs','initialized'),
 'notification_dispatch':('codex-rs/exec-server/src/server/request_dispatcher.rs','handle_notification'),
 'request_dispatch':('codex-rs/exec-server/src/server/request_dispatcher.rs','dispatch_request'),
 'request_admission':('codex-rs/exec-server/src/server/request_dispatcher.rs','dispatch_request'),
 'reverse_request_timeout':('codex-rs/exec-server/src/rpc_server_requests.rs','call_with_timeout'),
 'outbound_notification_limiter':('codex-rs/exec-server/src/client_inbound_request_limit.rs','client_inbound_message_exceeded_limit'),
 'network_audit_validation':('codex-rs/exec-server/src/client/network_policy_audit.rs','emit_network_policy_decision')}
def require(ok,message):
    if not ok:raise AssertionError(message)
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def protocol_result(header):
    m=re.search(r'->\s*Result\s*<',header);require(m,'No handler Result type')
    text=header[m.end():];depth=0
    for i,c in enumerate(text):
        if c=='<':depth+=1
        elif c=='>':
            if not depth:return text[:i].strip()
            depth-=1
        elif c==',' and not depth:return text[:i].strip()
    raise AssertionError('Unclosed return type')

def validate(graph):
    require(graph['functional_receipts']==0 and graph['full_g01_closure'] is False,'False qualification')
    helper=ROOT/'docs/04_audit/evidence/CODEX100-EXEC-20261017/g01/entrypoints/tools/build_tool_graph.py'
    require(graph['reader_helper']['path']==str(helper.relative_to(ROOT)) and sha(helper)==graph['reader_helper']['sha256'],'Reviewed reader helper changed')
    env={'re':re};parsed=ast.parse(helper.read_text())
    selected=[n for n in parsed.body if isinstance(n,ast.FunctionDef) and n.name in ['mask_rust','balanced']]
    exec(compile(ast.Module(body=selected,type_ignores=[]),'<reviewed-source-boundary-reader>','exec'),env)
    rows=graph['operations'];require(len(rows)==32,'Missing operation')
    expected={}
    for p in (UP/'codex-rs/exec-server-protocol/src').glob('*.rs'):
        for m in re.finditer(r'^pub const (\w*METHOD): &str = "([^"]+)";',p.read_text(),re.M):expected[m[1]]=m[2]
    require(len(expected)==32 and {r['constant'] for r in rows}==expected.keys(),'Missing/duplicate constant binding')
    source=(UP/'codex-rs/exec-server/src/server/registry.rs').read_text()
    registered={m[2]:m[1] for m in re.finditer(r'\brouter\.(request(?:_with_id|_with_trace)?|notification)\s*\(\s*(\w+METHOD)\s*,',source)}
    outbound={'EXEC_OUTPUT_DELTA_METHOD':'ExecOutputDeltaNotification','EXEC_EXITED_METHOD':'ExecExitedNotification',
              'EXEC_CLOSED_METHOD':'ExecClosedNotification','HTTP_REQUEST_BODY_DELTA_METHOD':'HttpRequestBodyDeltaNotification',
              'NETWORK_POLICY_DECISION_METHOD':'NetworkPolicyDecisionNotification'}
    sources={};excerpts=0
    def source_check(value):
        nonlocal excerpts
        if isinstance(value,dict):
            if {'path','sha256','start_offset'}<=value.keys():
                p=UP/value['path'];text=p.read_text();require(sha(p)==value['sha256'],'Source hash drift')
                require(text[:value['start_offset']].count('\n')+1==value['line'],'Source line drift')
                if 'excerpt'in value:require(text[value['start_offset']:value['end_offset']]==value['excerpt'],'Source excerpt drift');excerpts+=1
                if 'header'in value:
                    require(value['excerpt'].startswith(value['header']) and value['header']==value['excerpt'].split('{',1)[0],'Function header drift')
                    require(re.search(r'\bfn\s+'+re.escape(value['function'])+r'\b',value['header']),'Function identity changed')
                    masked=env['mask_rust'](value['excerpt']);brace=masked.index('{')
                    require(env['balanced'](masked,brace,'{','}')==len(masked),'Function body boundary truncated or transplanted')
                sources[value['path']]=value['sha256']
            for v in value.values():source_check(v)
        elif isinstance(value,list):
            for v in value:source_check(v)
    source_check(graph)
    counts=collections.Counter()
    for row in rows:
        constant=row['constant'];require(row['method']==expected[constant],'Method identity wrong')
        require(row['requirement']=='CDX100-EXEC-RPC-'+row['method'].replace('/','.'),'Requirement ID wrong')
        require(row['qualification']=='NOT_RUN' and row['state_cases'],'False/missing qualification or cases')
        if constant in registered:
            kind='CONTROLLER_TO_EXECUTOR_NOTIFICATION' if registered[constant]=='notification' else 'CONTROLLER_TO_EXECUTOR_REQUEST'
            require(row['kind']==kind and row['registry_api']==registered[constant],'Inbound direction/kind changed')
            text=row['registry_source']['excerpt']
            route=re.match(r'router\.(request(?:_with_id|_with_trace)?|notification)\s*\(\s*(\w+METHOD)\s*,',text)
            require(route and route[2]==constant and route[1]==registered[constant],'Registry excerpt transplanted from another operation')
            expected_route=re.search(r'\brouter\.'+re.escape(registered[constant])+r'\s*\(\s*'+re.escape(constant)+r'\s*,',source)
            require(row['registry_source']['start_offset']==expected_route.start(),'Registry source identity mismatch')
            actual_type=re.search(r'\b_?params:\s*([\w:]+|\(\))',text)
            require(actual_type and row['wire_params_type']==actual_type[1],'Wire params type changed')
            calls=re.findall(r'\bhandler\s*\.\s*(\w+)\s*\(',text)
            require(calls==[row['handler']['function']],'Registry-to-handler link changed')
            require(row['handler']['path']=='codex-rs/exec-server/src/server/handler.rs','Handler definition source changed')
            require(protocol_result(row['handler']['header'])==row['handler_result_type'],'Handler result type changed')
            if constant=='HTTP_REQUEST_METHOD':
                require(row['handler_result_type']=='()' and row['wire_response_type']=='HttpRequestResponse','HTTP internal unit confused with wire response')
                require('request_with_id'==row['registry_api'] and 'HANDLER_SENDS_HEADER' in row['response_semantics'],'HTTP deferred response lost')
                require('self.notifications.response(request_id, result)' in row['handler']['excerpt'],'HTTP explicit response sender omitted')
                require('HttpRequestResponse' in row['wire_response_type_source']['header'],'HTTP public wire type source missing')
            else:require(row['wire_response_type']==(None if kind.endswith('NOTIFICATION') else row['handler_result_type']),'Wire result changed')
            require(row['requires_initialized_session']==(row['handler']['function'] not in ['initialize','initialized']),'Initialization guard classification wrong')
            if 'try_into_request' in text:require(row['wire_to_domain_conversion']=='try_into_request(resolve_filesystem_sandbox)','Filesystem wire conversion lost')
        elif constant in outbound:
            require(row['kind']=='EXECUTOR_TO_CONTROLLER_NOTIFICATION' and row['wire_response_type'] is None,'Outgoing event turned into response/request')
            require(row['wire_params_type']==outbound[constant],'Notification payload type wrong')
            require(constant in row['sender_source']['excerpt'] and constant in row['receiver_source']['excerpt'],'Event send/receive anchor lost')
        else:
            require(constant=='NETWORK_POLICY_REQUEST_METHOD' and row['kind']=='EXECUTOR_TO_CONTROLLER_REQUEST','Reverse request direction wrong')
            require(row['wire_params_type']=='NetworkPolicyRequestParams' and row['wire_response_type']=='NetworkPolicyRequestResponse','Reverse request types wrong')
            require('call_with_timeout' in row['sender_source']['excerpt'] and 'NETWORK_POLICY_REQUEST_METHOD' in row['receiver_source']['excerpt'],'Reverse request path missing')
            require('.respond(request_id, &NetworkPolicyRequestResponse' in row['receiver_response_source']['excerpt'],'Reverse response path missing')
        counts[row['kind']]+=1
    require(dict(counts)==graph['counts']==COUNTS,'Direction count wrong')
    guards=graph['generic_sources']
    require(guards.keys()==REQUIRED_GENERIC.keys(),'Required generic guard inventory removed/changed')
    for role,(path,identity) in REQUIRED_GENERIC.items():
        evidence=guards[role];require(evidence['path']==path,'Generic guard source changed: '+role)
        if identity.startswith('@'):require(evidence.get('marker')==identity[1:] and identity[1:] in evidence['excerpt'],'Generic anchor identity wrong: '+role)
        else:require(evidence.get('function')==identity,'Generic function identity wrong: '+role)
    require('client must send initialized' in guards['initialization_guard']['excerpt'],'Initialized guard removed')
    require('session has been resumed by another connection' in guards['attachment_guard']['excerpt'],'Connection attachment guard removed')
    require('requires_cwd()' in guards['filesystem_sandbox_resolution']['excerpt'],'Filesystem cwd policy guard missing')
    require('retry_as_null' in guards['params_decode']['excerpt'],'Legacy empty-object params compatibility missing')
    require('"jsonrpc": "2.0"' in guards['wire_dialect']['excerpt'],'Wire dialect evidence missing')
    codes={}
    for r in graph['error_constructors']:
        m=re.search(r'code:\s*(-?\d+)',r['excerpt']);require(m,'Error code missing');codes[r['function']]=int(m[1])
    require(codes=={'invalid_request':-32600,'method_not_found':-32601,'invalid_params':-32602,'internal_error':-32603},'JSON-RPC error classes changed')
    return {'operations':32,'counts':dict(counts),'sources':len(sources),'source_excerpts':excerpts,'error_codes':codes}

graph=json.loads((OUT/'flows.json').read_text());result=validate(graph);negatives=[]
def operation(g,name):return next(r for r in g['operations'] if r['method']==name)
for name,mutate in [
 ('removed_operation',lambda g:g['operations'].pop()),
 ('reverse_direction_swapped',lambda g:operation(g,'network/policyRequest').update(kind='CONTROLLER_TO_EXECUTOR_REQUEST')),
 ('wire_type_changed',lambda g:operation(g,'fs/open').update(wire_params_type='FsOpenParams')),
 ('http_unit_wire_response',lambda g:operation(g,'http/request').update(wire_response_type='()')),
 ('event_invented_response',lambda g:operation(g,'process/output').update(wire_response_type='ExecResponse')),
 ('handler_link_changed',lambda g:operation(g,'fs/open')['handler'].update(function='fs_close')),
    ('consistent_foreign_route_evidence',lambda g:operation(g,'fs/open').update({k:copy.deepcopy(operation(g,'fs/readFile')[k]) for k in ['registry_source','handler','handler_result_type','wire_params_type','wire_response_type']})),
 ('lost_attachment_guard',lambda g:g['generic_sources'].pop('attachment_guard')),
    ('lost_concurrency_guards',lambda g:(g['generic_sources'].pop('request_dispatch'),g['generic_sources'].pop('request_admission'))),
    ('lost_deferred_response_adapter',lambda g:g['generic_sources'].pop('deferred_response_adapter')),
    ('lost_reverse_timeout',lambda g:g['generic_sources'].pop('reverse_request_timeout')),
 ('false_qualification',lambda g:operation(g,'initialize').update(qualification='PASS_CURRENT')),
]:
    bad=copy.deepcopy(graph);mutate(bad)
    try:validate(bad)
    except (AssertionError,KeyError) as e:negatives.append({'name':name,'result':'REJECTED','reason':str(e)})
    else:raise AssertionError('Bad flow accepted: '+name)
result.update(kind='T1_SOURCE_FLOW_VERIFICATION_ONLY',flow_sha256=sha(OUT/'flows.json'),negative_controls=negatives,functional_receipts=0,full_g01_closure=False)
(OUT/'flow-verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps(result))
