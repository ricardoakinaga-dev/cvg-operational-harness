"""Link independent source inventories without changing either lane."""
from pathlib import Path
import copy
import hashlib
import json
import re

OUT=Path(__file__).resolve().parent
def read(p):return json.loads(p.read_text())
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def require(ok,msg):
    if not ok:raise AssertionError(msg)

flows=read(OUT/'flows.json');inventory=read(OUT/'types/inventory.json')
local=[r for r in inventory['types'] if r['module'].startswith('codex_exec_server_protocol::')]
by_name={}
for row in local:by_name.setdefault(row['name'],[]).append(row)
by_id={r['id']:r for r in inventory['types']}
pairs={r['wire_id']:r for r in inventory['wire_domain_pairs']}

def resolve(expression):
    if expression is None:return {'rust_type':None,'resolution':'NO_PAYLOAD_OR_RESPONSE'}
    if expression in ['()','serde_json::Value']:
        return {'rust_type':expression,'resolution':'BUILTIN_UNIT_OR_JSON_VALUE'}
    base=expression.strip();wrappers=[]
    while True:
        match=re.fullmatch(r'(Arc|Box|Option)<(.+)>',base,re.S)
        if not match:break
        wrappers.append(match[1]);base=match[2].strip()
    hits=by_name.get(base.split('::')[-1],[])
    require(len(hits)==1,'Missing/ambiguous local protocol type: '+expression)
    return {'rust_type':expression,'type_id':hits[0]['id'],'wrapper_types':wrappers,
            'resolution':'BOUND_LOCAL_PROTOCOL_SOURCE_TYPE; serde wrapper semantics not executed'}

def build():
    rows=[]
    for operation in flows['operations']:
        row={'requirement':operation['requirement'],'method':operation['method'],
             'params':resolve(operation['wire_params_type']),'response':resolve(operation['wire_response_type']),
             'qualification':'NOT_RUN'}
        header=operation.get('handler',{}).get('header','')
        match=re.search(r'\bparams:\s*([^,\n]+)',header)
        domain=match[1].strip() if match else None
        row['handler_domain_params']=resolve(domain)
        if operation.get('wire_to_domain_conversion') not in [None,'NONE_IN_REGISTRY']:
            wire=row['params']['type_id'];require(wire in pairs,'Missing conversion pair')
            pair=pairs[wire];require(row['handler_domain_params'].get('type_id')==pair['domain_id'],'Domain params not matching conversion')
            row['wire_domain_pair']=pair
        rows.append(row)
    return {'task':'DX100-G01:EXPAND-EXEC-SERVER-CONTRACTS','flow_sha256':sha(OUT/'flows.json'),
      'type_inventory_sha256':sha(OUT/'types/inventory.json'),'type_manifest_sha256':sha(OUT/'types/manifest.json'),
      'operations':rows,'generic_envelope_types':[resolve(name) for name in ['JSONRPCMessage','JSONRPCRequest','JSONRPCNotification','JSONRPCResponse','JSONRPCError','JSONRPCErrorError','RequestId','ByteChunk','ProcessId']],
      'unresolved_transitive_type_references':inventory['unresolved_references'],'functional_receipts':0,'full_g01_closure':False}

def validate(joined):
    require(joined['functional_receipts']==0 and not joined['full_g01_closure'],'False qualification')
    require(joined['flow_sha256']==sha(OUT/'flows.json') and joined['type_inventory_sha256']==sha(OUT/'types/inventory.json'),'Input digest changed')
    require(joined['type_manifest_sha256']==sha(OUT/'types/manifest.json'),'Type manifest changed')
    require(len(joined['operations'])==32,'Operation join removed')
    actual={r['requirement']:r for r in joined['operations']}
    for flow in flows['operations']:
        row=actual[flow['requirement']]
        require(row['method']==flow['method'] and row['qualification']=='NOT_RUN','Method/qualification changed')
        require(row['params']==resolve(flow['wire_params_type']) and row['response']==resolve(flow['wire_response_type']),'Wire type link wrong')
        header=flow.get('handler',{}).get('header','');match=re.search(r'\bparams:\s*([^,\n]+)',header)
        require(row['handler_domain_params']==resolve(match[1].strip() if match else None),'Handler domain type wrong')
        conversion=flow.get('wire_to_domain_conversion') not in [None,'NONE_IN_REGISTRY']
        require(('wire_domain_pair'in row)==conversion,'Wire-to-domain conversion link omitted')
        if 'wire_domain_pair'in row:
            pair=row['wire_domain_pair'];require(pair==pairs[row['params']['type_id']],'Conversion source pair changed')
            require(row['handler_domain_params']['type_id']==pair['domain_id'],'Domain type join wrong')
    require(joined['unresolved_transitive_type_references']==inventory['unresolved_references'],'Open transitive types hidden')
    require(joined['generic_envelope_types']==[resolve(n) for n in ['JSONRPCMessage','JSONRPCRequest','JSONRPCNotification','JSONRPCResponse','JSONRPCError','JSONRPCErrorError','RequestId','ByteChunk','ProcessId']],'Generic envelope/codec type removed')
    return {'operations':32,'wire_domain_conversions':sum('wire_domain_pair'in r for r in joined['operations']),
            'bound_type_links':sum('type_id'in r[k] for r in joined['operations'] for k in ['params','response','handler_domain_params']),
            'unresolved_transitive_references':len(inventory['unresolved_references'])}

joined=build();summary=validate(joined);negatives=[]
for name,mutate in [
 ('removed_join',lambda g:g['operations'].pop()),
 ('wire_domain_type_swapped',lambda g:next(r for r in g['operations'] if r['method']=='fs/open').update(params=resolve('FsOpenParams'))),
 ('hidden_open_types',lambda g:g.update(unresolved_transitive_type_references=[])),
    ('removed_conversion_pair',lambda g:next(r for r in g['operations'] if r['method']=='fs/open').pop('wire_domain_pair')),
    ('removed_generic_codec_links',lambda g:g.update(generic_envelope_types=[])),
 ('false_qualification',lambda g:g.update(functional_receipts=1))
]:
    bad=copy.deepcopy(joined);mutate(bad)
    try:validate(bad)
    except (AssertionError,KeyError) as e:negatives.append({'name':name,'result':'REJECTED','reason':str(e)})
    else:raise AssertionError('Bad type join accepted')
(OUT/'type-links.json').write_text(json.dumps(joined,ensure_ascii=False,indent=2)+'\n')
summary.update(negative_controls=negatives,functional_receipts=0,full_g01_closure=False)
(OUT/'join-verification.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(summary))
