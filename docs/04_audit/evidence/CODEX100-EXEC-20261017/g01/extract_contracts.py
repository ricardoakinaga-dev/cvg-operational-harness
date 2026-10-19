"""T1 evidence extraction; does not load target code or implement the runtime.

Source-only contracts, companion generated schemas and static use sites are
different evidence. None of them is a functional parity receipt.
"""
from pathlib import Path
import collections
import datetime
import hashlib
import json
import re
import shutil
import subprocess
import tomllib

ROOT=Path(__file__).resolve().parents[5]
OUT=Path(__file__).resolve().parent
UP=Path('/tmp/cvg-rea-codex-20261017/upstream')
COMPANION=Path('/tmp/cvg-codex100-exec-20261017/experimental-schemas')
CATALOG=ROOT/'docs/03_build/tracking/codex100_catalog_v1.json'
BASE=OUT.parent/'catalog-input-draft-r1.json'
PIN='8d9f6466ff0294785d56f55b1fe363d132fe4133'

def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def write(path,value):path.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
def read(path):return json.loads(path.read_text())
def source(path,line=None):
 p=UP/path
 v={'path':path,'sha256':digest(p),'url':f'https://github.com/openai/codex/blob/{PIN}/{path}'}
 if line:v.update(line=line,url=v['url']+f'#L{line}')
 return v
def camel(name):return name[0].lower()+name[1:]
def owner(method):
 s=method.lower()
 if 'verification' in s or 'attestation' in s or 'authstatus' in s:return 'DX100-N01','CDX-20'
 if 'approval' in s or 'permissions' in s or 'guardian' in s:return 'DX100-X03','CDX-07'
 if s.startswith('account/'):return 'DX100-N01','CDX-20'
 if 'realtime' in s:return 'DX100-I02','CDX-19'
 if 'queue' in s or 'elicitation' in s or 'collaborationmode' in s or 'currenttime' in s:return 'DX100-O02','CDX-15'
 if s.startswith('remotecontrol'):return 'DX100-R01','CDX-18'
 if s.startswith('environment/'):return 'DX100-R02','CDX-18'
 if s.startswith('process/'):return 'DX100-X01','CDX-06'
 if s.startswith('project/'):return 'DX100-W01','CDX-16'
 if 'gitdiff' in s:return 'DX100-W02','CDX-16'
 if s.startswith('memory/') or 'memorymode' in s:return 'DX100-C02','CDX-03'
 if 'compress' in s or 'rawresponse' in s:return 'DX100-C01','CDX-03'
 if s.startswith('thread/') or 'conversationsummary' in s:return 'DX100-S01','CDX-02'
 if s.startswith('mcpserver'):return 'DX100-P01','CDX-13'
 if s.startswith('plugin/'):return 'DX100-E01','CDX-11'
 if s.startswith('fuzzy'):return 'DX100-T01','CDX-05'
 if s.startswith('server/diagnostics'):return 'DX100-V01','CDX-21'
 return 'DX100-A01','CDX-08'

assert subprocess.check_output(['git','-C',str(UP),'rev-parse','HEAD'],text=True).strip()==PIN
assert not subprocess.check_output(['git','-C',str(UP),'status','--porcelain'],text=True).strip()
baseline=read(BASE);catalog=read(CATALOG)
initial_by_id={r['id']:r for r in baseline['requirements']}
existing={r['id']:r for r in catalog['requirements']}
assert initial_by_id.keys() <= existing.keys(), 'Initial requirements must not disappear'
common='codex-rs/app-server-protocol/src/protocol/common.rs'
text=(UP/common).read_text()

def macro_items(macro,envelope):
 match=re.search(r'^'+re.escape(macro)+r'!\s*\{',text,re.M)
 assert match,macro
 finish=re.search(r'^\}',text[match.end():],re.M)
 assert finish,macro
 body=text[match.end():match.end()+finish.start()]
 headers=list(re.finditer(r'^    ([A-Z][A-Za-z0-9_]*)\s*(?:=>\s*"([^"\n]+)")?\s*(?=[{(,])',body,re.M))
 records=[]
 for i,m in enumerate(headers):
  fragment=body[m.start():headers[i+1].start() if i+1<len(headers) else len(body)]
  # Attributes preceding the header begin after the preceding item terminator.
  preceding=body[:m.start()]
  prev=max(preceding.rfind('\n    },'),preceding.rfind('\n    Initialized,'))
  attributes=preceding[prev+7:] if prev>=0 else preceding
  # Notification payloads terminate on one line, so restrict attrs to their gap.
  if envelope=='ServerNotification':
   prevline=preceding.rfind('),')
   if prevline>=0:attributes=preceding[prevline+2:]
  line=text[:match.end()+m.start()].count('\n')+1
  wire=m[2]
  if not wire:
   rename=re.findall(r'#\[(?:serde|strum)\((?:rename|serialize)\s*=\s*"([^"]+)"\)\]',attributes)
   wire=rename[-1] if rename else camel(m[1])
  payload=re.search(r'^\s*params:\s*([^,\n]+)',fragment,re.M)
  response=re.search(r'^\s*response:\s*([^,\n]+)',fragment,re.M)
  if envelope=='ServerNotification':
   payload=re.search(r'^    '+re.escape(m[1])+r'(?:\s*=>\s*"[^"]+")?\s*\(([^)]+)\)',fragment,re.M)
  records.append({'envelope':envelope,'variant':m[1],'method':wire,'source':source(common,line),
    'params_type':payload[1].strip() if payload else None,'response_type':response[1].strip() if response else None,
    'experimental_attribute':bool(re.search(r'#\[experimental\(',attributes)),
    'source_excerpt':(attributes+fragment).strip()[:5000],
    'evidence_kind':'SOURCE_DECLARATION; not runtime behavior'})
 assert len({r['method'] for r in records})==len(records),envelope
 return records

contracts=[]
for macro,envelope in [('client_request_definitions','ClientRequest'),('server_request_definitions','ServerRequest'),('server_notification_definitions','ServerNotification'),('client_notification_definitions','ClientNotification')]:contracts+=macro_items(macro,envelope)
assert collections.Counter(r['envelope'] for r in contracts)=={'ClientRequest':175,'ServerRequest':11,'ServerNotification':87,'ClientNotification':1}

# Candidate non-test uses: prove a static source location, never execution.
usefiles=[]
for rel in ['codex-rs/app-server/src','codex-rs/core/src','codex-rs/ext','codex-rs/exec-server/src']:
 for p in sorted((UP/rel).rglob('*.rs')):
  if 'test' in p.name or 'tests' in p.parts:continue
  content=p.read_text()
  # Unit test modules are not evidence of production dispatch.
  split=re.search(r'^#\[cfg\(test\)\]\s*\n(?:mod tests|#\[path)',content,re.M)
  if split:content=content[:split.start()]
  usefiles.append((str(p.relative_to(UP)),content))

schema_by_envelope={}
for envelope in ['ClientRequest','ServerRequest','ServerNotification','ClientNotification']:
 p=COMPANION/(envelope+'.json');obj=read(p)
 schema_by_envelope[envelope]=obj

bindings=[]
schema_cases=[]
def walk_schema(obj,definitions,pointer,visited=()):
 if isinstance(obj,bool):
  yield {'pointer':pointer,'boolean_schema':obj};return
 if not isinstance(obj,dict):
  yield {'pointer':pointer,'unsupported_schema_value':obj,'open_obligation':'Review non-object/non-boolean schema; never skip it silently.'};return
 structural={'$ref','properties','items','oneOf','anyOf','allOf','not','additionalProperties','additionalItems','patternProperties','contains','if','then','else','dependencies','propertyNames','definitions','$defs'}
 annotations={'$schema','$id','title','description','examples','$comment','deprecated','readOnly','writeOnly'}
 scalar={'type','required','enum','const','default','minimum','maximum','exclusiveMinimum','exclusiveMaximum','minLength','maxLength','minItems','maxItems','minProperties','maxProperties','pattern','format','uniqueItems','multipleOf'}
 row={'pointer':pointer,'type':obj.get('type'),'required':obj.get('required',[]),'enum':obj.get('enum'),'default':obj.get('default'),
  'schema_keywords':sorted(obj),'constraints':{k:v for k,v in obj.items() if k in scalar and k not in ['type','required','enum','default']},
  'annotations':{k:v for k,v in obj.items() if k in annotations}}
 unknown=set(obj)-structural-annotations-scalar
 if unknown:row['unsupported_keywords']={k:obj[k] for k in sorted(unknown)};row['open_obligation']='Preserved unsupported keywords require disposition before schema coverage closure.'
 if '$ref' in obj:
  ref=obj['$ref'];row['reference']=ref
  if ref in visited:
   row['recursion']='EXPLICIT_BACK_REFERENCE; bound fixture depth in SPEC'
   yield row;return
  yield row
  key=ref.removeprefix('#/definitions/')
  if ref.startswith('#/definitions/') and key in definitions:yield from walk_schema(definitions[key],definitions,pointer+'/$ref:'+key,visited+(ref,))
  else:yield {'pointer':pointer,'unresolved_reference':ref}
  return
 yield row
 required=set(obj.get('required',[]))
 for key,value in obj.get('properties',{}).items():
  yield {'pointer':pointer+'/properties/'+key,'presence':'REQUIRED' if key in required else 'OPTIONAL','boundary_cases':['valid','wrong_type','omitted'] if key in required else ['omitted','present_valid','present_invalid'],'oracle':'Frozen source schema plus functional reference, not synthesized expected output'}
  yield from walk_schema(value,definitions,pointer+'/properties/'+key,visited)
 for kind in ['oneOf','anyOf','allOf']:
  for i,value in enumerate(obj.get(kind,[])):yield from walk_schema(value,definitions,pointer+'/'+kind+'/'+str(i),visited)
 for kind in ['not','additionalProperties','additionalItems','contains','if','then','else','propertyNames']:
  if kind in obj:yield from walk_schema(obj[kind],definitions,pointer+'/'+kind,visited)
 for kind in ['patternProperties','dependencies']:
  for key,value in obj.get(kind,{}).items():
   if isinstance(value,(dict,bool)):yield from walk_schema(value,definitions,pointer+'/'+kind+'/'+key,visited)
   else:yield {'pointer':pointer+'/'+kind+'/'+key,'property_dependency':value}
 if 'items' in obj:
  if isinstance(obj['items'],list):
   for i,value in enumerate(obj['items']):yield from walk_schema(value,definitions,pointer+'/items/'+str(i),visited)
  else:yield from walk_schema(obj['items'],definitions,pointer+'/items',visited)

new_requirements=[]
for contract in contracts:
 envelope=contract['envelope'];method=contract['method'];variant=contract['variant']
 rid='CDX100-RPC-'+envelope+'-'+method.replace('/','.')
 contract['requirement']=rid
 if rid not in existing:
  who,family=owner(method)
  requirement={'id':rid,'family':family,'kind':'FUNCTIONAL_PARITY','title':envelope+': '+method,'mandatory':True,'owner':who,
   'sources':[contract['source']],'reference_validation':'SOURCE_DECLARED; companion schema may corroborate surface only','cvg_validation':'NOT_RUN','status':'NOT_RUN','equivalence':'PENDING_DECISION','receipt':None,
   'acceptance':'Qualificar '+method+' com seus campos/defaults/estados/erros/transporte/plataformas. Conservar o contrato legado/deprecated como resposta explícita se não executável; não inventar sucesso nem excluir do escopo.',
   'oracle':'Fonte pinada e referência executável vinculada; comparação real de estados/eventos/efeitos e controle negativo. Schema/help não fecham aceite.',
   'variants':'See g01 variant-matrix; source-only fields require source-bound experimental export or manual reviewed type expansion before G01 closure.',
   'introduced_in_revision':'draft-r2-g01'}
  new_requirements.append(requirement);existing[rid]=requirement
 locations=[]
 patterns=[envelope+'::'+variant]
 if envelope=='ServerRequest':patterns+=['ServerRequestPayload::'+variant]
 for rel,content in usefiles:
  for pattern in patterns:
   for m in list(re.finditer(re.escape(pattern)+r'\b',content))[:2]:
    locations.append(source(rel,content[:m.start()].count('\n')+1))
  if len(locations)>=6:break
 contract['static_use_sites']=locations[:6]
 obj=schema_by_envelope[envelope];matches=[]
 for idx,item in enumerate(obj.get('oneOf',[])):
  if method in item.get('properties',{}).get('method',{}).get('enum',[]):matches.append((idx,item))
 contract['companion_schema_presence']=bool(matches)
 contract['dispatch_status']='STATIC_USE_CANDIDATES' if locations else 'SOURCE_DECLARED_WITHOUT_NONTEST_USE_LOCATED'
 for idx,item in matches:
  schema_cases.append({'requirement':rid,'envelope':envelope,'method':method,'schema_sha256':digest(COMPANION/(envelope+'.json')),'schema_authority':'COMPANION_INSTALLED_0.163.0; source/build binding not authenticated','nodes':list(walk_schema(item,obj.get('definitions',{}),'/oneOf/'+str(idx))),
   'state_cases':['success_if_supported','invalid_params','invalid_state','policy_denied_before_effect_if_effectful','cancel_before_dispatch','cancel_after_dispatch_observe_effect','restart_resume_if_durable','concurrent_client_or_tenant_isolation'],
   'qualification':'NOT_RUN; source-specific applicability/expected semantics must be reviewed before frozen oracle'})
 if not matches:
  schema_cases.append({'requirement':rid,'envelope':envelope,'method':method,'source_params_type':contract['params_type'],'source_response_type':contract['response_type'],'schema_authority':'PINNED_RUST_SOURCE_ONLY','nodes':[],
   'open_obligation':'No companion exported schema. Expand source type and validate dispatch/legacy rejection before closure; item stays mandatory.', 'qualification':'NOT_RUN'})

# Every request has an explicit response-side obligation, even when no exported
# schema is available or the source/build relationship is still unauthenticated.
response_cases=[]
response_inputs=[('PINNED_CHECKED_IN_SCHEMA; export filtering may omit experimental fields',UP/'codex-rs/app-server-protocol/schema/json'),
 ('COMPANION_EXPERIMENTAL_SCHEMA; source/build identity pending',COMPANION)]
for contract in contracts:
 if contract['envelope'] not in ['ClientRequest','ServerRequest']:continue
 type_name=contract['response_type'].split('::')[-1]
 variants=[]
 for authority,base_path in response_inputs:
  for p in sorted(base_path.rglob(type_name+'.json')):
   obj=read(p)
   variants.append({'authority':authority,'path':str(p.relative_to(base_path)),
    'sha256':digest(p),'source':source(str(p.relative_to(UP))) if p.is_relative_to(UP) else None,
    'nodes':list(walk_schema(obj,obj.get('definitions',{}),'/response'))})
 response_cases.append({'requirement':contract['requirement'],'request_method':contract['method'],
  'request_envelope':contract['envelope'],'response_sender':'SERVER' if contract['envelope']=='ClientRequest' else 'CLIENT',
  'source_response_type':contract['response_type'],'schema_variants':variants,
  'coverage':'SCHEMA_PROJECTION_WITH_OPEN_SOURCE_RECONCILIATION' if variants else 'OPEN_NO_EXPORTED_SCHEMA',
  'open_obligations':['Reconcile source Rust fields/serde/experimental filtering with each schema.',
   'Freeze success/null/error payload and source-specific functional oracle; transport envelope/error union are separate.',
   'Verify response sender, correlation, invalid/late/duplicate response and capability-specific state constraints.'],
  'qualification':'NOT_RUN'})

# Exec-server is a different public protocol and must not disappear because
# only app-server schemas were exported by the planning investigation.
exec_contracts=[]
for path in sorted((UP/'codex-rs/exec-server-protocol/src').glob('*.rs')):
 if 'test' in path.name:continue
 content=path.read_text()
 for m in re.finditer(r'^pub const (\w*METHOD): &str = "([^"]+)";',content,re.M):
  rel=str(path.relative_to(UP));method=m[2];rid='CDX100-EXEC-RPC-'+method.replace('/','.')
  ref=source(rel,content[:m.start()].count('\n')+1)
  exec_contracts.append({'constant':m[1],'method':method,'source':ref,'requirement':rid,'wire_dialect':'Codex exec-server JSON-RPC omits jsonrpc field; source rpc.rs','schema_status':'SOURCE_TYPES_PENDING_EXPANSION','qualification':'NOT_RUN'})
  if rid not in existing:
   q={'id':rid,'family':'CDX-18','kind':'FUNCTIONAL_PARITY','title':'Exec-server: '+method,'mandatory':True,'owner':'DX100-R02','sources':[ref],'reference_validation':'SOURCE_DECLARED','cvg_validation':'NOT_RUN','status':'NOT_RUN','equivalence':'PENDING_DECISION','receipt':None,
    'acceptance':'Demonstrar '+method+' no executor remoto/nativo com envelopes, limites, ordem, reconexão e identidade da referência; recusar handle/grant alheios. Notificações são eventos observados, não chamadas com sucesso fabricado.',
    'oracle':'Execução do protocolo real source-bound e CVG em ambiente sintético; parâmetro/erro/estado e limites conferidos.',
    'variants':'Payload/type and handler reachability must be expanded before G01 closure; G02 must bind executable.', 'introduced_in_revision':'draft-r2-g01'}
   new_requirements.append(q);existing[rid]=q

config=read(UP/'codex-rs/core/config.schema.json');config_rows=[]
for name,node in config['properties'].items():config_rows.append({'key':name,'owner':'DX100-H01','requirement':'CDX100-10-04','source':source('codex-rs/core/config.schema.json'),'nodes':list(walk_schema(node,config.get('definitions',{}),'/properties/'+name)),'scope':'Syntax/default/union/constraints only; config precedence/trust/reload semantics are separate obligations.'})

# Component manifest inventory is a discovery aid, not a claim every exported
# Rust helper is a user-facing function or a verified parity item.
components=[]
for p in sorted((UP/'codex-rs').rglob('Cargo.toml')):
 if 'vendor' in p.parts:continue
 manifest=tomllib.loads(p.read_text());package=manifest.get('package')
 if not package:continue
 rel=str(p.relative_to(UP));components.append({'package':package.get('name'),'manifest':source(rel),'source_root':str(p.parent.relative_to(UP)),'publish':package.get('publish','workspace/default'),'has_lib_entry':(p.parent/'src/lib.rs').exists(),'has_main_entry':(p.parent/'src/main.rs').exists(),'scope_review':'REQUIRED: classify public entry/implementation-only/test helper and bind observable capabilities; no global closure asserted.'})

newids=(set(existing)-set(initial_by_id))
catalog['requirements'] += [q for q in new_requirements if not any(z['id']==q['id'] for z in catalog['requirements'])]
catalog.update(revision='draft-r2-g01',status='G01_IN_PROGRESS_EXPERIMENTAL_AND_EXEC_PROTOCOL_EXPANSION',scope_closure='OPEN_G01; schema variants, source-only types, component/CLI/tools/SDK reachability and independent review remain',functional_denominator=sum(q['kind']=='FUNCTIONAL_PARITY' for q in catalog['requirements']),surface_inventory_count=657+len(newids),full_codex_parity_claim=False)
catalog.setdefault('revision_log',[])
revision={'revision':'draft-r2-g01','task':'DX100-G01','parent_revision':'draft-r1','parent_sha256':digest(BASE),'added_requirement_ids':sorted(newids),'removed_requirement_ids':[],
 'reason':'Planning schemas omitted experimental/deprecated/client-notification and separate exec-server protocol. Additive extraction from pinned source; companion experimental export corroborates surface, not functional equivalence.',
 'functional_receipts_added':0,'closure':'NOT_CLOSED; unresolved source/variant/component obligations remain explicit.'}
if not any(r['revision']=='draft-r2-g01' for r in catalog['revision_log']):catalog['revision_log'].append(revision)
catalog['execution']={'program_status':'IN_PROGRESS','task':'DX100-G01','evidence_root':str(OUT.relative_to(ROOT)),'source_commit':PIN,'active_goal_scope':'Full original plan and all additive requirements','functional_qualification':'NOT_RUN','companion_export_evidence_id':'ev_ccf6fcd3199170a93847b193d2c77dbda0d5bae51853680c0b37a37cfa762e51'}

# Preserve original normative records byte-for-byte semantically. Additional
# requirements may be added; old status/acceptance must not be relabelled.
for rid,q in initial_by_id.items():assert next(z for z in catalog['requirements'] if z['id']==rid)==q,rid

write(OUT/'protocol-source-inventory.json',{'commit':PIN,'counts':dict(collections.Counter(r['envelope'] for r in contracts)),'entries':contracts,'kind':'STATIC_SOURCE_WITH_COMPANION_SCHEMA_CORROBORATION; not functional acceptance'})
write(OUT/'variant-matrix.json',{'revision':'r2-review-fixes','scope':'Partial syntax projections of app-server envelopes, explicit request response obligations, nested config; not complete behavioral or source coverage','app_server':schema_cases,'request_responses':response_cases,'configuration':config_rows,'unresolved':'Source-only types, response source reconciliation, exec-server payloads, CLI aliases/flags/cfg, SDK APIs, tools and component reachability require follow-up before G01 can close.'})
write(OUT/'exec-server-contracts.json',{'commit':PIN,'entries':exec_contracts,'qualification':'NOT_RUN'})
write(OUT/'component-inventory.json',{'commit':PIN,'components':components,'coverage':'Manifest enumeration, not semantic scope closure'})
write(OUT/'catalog-delta.json',revision)
original_surface=read(ROOT/'docs/04_audit/evidence/CODEX100-PLAN-20261017/surface-inventory.json')['entries']
combined=list(original_surface)
initial_rids={z.get('requirement') for z in combined}
for row in contracts:
 if row['requirement'] not in initial_rids:
  combined.append({'id':'SURF-G01-'+row['envelope']+'-'+row['method'],'kind':'app_server_source_contract','name':row['method'],'requirement':row['requirement'],'source':row['source'],'owner':existing[row['requirement']]['owner'],'disposition':'INCLUDED; source-only/companion-schema status explicit','functional_qualification':'NOT_RUN'})
for row in exec_contracts:
 combined.append({'id':'SURF-EXEC-'+row['method'],'kind':'exec_server_source_contract','name':row['method'],'requirement':row['requirement'],'source':row['source'],'owner':'DX100-R02','disposition':'INCLUDED; type/handler expansion pending','functional_qualification':'NOT_RUN'})
assert len(combined)==catalog['surface_inventory_count']
write(OUT/'surface-inventory-r2.json',{'commit':PIN,'entries':combined,'counts':dict(collections.Counter(z['kind'] for z in combined)),'scope_closure':'OPEN_G01'})

write(CATALOG,catalog)
snap=OUT/'reference';snap.mkdir(exist_ok=True)
for envelope in schema_by_envelope:shutil.copyfile(COMPANION/(envelope+'.json'),snap/(envelope+'.json'))
write(OUT/'schema-snapshot-index.json',{'kind':'INSTALLED_COMPANION_EXPERIMENTAL_SCHEMA; source/build binding pending','generated_schema_file_count':len(list(COMPANION.rglob('*.json'))),'files':[{'path':str(p.relative_to(COMPANION)),'sha256':digest(p),'bytes':p.stat().st_size} for p in sorted(COMPANION.rglob('*.json'))]})
summary={'observed_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'original_requirements':len(initial_by_id),'original_functional_denominator':baseline['functional_denominator'],'new_functional_requirements':len(newids),'functional_denominator_now':catalog['functional_denominator'],'cvg_controls':catalog['mandatory_cvg_controls'],
 'source_app_server_counts':dict(collections.Counter(r['envelope'] for r in contracts)),'app_server_without_companion_schema':[(r['envelope'],r['method']) for r in contracts if not r['companion_schema_presence']],
 'companion_schema_count':sum(len(v.get('oneOf',[])) for v in schema_by_envelope.values()),'exec_server_methods':len(exec_contracts),'schema_node_records':sum(len(r.get('nodes',[])) for r in schema_cases),'response_obligations':len(response_cases),'response_schema_node_records':sum(len(v['nodes']) for r in response_cases for v in r['schema_variants']),'responses_without_exported_schema':[r['request_method'] for r in response_cases if not r['schema_variants']],'config_node_records':sum(len(r['nodes']) for r in config_rows),'components':len(components),
 'dispatch_without_static_use':[(r['envelope'],r['method']) for r in contracts if not r['static_use_sites']],'functional_parity_receipts':0,'g01_status':'IN_PROGRESS; no complete scope closure claimed'}
write(OUT/'extraction-summary.json',summary)
print(json.dumps(summary,ensure_ascii=False))
