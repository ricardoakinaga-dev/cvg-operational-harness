"""T1 evidence verification against original source data, including negatives."""
from pathlib import Path
from urllib.parse import unquote
import collections
import copy
import functools
import hashlib
import json
import subprocess

OUT=Path(__file__).resolve().parent
ROOT=next(p for p in OUT.parents if (p/'docs/07_agents/AGENTS.md').is_file())
UP=Path('/tmp/cvg-rea-codex-20261017/upstream')
G01=OUT.parent
PIN='8d9f6466ff0294785d56f55b1fe363d132fe4133'
ARCHIVE='codex-rs/app-server-protocol/schema/precomputed/app-server-exports-experimental.json.zst'
def canonical(v):return json.dumps(v,sort_keys=True,ensure_ascii=False,separators=(',',':'),allow_nan=False).encode()
def sha(v):return hashlib.sha256(v).hexdigest()
def read(p):return json.loads(p.read_text())
def require(ok,msg):
    if not ok:raise AssertionError(msg)
def esc(s):return str(s).replace('~','~0').replace('/','~1')
def at(obj,pointer):
    if not pointer:return obj
    require(pointer.startswith('/'),'Invalid JSON pointer')
    for token in pointer[1:].split('/'):
        token=token.replace('~1','/').replace('~0','~')
        obj=obj[int(token)] if isinstance(obj,list) else obj[token]
    return obj

def family_for(pointer):
    if 'ThreadItem' in pointer or 'ImageGenerationInputImage' in pointer:return 'IMAGE_RESULT_INPUTS'
    if 'responsesapiClientMetadata' in pointer:return 'METADATA_PATCH'
    if 'voiceSessionId' in pointer:return 'VOICE_SESSION'
    if 'toolListMeta' in pointer:return 'MCP_TOOL_META'
    raise AssertionError('Unknown drift family')

def sites(obj,pointer=''):
    require(isinstance(obj,(dict,bool)),'Invalid schema node')
    yield pointer
    if isinstance(obj,bool):return
    for group in ['properties','patternProperties','definitions','$defs','dependentSchemas']:
        for name,value in obj.get(group,{}).items():yield from sites(value,pointer+'/'+esc(group)+'/'+esc(name))
    for group in ['oneOf','anyOf','allOf','prefixItems']:
        for i,value in enumerate(obj.get(group,[])):yield from sites(value,pointer+'/'+group+'/'+str(i))
    for key in ['not','if','then','else','additionalProperties','additionalItems','contains','propertyNames','unevaluatedProperties','unevaluatedItems','contentSchema']:
        if key in obj:yield from sites(obj[key],pointer+'/'+key)
    if 'items'in obj:
        items=obj['items']
        if isinstance(items,list):
            for i,value in enumerate(items):yield from sites(value,pointer+'/items/'+str(i))
        else:yield from sites(items,pointer+'/items')
    for name,value in obj.get('dependencies',{}).items():
        if isinstance(value,(dict,bool)):yield from sites(value,pointer+'/dependencies/'+esc(name))

require(subprocess.check_output(['git','-C',str(UP),'rev-parse','HEAD'],text=True).strip()==PIN,'Wrong source pin')
require(not subprocess.check_output(['git','-C',str(UP),'status','--porcelain'],text=True).strip(),'Source modified')
exports=json.loads(subprocess.check_output(['/usr/bin/zstd','-d','-c',str(UP/ARCHIVE)]))['json_schema']
comparison=read(G01/'entrypoints/exports/comparison.json')
protocol=read(G01/'protocol-source-inventory.json')['entries']
original_sources={name:text.encode() for name,text in exports.items()}
original_sources.update({
 '__config__/config.schema.json':(UP/'codex-rs/core/config.schema.json').read_bytes(),
 '__source_only__/RawResponseItemCompletedNotification.json':(UP/'codex-rs/app-server-protocol/schema/json/v2/RawResponseItemCompletedNotification.json').read_bytes(),
 '__source_only__/RawResponseCompletedNotification.json':(UP/'codex-rs/app-server-protocol/schema/json/v2/RawResponseCompletedNotification.json').read_bytes()})

def validate(matrix,families):
    require(matrix['functional_receipts']==families['functional_receipts']==0 and not matrix['full_g01_closure'] and not families['full_g01_closure'],'False functional/scope qualification')
    contracts=matrix['source_contracts'];responses=matrix['request_responses']
    require(len(contracts)==274,'Source contract removed')
    expected={r['requirement']:r for r in protocol}
    require({r['requirement'] for r in contracts}==expected.keys(),'Contract IDs changed')
    require(len(responses)==186,'Response obligation removed')
    require({r['requirement'] for r in responses}=={r['requirement'] for r in protocol if r['envelope'] in ['ClientRequest','ServerRequest']},'Response requirements changed')
    require(len(families['differences'])==215,'Difference removed')
    require(len({r['schema'] for r in families['differences']})==29,'Changed schema removed')
    observed={(r['schema'],r['comparison_record_index']):r for r in families['differences']}
    counts=collections.Counter()
    for row in comparison['schemas']:
        for i,diff in enumerate(row.get('differences',[])):
            require((row['path'],i) in observed,'Missing source difference')
            found=observed[(row['path'],i)];group=family_for(diff['pointer']);counts[group]+=1
            require(found['pointer']==diff['pointer'] and found['kind']==diff['kind'] and found['family']==group,'Wrong difference-to-family mapping')
            require(found['source_sha256']==row['source_sha256'] and found['companion_sha256']==row['companion_sha256'],'Difference digest mismatch')
            require(found['qualification']=='NOT_RUN','False difference qualification')
    require(dict(counts)==families['counts_by_family'],'Family counts changed')
    for group,family in families['families'].items():
        require(family['difference_records']==counts[group] and family['qualification']=='NOT_RUN','Family scope drift')
        require(family['sources'] and family['future_cases'],'Missing source/cases')
        for source in family['sources']:
            data=(UP/source['path']).read_bytes();lines=data.decode().splitlines()
            require(sha(data)==source['sha256'],'Rust source changed')
            require(source['anchor'] in lines[source['line']-1],'Rust anchor mismatch')
            start=source['excerpt_start']-1
            require(lines[start:start+len(source['excerpt_lines'])]==source['excerpt_lines'],'Rust excerpt mismatch')
    pool=matrix['json_nodes']
    for key,node in pool.items():require(sha(canonical(node))==key,'Schema node tampered')
    active=set()
    @functools.lru_cache(maxsize=None)
    def decode(key):
        require(key not in active,'Cyclic JSON data graph')
        active.add(key);node=pool[key]
        if node['kind']=='literal':value=node['value']
        elif node['kind']=='array':value=[decode(v) for v in node['items']]
        elif node['kind']=='object':
            require(len({k for k,v in node['entries']})==len(node['entries']),'Duplicate object member')
            value={k:decode(v) for k,v in node['entries']}
        else:raise AssertionError('Unknown JSON node kind')
        active.remove(key);return value
    docs={d['id']:d for d in matrix['documents']}
    require(len(docs)==len(matrix['documents'])==455 and docs.keys()==original_sources.keys(),'Pinned document omitted')
    references=0;schema_count=0
    for name,document in docs.items():
        raw=original_sources[name];root=json.loads(raw)
        require(sha(raw)==document['raw_sha256'],'Pinned source byte digest mismatch')
        require(sha(canonical(root))==document['json_sha256']==sha(canonical(decode(document['root_node']))),'Lossless source reconstruction failed')
        records={r['pointer']:r for r in document['schema_sites']}
        require(len(records)==len(document['schema_sites']) and records.keys()==set(sites(root)),'Schema syntax site omitted')
        for pointer,row in records.items():
            value=at(root,pointer);schema_count+=1
            require(canonical(decode(row['node']))==canonical(value),'Schema site points at wrong node')
            profile=matrix['syntax_variant_profiles'][row['node']]
            require(profile['qualification']=='NOT_RUN','False profile qualification')
            if isinstance(value,bool):require(profile['boolean_schema']==value,'Boolean schema lost');continue
            require(profile['keywords']==sorted(value),'Schema keyword omitted')
            require(profile['keyword_nodes'].keys()==value.keys(),'Keyword projection lost')
            for keyword,node in profile['keyword_nodes'].items():require(canonical(decode(node))==canonical(value[keyword]),'Keyword/default/constraint lost')
            if 'properties' in value:
                fields=profile['field_cases'];require({r['field'] for r in fields}==value['properties'].keys(),'Field obligation omitted')
                for field in fields:
                    require(canonical(decode(field['schema_node']))==canonical(value['properties'][field['field']]),'Field schema changed')
                    required=field['field'] in value.get('required',[])
                    require(field['presence']==('REQUIRED_BY_THIS_SCHEMA_OBJECT' if required else 'OPTIONAL_IN_THIS_SCHEMA_OBJECT'),'Presence obligation wrong')
            if '$ref' in value:
                references+=1;edge=row.get('reference_edge')
                require(edge and edge['reference']==value['$ref'],'Reference edge omitted')
                target=at(root,unquote(value['$ref'][1:]))
                require(edge['status']=='RESOLVED_LOCAL_SYNTAX_EDGE' and canonical(decode(edge['target_node']))==canonical(target),'Reference target lost')
    require(not matrix['unresolved_references'],'Unresolved references')
    public=0;excluded=[]
    for row in contracts:
        source=expected[row['requirement']]
        require(row['method']==source['method'] and row['envelope']==source['envelope'] and row['qualification']=='NOT_RUN','Contract changed/qualified')
        if 'schema_document' in row:
            public+=1;value=at(json.loads(original_sources[row['schema_document']]),row['schema_pointer'])
            require(row['method'] in value['properties']['method']['enum'] and canonical(decode(row['schema_node']))==canonical(value),'Wrong public method binding')
        else:
            excluded.append(row['method']);require('DELIBERATELY_EXCLUDED' in row['coverage'],'Excluded contract hidden')
    require(public==269 and set(excluded)=={'getConversationSummary','gitDiffToRemote','getAuthStatus','rawResponseItem/completed','rawResponse/completed'},'Excluded contract lost')
    for row in responses:
        source=expected[row['requirement']]
        require(row['source_response_type']==source['response_type'] and row['qualification']=='NOT_RUN','Response type/qualification changed')
        require(row['response_sender']==('SERVER' if source['envelope']=='ClientRequest' else 'CLIENT'),'Response sender wrong')
        expected_docs=sorted(name for name in exports if name.split('/')[-1]==source['response_type'].split('::')[-1]+'.json')
        require(sorted(row['schema_documents'])==expected_docs,'Response schema omitted')
    return {'lossless_documents':455,'public_schemas':452,'json_nodes':len(pool),'schema_sites':schema_count,'resolved_reference_edges':references,'contracts':274,'response_obligations':186,'difference_records':215,'families':4}

matrix=read(OUT/'matrix.json');families=read(OUT/'families.json')
result=validate(matrix,families)
negative=[]
for name,mutate in [
 ('removed_contract',lambda m,f:m['source_contracts'].pop()),
 ('removed_difference',lambda m,f:f['differences'].pop()),
 ('wrong_family',lambda m,f:f['differences'][0].update(family='METADATA_PATCH')),
 ('removed_response',lambda m,f:m['request_responses'].pop()),
 ('tampered_node',lambda m,f:m['json_nodes'][next(iter(m['json_nodes']))].update(unexpected_key=True)),
 ('removed_reference_edge',lambda m,f:next(r for d in m['documents'] for r in d['schema_sites'] if 'reference_edge'in r).pop('reference_edge')),
 ('removed_keyword',lambda m,f:next(p for p in m['syntax_variant_profiles'].values() if 'keyword_nodes'in p)['keyword_nodes'].clear()),
 ('invented_qualification',lambda m,f:m.update(functional_receipts=1))
]:
    bad_m=copy.deepcopy(matrix);bad_f=copy.deepcopy(families);mutate(bad_m,bad_f)
    try:validate(bad_m,bad_f)
    except (AssertionError,KeyError,IndexError) as e:negative.append({'name':name,'result':'REJECTED','reason':str(e)})
    else:raise AssertionError('Known-bad evidence accepted: '+name)
    del bad_m,bad_f
for row in read(OUT/'protected-inputs.json')['files']:
    require(sha((ROOT/row['path']).read_bytes())==row['sha256'],'Prior evidence/catalog changed')
result.update(kind='T1_SOURCE_EVIDENCE_VERIFICATION_NOT_FUNCTIONAL_PARITY',negative_controls=negative,
              protected_inputs='UNCHANGED',functional_receipts=0,full_g01_closure=False)
(OUT/'verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(result,ensure_ascii=False))
