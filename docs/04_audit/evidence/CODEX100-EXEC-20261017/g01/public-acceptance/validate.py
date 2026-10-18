#!/usr/bin/env python3
"""Validate documentary acceptance contracts, never execute target or fixtures."""
from pathlib import Path
import argparse
import copy
import hashlib
import json
import subprocess

HERE = Path(__file__).resolve().parent
E = HERE.parents[1]
ROOT = HERE.parents[5]
UP = Path('/tmp/cvg-rea-codex-20261017/upstream')
sha = lambda b: hashlib.sha256(b).hexdigest()


def need(ok, why):
    if not ok:
        raise ValueError(why)


def load(p):
    def pairs(items):
        d = {}
        for k, v in items:
            need(k not in d, 'duplicate key '+k);d[k] = v
        return d
    return json.loads(p.read_text(),object_pairs_hook=pairs)


def validate(d, lane, contract, source_check=True):
    need(set(d) == {'schema_version','task','lane','pin','contract_sha256','requirements','status','limits'},'root schema')
    need(d['schema_version'] == 'cvg.codex100.public-acceptance.v1' and d['task'] == contract['task'] and d['lane'] == lane and d['pin'] == contract['pin'],'schema/task/lane/pin')
    need(d['contract_sha256'] == sha((HERE/'contract.json').read_bytes()),'contract drift')
    need(d['status'] == 'PROPOSED_ACCEPTANCE_NOT_RUN' and len(d['limits']) >= 3,'source-only limits')
    cat = load(ROOT/contract['catalog']['path']);need(sha((ROOT/contract['catalog']['path']).read_bytes()) == contract['catalog']['sha256'],'catalog drift')
    seeds = load(E/'next-g01-closure-recon.json')['acceptance_seeds']
    wanted = {r['id']:r for r in seeds if r['family'] in contract['lanes'][lane]['families']}
    records = {r['id']:r for r in cat['requirements']}
    need(len(d['requirements']) == len(wanted) and {r['id'] for r in d['requirements']} == set(wanted),'requirement omission/duplicate')
    source_cache = {}; all_ids = set(); counts = {'requirements':len(wanted),'variants':0,'source_evidence_occurrences':0,'unknown_axis_dispositions':0}
    tree = {}
    if source_check:
        need(subprocess.check_output(['git','-C',str(UP),'rev-parse','HEAD']).decode().strip() == contract['pin'],'wrong pin')
        need(not subprocess.check_output(['git','-C',str(UP),'status','--porcelain']),'dirty upstream')
        for raw in subprocess.check_output(['git','-C',str(UP),'ls-tree','-rz',contract['pin']]).split(b'\0'):
            if raw:
                head,name = raw.split(b'\t',1);tree[name.decode()] = head.decode().split()
    for r in d['requirements']:
        seed = wanted[r['id']]; original = records[r['id']]
        need((r['family'],r['owner'],r['title']) == (seed['family'],seed['owner'],seed['title']),'owner/title/family transfer')
        need(r['existing_record_sha256'] == sha(json.dumps(original,sort_keys=True,ensure_ascii=False).encode()),'original requirement changed')
        variants = r['variants']; need(len(variants) >= 2,'baseline and edge/known-bad required')
        ids = {v['id'] for v in variants};need(len(ids) == len(variants),'duplicate variant')
        need(any(v['kind'] == 'POSITIVE' for v in variants) and any(v['kind'] != 'POSITIVE' for v in variants),'baseline/edge kinds')
        for v in variants:
            need(v['id'].startswith(r['id']+':') and v['id'] not in all_ids,'variant identity');all_ids.add(v['id'])
            need(v['runtime_status'] == 'NOT_RUN' and v['receipt'] is None,'fake runtime receipt')
            need(v['kind'] in ['POSITIVE','NEGATIVE','STATE','CANCEL','PLATFORM','GOVERNED_DECISION'],'unknown kind')
            need(v['driver']['selector_status'] in ['SOURCE_BOUND_SELECTOR','PROPOSED_DRIVER_ACTION'],'selector proof')
            need(v['driver']['access'] in ['LOCAL_REFERENCE','PLATFORM_RUNNER','EXTERNAL_ENTITLEMENT','GOVERNANCE_SPEC'],'access classification')
            need(v['driver']['dialect'] and v['driver']['operation'] and isinstance(v['fixture'],dict) and v['stimulus'],'concrete driver/fixture/stimulus')
            need(len(json.dumps(v['fixture'])+json.dumps(v['stimulus'])) >= 60,'empty fixture')
            ref = v['reference_expectation'];need(ref['basis'] in ['SOURCE_EXPECTED_NOT_OBSERVED','PROPOSED_ORACLE_PENDING_REFERENCE'],'expected is not observation')
            assertions = ref['assertions'];need(assertions,'missing observable expectation')
            aids = {a['id'] for a in assertions};need(len(aids) == len(assertions),'duplicate assertion')
            for a in assertions:need(a['observation'] and a['predicate'] and 'expected' in a,'empty assertion')
            need(v['known_bad']['mutation'] and v['known_bad']['rejected_by'] and set(v['known_bad']['rejected_by']) <= aids,'unfalsifiable/dangling known-bad')
            cvg = v['cvg_expectation'];need(cvg['native_engine'] is True and cvg['governed_difference'] in ['NONE_PROPOSED','PENDING_T3','PENDING_T4'],'native/authority ambiguity')
            need(v['source_evidence'] and isinstance(v['unknowns'],list),'missing source/unknowns')
            direct = False
            for s in v['source_evidence']:
                need(s['support'] in ['DIRECT_SOURCE_RULE','CONTEXT_ONLY'] and s['claim'],'source claim classification')
                direct |= s['support'] == 'DIRECT_SOURCE_RULE'
                if source_check:
                    name = s['path'];need(name in tree and tree[name][0] in ['100644','100755'] and tree[name][1] == 'blob','untracked/alias source')
                    if name not in source_cache:
                        b = (UP/name).read_bytes();oid = hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest();need(oid == tree[name][2],'Git blob changed');source_cache[name] = b
                    b = source_cache[name];a,z = s['start_byte'],s['end_byte_exclusive']
                    need(s['git_blob'] == tree[name][2] and s['file_sha256'] == sha(b),'source identity')
                    need(0 <= a < z <= len(b) and z-a <= 4096 and sha(b[a:z]) == s['sha256'] and b[a:z].decode() == s['text'],'source span')
                counts['source_evidence_occurrences'] += 1
            need(direct if ref['basis'] == 'SOURCE_EXPECTED_NOT_OBSERVED' else bool(v['unknowns']),'unsupported source expected/unnamed unknown')
            oracle = v['oracle'];need(oracle['reference_binding'] == 'OPEN_G02' and oracle['real_reference_required'] is True and oracle['provider_mock_role'] == 'INPUTS_AND_FAULTS_ONLY' and oracle['comparison'],'fabricated oracle')
            counts['variants'] += 1
        axes = seed['source_rule']['proposed_oracle_axes'];dispositions = r['axis_disposition']
        need(len(dispositions) == len(axes) and {a['axis'] for a in dispositions} == set(axes),'axis omission')
        for a in dispositions:
            need(bool(a['variant_ids']) != bool(a['unknown']),'axis needs coverage or named unknown')
            need(set(a['variant_ids']) <= ids,'unknown variant in axis')
            if a['unknown']:
                need(a['unknown']['owner'] and a['unknown']['required_evidence'] and a['unknown']['gate'],'unnamed boundary')
                counts['unknown_axis_dispositions'] += 1
    return counts


def controls(d,lane,c):
    tests = []
    for key,mutate in [
        ('omit_requirement',lambda v:v['requirements'].pop()),
        ('owner_transfer',lambda v:v['requirements'][0].update(owner='DX100-OTHER')),
        ('fake_receipt',lambda v:v['requirements'][0]['variants'][0].update(receipt={'fake':True})),
        ('runtime_pass',lambda v:v['requirements'][0]['variants'][0].update(runtime_status='PASS')),
        ('omit_expectation',lambda v:v['requirements'][0]['variants'][0]['reference_expectation'].update(assertions=[])),
        ('fake_reference_observation',lambda v:v['requirements'][0]['variants'][0]['reference_expectation'].update(basis='OBSERVED_PASS')),
        ('fake_oracle',lambda v:v['requirements'][0]['variants'][0]['oracle'].update(real_reference_required=False)),
        ('missing_native_engine',lambda v:v['requirements'][0]['variants'][0]['cvg_expectation'].update(native_engine=False)),
        ('uncovered_axis',lambda v:v['requirements'][0]['axis_disposition'].pop()),
        ('dangling_known_bad',lambda v:v['requirements'][0]['variants'][0]['known_bad'].update(rejected_by=['missing'])),
        ('drop_source',lambda v:v['requirements'][0]['variants'][0].update(source_evidence=[])),
    ]:
        bad = copy.deepcopy(d);mutate(bad)
        try:validate(bad,lane,c,False)
        except ValueError:tests.append({'id':key,'result':'REJECTED_BY_STRUCTURAL_SEMANTIC_INVARIANT'});continue
        raise ValueError('negative accepted '+key)
    return tests


def main():
    ap = argparse.ArgumentParser();ap.add_argument('--lane',required=True,choices=['core','interfaces','operations'])
    group = ap.add_mutually_exclusive_group(required=True)
    for n in ['check','self-test','seal']:group.add_argument('--'+n,action='store_true')
    args = ap.parse_args();c = load(HERE/'contract.json');lane = HERE/args.lane;d = load(lane/'cases.json')
    counts = validate(d,args.lane,c)
    if args.self_test:print(json.dumps({'controls':controls(d,args.lane,c),'scope':'DOCUMENT_VALIDATOR_NOT_RUNTIME','functional_receipts':0}));return
    names = {'cases.json','README.md','commands.json'}
    if args.seal:
        need({p.name for p in lane.iterdir() if p.is_file()}-{'manifest.json'} == names,'lane file set')
        rows = []
        for name in sorted(names):
            p = lane/name;need(not p.is_symlink(),'alias payload');b = p.read_bytes();rows.append({'path':name,'sha256':sha(b),'bytes':len(b)})
        (lane/'manifest.json').write_text(json.dumps({'lane':args.lane,'contract_sha256':sha((HERE/'contract.json').read_bytes()),'files':rows,'functional_receipts':0},indent=2)+'\n')
    elif (lane/'manifest.json').exists():
        mf = load(lane/'manifest.json');need({r['path'] for r in mf['files']} == names and len(mf['files']) == len(names),'manifest omitted/duplicate')
        need({p.name for p in lane.iterdir() if p.is_file()} == names|{'manifest.json'},'extra lane file')
        for r in mf['files']:
            p = lane/r['path'];need(not p.is_symlink() and p.stat().st_size == r['bytes'] and sha(p.read_bytes()) == r['sha256'],'lane manifest drift')
    print(json.dumps({'result':'PASS_T1_ACCEPTANCE_DOCUMENT','lane':args.lane,'counts':counts,'functional_receipts':0}))


if __name__ == '__main__':
    main()
