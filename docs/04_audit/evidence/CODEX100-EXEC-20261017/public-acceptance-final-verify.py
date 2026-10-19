#!/usr/bin/env python3
"""Checkpoint verification of documentary cases; never run the proposed fixtures."""
from pathlib import Path
import argparse
import hashlib
import json
import subprocess

E = Path(__file__).resolve().parent
ROOT = E.parents[3]
S = E/'g01/public-acceptance'
UP = Path('/tmp/cvg-rea-codex-20261017/upstream')
sha = lambda b: hashlib.sha256(b).hexdigest()
load = lambda p: json.loads(p.read_text())
checks = []


def need(ok, why):
    if not ok:
        raise ValueError(why)


def check(name, action):
    detail = action();checks.append({'name':name,'result':'PASS','detail':detail})


def exact(rows, base):
    names = set()
    for r in rows:
        need(r['path'] not in names,'duplicate path');names.add(r['path'])
        p = base/r['path'];need(p.is_file() and not p.is_symlink(),'missing/alias file')
        b = p.read_bytes();need(len(b) == r['bytes'] and sha(b) == r['sha256'],'hash/size drift '+str(p))
    return len(names)


def main():
    ap = argparse.ArgumentParser();ap.add_argument('--freeze',default='review-r1-inputs.json');ap.add_argument('--review',default='review-r1.raw.txt');a = ap.parse_args()
    frozen = load(S/a.freeze);c = load(S/'contract.json');joined = load(S/'integration.json')
    check('reviewed_inputs_intact',lambda:{'local':exact(frozen['files'],S),'root':exact(frozen['root_inputs'],ROOT)})
    check('independent_bounded_acceptance',lambda:need('ACCEPT_BOUNDED_PUBLIC_ACCEPTANCE_PROPOSALS' in (S/a.review).read_text(),'review not accepted'))
    check('unit_contract_and_helper_authenticity',lambda:need(sha((S/'contract.json').read_bytes()) == '3bac853ce307043e087ec76f14f4b2e057010c9a6b4d1b65d750f47b4818d07a' and sha((S/'validate.py').read_bytes()) == 'a3638bd70a4a9a3c1cd428090a54b158358b6d77dc57943228569a2b2bd16377','contract/helper changed'))

    def previous():
        total = 0
        for pkg in c['source_packages']:
            p = E/pkg['manifest'];need(sha(p.read_bytes()) == pkg['sha256'],'old manifest changed');mf = load(p);need(len(mf['files']) == pkg['files'],'old file count')
            expected = set()
            for r in mf['files']:
                base = ROOT if r['path'].startswith('docs/') else p.parent
                exact([r],base);expected.add((base/r['path']).resolve())
            need(expected == {q.resolve() for q in p.parent.rglob('*') if q.is_file() and q != p},'old exact file set changed')
            total += len(expected)
        need(total == 488 and len(c['source_packages']) == 11,'old packet population')
        return {'payloads':total,'root_manifests':11}
    check('eleven_previous_packages_exact_sets_and_bytes',previous)
    check('previous585checkpoint',lambda:need(sha((E/c['previous_checkpoint']['path']).read_bytes()) == c['previous_checkpoint']['sha256'],'old checkpoint changed'))
    cat = load(ROOT/c['catalog']['path'])

    def canonical():
        need(sha((ROOT/c['catalog']['path']).read_bytes()) == c['catalog']['sha256'],'catalog changed')
        need(len(cat['requirements']) == 509 and cat['functional_denominator'] == 487 and cat['mandatory_cvg_controls'] == 22,'denominator changed')
        need(all(r['status'] == r['cvg_validation'] == 'NOT_RUN' and r['receipt'] is None for r in cat['requirements']),'false functional receipt')
        return {'functional':487,'CVG_controls':22,'functional_receipts':0}
    check('canonical_catalog_and_all_receipts_unqualified',canonical)
    packets = {lane:load(S/lane/'cases.json') for lane in c['lanes']}
    variants = [v for d in packets.values() for r in d['requirements'] for v in r['variants']]

    def lanes():
        for lane in c['lanes']:
            base = S/lane;mf = load(base/'manifest.json');need({r['path'] for r in mf['files']} == {'README.md','cases.json','commands.json'} and len(mf['files']) == 3,'lane manifest omission')
            exact(mf['files'],base);need({p.name for p in base.iterdir() if p.is_file()} == {'README.md','cases.json','commands.json','manifest.json'},'lane extra file')
        return {'lanes':3,'payloads':9,'root_manifests':3}
    check('three_lane_manifests_and_exact_sets',lanes)

    def ids():
        requirements = [r for d in packets.values() for r in d['requirements']]
        seeds = load(E/'next-g01-closure-recon.json')['acceptance_seeds'];old = {r['id']:r for r in cat['requirements']}
        need(len(requirements) == len({r['id'] for r in requirements}) == len(seeds) == 179,'requirement duplicate/omission')
        need({r['id'] for r in requirements} == {r['id'] for r in seeds},'seed set changed')
        need(len(variants) == len({v['id'] for v in variants}) == 360,'variant duplicate/omission')
        for r in requirements:
            o = old[r['id']];need((r['owner'],r['family'],r['title']) == (o['owner'],o['family'],o['title']),'owner/title changed')
            need(r['existing_record_sha256'] == sha(json.dumps(o,sort_keys=True,ensure_ascii=False).encode()),'canonical record digest changed')
        need(all(v['runtime_status'] == 'NOT_RUN' and v['receipt'] is None for v in variants),'case functional PASS fabricated')
        return {'requirements':179,'variants':360,'owners_preserved':179}
    check('exact_requirements_case_ids_and_canonical_owners',ids)

    def axes():
        seeds = {r['id']:r for r in load(E/'next-g01-closure-recon.json')['acceptance_seeds']};count = 0;unknown = 0
        for d in packets.values():
            for r in d['requirements']:
                wanted = seeds[r['id']]['source_rule']['proposed_oracle_axes'];got = r['axis_disposition'];need(len(got) == len(wanted) and {a['axis'] for a in got} == set(wanted),'axis lost')
                ids = {v['id'] for v in r['variants']}
                for a in got:
                    need(bool(a['variant_ids']) != bool(a['unknown']) and set(a['variant_ids']) <= ids,'axis ambiguous/dangling')
                    if a['unknown']:need(all(a['unknown'].get(k) for k in ['owner','required_evidence','gate']),'unnamed unknown');unknown += 1
                    count += 1
        need(count == 976 and unknown == 54,'axis count changed unexpectedly')
        return {'all':count,'linked_to_proposals':count-unknown,'named_uncovered':unknown}
    check('all_axes_disposed_without_qualification',axes)

    def falsification():
        n = 0
        for v in variants:
            asserts = v['reference_expectation']['assertions'];aids = {a['id'] for a in asserts}
            need(v['known_bad']['mutation'] and v['known_bad']['rejected_by'] and set(v['known_bad']['rejected_by']) <= aids,'unfalsifiable/dangling proposal')
            need(v['oracle']['real_reference_required'] and v['oracle']['reference_binding'] == 'OPEN_G02' and v['oracle']['provider_mock_role'] == 'INPUTS_AND_FAULTS_ONLY','fake reference oracle')
            need(v['cvg_expectation']['native_engine'] and v['cvg_expectation']['governed_difference'] in ['NONE_PROPOSED','PENDING_T3','PENDING_T4'],'native/gate claim')
            need(v['reference_expectation']['basis'] in ['SOURCE_EXPECTED_NOT_OBSERVED','PROPOSED_ORACLE_PENDING_REFERENCE'],'fake observed result');n += 1
        return {'unexecuted_falsification_contracts':n}
    check('known_bad_targets_and_real_oracle_native_boundaries',falsification)

    def source():
        tree = {}
        for raw in subprocess.check_output(['git','-C',str(UP),'ls-tree','-rz',c['pin']]).split(b'\0'):
            if raw:
                head,name = raw.split(b'\t',1);tree[name.decode()] = head.decode().split()
        cache = {};coordinates = set();n = 0
        for v in variants:
            for s in v['source_evidence']:
                path = s['path'];need(path in tree and tree[path][0] in ['100644','100755'] and tree[path][1] == 'blob','source alias/untracked')
                if path not in cache:
                    b = (UP/path).read_bytes();oid = hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest();need(oid == tree[path][2],'Git source changed');cache[path] = b
                b = cache[path];a,z = s['start_byte'],s['end_byte_exclusive'];need(s['git_blob'] == tree[path][2] and s['file_sha256'] == sha(b),'source identity changed')
                need(0 <= a < z <= len(b) and z-a <= 4096 and sha(b[a:z]) == s['sha256'] and b[a:z].decode() == s['text'],'source UTF8 span changed')
                need(s['support'] in ['DIRECT_SOURCE_RULE','CONTEXT_ONLY'],'source support ambiguity');coordinates.add((path,a,z));n += 1
        return {'Git_blobs':len(cache),'source_span_occurrences':n,'unique_coordinates':len(coordinates)}
    check('independent_all_Git_source_UTF8_spans',source)

    def historical_delivery():
        d = load(S/'interfaces-delivery-disposition.json');exact(d['original_delivery'],S)
        original = load(S/'interfaces-builder-delivery/manifest.json.raw.txt')
        for r in original['files']:
            p = S/'interfaces-builder-delivery'/(r['path']+'.raw.txt');need(sha(p.read_bytes()) == r['sha256'] and p.stat().st_size == r['bytes'],'original builder drift')
        r = next(r for r in packets['interfaces']['requirements'] if r['id'] == 'CDX100-10-01')
        resolution = r['source_boundaries']['count_reconciliation'];need(resolution['status'] == 'RESOLVED_LEAD_PROMPT_COUNT_ERROR','count correction lost')
        need(resolution['evidence']['combined_fields'] == 309 and resolution['evidence']['previous_package_files_preserved'] == 313,'field/payload confusion')
        return {'original_payloads':3,'original_manifest':1,'metadata_only_correction':True}
    check('original_builder_archive_and_count_label_resolution',historical_delivery)
    def r1_archive():
        mf = load(S/'review-r1-archive.json');original = load(S/'review-r1-inputs.json')
        need(len(mf['files']) == len(original['files']) == 25,'R1 archive size')
        by_path = {r['path']:r for r in original['files']}
        for r in mf['files']:
            old = by_path[r['original_path']];need((r['sha256'],r['bytes']) == (old['sha256'],old['bytes']),'R1 archive identity mismatch')
            exact([{'path':r['archive_path'],'sha256':r['sha256'],'bytes':r['bytes']}],S)
        return {'R1_original_inputs_preserved':25}
    check('review_R1_exact_archived_inputs',r1_archive)

    def focused_rework():
        old = load(S/'review-r1-inputs/interfaces/cases.json.raw.txt')
        current = packets['interfaces'];old_map = {r['id']:r for r in old['requirements']}
        for r in current['requirements']:
            if r['id'] != 'CDX100-13-04':need(r == old_map[r['id']],'unrelated requirement changed during MCP rework')
        r = next(r for r in current['requirements'] if r['id'] == 'CDX100-13-04')
        axes = {a['axis']:a for a in r['axis_disposition']};cases = {v['id']:v for v in r['variants']}
        need(axes['timeout']['variant_ids'] == ['CDX100-13-04:timeout'] and axes['tool error']['variant_ids'] == ['CDX100-13-04:tool-error'],'R1 false linkage persists')
        t = cases['CDX100-13-04:timeout']['fixture']['input_and_state'];e = cases['CDX100-13-04:tool-error']['fixture']['input_and_state']
        need(t['client_user_cancel'] is False and t['peer_terminal_response_delay_ms'] > t['tool_timeout_boundary_ms'],'timeout stimulus absent')
        need(e['client_user_cancel'] is False and e['deadline_expires'] is False and e['peer_result_semantic']['isError'] is True,'tool error stimulus absent')
        regression = load(S/'mcp-r2-regression.json');need(regression['positive'] == regression['actual_failed_R1_rejected'] == 1 and regression['additional_negative_mutants'] == 6,'rework regression incomplete')
        return {'unrelated_interface_requirements_unchanged':55,'independent_MCP_cases_added':2,'documentary_regression_positive':1,'R1_actual_rejected':1,'mutants_rejected':6}
    check('MCP_rework_is_focused_with_independent_stimuli',focused_rework)
    check('earlier_open_obligations_not_erased',lambda:need(joined['previous_registry_remaining_gaps'] == load(E/'g01/variant-registry/integration.json')['remaining_gaps'],'old gaps erased'))

    def native_recon():
        d = load(E/'next-native-contract-recon.json');exact(d['sources'],ROOT)
        for r in d['facts']:
            s = r['source'];b = (ROOT/s['path']).read_bytes();need(sha(b) == s['file_sha256'] and sha(b[s['start_byte']:s['end_byte_exclusive']]) == s['sha256'],'native source fact drift')
        need(d['native_build'] == 'NOT_STARTED' and d['functional_receipts'] == 0,'native authority invented')
        return {'CVG_sources':10,'source_facts':11,'first_native_BUILD':'NOT_STARTED'}
    check('native_recon_source_facts_not_runtime_proof',native_recon)
    state = load(E/'state.json')
    check('own_continuity_and_closed_agents',lambda:need(state['goal_status'] == 'active' and state['no_progress_consecutive'] == 0 and state['public_acceptance']['agents_closed'],'own continuity wrong'))
    check('no_full_scope_or_parity_claim',lambda:need(joined['functional_receipts'] == 0 and not joined['full_g01_closure'] and not joined['full_codex_parity_claim'],'false closure'))
    report = {'kind':'T1_PUBLIC_ACCEPTANCE_CHECKPOINT_NOT_EXECUTED_FUNCTIONAL_PROOF','checks':checks,'passed':len(checks),'failed':0,'functional_receipts':0,'full_g01_closure':False,'goal_status':'active'}
    (E/'public-acceptance-final-verification.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'passed':len(checks),'failed':0,'functional_receipts':0}))


if __name__ == '__main__':
    main()
