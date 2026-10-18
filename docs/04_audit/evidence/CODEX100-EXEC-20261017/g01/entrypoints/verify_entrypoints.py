"""Integration checks for source graphs/export comparison, not runtime parity."""
from pathlib import Path
import datetime
import hashlib
import json
import re
import subprocess

OUT=Path(__file__).resolve().parent
ROOT=OUT.parents[5]
UP=Path('/tmp/cvg-rea-codex-20261017/upstream')
COMPANION=Path('/tmp/cvg-codex100-exec-20261017/experimental-schemas')
PIN='8d9f6466ff0294785d56f55b1fe363d132fe4133'
NODE='/home/ricardo/.nvm/versions/node/v22.23.2/bin/node'
checks=[]
def read(path):return json.loads(path.read_text())
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def require(ok,message):
    if not ok:raise AssertionError(message)
def check(name,fn):
    try:checks.append({'name':name,'result':'PASS','detail':fn()})
    except Exception as e:checks.append({'name':name,'result':'FAIL','detail':str(e)})

def pin():
    require(subprocess.check_output(['git','-C',str(UP),'rev-parse','HEAD'],text=True).strip()==PIN,'Wrong pin')
    require(not subprocess.check_output(['git','-C',str(UP),'status','--porcelain'],text=True).strip(),'Source changed')
    return {'commit':PIN,'clean':True}
check('pinned_source_identity',pin)

def catalog_unchanged():
    current=read(ROOT/'docs/03_build/tracking/codex100_catalog_v1.json')
    reviewed=read(OUT.parents[1]/'review-r2-catalog.json')
    require(current==reviewed,'Normative catalog changed during graph unit')
    return {'requirements':len(current['requirements']),'functional':current['functional_denominator'],'controls':22,'new_functional_receipts':0}
check('catalog_preservation',catalog_unchanged)

def cli():
    manifest=read(OUT/'cli/manifest.json')
    require(manifest['contract_sha256']==sha(OUT/'cli-contract.json'),'CLI contract changed')
    for row in manifest['artifacts']:
        p=OUT/'cli'/row['path'];require(sha(p)==row['sha256'] and p.stat().st_size==row['bytes'],'CLI artifact drift: '+row['path'])
    for row in manifest['sources']:
        require(sha(UP/row['path'])==row['sha256'],'CLI source drift')
    report=read(OUT/'cli/checks.json')
    require(all(r['result']=='PASS' for r in report['checks']) and len(report['checks'])==8,'CLI checks not green')
    require(len(report['known_bad'])==7 and all(r['result']=='REJECTED' for r in report['known_bad']),'CLI known-bad control accepted')
    require(report['counts']['root_dispatch_resolved']==report['counts']['root_variants']==30,'Root dispatch not bound')
    require(report['counts']['unresolved_edges']==4,'Unresolved manual CLI edges hidden')
    return {'checks':8,'negatives_rejected':7,'manifest_sha256':sha(OUT/'cli/manifest.json'),'counts':report['counts'],
            'qualification':'STATIC_ONLY; lead independently ran --check and read returned package; runtime remains NOT_RUN'}
check('cli_frozen_evidence',cli)

def tools():
    manifest=read(OUT/'tools-review-input-r2.json')
    for row in manifest['files']:
        require(sha(OUT/row['path'])==row['sha256'],'Tool reviewed input drift: '+row['path'])
    report=read(OUT/'tools/verification.json');graph=read(OUT/'tools/tool-graph.json')
    require(len(report['negative_controls'])==8 and all(r['result']=='REJECTED' for r in report['negative_controls']),'Tool negative accepted')
    require(graph['registration_site_count']==39 and graph['test_only_registration_sites']==1 and graph['non_test_textual_registration_sites']==38,'Tool cfg scope wrong')
    require(graph['handler_binding_count']==36 and graph['functional_receipts']==0 and not graph['full_g01_closure'],'Wrong tool closure')
    seen={}
    def visit(v):
        if isinstance(v,dict):
            if {'path','sha256','start_offset'}<=v.keys():
                seen[v['path']]=v['sha256'];text=(UP/v['path']).read_text()
                if 'excerpt' in v:require(text[v['start_offset']:v['end_offset']]==v['excerpt'],'Tool source excerpt drift')
            for z in v.values():visit(z)
        elif isinstance(v,list):
            for z in v:visit(z)
    visit(graph)
    require(all(sha(UP/p)==digest for p,digest in seen.items()),'Tool source drift')
    return {'textual_registration_sites':39,'test_only':1,'other_textual':38,'handler_bindings':36,
            'sources':len(seen),'negative_controls_rejected':8,'functional_receipts':0}
check('tool_frozen_evidence',tools)

def exports():
    data=read(OUT/'exports/comparison.json');p=UP/data['archive']['path']
    require(sha(p)==data['archive']['sha256'],'Pinned export archive drift')
    raw=subprocess.check_output(['/usr/bin/zstd','-d','-c',str(p)])
    require(hashlib.sha256(raw).hexdigest()==data['archive_payload_sha256'],'Archive payload changed')
    bundle=json.loads(raw);counts={'BYTE_IDENTICAL':0,'STRUCTURALLY_DIFFERENT_JSON':0}
    for row in data['schemas']:
        original=bundle['json_schema'][row['path']].encode();companion=(COMPANION/row['path']).read_bytes()
        require(hashlib.sha256(original).hexdigest()==row['source_sha256'] and hashlib.sha256(companion).hexdigest()==row['companion_sha256'],'Schema digest mismatch')
        result='BYTE_IDENTICAL' if original==companion else 'STRUCTURALLY_DIFFERENT_JSON'
        if result!='BYTE_IDENTICAL':require(json.loads(original)!=json.loads(companion) and row['difference_count']>0,'Not a structural difference')
        require(row['comparison']==result,'Comparison changed');counts[result]+=1
    require(counts==data['comparison_counts']=={'BYTE_IDENTICAL':423,'STRUCTURALLY_DIFFERENT_JSON':29},'Wrong export comparison')
    text=(UP/'codex-rs/app-server-protocol/src/export.rs').read_text()
    for name,methods in data['export_policy'].items():
        m=re.search(r'const '+name+r':[^=]+?=\s*&\[(.*?)\];',text,re.S)
        require(m and re.findall(r'"([^"\n]+)"',m[1])==methods,'Export policy mismatch')
    for name in ['ClientRequest','ServerRequest','ClientNotification','ServerNotification']:
        require((OUT/'exports/reference'/('pinned-'+name+'.json')).read_bytes()==bundle['json_schema'][name+'.json'].encode(),'Pinned envelope copy mismatch')
    for row in data['legacy_typescript_snapshots']:
        require(sha(OUT/'exports'/row['snapshot'])==row['sha256'],'Legacy TS snapshot drift')
    require(data['functional_receipts']==0 and data['g02_source_binary_binding']=='NOT_AUTHENTICATED','False source/build authentication')
    return {'schemas':452,'identical_bytes':423,'structurally_different':29,'deliberate_excluded_contracts':5,'source_binary_binding':'OPEN_G02'}
check('pinned_export_policy_and_differences',exports)

def reviews():
    requirements={'tools-review-r2.raw.txt':'ACCEPT_BOUNDED_GRAPH','cli-review-r1.raw.txt':'ACCEPT_BOUNDED_CLI_GRAPH'}
    found={}
    for name,verdict in requirements.items():
        p=OUT/name;require(p.exists() and verdict in p.read_text(),'Required bounded review pending or not accepted: '+name);found[name]=sha(p)
    return {'bounded_reviews':found,'full_g01_approval':False}
check('independent_bounded_reviews',reviews)

result={'task':'DX100-G01:RESOLVE-ENTRYPOINT-GRAPH','observed_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),
 'kind':'T1_INTEGRATION_EVIDENCE_ONLY','checks':checks,'passed':sum(r['result']=='PASS' for r in checks),
 'failed':sum(r['result']=='FAIL' for r in checks),'functional_receipts':0,'goal_status':'active','g01_status':'IN_PROGRESS',
 'remaining':['Four CLI effective-schema edges and dynamic Windows grammar; nested dispatch reachability and arg0.',
 'Pinned source/companion schema differences and Rust/export reconciliation.',
 'Extension/MCP/hosted factories and per-variant functional qualification; G02 executable authentication.']}
(OUT/'verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'passed':result['passed'],'failed':result['failed'],'failures':[r for r in checks if r['result']=='FAIL']}))
raise SystemExit(1 if result['failed'] else 0)
