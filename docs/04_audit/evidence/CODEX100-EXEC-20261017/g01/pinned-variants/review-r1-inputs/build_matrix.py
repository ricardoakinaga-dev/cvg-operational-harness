"""Lossless T1 JSON graph and source-bound schema/contract index.

Reads the pin as data. Does not import/execute target code, mutate the catalog,
or qualify any behavior. References are edges, never recursively expanded.
"""
from pathlib import Path, PurePosixPath
from urllib.parse import unquote
import collections
import hashlib
import json
import subprocess

OUT=Path(__file__).resolve().parent
ROOT=next(p for p in OUT.parents if (p/'docs/07_agents/AGENTS.md').is_file())
G01=OUT.parent
UP=Path('/tmp/cvg-rea-codex-20261017/upstream')
PIN='8d9f6466ff0294785d56f55b1fe363d132fe4133'
ARCHIVE='codex-rs/app-server-protocol/schema/precomputed/app-server-exports-experimental.json.zst'

def canonical(v):return json.dumps(v,sort_keys=True,ensure_ascii=False,separators=(',',':'),allow_nan=False).encode()
def digest(v):return hashlib.sha256(v).hexdigest()
def write(p,v):p.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n')
def read(p):return json.loads(p.read_text())
def esc(s):return str(s).replace('~','~0').replace('/','~1')

pool={}
def intern(value):
    if isinstance(value,dict):node={'kind':'object','entries':[[k,intern(v)] for k,v in sorted(value.items())]}
    elif isinstance(value,list):node={'kind':'array','items':[intern(v) for v in value]}
    else:node={'kind':'literal','value':value}
    key=digest(canonical(node))
    if key in pool:assert pool[key]==node,'Content digest collision'
    else:pool[key]=node
    return key

def pointer_get(value,pointer):
    if pointer=='':return value
    assert pointer.startswith('/'),pointer
    for token in pointer[1:].split('/'):
        token=token.replace('~1','/').replace('~0','~')
        value=value[int(token)] if isinstance(value,list) else value[token]
    return value

MAP_KEYS={'properties','patternProperties','definitions','$defs','dependentSchemas'}
ARRAY_KEYS={'oneOf','anyOf','allOf','prefixItems'}
SINGLE_KEYS={'not','if','then','else','additionalProperties','additionalItems','contains','propertyNames','unevaluatedProperties','unevaluatedItems','contentSchema'}

profiles={}
def schema_sites(schema,root,pointer='',seen=None):
    if seen is None:seen=set()
    if pointer in seen:return
    seen.add(pointer)
    assert isinstance(schema,(dict,bool)),('Non-schema at schema position',pointer,type(schema))
    key=intern(schema)
    row={'pointer':pointer,'node':key}
    if isinstance(schema,bool):
        profiles.setdefault(key,{'boolean_schema':schema,'qualification':'NOT_RUN'})
        yield row;return
    profile={'keywords':sorted(schema),'keyword_nodes':{k:intern(v) for k,v in schema.items()},
        'qualification':'NOT_RUN','scope':'Syntax obligations only; applicability/serde/default behavior and state require source and runtime proof.'}
    if 'properties' in schema:
        required=set(schema.get('required',[]))
        profile['field_cases']=[{'field':k,'schema_node':intern(v),'presence':'REQUIRED_BY_THIS_SCHEMA_OBJECT' if k in required else 'OPTIONAL_IN_THIS_SCHEMA_OBJECT',
            'cases':['omitted','present_valid','present_wrong_type','null_if_distinct_from_omission'],
            'context':'Evaluate enclosing unions/conditions and Rust serde before freezing expected results.'}
            for k,v in schema['properties'].items()]
    if any(k in schema for k in ARRAY_KEYS|{'not','if','then','else'}):
        profile['combinator_cases']='Each branch, overlaps/no-match, negation and conditional activation; branch order preserved, no generated expected success.'
    profiles.setdefault(key,profile)
    if '$ref' in schema:
        reference=schema['$ref'];resolution={'reference':reference}
        if reference.startswith('#'):
            fragment=unquote(reference[1:])
            try:
                target=pointer_get(root,fragment)
                assert isinstance(target,(dict,bool))
                resolution.update(status='RESOLVED_LOCAL_SYNTAX_EDGE',target_pointer=fragment,target_node=intern(target))
            except (KeyError,IndexError,ValueError,AssertionError,TypeError):
                resolution['status']='OPEN_UNRESOLVED_LOCAL_REFERENCE'
        else:resolution['status']='OPEN_EXTERNAL_REFERENCE'
        row['reference_edge']=resolution
    yield row
    for name in sorted(MAP_KEYS):
        for member,value in schema.get(name,{}).items():
            yield from schema_sites(value,root,pointer+'/'+esc(name)+'/'+esc(member),seen)
    for name in sorted(ARRAY_KEYS):
        for i,value in enumerate(schema.get(name,[])):
            yield from schema_sites(value,root,pointer+'/'+name+'/'+str(i),seen)
    for name in sorted(SINGLE_KEYS):
        if name in schema:yield from schema_sites(schema[name],root,pointer+'/'+name,seen)
    if 'items' in schema:
        value=schema['items']
        if isinstance(value,list):
            for i,item in enumerate(value):yield from schema_sites(item,root,pointer+'/items/'+str(i),seen)
        else:yield from schema_sites(value,root,pointer+'/items',seen)
    for member,value in schema.get('dependencies',{}).items():
        if isinstance(value,(dict,bool)):
            yield from schema_sites(value,root,pointer+'/dependencies/'+esc(member),seen)

assert subprocess.check_output(['git','-C',str(UP),'rev-parse','HEAD'],text=True).strip()==PIN
assert not subprocess.check_output(['git','-C',str(UP),'status','--porcelain'],text=True).strip()
payload=subprocess.check_output(['/usr/bin/zstd','-d','-c',str(UP/ARCHIVE)])
assert len(payload)<64*1024*1024
archive=read(G01/'entrypoints/exports/comparison.json')
assert digest((UP/ARCHIVE).read_bytes())==archive['archive']['sha256']
exports=json.loads(payload)['json_schema']
documents=[];objects={}
for name,text in sorted(exports.items()):
    p=PurePosixPath(name);assert not p.is_absolute() and '..' not in p.parts
    obj=json.loads(text);objects[name]=obj
    documents.append({'id':name,'authority':'PINNED_PRECOMPUTED_PUBLIC_EXPORT; reconcile Rust serialization independently',
        'archive_member':name,'raw_sha256':digest(text.encode()),'json_sha256':digest(canonical(obj)),
        'root_node':intern(obj),'schema_sites':list(schema_sites(obj,obj))})
for rel,docid in [
    ('codex-rs/core/config.schema.json','__config__/config.schema.json'),
    ('codex-rs/app-server-protocol/schema/json/v2/RawResponseItemCompletedNotification.json','__source_only__/RawResponseItemCompletedNotification.json'),
    ('codex-rs/app-server-protocol/schema/json/v2/RawResponseCompletedNotification.json','__source_only__/RawResponseCompletedNotification.json')
]:
    data=(UP/rel).read_bytes();obj=json.loads(data);objects[docid]=obj
    documents.append({'id':docid,'authority':'PINNED_CHECKED_IN_SCHEMA; separate from public export and Rust/runtime',
       'source_path':rel,'raw_sha256':digest(data),'json_sha256':digest(canonical(obj)),
       'root_node':intern(obj),'schema_sites':list(schema_sites(obj,obj))})

protocol=read(G01/'protocol-source-inventory.json')['entries']
catalog=read(ROOT/'docs/03_build/tracking/codex100_catalog_v1.json')
requirements={r['id']:r for r in catalog['requirements']}
contracts=[];responses=[]
source_only={r['requirement']:r for r in read(G01/'source-only-dispositions.json')['contracts']}
for contract in protocol:
    envelope=contract['envelope'];method=contract['method'];rid=contract['requirement']
    name=envelope+'.json';root=objects[name]
    matches=[i for i,v in enumerate(root.get('oneOf',[])) if method in v.get('properties',{}).get('method',{}).get('enum',[])]
    assert len(matches)<=1,(envelope,method)
    row={'requirement':rid,'owner':requirements[rid]['owner'],'envelope':envelope,'method':method,
         'source_declaration':contract['source'],'source_params_type':contract['params_type'],
         'qualification':'NOT_RUN','variant_status':'OPEN_BEHAVIORAL_AND_SERDE_RECONCILIATION'}
    if matches:
        pointer='/oneOf/'+str(matches[0]);row.update(schema_document=name,schema_pointer=pointer,
             schema_node=intern(pointer_get(root,pointer)),coverage='PINNED_PUBLIC_EXPORT_CASE')
    else:
        assert rid in source_only,(rid,'Unexpected source contract without export')
        row.update(coverage='DELIBERATELY_EXCLUDED_PUBLIC_JSON; mandatory source contract retained',
            source_disposition='../source-only-dispositions.json',excluded_source_type=source_only[rid]['sources'])
        if envelope=='ServerNotification':
            docid='__source_only__/'+contract['params_type'].split('::')[-1]+'.json'
            assert docid in objects
            row['payload_schema_document']=docid;row['payload_schema_node']=intern(objects[docid])
        else:row['legacy_payload_obligation']='OPEN: Rust/v1 and pinned TypeScript fields retained; no invented JSON export.'
    contracts.append(row)
    if envelope in ['ClientRequest','ServerRequest']:
        type_name=contract['response_type'].split('::')[-1]
        candidates=[d['id'] for d in documents if d.get('archive_member') and d['id'].split('/')[-1]==type_name+'.json']
        responses.append({'requirement':rid,'method':method,'source_response_type':contract['response_type'],
            'response_sender':'SERVER' if envelope=='ClientRequest' else 'CLIENT',
            'schema_documents':candidates,'coverage':'PINNED_PUBLIC_RESPONSE_CANDIDATES; reconcile namespace/filtering/serde' if candidates else 'OPEN_NO_PUBLIC_JSON_RESPONSE',
            'qualification':'NOT_RUN','open_cases':['success/null/error wire envelopes','late/duplicate/mismatched response','source-specific states and effects']})

assert len(contracts)==274 and sum('schema_document' in r for r in contracts)==269
assert len(responses)==186
unresolved=[{'document':d['id'],**r['reference_edge']} for d in documents for r in d['schema_sites']
            if 'reference_edge' in r and r['reference_edge']['status'].startswith('OPEN')]
matrix={'schema':'cvg.codex.source-variant-graph.v1','pin':PIN,'archive':archive['archive'],
 'pool_format':'SHA256 of canonical node representation; lossless parsed-JSON reconstruction; reference edges never recursively expanded',
 'documents':documents,'json_nodes':pool,'syntax_variant_profiles':profiles,'source_contracts':contracts,'request_responses':responses,
 'configuration':{'document':'__config__/config.schema.json','top_level_keys':sorted(objects['__config__/config.schema.json']['properties'])},
 'unresolved_references':unresolved,'functional_receipts':0,'full_g01_closure':False,
 'remaining':['Rust/export reconciliation beyond the four drift families','Legacy request payloads, all lifecycle/state/transport/platform/error and functional cases',
 'Exec-server payload/dispatch, CLI manual/arg0 and extension/MCP runtime factories','G02 executable binding and oracles']}
(OUT/'matrix.json').write_bytes(canonical(matrix)+b'\n')
summary={'public_schema_documents':len(exports),'additional_pinned_schemas':3,'unique_json_nodes':len(pool),
 'schema_sites':sum(len(d['schema_sites']) for d in documents),'syntax_profiles':len(profiles),'source_contracts':len(contracts),
 'public_envelope_cases':269,'deliberately_excluded_source_contracts':5,'response_obligations':len(responses),
 'responses_without_public_schema':[r['method'] for r in responses if not r['schema_documents']],
 'config_top_level_keys':len(matrix['configuration']['top_level_keys']),'unresolved_references':len(unresolved),'functional_receipts':0,'full_g01_closure':False}
write(OUT/'matrix-summary.json',summary)
print(json.dumps(summary))
