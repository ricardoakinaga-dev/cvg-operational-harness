from pathlib import Path
import datetime, hashlib, json, re, subprocess

root=Path('/home/ricardo/Área de trabalho/cvg-operational-harness')
out=root/'docs/04_audit/evidence/CODEX100-EXEC-20261017/g04/full-native-spec/wire-scout'
pin=Path('/tmp/cvg-rea-codex-20261017/upstream')
expected='8d9f6466ff0294785d56f55b1fe363d132fe4133'
sha=lambda b:hashlib.sha256(b).hexdigest()
def dump(name,data): (out/name).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
assert root.resolve()==root and pin.resolve()==pin
head=subprocess.check_output(['git','-C',str(pin),'rev-parse','HEAD'],text=True).strip()
assert head==expected
d=json.loads((out/'sources-initial.json').read_text())
spans=json.loads((out/'ranges-initial.json').read_text())['spans']
contract=json.loads((out/'wire-contract.json').read_text())
assert len(d['sources'])<=35 and len(spans)<=60
stable=[]; changed=[]; pinmatches=[]
for s in d['sources']:
    p=Path(s['official_current_path'])
    assert p.resolve()==p and p.is_file(),p
    before=(out/s['snapshot']).read_bytes()
    assert len(before)==s['bytes'] and sha(before)==s['initial_sha256']
    now=p.read_bytes()
    s['final_sha256']=sha(now);s['final_bytes']=len(now)
    s['initial_final_match']=before==now
    (stable if before==now else changed).append(s['id'])
    if s['kind']=='pin':
        b=subprocess.check_output(['git','-C',str(pin),'show',expected+':'+str(p.relative_to(pin))])
        assert b==before,(s['id'],'pin worktree content differs from commit')
        assert now==before,(s['id'],'pin drift')
        s['git_commit_content_match']=True;pinmatches.append(s['id'])
    ownspans=[r for r in spans if r['source']==s['id']]
    for r in ownspans:
        physical=before.splitlines(keepends=True)
        chunk=b''.join(physical[r['start_line']-1:r['end_line_inclusive']])
        assert len(chunk)==r['bytes'] and sha(chunk)==r['sha256']
        assert before[r['byte_start']:r['byte_start']+r['bytes']]==chunk
    s['ranges']=ownspans
assert next(s for s in d['sources'] if s['id']=='S07')['initial_sha256']==contract['parent_task_sha256']
assert next(s for s in d['sources'] if s['id']=='S07')['initial_final_match']
# Concurrent governance changes are recorded, never attributed to this lane or restored.
assert not any(s['id'] in changed for s in d['sources'] if s['id'] not in ['S01','S02','S03','S04','S05']),changed
for typ,metadata in contract['types'].items():
    sid=metadata['citation'].split(':')[0]
    physical=(out/next(s['snapshot'] for s in d['sources'] if s['id']==sid)).read_text().splitlines()
    for f in metadata['fields']:
        assert f['rust_type'] in physical[f['source_line']-1],(typ,f)
        assert any(r['source']==sid and r['start_line']<=f['source_line']<=r['end_line_inclusive'] for r in spans),(typ,f['source_line'])
assert [f['wire_name'] for f in contract['types']['UserInput.Text']['fields']]==['text','text_elements']
image=contract['types']['UserInput.Image']['fields'][0]
assert image['wire_name'] is None and 'no image wrapper' in image['flattened_shape']
assert contract['types']['TurnInterruptResponse']['fields']==[]
assert len(contract['methods'])==6 and len(contract['notifications'])==6
assert all(n['ack']=='none' for n in contract['notifications'])
ids={x['id'] for x in spans}
def scan(v):
    if isinstance(v,dict):
        for k,x in v.items():
            if k=='citation': assert x in ids,x
            elif k in ['citations','source_chain']: assert all(t in ids for t in x),x
            else: scan(x)
    elif isinstance(v,list):
        for x in v:scan(x)
scan(contract)
links=re.findall(r'\]\(([^)]+)\)',(out/'report.md').read_text())
# All links point to owned artifacts; sources/checks/manifest are produced below.
pending={'sources.json','checks.json','manifest.json'}
for link in links:
    assert link in pending or (out/link).is_file(),link
    assert (out/link).resolve().is_relative_to(out),link
dump('sources.json',{'task':contract['task'],'parent_task_sha256':contract['parent_task_sha256'],
 'pin':{'official_current_path':str(pin),'expected_commit':expected,'initial_commit':expected,'final_commit':head,'selected_worktree_files_match_commit':True},
 'budget':{'primary_files':len(d['sources']),'max_primary_files':35,'cited_exact_ranges':len(spans),'max_cited_exact_ranges':60},
 'baseline_note':'Initial hashes bind captured source snapshots before detailed analysis; governance/bootstrap reads happened before capture. Final hashes checked at seal. Full snapshots are archives, not forwarded schemas.',
 'sources':d['sources'],'concurrent_governance_drift':changed})
claim=json.loads((out/'claim.json').read_text());claim['status']='COMPLETED_FACTUAL_INPUT_AND_PROPOSAL / NOT_APPROVED / NOT_IMPLEMENTED';claim['closed_at']=datetime.datetime.now(datetime.timezone.utc).isoformat();claim['last_completed_action']=contract['handoff']['last_completed_action'];claim['next_action']=contract['handoff']['next_action'];dump('claim.json',claim)
dump('checks.json',{'status':'PASS_SCOPED_STATIC_ARTIFACT_CHECKS','task_sha256':contract['parent_task_sha256'],
 'checks':{'pin_HEAD_exact':True,'official_paths_realpath_checked':True,'pin_selected_commit_content_exact':len(pinmatches),
   'raw_source_snapshots_hash_bytes':len(d['sources']),'exact_range_hash_bytes_offsets':len(spans),'source_initial_final_stable':stable,
   'concurrent_governance_drift':changed,'all_non_governance_sources_stable':True,'selected_method_count':6,'selected_notification_count':6,
   'initialized_separate_no_ACK':True,'type_descriptors':len(contract['types']),'field_source_lines_checked':sum(len(x['fields']) for x in contract['types'].values()),
   'source_citation_links_resolve':True,'report_links_within_owned_package':True,'field_snake_case_and_flatten_regressions':True,
   'budget_35_files_60_ranges':True,'DDL_runtime_app_imports_network_PG_Docker_install_broad_gates_descendants':0},
 'scope':'Local Python artifact parsing/hash/link/source-field checks only, no application runtime or functional test. Governance drift, if any, is preserved and not claimed as scout mutation.',
 'functional_receipts':0,'CQ01_to_CQ14':'NOT_RUN','program_obligations_preserved':'487+22','final_approval':False})
# Copy the two evidence-generation scripts into the owned package for reproducibility.
tmp=Path('/tmp/cvg-codex100-exec-20261017/full-native-spec/wire-scout')
for script in ['assemble.py','seal.py']:
    (out/script).write_bytes((tmp/script).read_bytes())
for p in out.rglob('*.json'):
    if p.name!='manifest.json':json.loads(p.read_text())
files=[]
for p in sorted(out.rglob('*')):
    if p.is_file() and p.name!='manifest.json':
        b=p.read_bytes();files.append({'path':str(p.relative_to(out)),'sha256':sha(b),'bytes':len(b)})
dump('manifest.json',{'task':contract['task'],'status':'SEALED_FACTUAL_INPUT_AND_PROPOSAL / NOT_APPROVED / NOT_IMPLEMENTED',
 'sealed_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'task_binding':{'official_current_path':str(root/'docs/04_audit/evidence/CODEX100-EXEC-20261017/g04/full-native-spec/task.json'),'sha256':contract['parent_task_sha256'],'source':'S07','snapshot':next(s['snapshot'] for s in d['sources'] if s['id']=='S07')},
 'source_inventory':'sources.json','source_initial_hashes':'sources-initial.json','range_inventory':'ranges-initial.json',
 'files':files,'manifest_self_excluded':True,'manifest_exclusion_reason':'No recursive self hash; final chat/Lead may bind manifest bytes externally.',
 'writes_scope':'Only delegated evidence and TMP prefixes; no source/runtime/ledger/owner/DDL/SQL writes',
 'runtime_BUILD_authorized':False,'functional_receipts':0,'final_approval':False})
for entry in files:
    b=(out/entry['path']).read_bytes();assert sha(b)==entry['sha256'] and len(b)==entry['bytes']
print(json.dumps({'status':'PASS_SCOPED_STATIC_ARTIFACT_CHECKS','primary_files':len(d['sources']),'exact_ranges':len(spans),'pin_files_match_commit':len(pinmatches),'concurrent_governance_drift':changed,'sealed_files_excluding_manifest':len(files),'task_sha256':contract['parent_task_sha256'],'manifest_sha256':sha((out/'manifest.json').read_bytes()),'output_files':[p.name for p in out.iterdir() if p.is_file()]},ensure_ascii=False,indent=2))
