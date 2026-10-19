"""Additive requirement-to-source candidates and proposed oracle dimensions.

This is a T1 planning projection, not executed Codex/CVG behavior or G01 closure.
"""
from pathlib import Path
import collections
import copy
import fnmatch
import hashlib
import importlib.util
import json
import subprocess
import sys

sys.dont_write_bytecode = True
OUT = Path(__file__).resolve().parent
E = OUT.parents[2]
ROOT = next(p for p in OUT.parents if (p/'docs/07_agents/AGENTS.md').exists())
UP = Path('/tmp/cvg-rea-codex-20261017/upstream')
PIN = '8d9f6466ff0294785d56f55b1fe363d132fe4133'
CAT = 'docs/03_build/tracking/codex100_catalog_v1.json'
INPUTS = {
 'pinned': 'g01/pinned-variants/matrix.json',
 'cli': 'g01/entrypoints/cli/graph.json',
 'handlers': 'g01/entrypoints/tools/tool-graph.json',
 'factories': 'g01/dynamic-factories/integration.json',
 'nonrust': 'g01/component-surfaces/non-rust/inventory.json',
 'tui': 'g01/tui-interactions/commands/inventory.json',
 'tui_join': 'g01/tui-interactions/integration.json',
 'exec': 'g01/exec-transitive/integration.json',
}


def require(ok, message):
    if not ok: raise AssertionError(message)


def read(p): return json.loads(p.read_text())
def sha(b): return hashlib.sha256(b).hexdigest()
def canon(v): return json.dumps(v, ensure_ascii=False, sort_keys=True, separators=(',',':')).encode()
def encoded(v): return (json.dumps(v, ensure_ascii=False, indent=2)+'\n').encode()
def escape(s): return s.replace('~','~0').replace('/','~1')


CONTRACT_SHA = '4722152a3f4c8be37fb8edc0e3409cd298b58bd5f5eb7f5937b0ea66986ecab2'
require(sha((OUT.parent/'contract.json').read_bytes()) == CONTRACT_SHA, 'Parent contract changed')
parent_contract = read(OUT.parent/'contract.json')
require(sha((E/'checkpoint-tui-manifest.json').read_bytes()) == parent_contract['previous_program_checkpoint']['sha256'], 'Previous checkpoint changed')
checkpoint = read(E/'checkpoint-tui-manifest.json')
protected = {r['path']:r for r in checkpoint['files']}
for chain_path in ['g01/entrypoints/manifest.json', 'g01/entrypoints/cli/generate.py']:
    chain = E/chain_path
    require(sha(chain.read_bytes()) == protected[str(chain.relative_to(ROOT))]['sha256'], 'Accepted helper dependency changed')
helper_path = E/'g01/tui-interactions/commands/reader.py'
helper_expected = protected[str(helper_path.relative_to(ROOT))]['sha256']
require(sha(helper_path.read_bytes()) == helper_expected, 'Accepted audit helper changed')
spec = importlib.util.spec_from_file_location('accepted_registry_capability_lexer', helper_path)
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)


def parse_rules(text):
    rows=[]
    for ordinal,line in enumerate(text.splitlines()):
        if not line or line.startswith('#'): continue
        columns=line.split('|')
        require(len(columns)==8, 'Eight DSL columns required at '+str(ordinal+1))
        rid,rpc,slash,cli,config,handlers,seed,axes=columns
        rows.append({'requirement':'CDX100-'+rid,
            'rpc_selectors':[v for v in rpc.split(',') if v],
            'slash_variants':[v for v in slash.split(',') if v],
            'root_cli_variants':[v for v in cli.split(',') if v],
            'config_keys':[v for v in config.split(',') if v],
            'handler_names':[v for v in handlers.split(',') if v],
            'seed_function_names':[v for v in seed.split(',') if v],
            'proposed_oracle_axes':[v.strip() for v in axes.split(';') if v.strip()],
            'rule_line':ordinal+1})
    require(len(rows)==179 and len({r['requirement'] for r in rows})==179,'179 unique historical requirements required')
    return rows


def summary(obj):
    if not isinstance(obj,dict): return {'literal':obj}
    selected={k:obj[k] for k in ['method','envelope','variant','rust_variant','name','kind','family',
        'source_params_type','source_response_type','cfg','attributes','spelling','cli_name','aliases',
        'type_only','binding','root_type_ids','external_contracts','qualification'] if k in obj}
    return selected


def object_link(key, pointer, obj, relation):
    return {'input':INPUTS[key], 'json_pointer':pointer, 'object_sha256':sha(canon(obj)),
            'digest_encoding':'UTF8 JSON sort_keys true compact separators ensure_ascii false',
            'relation':relation, 'source_summary':summary(obj),
            'qualification':'NOT_RUN',
            'semantic_scope':'SOURCE_CANDIDATE; no effect completion, equivalence or domain-owner transfer'}


def require_search_domain_boundaries(rows):
    by_id={r['id']:r for r in rows}
    file_search=by_id['CDX100-05-04']
    require('ToolSearchHandler' not in file_search['source_rule']['handler_names'],
            'Deferred tool discovery is not filesystem search')
    require(not any(link['json_pointer']=='/handler_bindings/ToolSearchHandler'
                    and link['input']==INPUTS['handlers'] for link in file_search['source_fragment_candidates']),
            'Irrelevant tool discovery fragment attached to filesystem search')
    require(any(link['source_summary'].get('method','').startswith('fuzzyFileSearch')
                for link in file_search['source_fragment_candidates']), 'Filesystem fuzzy search source lost')
    require(any(link['source_summary'].get('variant')=='Mention'
                for link in file_search['source_fragment_candidates']), 'Mention input source lost')
    for rid in ['CDX100-11-08','CDX100-13-08','CDX100-22-03']:
        require('ToolSearchHandler' in by_id[rid]['source_rule']['handler_names'],
                'Relevant deferred discovery binding lost: '+rid)


def project(rules, data, catalog, seed_sources):
    reqs={r['id']:r for r in catalog['requirements']}
    generic={r['id'] for r in reqs.values() if isinstance(r.get('variants'),str)
             and r['variants'].startswith('Payload/default/erro/estado/concurrency/platform/provider')}
    require({r['requirement'] for r in rules}==generic and len(generic)==179,'Historical placeholder set changed')
    family_sources={f['id']:f['source'] for f in catalog['families']}
    source_contracts=data['pinned']['source_contracts']
    cfg_keys=data['pinned']['configuration']['top_level_keys']
    fn_cache={}
    rows=[]
    for rule in rules:
        rid=rule['requirement'];require(rid in reqs,'Unknown requirement')
        requirement=reqs[rid];links=[];unresolved=[]
        def match_selectors(key, field, pool, kind, keyname):
            for selector in rule[field]:
                matches=[(i,row) for i,row in enumerate(pool) if fnmatch.fnmatchcase(row[keyname],selector)]
                if not matches: unresolved.append({'kind':kind,'selector':selector,'status':'OPEN_NO_EXPLICIT_SOURCE_MATCH'})
                for i,row in matches:
                    links.append(object_link(key,kind+str(i),row,'CURATED_EXPLICIT_SELECTOR_CANDIDATE'))
        match_selectors('pinned','rpc_selectors',source_contracts,'/source_contracts/','method')
        selected_rpc={r['source_summary'].get('method') for r in links}
        for i,response in enumerate(data['pinned']['request_responses']):
            if response['method'] in selected_rpc:
                links.append(object_link('pinned','/request_responses/'+str(i),response,'RESPONSE_OF_SELECTED_REQUEST_NOT_EFFECT_EQUIVALENCE'))
        match_selectors('tui','slash_variants',data['tui']['variants'],'/variants/','variant')
        for name in rule['root_cli_variants']:
            found=[(i,r) for i,r in enumerate(data['cli']['variants'])
                   if r['owner']==data['cli']['root_enum'] and r['rust_variant']==name]
            if not found: unresolved.append({'kind':'root_cli','selector':name,'status':'OPEN_NO_EXPLICIT_SOURCE_MATCH'})
            links.extend(object_link('cli','/variants/'+str(i),r,'ROOT_CLI_SOURCE_VARIANT_CANDIDATE') for i,r in found)
        for selector in rule['config_keys']:
            matched=[(i,k) for i,k in enumerate(cfg_keys) if fnmatch.fnmatchcase(k,selector)]
            if not matched:unresolved.append({'kind':'configuration','selector':selector,'status':'OPEN_NO_EXPLICIT_SOURCE_MATCH'})
            links.extend(object_link('pinned','/configuration/top_level_keys/'+str(i),k,'CONFIGURATION_KEY_SOURCE_CANDIDATE') for i,k in matched)
        for name in rule['handler_names']:
            obj=data['handlers']['handler_bindings'].get(name)
            if obj is None:unresolved.append({'kind':'handler','selector':name,'status':'OPEN_NO_EXPLICIT_SOURCE_MATCH'})
            else:links.append(object_link('handlers','/handler_bindings/'+escape(name),obj,'REGISTERED_HANDLER_SOURCE_CANDIDATE; guards retained in original graph'))
        # These bindings are explicit in already accepted packets, not guessed by a
        # matching path/title. The original objects and their limits remain intact.
        for field in ['tool_links','pipeline_links']:
            for i,obj in enumerate(data['factories'][field]):
                if any(r['id']==rid for r in obj['requirements']):
                    links.append(object_link('factories','/'+field+'/'+str(i),obj,'EXPLICIT_PRIOR_REQUIREMENT_BINDING'))
        for field,pool in [('typescript',data['nonrust']['typescript']),
                           ('python/root_public_api',data['nonrust']['python']['root_public_api']),
                           ('packaging',data['nonrust']['packaging']),
                           ('manifests',data['nonrust']['manifests']),
                           ('behavior_and_provenance',data['nonrust']['behavior_and_provenance'])]:
            for i,obj in enumerate(pool):
                if rid in obj.get('binding',{}).get('existing_requirements',[]):
                    relation='EXPLICIT_PACKAGING_SUPPORT_METADATA_NOT_PUBLIC_FUNCTION' if field in ['packaging','manifests'] else 'EXPLICIT_LANGUAGE_VARIANT_BINDING_NOT_LANGUAGE_EQUIVALENCE'
                    links.append(object_link('nonrust','/'+field+'/'+str(i),obj,relation))
        for field in ['commands','view_requirements']:
            for i,obj in enumerate(data['tui_join'][field]):
                ids=[obj['id']] if field=='view_requirements' else [obj['entry_requirement']['id']]+[r['id'] for r in obj['effect_requirement_candidates']]
                if rid in ids:links.append(object_link('tui_join','/'+field+'/'+str(i),obj,'EXPLICIT_TUI_ENTRY_OR_EFFECT_CANDIDATE_BINDING'))
        if rid in ['CDX100-18-04','CDX100-18-05','CDX100-18-06']:
            links.extend(object_link('exec','/operations/'+str(i),obj,'EXPLICIT_EXEC_SERVER_FAMILY_CANDIDATE; detailed per-effect linkage OPEN') for i,obj in enumerate(data['exec']['operations']))
        seed_path=family_sources[requirement['family']]
        raw=seed_sources[seed_path]
        bodies=[]
        if rule['seed_function_names']:
            if seed_path not in fn_cache:
                require(seed_path.endswith('.rs'),'Function selector on non-Rust source')
                parsed=helper.cli.Source(seed_path,raw.decode())
                fn_cache[seed_path]=helper.functions(parsed)
            for name in rule['seed_function_names']:
                matches=[f for f in fn_cache[seed_path] if f['name']==name]
                if not matches:unresolved.append({'kind':'seed_function','selector':name,'status':'OPEN_NO_EXPLICIT_SOURCE_MATCH'})
                bodies.extend({'name':f['name'],'source':f['source'],
                               'relation':'SEED_SOURCE_BODY_CANDIDATE; may be private/trait/default/test; no resolved semantic call edge'} for f in matches)
        links=list({(r['input'],r['json_pointer'],r['relation']):r for r in links}.values())
        rows.append({'id':rid,'family':requirement['family'],'owner':requirement['owner'],'title':requirement['title'],
            'historical_requirement_sha256':sha(canon(requirement)),
            'historical_placeholder_unchanged':requirement['variants'],
            'source_rule':rule,'source_fragment_candidates':links,'seed_source':{'path':seed_path,'sha256':sha(raw),'bytes':len(raw),
                'scope':'HISTORICAL_FAMILY_SEED_CONTEXT; alone does not prove this requirement or complete public reachability'},
            'seed_function_candidates':bodies,'unresolved_selectors':unresolved,
            'future_oracle_obligations':[{'id':'capability-oracle:'+rid+':'+str(i),
                'dimension':axis,'qualification':'NOT_RUN',
                'expected_result':'TO_BE_FROZEN_FROM_AUTHENTICATED_REFERENCE_AND_APPLICABLE_CVG_SPEC; planning dimension is not observed grammar/outcome'} for i,axis in enumerate(rule['proposed_oracle_axes'])],
            'source_closure':'OPEN_REQUIREMENT_SPECIFIC_SEMANTIC_AND_VARIANT_ACCEPTANCE; explicit source candidates do not close generic requirement',
            'reference_validation':'NOT_RUN','cvg_validation':'NOT_RUN','receipt':None,
            'applicable_future_gate':'G04 concrete SPEC; T3 explicit review for public/schema/security/identity/policy/approval; T4 sensitive real effects/release',
            'functional_receipts':0})
    return rows


def build():
    contract=read(OUT.parent/'contract.json')
    require(contract['pin']==PIN,'Wrong pin')
    require(sha((ROOT/CAT).read_bytes())==contract['catalog']['sha256'],'Catalog changed')
    catalog=read(ROOT/CAT)
    data={}
    identities=[]
    for key,rel in INPUTS.items():
        p=E/rel;actual=sha(p.read_bytes())
        require(actual==protected[str(p.relative_to(ROOT))]['sha256'],'Accepted source input changed '+rel)
        data[key]=read(p);identities.append({'key':key,'path':rel,'sha256':actual,'bytes':p.stat().st_size})
    require(subprocess.check_output(['git','-C',str(UP),'rev-parse','HEAD']).decode().strip()==PIN,'Wrong upstream')
    require(not subprocess.check_output(['git','-C',str(UP),'status','--porcelain']).strip(),'Dirty upstream')
    tree={}
    for record in subprocess.check_output(['git','-C',str(UP),'ls-tree','-r','-z',PIN]).split(b'\0'):
        if record:
            header,path=record.split(b'\t',1);tree[path.decode()]=header.decode().split()[-1]
    seed_sources={};source_identities=[]
    for family in catalog['families']:
        path=family['source'];raw=(UP/path).read_bytes()
        require(hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()==tree[path],'Seed Git source differs')
        seed_sources[path]=raw;source_identities.append({'path':path,'git_blob':tree[path],'sha256':sha(raw),'bytes':len(raw)})
    rules=parse_rules((OUT/'rules.txt').read_text())
    rows=project(rules,data,catalog,seed_sources)
    require_search_domain_boundaries(rows)
    return {'kind':'T1_179_HISTORICAL_CAPABILITY_SOURCE_CANDIDATES_AND_PROPOSED_ORACLES','pin':PIN,
        'contract_sha256':sha((OUT.parent/'contract.json').read_bytes()),'catalog_sha256':sha((ROOT/CAT).read_bytes()),
        'helper_sha256':helper_expected,'inputs':identities,'rules_sha256':sha((OUT/'rules.txt').read_bytes()),
        'requirements':rows,'sources':source_identities,
        'counts':{'requirements':len(rows),'families':len({r['family'] for r in rows}),
                  'source_fragment_candidates':sum(len(r['source_fragment_candidates']) for r in rows),
                  'seed_function_candidate_occurrences':sum(len(r['seed_function_candidates']) for r in rows),
                  'proposed_future_oracle_dimensions':sum(len(r['future_oracle_obligations']) for r in rows),
                  'unresolved_selectors':sum(len(r['unresolved_selectors']) for r in rows),
                  'requirements_without_nonseed_candidate':sum(not r['source_fragment_candidates'] for r in rows)},
        'limits':['Curated selectors establish audit candidates, not complete semantic ownership, public reachability or functional equality.',
                  'Proposed dimensions are unobserved planning obligations, not finite exhaustiveness or executed tests.',
                  'Every generic requirement remains OPEN until requirement-specific source/variant acceptance. All historical catalog objects remain byte-exact.',
                  'Seed functions may be private, trait defaults or test functions; retained source context does not make them a public API.',
                  'Language-specific SDK, dynamic schemas, cfg/macros/platforms/stdio/terminal/providers/effects and authenticated-reference oracles remain mandatory.'],
        'functional_receipts':0,'full_g01_closure':False},(rules,data,catalog,seed_sources)


def main():
    fresh,context=build();require(fresh==build()[0],'Nondeterministic capability projection')
    rules,data,catalog,seed_sources=context
    negatives=[]
    for name,mutation in [
      ('lost_requirement',lambda x:x['requirements'].pop()),
      ('false_owner',lambda x:x['requirements'][0].update(owner='DX100-Z02')),
      ('lost_oracle_dimension',lambda x:x['requirements'][0]['future_oracle_obligations'].pop()),
      ('source_candidate_promoted_to_PASS',lambda x:x['requirements'][0].update(cvg_validation='PASS')),
      ('fake_receipt',lambda x:x.update(functional_receipts=1)),
      ('lost_source_limits',lambda x:x['limits'].clear()),
    ]:
        bad=copy.deepcopy(fresh);mutation(bad);require(bad!=fresh,'Ineffective negative '+name)
        negatives.append({'id':name,'result':'REJECTED_BY_EXACT_REGENERATION'})
    def signature(rows):
        return [(r['id'],r['owner'],[(l['input'],l['json_pointer'],l['source_summary']) for l in r['source_fragment_candidates']],
                 [f['name'] for f in r['seed_function_candidates']],r['unresolved_selectors'],
                 [o['dimension'] for o in r['future_oracle_obligations']]) for r in rows]
    baseline=signature(fresh['requirements'])
    for name in ['RPC_payload_type','CLI_cfg','slash_alias','Python_requirement_binding','rule_oracle_axis','seed_function_name']:
        ds=copy.deepcopy(data);rs=copy.deepcopy(rules);ss=dict(seed_sources)
        if name=='RPC_payload_type':
            next(r for r in ds['pinned']['source_contracts'] if r['method']=='thread/start')['source_params_type']='CONTROL_MUTANT'
        elif name=='CLI_cfg':
            # Add a symbolic cfg to the real root Exec record: input change must
            # survive into the source summary, not merely into an object digest.
            next(r for r in ds['cli']['variants'] if r['owner']==ds['cli']['root_enum'] and r['rust_variant']=='Exec')['cfg']=['#[cfg(control_mutant)]']
        elif name=='slash_alias':
            next(r for r in ds['tui']['variants'] if r['variant']=='Pets')['spelling']['explicit_strum_attributes'].append({'key':'serialize','value':'CONTROL_MUTANT'})
        elif name=='Python_requirement_binding':
            for r in ds['nonrust']['python']['root_public_api']:
                r['binding']['existing_requirements']=[]
        elif name=='rule_oracle_axis':rs[0]['proposed_oracle_axes'][0]='CONTROL_MUTANT'
        else:
            path='codex-rs/core/src/session/turn.rs'
            require(b'fn run_turn(' in ss[path],'Missing seed control anchor')
            ss[path]=ss[path].replace(b'fn run_turn(',b'fn run_turn_control(',1)
        mutant=project(rs,ds,catalog,ss)
        require(signature(mutant)!=baseline,'Semantic projection did not detect '+name)
        negatives.append({'id':name,'result':'SEMANTIC_INPUT_CHANGE_DETECTED_IN_MEMORY_NOT_ONLY_DIGEST'})
    bad_rules=copy.deepcopy(rules)
    next(r for r in bad_rules if r['requirement']=='CDX100-05-04')['handler_names'].append('ToolSearchHandler')
    bad_association=project(bad_rules,data,catalog,seed_sources)
    try:require_search_domain_boundaries(bad_association)
    except AssertionError:
        negatives.append({'id':'file_search_cannot_use_deferred_tool_discovery',
                          'result':'SEMANTIC_SOURCE_ASSOCIATION_REJECTED; fuzzyFileSearch/Mention and discovery11-08/13-08/22-03 retained'})
    else:raise AssertionError('Known irrelevant discovery/filesystem association accepted')
    report={'result':'PASS','kind':'T1_SOURCE_CANDIDATE_REGISTRY_NOT_FUNCTIONAL_ACCEPTANCE','counts':fresh['counts'],
            'negative_controls':negatives,'functional_receipts':0,'full_g01_closure':False}
    for name,value in [('inventory.json',fresh),('verification.json',report)]:
        if '--check' in sys.argv:require((OUT/name).read_bytes()==encoded(value),'Regeneration differs '+name)
        else:(OUT/name).write_bytes(encoded(value))
    print(json.dumps(report))


if __name__=='__main__':main()
