"""Join pinned CLI field, scalar and rule evidence; no target parsing occurs."""
from pathlib import Path
import collections
import copy
import hashlib
import json
import subprocess
import sys

OUT=Path(__file__).resolve().parent
E=OUT.parents[1]
ROOT=next(p for p in OUT.parents if (p/'docs/07_agents/AGENTS.md').exists())
UP=Path('/tmp/cvg-rea-codex-20261017/upstream')


def require(ok,message):
    if not ok:raise AssertionError(message)


def read(p):return json.loads(p.read_text())
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def encoded(v):return (json.dumps(v,ensure_ascii=False,indent=2)+'\n').encode()


def build():
    contract=read(OUT/'contract.json');pin=contract['pin']
    require(all(sha(E/r['path'])==r['sha256'] for r in contract['inputs']),'Parent inputs differ')
    rules=read(OUT/'rules/inventory.json');scalars=read(OUT/'scalars/inventory.json')
    graph=read(E/'g01/entrypoints/cli/graph.json');previous=read(E/'g01/cli-adapters/integration.json')
    catalog_path=ROOT/'docs/03_build/tracking/codex100_catalog_v1.json'
    catalog=read(catalog_path);requirements={r['id']:r for r in catalog['requirements']}
    require(requirements['CDX100-10-01']['owner']=='DX100-H02' and len(requirements)==509,'CLI catalog owner/denominator differs')
    require(rules['pin']==scalars['pin']==pin and rules['contract_sha256']==sha(OUT/'contract.json')
            and scalars['contract_sha256']==sha(OUT/'scalars-contract.json'),'Lane contract/pin differs')
    require(read(OUT/'scalars-contract.json')['parent_contract_sha256']==sha(OUT/'contract.json'),
            'Scalar parent contract differs')
    manifests={lane:read(OUT/lane/'manifest.json') for lane in ['rules','scalars']}
    for lane,manifest in manifests.items():
        rows=manifest.get('files',manifest.get('artifacts'));directory=OUT/lane
        require({r['path'] for r in rows}=={str(p.relative_to(directory)) for p in directory.rglob('*')
                if p.is_file() and p!=directory/'manifest.json'},'Lane file set differs')
        require(all(sha(directory/r['path'])==r['sha256'] and (directory/r['path']).stat().st_size==r['bytes']
                    for r in rows),'Lane bytes differ')
    rule_by_id={r['id']:r for r in rules['fields']};scalar_by_id={r['id']:r for r in scalars['fields']}
    historical={r['id']:r for r in graph['fields']}
    require(rule_by_id.keys()==scalar_by_id.keys()==historical.keys() and len(historical)==305,'Field omission/collision')
    scalar_types={r['id']:r for r in scalars['scalar_types']}
    recipes={r['id']:r for r in rules['parser_recipes']}
    joined=[]
    for fid,parent in historical.items():
        rule=rule_by_id[fid];scalar=scalar_by_id[fid]
        require(rule['historical_field']==scalar['historical']==parent,'Historical field changed')
        expressions=rule['parser_expressions']
        require(expressions==scalar['explicit_value_parser'],'Explicit parser ownership differs')
        require(scalar['runtime_qualification']=='NOT_RUN' and scalar['effective_clap_grammar']=='OPEN','False scalar qualification')
        if expressions:
            require(scalar['parser_owner']=='LEAD_EXPLICIT' and not scalar['implicit_candidates']
                    and scalar['implicit_parser_applicability']=='SUPPRESSED_EXPLICIT_PARSER','Explicit parser incorrectly replaced by implicit')
        require(all(r['kind']!='REPOSITORY' or r['id'] in scalar_types for r in scalar['leaf_bindings']),
                'Repository scalar definition missing')
        joined.append({'id':fid,'declaration_owner':parent['owner'],'owner':'DX100-H02','requirement':'CDX100-10-01',
                       'binding':parent['binding'],'rust_type':parent['rust_type'],
                       'scalar_disposition':scalar['disposition'],'scalar_leaf_bindings':scalar['leaf_bindings'],
                       'implicit_candidates':scalar['implicit_candidates'],'parser_owner':scalar['parser_owner'],
                       'explicit_recipes':[recipes['parser:'+expr]['id'] for expr in expressions],
                       'raw_properties':rule['raw_properties'],'lossless_property_syntax':rule['lossless_property_syntax'],
                       'defaults':rule['explicit_defaults'],'relations':rule['relations'],
                       'direct_cfg':parent.get('cfg',[]),'source':rule['source'],
                       'availability':'DECLARATION_METADATA; inherited command/flatten/alias cfg retained in historical graph, not evaluated',
                       'qualification':'NOT_RUN'})
    for row in rules['windows_fields']:
        require(row['id'] not in historical,'Windows field duplicates historical field')
        joined.append({**row,'owner':'DX100-H02','requirement':'CDX100-10-01',
                       'scalar_disposition':'STANDARD_SOURCE_BOUNDARY_OPEN',
                       'scalar_leaf_bindings':[],'implicit_candidates':[],
                       'parser_owner':'LEAD_WINDOWS_DERIVED_ARGUMENT_SOURCE',
                       'explicit_recipes':[],'defaults':{k:v for k,v in row['raw_properties'].items() if k.startswith('default')},
                       'relations':{k:v for k,v in row['raw_properties'].items() if k.startswith(('requires','conflicts','overrides'))},
                       'direct_cfg':[rules['windows_grammar']['dispatch_cfg']],
                       'availability':'Windows-only source branch; no target evaluation or provisioning receipt'})
    require(len(joined)==309,'Combined field census differs')
    # Concrete source-bound obligation families, not executed examples or inferred expected outputs.
    cases=[]
    for field in joined:
        if field['binding'] in ['arg','manual-windows-derived-arg']:
            kinds=['absent','valid_value_or_flag','invalid_value_or_arity','library_grammar_and_platform_profile']
            if field['defaults']:kinds.append('declared_default_and_missing_value')
            if field['relations']:kinds.append('requires_conflicts_overrides')
            if any('alias' in k or k=='short' for k in field['raw_properties']):kinds.append('alias_or_short_spelling')
            if any(k in field['raw_properties'] for k in ['num_args','value_delimiter','trailing_var_arg','action']):
                kinds.append('repetition_delimiter_arity_action')
            if field['explicit_recipes']:kinds.append('explicit_parser_errors_and_boundaries')
            if any(r['kind']=='REPOSITORY' for r in field.get('scalar_leaf_bindings',[])):kinds.append('scalar_variants_aliases_conversions')
            if field.get('direct_cfg'):kinds.append('direct_cfg_branch')
        else:
            kinds=['container_or_manual_data_disposition','not_promoted_to_scalar_argument']
        cases.extend({'id':'cli-case:'+field['id']+'::'+kind,'field_id':field['id'],'kind':kind,
                      'requirement':field['requirement'],'owner':field['owner'],
                      'expected_result':'TO_BE_OBSERVED_WITH_AUTHENTICATED_REFERENCE; source syntax is not runtime outcome',
                      'qualification':'NOT_RUN'} for kind in kinds)
    for context in rules['command_and_variant_metadata']:
        cases.append({'id':'cli-context-case:'+context['id'],'field_id':None,'context_id':context['id'],
                      'kind':'command_name_alias_visibility_group_cfg_context',
                      'owner':'DX100-H02','requirement':'CDX100-10-01',
                      'expected_result':'TO_BE_OBSERVED_WITH_AUTHENTICATED_REFERENCE', 'qualification':'NOT_RUN'})
    for adapter in rules['manual_adapters']:
        cases.append({'id':'cli-manual-case:'+adapter['owner'],'field_id':None,'context_id':adapter['owner'],
                      'kind':'manual_adapter_host_mutation_and_raw_to_domain',
                      'owner':'DX100-H02','requirement':'CDX100-10-01',
                      'expected_result':'TO_BE_OBSERVED_WITH_AUTHENTICATED_REFERENCE', 'qualification':'NOT_RUN'})
    require(len({r['id'] for r in cases})==len(cases),'Case ID collision')
    require(len(previous['surfaces'])==12 and len(rules['manual_adapters'])==4,'Manual surface omission')
    for surface in previous['surfaces']:
        require(all(requirements[r['id']]['owner']==r['owner'] for r in surface['requirements']),'Manual capability owner differs')
    source_rows=rules['sources']+manifests['scalars']['sources'];sources={};data_cache={}
    for r in source_rows:
        raw=(UP/r['path']).read_bytes();oid=r.get('git_blob',r.get('git_blob_oid'))
        require(hashlib.sha256(raw).hexdigest()==r['sha256'] and len(raw)==r['bytes'],'Source bytes differ')
        require(hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()==oid,'Git source object differs')
        if r['path'] in sources:require(sources[r['path']]['sha256']==r['sha256'],'Conflicting source hashes')
        sources[r['path']]={'path':r['path'],'sha256':r['sha256'],'bytes':r['bytes'],'git_blob':oid}
        data_cache[r['path']]=raw
    spans=0
    def attest(v):
        nonlocal spans
        if isinstance(v,dict):
            if {'path','start_byte','sha256'}<=v.keys() and ('end_byte' in v or 'end_byte_exclusive' in v):
                raw=data_cache[v['path']];a=v['start_byte'];b=v.get('end_byte_exclusive',v.get('end_byte'))
                require(0<=a<=b<=len(raw) and hashlib.sha256(raw[a:b]).hexdigest()==v['sha256'],'Span hash/bounds differ')
                if 'text' in v:require(raw[a:b].decode()==v['text'],'Exact span text differs')
                if 'file_sha256' in v:require(hashlib.sha256(raw).hexdigest()==v['file_sha256'],'Whole source hash differs')
                if 'start_line' in v:require(raw[:a].count(b'\n')+1==v['start_line'],'Span start line differs')
                spans+=1
            for child in v.values():attest(child)
        elif isinstance(v,list):
            for child in v:attest(child)
    attest(rules);attest(scalars)
    protected=[]
    for name in ['entrypoints','pinned-variants','exec-server','cli-adapters','dynamic-factories','component-surfaces','exec-transitive']:
        base=E/'g01'/name;manifest=read(base/'manifest.json')
        for r in manifest['files']:
            path=ROOT/r['path'] if r['path'].startswith('docs/') else base/r['path']
            require(sha(path)==r['sha256'] and path.stat().st_size==r['bytes'],'Previous package changed')
            protected.append(str(path))
    require(len(protected)==313,'Prior seven-package count differs')
    require(subprocess.check_output(['git','-C',str(UP),'rev-parse','HEAD']).decode().strip()==pin
            and not subprocess.check_output(['git','-C',str(UP),'status','--porcelain']).strip(),'Upstream pin/clean state differs')
    return {'task':contract['task'],'kind':'T1_CLI_PARSER_SOURCE_AND_FUTURE_OBLIGATION_JOIN_NOT_RUNTIME',
            'pin':pin,'contract_sha256':sha(OUT/'contract.json'),'catalog_sha256':sha(catalog_path),
            'lane_manifests':{lane:sha(OUT/lane/'manifest.json') for lane in ['rules','scalars']},
            'fields':joined,'future_oracle_obligations':cases,'manual_adapter_surfaces':previous['surfaces'],
            'command_and_variant_metadata':rules['command_and_variant_metadata'],
            'windows_grammar':rules['windows_grammar'],'manual_adapters':rules['manual_adapters'],
            'scalar_definition_ids':sorted(scalar_types),'parser_recipe_ids':sorted(recipes),
            'counts':{'historical_fields':305,'additional_windows_fields':4,'combined_fields':len(joined),
                      'command_type_metadata':105,'variant_metadata':82,'explicit_parser_fields':14,
                      'distinct_parser_expressions':10,'scalar_definitions':len(scalar_types),
                      'scalar_variants':scalars['counts']['variants'],'scalar_impls':scalars['counts']['impls'],
                      'rule_function_bodies':39,'manual_adapters':4,'manual_surfaces':12,
                      'future_obligation_families':len(cases),'unique_git_sources':len(sources),
                      'span_occurrences':spans,'previous_package_files_preserved':len(protected)},
            'scalar_disposition_counts':dict(collections.Counter(f['scalar_disposition'] for f in joined)),
            'sources':sorted(sources.values(),key=lambda r:r['path']),
            'mandatory_limits':['Future case families are unexecuted obligations; every expected runtime result needs a bound reference oracle.',
                'Standard/external and implicit Clap parser precedence/grammar remain OPEN, including Shell/url/SocketAddr/numeric/path/string.',
                'cfg availability, manual effective schema, TUI/platform/cwd/env/postparse runtime behaviors are not executed.',
                'All six SDK/package gaps and five previous external runtime/dependency limits remain mandatory.',
                'G01 global scope, G02 reference binding, G03 current reuse, G04 concrete SPEC and native runtime BUILD remain open.',
                'An accepted Codex bypass/auto-review flag does not enlarge CVG policy/approval/containment grants.'],
            'functional_receipts':0,'full_g01_closure':False,'full_codex_parity_claim':False}


fresh=build();require(fresh==build(),'Nondeterministic join')
negatives=[]
for name,mutation in [
 ('lost_field',lambda v:v['fields'].pop()),
 ('lost_future_case',lambda v:v['future_oracle_obligations'].pop()),
 ('qualified_future_case',lambda v:v['future_oracle_obligations'][0].update(qualification='PASS')),
 ('wrong_requirement_owner',lambda v:v['fields'][0].update(owner='DX100-FAKE')),
 ('lost_explicit_precedence',lambda v:next(f for f in v['fields'] if f['explicit_recipes']).update(parser_owner='SCALAR_IMPLICIT')),
 ('lost_windows_cfg',lambda v:next(f for f in v['fields'] if f['binding']=='manual-windows-derived-arg').update(direct_cfg=[])),
 ('lost_scalar_definition',lambda v:v['scalar_definition_ids'].pop()),
 ('lost_manual_surface',lambda v:v['manual_adapter_surfaces'].pop()),
 ('lost_command_context',lambda v:v['command_and_variant_metadata'].pop()),
 ('lost_windows_required_group',lambda v:v['windows_grammar'].pop('required_group')),
 ('removed_runtime_limit',lambda v:v['mandatory_limits'].pop()),
 ('false_full_g01',lambda v:v.update(full_g01_closure=True)),
 ('false_functional_receipt',lambda v:v.update(functional_receipts=1)),
]:
    bad=copy.deepcopy(fresh);mutation(bad)
    try:require(bad==fresh,'Rejected source join mutation')
    except AssertionError:negatives.append({'id':name,'result':'REJECTED'})
    else:raise AssertionError('Accepted known-bad source join')
report={'result':'PASS','kind':'T1_SOURCE_JOIN_ONLY','counts':fresh['counts'],'negative_controls':negatives,
        'functional_receipts':0,'full_g01_closure':False}
for name,value in [('integration.json',fresh),('verification.json',report)]:
    if '--check' in sys.argv:require((OUT/name).read_bytes()==encoded(value),'Join regeneration differs: '+name)
    else:(OUT/name).write_bytes(encoded(value))
print(json.dumps(report))
