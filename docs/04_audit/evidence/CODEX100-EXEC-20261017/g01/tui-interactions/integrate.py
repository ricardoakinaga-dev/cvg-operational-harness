"""Join offline TUI evidence. No target imports, compilation or terminal execution."""
from pathlib import Path
import collections
import copy
import hashlib
import json
import subprocess
import sys

OUT = Path(__file__).resolve().parent
E = OUT.parents[1]
ROOT = next(p for p in OUT.parents if (p/'docs/07_agents/AGENTS.md').exists())
UP = Path('/tmp/cvg-rea-codex-20261017/upstream')
CATALOG = ROOT/'docs/03_build/tracking/codex100_catalog_v1.json'
CAT_SHA = '7526e9d172abb1eeffa6981d98f1317fe91af2b617aab2b18a6645a5fd101fa7'
PREVIOUS = ['entrypoints', 'pinned-variants', 'exec-server', 'cli-adapters',
            'dynamic-factories', 'component-surfaces', 'exec-transitive', 'cli-parser-semantics']
# Candidate effect requirements supplement the UI entry requirement. They do not
# transfer ownership or claim the whole effect is implemented by a TUI action.
EFFECTS = {
 'Model':['04-02'], 'Daybreak':['20-06'], 'Ide':['18-08'],
 'Permissions':['07-02','07-03'], 'Keymap':['17-04'], 'Vim':['17-04'],
 'ElevateSandbox':['07-08'], 'Experimental':['10-06'], 'AutoReview':['07-05'],
 'Memories':['03-07','03-08'], 'Skills':['11-01','11-02'], 'Import':['22-05','22-06'],
 'Hooks':['12-01'], 'Review':['16-05'], 'Rename':['02-05'], 'New':['02-01'],
 'Archive':['02-07'], 'Delete':['02-07'], 'Resume':['02-02'], 'Fork':['02-03'],
 'Worktree':['16-01'], 'App':['18-08'], 'Init':['03-02'], 'Compact':['03-04'],
 'Config':['10-02'], 'Recap':['17-06'], 'Plan':['15-03'], 'Voice':['19-04','19-05'],
 'Goal':['15-01','15-02'], 'Agents':['17-07'], 'Side':['15-08'], 'Btw':['15-08'],
 'Copy':['17-06'], 'Export':['17-06'], 'Raw':['17-03'], 'Tui':['17-03'],
 'Diff':['16-03'], 'Mention':['17-02'], 'Status':['17-05'], 'Daemon':['18-01'],
 'Warnings':['21-03'], 'Cd':['16-02'], 'Pwd':['16-02'], 'Usage':['20-04'],
 'DebugConfig':['10-02','10-03'], 'Title':['17-05'], 'Statusline':['17-05'],
 'Theme':['17-05'], 'Pets':['17-08'], 'Mcp':['13-02','13-03'], 'Apps':['13-06'],
 'Plugins':['11-04'], 'Logout':['20-03'], 'Feedback':['21-04'], 'Rollout':['21-06'],
 'Ps':['06-06'], 'Stop':['06-05'], 'Clear':['02-01'], 'TestApproval':['07-03'],
 'MultiAgents':['17-07'], 'MemoryDrop':['03-08'], 'MemoryUpdate':['03-07']}


def require(ok, message):
    if not ok: raise AssertionError(message)


def read(p): return json.loads(p.read_text())
def sha(b): return hashlib.sha256(b).hexdigest()
def encoded(v): return (json.dumps(v, ensure_ascii=False, indent=2)+'\n').encode()


def strict_lane(lane):
    directory = OUT/lane
    manifest = read(directory/'manifest.json')
    rows = manifest['files']
    if isinstance(rows, dict): rows = [{'path': p, **r} for p, r in rows.items()]
    actual = {str(p.relative_to(directory)) for p in directory.rglob('*') if p.is_file() and p != directory/'manifest.json'}
    require(len(rows) == len({r['path'] for r in rows}) and actual == {r['path'] for r in rows}, 'Lane file set '+lane)
    require(all(sha((directory/r['path']).read_bytes()) == r['sha256'] and (directory/r['path']).stat().st_size == r['bytes'] for r in rows), 'Lane bytes '+lane)
    require(not any(p.is_symlink() for p in directory.rglob('*')), 'Lane symlink')
    return {'lane': lane, 'manifest_sha256': sha((directory/'manifest.json').read_bytes()), 'files': len(rows)}


def build():
    contract = read(OUT/'contract.json')
    require(all(sha((E/r['path']).read_bytes()) == r['sha256'] for r in contract['inputs']), 'Parent input changed')
    require(sha(CATALOG.read_bytes()) == CAT_SHA, 'Catalog changed')
    cat = read(CATALOG)
    reqs = {r['id']: r for r in cat['requirements']}
    require(len(reqs) == 509 and cat['functional_denominator'] == 487 and cat['mandatory_cvg_controls'] == 22, 'Catalog census')
    require(all(r['status'] == r['cvg_validation'] == 'NOT_RUN' and r['receipt'] is None for r in reqs.values()), 'False catalog qualification')
    reference_states = collections.Counter(r['reference_validation'] for r in reqs.values())
    require(dict(reference_states) == {'SCHEMA_OBSERVED_ONLY':200,'NOT_RUN':181,
        'SOURCE_DECLARED; companion schema may corroborate surface only':74,
        'SOURCE_DECLARED':32,'NOT_APPLICABLE_CVG_ORACLE':22}, 'Historical reference observations changed')
    lanes = {n: read(OUT/n/'inventory.json') for n in ['commands','events','views','scope']}
    lane_manifests = [strict_lane(n) for n in lanes]
    commands, events, views, scope = [lanes[n] for n in ['commands','events','views','scope']]
    require(all(v['pin'] == contract['pin'] and v['functional_receipts'] == 0 and not v['full_g01_closure'] for v in lanes.values()), 'Lane pin/receipt/closure')
    for lane in ['events', 'views']:
        require(read(OUT/(lane+'-contract.json'))['parent_contract_sha256'] == sha((OUT/'contract.json').read_bytes()), 'Child parent contract')
        require(lanes[lane]['contract_sha256'] == sha((OUT/(lane+'-contract.json')).read_bytes()), 'Worker contract changed')
    require(commands['contract_sha256'] == scope['contract_sha256'] == sha((OUT/'contract.json').read_bytes()), 'Lead contract changed')
    command_by_name = {v['variant']: v for v in commands['variants']}
    event_by_name = {v['name']: v for v in events['enum']['variants']}
    require(len(command_by_name) == 65 and len(event_by_name) == 291, 'Enums omitted')
    scope_by_path = {r['path']: r for r in scope['files']}
    require(len(scope_by_path) == 1131, 'Scope omitted')
    view_refs = collections.defaultdict(list)
    for r in views['crosslane_references']:
        view_refs[(r['kind'], r['name'])].append(r['id'])
    def requirement(rid):
        r = reqs[rid]
        return {'id': rid, 'owner': r['owner'], 'title': r['title'], 'qualification': 'NOT_RUN'}
    command_rows = []
    event_commands = collections.defaultdict(list)
    for name, v in command_by_name.items():
        effect_links = [requirement('CDX100-'+suffix) for suffix in EFFECTS.get(name, [])]
        arms = [commands['bare_dispatch_arms'][i] for i in v['bare_dispatch_arm_indexes']]
        arms += [commands['inline_dispatch_arms'][i] for i in v['inline_dispatch_arm_indexes']]
        evs = sorted({e for arm in arms for e in arm['events']})
        for event in evs:
            require(event in event_by_name, 'Unknown command event '+event)
            event_commands[event].append(name)
        command_rows.append({'id': 'slash:'+name, 'variant': name,
            'source_variant_order': v['presentation_order'],
            'entry_requirement': requirement('CDX100-17-01'), 'effect_requirement_candidates': effect_links,
            'effect_owner_disposition': 'CANDIDATE_REQUIREMENT_LINK_NOT_EFFECT_QUALIFICATION' if effect_links else 'OPEN_EFFECT_REQUIREMENT_JOIN',
            'bare_dispatch_arm_indexes': v['bare_dispatch_arm_indexes'],
            'inline_dispatch_arm_indexes': v['inline_dispatch_arm_indexes'],
            'inline_fallback_arm_indexes': v['inline_fallback_arm_indexes'],
            'literal_app_event_candidates': evs,
            'view_reference_ids': view_refs[('SlashCommand', name)],
            'future_variant_family': {'id': 'tui:slash:'+name, 'owner': 'DX100-U01',
                'requirement': 'CDX100-17-01', 'qualification': 'NOT_RUN',
                'dimensions': ['spelling_alias_order','popup_lookup_dispatch','inline_args_draft_history',
                               'task_thread_review_queue','side_conversation','feature_cfg_platform',
                               'result_error_cancel_effect_and_CVG_authority']}})
    command_join = {r['variant']: r for r in command_rows}
    event_rows = []
    for name, v in event_by_name.items():
        linked_commands = sorted(set(event_commands[name]))
        effect_ids = sorted({r['id'] for command in linked_commands for r in command_join[command]['effect_requirement_candidates']})
        event_rows.append({'id': v['variant_id'], 'name': name, 'source_order': v['ordinal'],
            'source_reference_ids': v['reference_ids'], 'producer_candidate_ids': v['producer_candidate_ids'],
            'consumer_candidate_ids': v['consumer_candidate_ids'],
            'central_dispatch_consumer_ids': v['central_dispatch_consumer_ids'],
            'command_literal_candidates': linked_commands, 'view_reference_ids': view_refs[('AppEvent', name)],
            'effect_requirement_candidates': [requirement(rid) for rid in effect_ids],
            'effect_owner_disposition': 'OPEN; literal command/view link is not end-to-end event/effect ownership',
            'future_variant_family': {'id': 'tui:event:'+name, 'surface_owner': 'DX100-U01',
                                     'requirement': 'CDX100-17-01', 'qualification': 'NOT_RUN',
                                     'effect_requirement': 'OPEN_LEAD_EFFECT_JOIN'}})
    source_rows = scope['sources']+commands['sources']
    source_rows += [{'path': r['source_path'], 'git_blob': r['git_blob_oid'], **{k:r[k] for k in ['sha256','bytes']}} for r in events['sources']]
    source_rows += [{k:r[k] for k in ['path','git_blob','sha256','bytes']} for r in views['files']]
    sources = {}; data_cache = {}
    tree = {}
    for line in subprocess.check_output(['git','-C',str(UP),'ls-tree','-r','-z',contract['pin']]).split(b'\0'):
        if line:
            h,p = line.split(b'\t',1)
            mode,kind,oid = h.decode().split()
            tree[p.decode()] = oid
    for r in source_rows:
        path = r['path']; raw = data_cache.setdefault(path, (UP/path).read_bytes())
        require(sha(raw) == r['sha256'] and len(raw) == r['bytes'], 'Source identity '+path)
        require(hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest() == r['git_blob'] == tree[path], 'Git identity '+path)
        normalized = {k:r[k] for k in ['path','git_blob','sha256','bytes']}
        require(path not in sources or sources[path] == normalized, 'Conflicting source identity')
        sources[path] = normalized
    checked = {}; span_count = 0
    def attest(v):
        nonlocal span_count
        if isinstance(v, list):
            for item in v: attest(item)
        elif isinstance(v, dict):
            if all(k in v for k in ['path','start_byte','sha256']) and ('end_byte' in v or 'end_byte_exclusive' in v):
                path = v['path']; start=v['start_byte']; end=v.get('end_byte_exclusive',v.get('end_byte'))
                require(path in data_cache, 'Span not in sources '+path)
                raw=data_cache[path]; require(0 <= start <= end <= len(raw), 'Span bounds')
                key=(path,start,end)
                digest=checked.setdefault(key,sha(raw[start:end]))
                require(v['sha256'] == digest, 'Span hash')
                if 'text' in v: require(v['text'].encode() == raw[start:end], 'Span text')
                if 'file_sha256' in v: require(v['file_sha256'] == sources[path]['sha256'], 'Span file hash')
                span_count += 1
            for item in v.values(): attest(item)
    for inv in lanes.values(): attest(inv)
    source_context = []
    for path in sorted(sources):
        row=scope_by_path.get(path)
        source_context.append({'path': path, 'scope_join_id': 'scope:'+path,
            'classification': row['classification'] if row else 'PACKAGE_TARGET_OR_EXTERNAL_SOURCE_CONTEXT_OPEN',
            'module_roles': row['declaration_path_roles'] if row else [],
            'inbound_module_edge_indexes': row['inbound_module_edge_indexes'] if row else [],
            'runtime_reachability': 'OPEN_NO_RUST_COMPILATION_OR_CFG_EVALUATION'})
    checkpoint_path=E/'checkpoint-cli-parser-manifest.json'
    checkpoint=read(checkpoint_path)
    protected={r['path']:r for r in checkpoint['files']}
    require(len(protected)==checkpoint['file_count']==423,'Previous program checkpoint census')
    preserved=[]
    for name in PREVIOUS:
        directory=E/'g01'/name; mf=directory/'manifest.json'; m=read(mf)
        require(sha(mf.read_bytes())==protected[str(mf.relative_to(ROOT))]['sha256'],'Prior manifest changed')
        expected_paths=set()
        for r in m['files']:
            path=ROOT/r['path'] if r['path'].startswith('docs/') else directory/r['path']
            require(r['sha256']==protected[str(path.relative_to(ROOT))]['sha256'],'Prior protected input differs')
            require(path.is_file() and sha(path.read_bytes()) == r['sha256'] and path.stat().st_size == r['bytes'], 'Prior file changed '+str(path))
            expected_paths.add(path)
        require(expected_paths=={p for p in directory.rglob('*') if p.is_file() and p!=mf},'Prior package file set differs')
        preserved.append({'package': name, 'manifest_sha256': sha(mf.read_bytes()), 'files': len(m['files'])})
    expected_u01={r['id'] for r in reqs.values() if r['owner']=='DX100-U01'}
    require({r['id'] for r in views['requirements']} == expected_u01 and len(expected_u01)==8, 'U01 ownership omitted')
    require(len(views['mandatory_readonly_sdk_gaps'])==6 and len(views['mandatory_readonly_external_runtime_limits'])==5, 'Inherited limits omitted')
    return {'kind':'T1_TUI_SOURCE_BINDING_JOIN_NOT_NATIVE_PARITY', 'pin':contract['pin'],
        'contract_sha256':sha((OUT/'contract.json').read_bytes()), 'lane_manifests':lane_manifests,
        'catalog':{'path':str(CATALOG.relative_to(ROOT)),'sha256':CAT_SHA,'functional':487,'controls':22,
                   'all509_status_and_CVG_NOT_RUN':True,'reference_observation_states':dict(reference_states),
                   'normative_catalog_mutated':False},
        'commands':command_rows, 'events':event_rows,
        'view_requirements':views['requirements'], 'view_families':views['source_families'],
        'view_open_named_anchors':[r for r in views['entry_surface_bindings'] if not r['source_refs']],
        'view_open_action_joins':views['unknowns'], 'dynamic_command_families':commands['dynamic_families'],
        'source_context':source_context, 'sources':[sources[p] for p in sorted(sources)],
        'previous_packages':preserved,
        'previous_checkpoint':{'path':str(checkpoint_path.relative_to(ROOT)),'sha256':sha(checkpoint_path.read_bytes()),'files':423},
        'mandatory_sdk_gaps':views['mandatory_readonly_sdk_gaps'],
        'mandatory_external_runtime_limits':views['mandatory_readonly_external_runtime_limits'],
        'mandatory_next_gates':['G01 variant registry consolidation','G02 authenticated executable and oracles','G03 accepted reuse','G04 concrete SPEC and applicable review before BUILD'],
        'counts':{'commands':len(command_rows),'events':len(event_rows),'view_requirements':len(expected_u01),
                  'view_families':len(views['source_families']),'git_sources':len(sources),
                  'span_occurrences':span_count,'unique_span_coordinates':len(checked),
                  'command_event_candidate_links':sum(len(r['literal_app_event_candidates']) for r in command_rows),
                  'events_with_command_literal_candidates':sum(bool(r['command_literal_candidates']) for r in event_rows),
                  'events_with_view_candidates':sum(bool(r['view_reference_ids']) for r in event_rows),
                  'events_effect_owner_OPEN':len(event_rows),
                  'future_source_variant_families_NOT_RUN':len(command_rows)+len(event_rows)+len(views['source_families']),
                  'previous_package_files_preserved':sum(r['files'] for r in preserved)},
        'limits':['Lexical name/arm/view linkage and source module routes are candidates, not causal delivery or compiled reachability.',
                  'Effect requirement links supplement UI entry obligations; domain ownership stays in the normative catalog. Event effect owner remains OPEN.',
                  'Static grammar, dynamic model tiers, macros, cfg, platform/terminal behavior, providers and all functional results remain OPEN/NOT_RUN.',
                  'No target execution, runtime implementation, functional receipt, full G01 closure, native parity, CVG bypass or release is granted.'],
        'functional_receipts':0,'full_g01_closure':False}


def main():
    fresh=build(); require(fresh==build(),'Join nondeterministic')
    negatives=[]
    for name,mutation in [
      ('omitted_command',lambda x:x['commands'].pop()),
      ('omitted_event',lambda x:x['events'].pop()),
      ('omitted_requirement',lambda x:x['view_requirements'].pop()),
      ('false_UI_owner',lambda x:x['commands'][0]['entry_requirement'].update(owner='DX100-W01')),
      ('lost_event_consumer',lambda x:x['events'][0]['central_dispatch_consumer_ids'].clear()),
      ('lost_module_context',lambda x:x['source_context'].pop()),
      ('lost_dynamic_tier',lambda x:x['dynamic_command_families'].pop(0)),
      ('lost_SDK_gap',lambda x:x['mandatory_sdk_gaps'].pop()),
      ('lost_external_limit',lambda x:x['mandatory_external_runtime_limits'].pop()),
      ('fake_qualification',lambda x:x.update(functional_receipts=1,full_g01_closure=True)),
    ]:
        bad=copy.deepcopy(fresh);mutation(bad)
        require(bad!=fresh,'Ineffective negative '+name)
        negatives.append({'id':name,'result':'REJECTED_BY_EXACT_REGENERATION'})
    report={'result':'PASS','kind':'T1_TUI_INTEGRATION_ONLY','counts':fresh['counts'],
            'negative_controls':negatives,'functional_receipts':0,'full_g01_closure':False}
    for name,value in [('integration.json',fresh),('verification.json',report)]:
        if '--check' in sys.argv: require((OUT/name).read_bytes()==encoded(value),'Join differs '+name)
        else: (OUT/name).write_bytes(encoded(value))
    print(json.dumps(report))


if __name__=='__main__': main()
