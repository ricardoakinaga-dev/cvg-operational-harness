#!/usr/bin/env python3
"""T1 acceptance index; source/fixture declarations are not runtime results."""
from pathlib import Path
import copy
import hashlib
import json
import sys

HERE = Path(__file__).resolve().parent
E = HERE.parents[1]
ROOT = HERE.parents[5]
sha = lambda b: hashlib.sha256(b).hexdigest()


def need(ok, why):
    if not ok:
        raise ValueError(why)


def load(p):
    return json.loads(p.read_text())


def identity(p, base=ROOT):
    b = p.read_bytes()
    return {'path':str(p.relative_to(base)),'sha256':sha(b),'bytes':len(b)}


def exact(row, root):
    p = root/row['path'];need(p.is_file() and not p.is_symlink(),'missing/alias '+str(p));b = p.read_bytes()
    need(sha(b) == row['sha256'] and len(b) == row['bytes'],'bytes changed '+str(p))


def build():
    c = load(HERE/'contract.json')
    need(sha((HERE/'contract.json').read_bytes()) == '3bac853ce307043e087ec76f14f4b2e057010c9a6b4d1b65d750f47b4818d07a','contract drift')
    for row in c['inputs']:exact(row,ROOT)
    need(sha((E/c['previous_checkpoint']['path']).read_bytes()) == c['previous_checkpoint']['sha256'],'old585checkpoint changed')
    old = []
    for pkg in c['source_packages']:
        mfpath = E/pkg['manifest'];need(sha(mfpath.read_bytes()) == pkg['sha256'],'old manifest changed')
        mf = load(mfpath);need(len(mf['files']) == pkg['files'],'old payload count')
        expected = set()
        for row in mf['files']:
            root = ROOT if row['path'].startswith('docs/') else mfpath.parent
            exact(row,root);expected.add((root/row['path']).resolve())
        actual = {p.resolve() for p in mfpath.parent.rglob('*') if p.is_file() and p != mfpath}
        need(actual == expected,'old exact file set changed')
        old.append({'package':pkg['package'],'manifest_sha256':pkg['sha256'],'payload_files':pkg['files']})
    exact(c['catalog'],ROOT) if 'bytes' in c['catalog'] else need(sha((ROOT/c['catalog']['path']).read_bytes()) == c['catalog']['sha256'],'catalog drift')
    catalog = load(ROOT/c['catalog']['path']);canonical = {r['id']:r for r in catalog['requirements']}
    seeds = load(E/'next-g01-closure-recon.json')['acceptance_seeds'];wanted = {r['id']:r for r in seeds}
    index = [];lanes = [];caseids = set();boundaries = [];count = 0;axes = 0;uncovered = 0
    for lane in c['lanes']:
        base = HERE/lane;mf = load(base/'manifest.json')
        need(mf['contract_sha256'] == sha((HERE/'contract.json').read_bytes()) and mf['lane'] == lane,'lane manifest contract')
        names = {r['path'] for r in mf['files']};need(names == {'cases.json','README.md','commands.json'} and len(mf['files']) == 3,'lane manifest set')
        need({p.name for p in base.iterdir() if p.is_file()} == names|{'manifest.json'},'extra lane files')
        for row in mf['files']:exact(row,base)
        d = load(base/'cases.json');need(d['status'] == 'PROPOSED_ACCEPTANCE_NOT_RUN','lane status')
        familyids = {r['id'] for r in seeds if r['family'] in c['lanes'][lane]['families']}
        need({r['id'] for r in d['requirements']} == familyids and len(d['requirements']) == len(familyids),'lane requirement set')
        n = 0;u = 0;a = 0
        for r in d['requirements']:
            original = canonical[r['id']];need(r['owner'] == original['owner'] and r['title'] == original['title'] and r['family'] == original['family'],'canonical ownership/title changed')
            need(r['existing_record_sha256'] == sha(json.dumps(original,sort_keys=True,ensure_ascii=False).encode()),'record identity changed')
            need(len(r['variants']) >= 2,'generic requirement not decomposed')
            for v in r['variants']:
                need(v['id'] not in caseids and v['runtime_status'] == 'NOT_RUN' and v['receipt'] is None,'duplicate/fake qualified case')
                caseids.add(v['id']);n += 1
            source_axes = wanted[r['id']]['source_rule']['proposed_oracle_axes']
            need(len(r['axis_disposition']) == len(source_axes) and {a['axis'] for a in r['axis_disposition']} == set(source_axes),'lost axis')
            for axis in r['axis_disposition']:
                a += 1
                if axis['unknown']:
                    u += 1;boundaries.append({'requirement':r['id'],'axis':axis['axis'],'unknown':axis['unknown'],'status':'OPEN','qualification':'NOT_RUN'})
            index.append({'id':r['id'],'family':r['family'],'owner':r['owner'],'lane':lane,'path':lane+'/cases.json','record_sha256':sha(json.dumps(r,sort_keys=True,ensure_ascii=False).encode()),'variant_ids':[v['id'] for v in r['variants']],'axes':len(source_axes),'named_uncovered_axes':sum(bool(a['unknown']) for a in r['axis_disposition']),'acceptance_status':'DOCUMENTARY_BASELINE_EDGE_WRITTEN_REFERENCE_AND_CVG_NOT_RUN','qualification':'NOT_RUN','receipt':None})
        lanes.append({'lane':lane,'manifest':identity(base/'manifest.json',HERE),'cases':identity(base/'cases.json',HERE),'requirements':len(d['requirements']),'variants':n,'axis_dispositions':a,'uncovered_named_axes':u})
        count += n;axes += a;uncovered += u
    need({r['id'] for r in index} == set(wanted) and len(index) == 179,'whole acceptance set missing')
    registry = load(E/'g01/variant-registry/integration.json')
    return {'kind':'T1_CONCRETE_PUBLIC_ACCEPTANCE_PROPOSALS_NOT_EXECUTED_PARITY','pin':c['pin'],'contract_sha256':sha((HERE/'contract.json').read_bytes()),'catalog_sha256':c['catalog']['sha256'],'previous_source_packages_preserved':old,'lanes':lanes,'requirements':sorted(index,key=lambda r:r['id']),'named_uncovered_axes':boundaries,'previous_registry_remaining_gaps':registry['remaining_gaps'],
            'counts':{'families':22,'catalog_functional':487,'CVG_controls':22,'requirements_decomposed':len(index),'proposed_variants':count,'axis_dispositions':axes,'uncovered_named_axes':uncovered,'previous_payloads_preserved':sum(r['payload_files'] for r in old),'previous_manifests_preserved':len(old),'functional_receipts':0},
            'next_execution_preparation':{'G02':'Prepare bounded reference execution/build/provenance task/SPEC and isolation proof; documentary recipe exists,source executable binding OPEN.','G03':'Accept reused kit/driver boundaries and own Codex evidence,do not copy Claude/PAR qualification.','G04':'Prepare concrete native stream/tool-loop/cancel/durable contract and explicit T3 review before public/schema/security BUILD.','G01':'Scope closure is a separate audit; candidate cases and all accounted axes do not prove zero unclassified public surfaces.'},
            'limits':['These cases are documentary fixtures/stimuli/comparison proposals, not executed or already executable drivers. G02 must map projections to actual public transcript/state/effects and authenticate reference captures.','Uncovered axes and per-case runtime/source/access unknowns stay open and owned; variant count is not coverage or a functional numerator.','Literal reference outcome and native CVG controls/governed differences are separate. No source feature, bypass or automatic reviewer grants CVG authority.','Source context,selector declaration and schema cannot replace direct behavior evidence. No target execution/import/build/install/network/provider/account/real effect occurred.','Preserve all49cards/22families/487+22/allNOT_RUN/nullreceipts,6SDKgaps/5externallimits/291TUIcorrelations. No fullG01/nativeparity/BUILD/release claim.'],
            'functional_receipts':0,'full_g01_closure':False,'full_codex_parity_claim':False}


def main():
    v = build();need(v == build(),'nondeterministic index');tests = []
    for key in ['requirements','lanes','named_uncovered_axes','previous_registry_remaining_gaps','limits']:
        bad = copy.deepcopy(v);need(bad[key],'empty negative fixture');bad[key].pop();need(bad != v,'ineffective mutation');tests.append({'id':'drop_'+key,'result':'REJECTED_BY_EXACT_REGENERATION_INEQUALITY'})
    for key in ['functional_receipts','full_g01_closure','full_codex_parity_claim']:
        bad = copy.deepcopy(v);bad[key] = 1;need(bad != v,'ineffective mutation');tests.append({'id':'fake_'+key,'result':'REJECTED_BY_EXACT_REGENERATION_INEQUALITY'})
    report = {'result':'PASS_T1_ACCEPTANCE_INDEX','counts':v['counts'],'controls':tests,'scope':'Index regeneration inequality; not8independentsemanticchecks or runtimeproof','functional_receipts':0}
    for name,data in [('integration.json',v),('verification.json',report)]:
        b = (json.dumps(data,ensure_ascii=False,indent=2)+'\n').encode()
        if '--check' in sys.argv:need((HERE/name).read_bytes() == b,'index drift '+name)
        else:(HERE/name).write_bytes(b)
    print(json.dumps({'result':report['result'],'counts':v['counts']}))


if __name__ == '__main__':
    main()
