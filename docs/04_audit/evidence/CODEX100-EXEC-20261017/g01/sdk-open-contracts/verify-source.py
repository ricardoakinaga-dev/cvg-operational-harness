from pathlib import Path
import ast,json,hashlib,copy,subprocess,sys
R=Path.cwd();E=R/'docs/04_audit/evidence/CODEX100-EXEC-20261017';P=E/'g01/sdk-open-contracts';U=Path('/tmp/cvg-rea-codex-20261017/upstream')
load=lambda q:json.loads(q.read_text());sha=lambda b:hashlib.sha256(b).hexdigest()
src={x['path']:x for x in load(P/'source-inputs.json')['inputs']};txt={f:(P/x['archive']).read_text() for f,x in src.items()};trees={f:ast.parse(t) for f,t in txt.items() if f.endswith('.py')};spans={x['path']+':'+str(x['start_line'])+'-'+str(x['end_line']):x for x in load(P/'source-spans.json')['spans']}
rpc=load(P/'python-rpc-bindings.json');gen=load(P/'generated-boundaries.json');integration=load(P/'integration.json');contracts=load(P/'python-contracts.json');versions=load(P/'versions-and-packaging.json');catalog=load(R/'docs/03_build/tracking/codex100_catalog_v1.json');catalogids={x['id'] for x in catalog['requirements']};old=load(E/'g01/sdk-language-contracts/python/inventory.json');basegaps={x['id']:x for x in load(E/'g01/component-surfaces/integration.json')['mandatory_open_variants']}
checks=[]
for f,x in src.items():
 b=(P/x['archive']).read_bytes();assert len(b)==x['bytes'] and sha(b)==x['sha256'];assert (U/f).read_bytes()==b
 actual=subprocess.run(['git','-C',str(U),'rev-parse','8d9f6466ff0294785d56f55b1fe363d132fe4133:'+f],check=True,capture_output=True,text=True).stdout.strip();assert actual==x['git_blob']
for key,s in spans.items():
 expected='\n'.join(txt[s['path']].splitlines()[s['start_line']-1:s['end_line']]);assert expected==s['excerpt'] and sha(expected.encode())==s['excerpt_sha256'],key
checks.append({'id':'SRC','sources':24,'exact_primary_spans':len(spans),'status':'PASS_STATIC'})
def validate_rpc(d):
 rows=d['records'];assert len(rows)==len(old['rpc'])==25;assert len({x['id'] for x in rows})==25
 for x,previous in zip(rows,old['rpc']):
  assert x['historical_from']==previous['from'] and x['callee']==previous['callee']
  s=spans[x['source']];calls=[n for n in ast.walk(trees[s['path']]) if isinstance(n,ast.Call) and n.lineno==s['start_line'] and n.end_lineno==s['end_line'] and ast.unparse(n.func)==x['callee']];assert len(calls)==1
  c=calls[0];assert [ast.unparse(a) for a in c.args]==x['argument_expressions'];assert {k.arg:ast.unparse(k.value) for k in c.keywords}==x['keyword_expressions']
  assert x['literal_method']==previous['literal_method'] and x['selector_kind']==previous['selector_kind']
  notify=x['callee']=='self.notify';assert x['dispatch_kind']==('CLIENT_NOTIFICATION_NO_RESPONSE' if notify else 'REQUEST_OR_REQUEST_FORWARDING')
  if notify:assert x['response_path']==[] and x['response_model_binding'] is None and len(x['common_sync_transport'])==2
  if x['literal_method']:
   expected=('CDX100-RPC-ClientNotification-' if notify else 'CDX100-RPC-ClientRequest-')+x['literal_method'].replace('/','.');assert x['catalog_requirement_id']==expected and expected in catalogids
  else:assert x['catalog_requirement_id'] is None
  if x['response_model_binding'] and x['response_model_binding']['kind']=='LOCAL_DECLARED_CLASS':
   q=spans[x['response_model_binding']['source']];assert q['path'].endswith(x['response_model_binding']['module'].replace('.','/')+'.py');node=[a for a in trees[q['path']].body if isinstance(a,ast.ClassDef) and a.name==x['response_model_binding']['name']];assert len(node)==1 and node[0].lineno==q['start_line']
   modelname=x['keyword_expressions'].get('response_model');im=[(n.module,z.name) for n in trees['sdk/python/src/openai_codex/client.py'].body if isinstance(n,ast.ImportFrom) and n.level==1 for z in n.names if (z.asname or z.name)==modelname];assert im==[(x['response_model_binding']['module'],x['response_model_binding']['name'])]
  assert x['runtime_status']=='NOT_RUN' and x['receipt'] is None
 assert sum(x['literal_method'] is not None and x['dispatch_kind']=='REQUEST_OR_REQUEST_FORWARDING' for x in rows)==20
 assert sum(x['dispatch_kind']=='CLIENT_NOTIFICATION_NO_RESPONSE' for x in rows)==1
 assert sum(x['literal_method'] is None for x in rows)==4
validate_rpc(rpc);checks.append({'id':'RPC','status':'PASS_STATIC','sites':25,'literal_requests':20,'notification':1,'dynamic':4,'source_to_real_catalog_join':True})
def validate_generated(d):
 f='sdk/python/src/openai_codex/client.py';n=next(x for x in trees[f].body if isinstance(x,ast.FunctionDef) and x.name=='_params_dict');calls=[x for x in ast.walk(n) if isinstance(x,ast.Call) and isinstance(x.func,ast.Attribute) and x.func.attr=='model_dump'];assert len(calls)==1
 flags={k.arg:ast.literal_eval(k.value) for k in calls[0].keywords};assert d['serializer_flags']==flags
 assert len(d['models'])==33 and len({x['name'] for x in d['models']})==33
 g='sdk/python/src/openai_codex/generated/v2_all.py'
 for x in d['models']:
  node=next(v for v in trees[g].body if isinstance(v,ast.ClassDef) and v.name==x['name']);assert x['bases']==[ast.unparse(y) for y in node.bases]
  cfg=[ast.unparse(z.value) for z in node.body if isinstance(z,ast.Assign) and any(isinstance(v,ast.Name) and v.id=='model_config' for v in z.targets)];assert x['config_expression']==(cfg[0] if cfg else None)
  fields=[y for y in node.body if isinstance(y,ast.AnnAssign) and isinstance(y.target,ast.Name)];assert [z['name'] for z in x['fields']]==[y.target.id for y in fields]
  for y,z in zip(fields,x['fields']):assert z['annotation']==ast.unparse(y.annotation) and z['default_expression']==(ast.unparse(y.value) if y.value is not None else None) and z['required_syntax']==(y.value is None)
  assert x['semantic_status']=='SOURCE_DECLARATION_ONLY_PYDANTIC_RUNTIME_OPEN'
  for y,z in zip(fields,x['fields']):
   aliases=[ast.unparse(k.value) for node in ast.walk(y.annotation) if isinstance(node,ast.Call) and ast.unparse(node.func)=='Field' for k in node.keywords if k.arg=='alias'];assert z['aliases']==aliases
validate_generated(gen);checks.append({'id':'MODEL','status':'PASS_STATIC','selected_declarations':33,'model_runtime':'NOT_RUN'})
def validate_gaps(d):
 assert {x['id'] for x in d['rows']}==set(basegaps) and len(d['rows'])==6
 for x in d['rows']:
  base=basegaps[x['id']];assert x['owner']==base['owner'] and x['variant_obligation_id']==base['variant_obligation_id'] and x['existing_owner_requirements']==base['existing_owner_requirements']
  assert x['current_gap_status']=='OPEN' and x['qualification']=='NOT_RUN' and x['receipt'] is None and not x['whole_requirement_covered']
  assert x['python_contracts'] or x['typescript_contracts']
 assert d['functional_receipts']==0 and not d['full_G01_closure']
validate_gaps(integration);assert len(contracts['rows'])==20
for x in contracts['rows']:
 assert x['source_refs'] and all(q in spans for q in x['source_refs']) and all(g in basegaps for g in x['gaps']);assert x['runtime_status']=='NOT_RUN' and x['receipt'] is None
checks.append({'id':'GAPS','status':'PASS_STATIC','gaps_open':6,'Python_contracts':20,'TS_contracts':24})
def validate_versions(d):
 f='sdk/python/src/openai_codex/_runtime_requirements.py';n=next(x for x in trees[f].body if isinstance(x,ast.Assign) and any(isinstance(y,ast.Name) and y.id=='MINIMUM_RUNTIME_VERSION' for y in x.targets));assert d['versions']['minimum_runtime_literal']==ast.literal_eval(n.value)
 assert d['versions']['actual_wheel_or_runtime_bytes_authenticated'] is False and d['versions']['identities_are_not_equivalent'] is True and d['functional_receipts']==0
validate_versions(versions);checks.append({'id':'VERSIONS','status':'PASS_STATIC','artifact_authentication':'OPEN'})
neg=[]
def reject(id,data,mutate,validator):
 obj=copy.deepcopy(data);mutate(obj)
 try:validator(obj)
 except (AssertionError,KeyError,StopIteration):neg.append({'id':id,'status':'REJECTED_STATIC_DATA_MUTATION','runtime':'NOT_RUN'});return
 raise AssertionError('Accepted wrong source relation: '+id)
reject('omit-initialized',rpc,lambda d:d['records'].pop(3),validate_rpc)
reject('notification-as-request',rpc,lambda d:d['records'][3].update(dispatch_kind='REQUEST_OR_REQUEST_FORWARDING'),validate_rpc)
reject('invent-notification-response',rpc,lambda d:d['records'][3].update(response_path=['invented-response-waiter']),validate_rpc)
reject('drop-generic-site',rpc,lambda d:d['records'].pop(0),validate_rpc)
idx=next(i for i,x in enumerate(rpc['records']) if x['literal_method']=='thread/start')
reject('wrong-method-on-same-call',rpc,lambda d:d['records'][idx].update(literal_method='thread/resume'),validate_rpc)
reject('wrong-typed-response',rpc,lambda d:d['records'][idx]['keyword_expressions'].update(response_model='ThreadResumeResponse'),validate_rpc)
reject('drop-model-null-omission',gen,lambda d:d['serializer_flags'].update(exclude_none=False),validate_generated)
reject('omit-generated-field',gen,lambda d:next(x for x in d['models'] if x['fields'])['fields'].pop(),validate_generated)
reject('wrong-generated-alias',gen,lambda d:next(f for m in d['models'] for f in m['fields'] if f['aliases'])['aliases'].append("'wrongAlias'"),validate_generated)
reject('invent-model-config',gen,lambda d:d['models'][0].update(config_expression="ConfigDict(extra='forbid')"),validate_generated)
reject('wrong-response-model-declaration',rpc,lambda d:d['records'][idx]['response_model_binding'].update(name='ThreadResumeResponse'),validate_rpc)
reject('conflate-minimum-with-package-version',versions,lambda d:d['versions'].update(minimum_runtime_literal='0.153.4'),validate_versions)
reject('manifest-name-as-artifact-authentication',versions,lambda d:d['versions'].update(actual_wheel_or_runtime_bytes_authenticated=True),validate_versions)
reject('wrong-gap-owner',integration,lambda d:d['rows'][0].update(owner='WRONG_OWNER'),validate_gaps)
reject('invent-functional-receipt',integration,lambda d:d['rows'][0].update(receipt='fabricated'),validate_gaps)
# Source edge endpoints and all proposed evidence-level references are real selected nodes, not execution proof.
edges=load(P/'python-call-edges.json')['edges']
def validate_receiver_edges(data):
 aliases={x['id']:x for x in data['aliases']};assert len(aliases)==8
 for a in aliases.values():
  f='sdk/python/src/openai_codex/'+a['source_module']+'.py';cl=next(n for n in trees[f].body if isinstance(n,ast.ClassDef) and n.name==a['source_class']);assert a['id']==a['source_module']+'.'+a['source_class']+'.'+a['receiver_field']
  for ref in a['declaration_evidence']:
   s=spans[ref];assert s['path']==f
   ns=[n for n in ast.walk(cl) if isinstance(n,(ast.Assign,ast.AnnAssign)) and n.lineno==s['start_line'] and n.end_lineno==s['end_line']];assert len(ns)==1;n=ns[0]
   if isinstance(n,ast.AnnAssign):assert isinstance(n.target,ast.Name) and n.target.id==a['receiver_field'] and ast.unparse(n.annotation)==a['target_class']
   else:assert isinstance(n.value,ast.Call) and ast.unparse(n.value.func)==a['target_class'] and any(ast.unparse(x)=='self.'+a['receiver_field'] for x in n.targets)
  tf='sdk/python/src/openai_codex/'+a['target_module']+'.py';assert any(isinstance(n,ast.ClassDef) and n.name==a['target_class'] for n in trees[tf].body)
  if a['target_module']!=a['source_module']:assert any(isinstance(n,ast.ImportFrom) and n.level==1 and n.module==a['target_module'] and any(x.name==a['target_class'] and (x.asname or x.name)==a['target_class'] for x in n.names) for n in trees[f].body)
 assert len(data['edges'])==350
 for x in data['edges']:
  assert x['source'] in spans and x['target_source'] in spans and x['scope']=='STATIC_SOURCE_BINDING_NOT_RUNTIME_CALLGRAPH';s=spans[x['source']];calls=[n for n in ast.walk(trees[s['path']]) if isinstance(n,ast.Call) and n.lineno==s['start_line'] and n.end_lineno==s['end_line'] and ast.unparse(n.func)==x['call_site_callee']];assert len(calls)==1;c=calls[0]
  if x['resolution']=='CALLABLE_ARGUMENT_TO_THREAD_BRIDGE':assert ast.unparse(c.func)=='self._call_sync';expr=c.args[0]
  elif x['resolution']=='CALLABLE_ARGUMENT_TO_COPY_CONTEXT_EXECUTOR':assert ast.unparse(c.func)=='_TURN_START_EXECUTOR.submit';expr=c.args[1]
  else:expr=c.func
  assert ast.unparse(expr)==x['callee'];proof=[];attrs=[];root=expr
  while isinstance(root,ast.Attribute):attrs.append(root.attr);root=root.value
  attrs.reverse()
  if isinstance(root,ast.Name) and root.id=='self':
   f,qual=x['from'].split('::');cm,cc=Path(f).stem,qual.split('.')[0]
   for field in attrs[:-1]:
    id=cm+'.'+cc+'.'+field;a=aliases[id];proof.append(id);cm,cc=a['target_module'],a['target_class']
   assert x['to']=='sdk/python/src/openai_codex/'+cm+'.py::'+cc+'.'+attrs[-1]
  assert proof==x['receiver_binding_ids']
  ts=spans[x['target_source']];assert x['to'].split('::')[0]==ts['path']
validate_receiver_edges({'aliases':load(P/'python-alias-evidence.json')['bindings'],'edges':edges})
edgefixture={'aliases':load(P/'python-alias-evidence.json')['bindings'],'edges':edges}
reject('invent-singlehop-asyncthread-field',edgefixture,lambda d:next(x for x in d['aliases'] if x['source_class']=='AsyncThread').update(receiver_field='_client'),validate_receiver_edges)
mi=next(i for i,x in enumerate(edges) if len(x['receiver_binding_ids'])>1)
reject('drop-multihop-binding',edgefixture,lambda d:d['edges'][mi]['receiver_binding_ids'].pop(),validate_receiver_edges)
ci=next(i for i,x in enumerate(edges) if x['resolution']=='CALLABLE_ARGUMENT_TO_THREAD_BRIDGE')
reject('callable-reference-as-direct-invocation',edgefixture,lambda d:d['edges'][ci].update(resolution='SAME_CLASS_SOURCE_METHOD'),validate_receiver_edges)
ids={x['id'] for x in contracts['rows']}|{x['id'] for x in load(P/'typescript/contracts.json')['contracts']}
for x in load(P/'oracle-boundaries.json')['methods']:assert all(id in ids for id in x['sources'])
checks.append({'id':'RELATIONS','status':'PASS_STATIC','explicit_alias_source_edges':len(edges),'receiver_alias_declarations':8,'multihop_edges':7,'callable_argument_edges':32,'negative_source_join_controls':len(neg)})
for x in load(P/'metadata-inputs.json')['inputs']:
 b=(R/x['path']).read_bytes();assert sha(b)==x['sha256'] and len(b)==x['bytes'],x['path']
m=load(P/'typescript/manifest.json')
for x in m['outputs']:
 b=(P/'typescript'/x['path']).read_bytes();assert sha(b)==x['sha256'] and len(b)==x['bytes']
checks.append({'id':'SEALED_INPUTS','status':'PASS_STATIC','scout_outputs':18,'metadata_inputs':6,'old_catalog_rows_NOT_RUN':509})
# R1 repair: discriminate actual source overlay order and goal cancellation guards.
def validate_repaired_facts(d):
 f='sdk/python/src/openai_codex/client.py';cl=next(x for x in trees[f].body if isinstance(x,ast.ClassDef) and x.name=='CodexClient')
 for row in d['payloads']:
  fn=next(x for x in cl.body if isinstance(x,ast.FunctionDef) and x.name==row['method']);ass=next(n for n in ast.walk(fn) if isinstance(n,ast.Assign) and any(isinstance(z,ast.Name) and z.id=='payload' for z in n.targets));assert isinstance(ass.value,ast.Dict)
  entries=[{'key':ast.literal_eval(k) if k is not None else None,'value_expression':ast.unparse(v)} for k,v in zip(ass.value.keys,ass.value.values)];assert row['ordered_dict_entries']==entries
  ti=next(i for i,x in enumerate(entries) if x['key']=='threadId');pi=next(i for i,x in enumerate(entries) if x['key'] is None);assert row['precedence']==('PARAMS_THREAD_ID_WINS' if ti<pi else 'EXPLICIT_ARGUMENT_AND_INPUT_WIN')
  assert len(row['source_only_overlay_examples'])>=5
  for v in row['source_only_overlay_examples']:
   out={}
   for x in entries:
    if x['key'] is None:out.update(v['params'] or {})
    elif x['key']=='threadId':out['threadId']=v['argument_thread_id']
    elif x['key']=='input':out['input']=v['normalized_input']
   assert out==v['expected_payload_from_plain_data_overlay']
 g=d['goal'];af='sdk/python/src/openai_codex/async_client.py';startup=next(n for n in ast.walk(trees[af]) if isinstance(n,ast.AsyncFunctionDef) and n.name=='start_goal_operation');aw=[ast.unparse(n.value) for n in ast.walk(startup) if isinstance(n,ast.Await)];assert g['await_expressions']==aw and g['shield_present']==any('asyncio.shield(' in s for s in aw)
 th=[{k.arg:ast.unparse(k.value) for k in n.keywords} for n in ast.walk(startup) if isinstance(n,ast.Call) and ast.unparse(n.func)=='threading.Thread'];assert g['worker_thread_keywords']==th
 cb=next(n for n in ast.walk(startup) if isinstance(n,ast.FunctionDef) and n.name=='cleanup_cancelled_start');tr=next(n for n in cb.body if isinstance(n,ast.Try));assert g['callback_result_failure_handler']==ast.unparse(tr.handlers[0].type) and g['callback_result_failure_returns']==any(isinstance(n,ast.Return) for n in tr.handlers[0].body)
 callback=next(n for n in ast.walk(startup) if isinstance(n,ast.Call) and ast.unparse(n.func)=='operation.add_done_callback');assert g['done_callback_expression']==ast.unparse(callback.args[0])
 stop=next(n for n in ast.walk(startup) if isinstance(n,ast.FunctionDef) and n.name=='stop_cancelled_goal');fin=next(n for n in stop.body if isinstance(n,ast.Try));fc=[ast.unparse(n.value.func) for n in fin.finalbody if isinstance(n,ast.Expr) and isinstance(n.value,ast.Call)];assert g['cleanup_finally_calls']==fc==['state.finish','self._sync.unregister_goal_operation']
 pol=next(n for n in cl.body if isinstance(n,ast.FunctionDef) and n.name=='cancel_goal_operation');body=[n for n in pol.body if not(isinstance(n,ast.Expr) and isinstance(n.value,ast.Constant) and isinstance(n.value.value,str))];assert g['cancel_policy_statements']==[ast.unparse(n) for n in body]
 assert isinstance(body[0],ast.Try) and ast.unparse(body[0].body[0].value.func)=='self.pause_goal' and ast.unparse(body[0].handlers[0].type)==g['pause_exception_type']=='Exception';assert ast.unparse(body[1].value.func)=='self._interrupt_goal_operation' and g['interrupt_after_pause_exception'] is True
 intr=next(n for n in cl.body if isinstance(n,ast.FunctionDef) and n.name=='_interrupt_goal_operation');calls=[n for n in ast.walk(intr) if isinstance(n,ast.Call) and ast.unparse(n.func)=='self.turn_interrupt'];assert g['interrupt_call_sites']==len(calls)==2 and not any(isinstance(n,(ast.For,ast.While)) for n in ast.walk(intr))
 handler=next(n for n in ast.walk(intr) if isinstance(n,ast.ExceptHandler) and isinstance(n.type,ast.Name) and n.type.id=='InvalidRequestError');assert g['retry_exception_type']==ast.unparse(handler.type);pre=next(n for n in ast.walk(handler) if isinstance(n,ast.Call) and ast.unparse(n.func)=='exc.message.startswith');assert g['retry_message_prefix']==ast.literal_eval(pre.args[0])
 ass=next(n for n in handler.body if isinstance(n,ast.Assign) and any(isinstance(v,ast.Name) and v.id=='next_turn_id' for v in n.targets));assert g['candidate_expression']==ast.unparse(ass.value);guard=next(n for n in handler.body if isinstance(n,ast.If) and 'next_turn_id' in ast.unparse(n.test));assert g['no_retry_predicate']==ast.unparse(guard.test)
 sf='sdk/python/src/openai_codex/_goal.py';sel=next(n for n in ast.walk(trees[sf]) if isinstance(n,ast.FunctionDef) and n.name=='turn_for_interrupt');priority=[ast.unparse(n.value) for n in sorted([x for x in ast.walk(sel) if isinstance(x,ast.Return)],key=lambda x:x.lineno)];assert g['turn_id_priority']==priority
 assert g['runtime_status']=='NOT_RUN' and g['receipt'] is None and d['all_cutpoints_status']=='NOT_RUN'
repairfacts=load(P/'payload-and-goal-facts.json');validate_repaired_facts(repairfacts)
reject('invert-resume-fork-precedence',repairfacts,lambda d:d['payloads'][0].update(precedence='EXPLICIT_ARGUMENT_AND_INPUT_WIN'),validate_repaired_facts)
reject('invert-start-turn-precedence',repairfacts,lambda d:d['payloads'][2].update(precedence='PARAMS_THREAD_ID_WINS'),validate_repaired_facts)
reject('omit-goal-startup-shield',repairfacts,lambda d:d['goal'].update(shield_present=False),validate_repaired_facts)
reject('omit-cancelled-goal-cleanup-finally',repairfacts,lambda d:d['goal']['cleanup_finally_calls'].pop(),validate_repaired_facts)
reject('skip-pause-before-goal-interrupt',repairfacts,lambda d:d['goal'].update(interrupt_after_pause_exception=False),validate_repaired_facts)
reject('invent-third-interrupt-attempt',repairfacts,lambda d:d['goal'].update(interrupt_call_sites=3),validate_repaired_facts)
checks.append({'id':'REPAIR_SOURCE_GUARDS','status':'PASS_STATIC','payload_precedence_methods':3,'plain_data_overlays':sum(len(x['source_only_overlay_examples']) for x in repairfacts['payloads']),'goal_startup_and_control_guards':'SOURCE_ONLY','future_runtime':'NOT_RUN'})
result={'kind':'SOURCE_AND_DATA_RELATION_VERIFICATION_NOT_RUNTIME_TESTS','checks':checks,'passed':len(checks),'failed':0,'negative_controls':neg,'negative_controls_rejected':len(neg),'TS_negative_controls_reported':10,'runtime_tests':'NOT_RUN','functional_receipts':0,'limits':'Sourcefacts/joinschecked,notfullcallgraphdispatch,librarysemantics,platformlivenessorfunctionalparity.'}
assert sys.argv[1:] in ([],['--write'],['--check']), 'Use --check or --write'
if '--check' in sys.argv:assert load(P/'verification.json')==result, 'Current static verification output differs'
else:(P/'verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'static_checks':len(checks),'negative_controls_rejected':len(neg),'TS_negative_controls':10,'functional_receipts':0,'runtime':'NOT_RUN'}))
