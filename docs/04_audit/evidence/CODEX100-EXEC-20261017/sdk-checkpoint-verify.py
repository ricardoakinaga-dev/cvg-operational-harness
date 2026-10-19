#!/usr/bin/env python3
"""Independent bounded checkpoint checks; no target imports or runtime execution."""
from pathlib import Path
import argparse
import hashlib
import json
import re
import subprocess

E = Path(__file__).resolve().parent
ROOT = E.parents[3]
X = E/'g01/sdk-language-contracts'
UP = Path('/tmp/cvg-rea-codex-20261017/upstream')
sha = lambda b: hashlib.sha256(b).hexdigest()
load = lambda p: json.loads(p.read_text())
checks = []


def require(ok, why):
    if not ok:
        raise ValueError(why)


def check(name, f):
    details = f()
    checks.append({'name': name, 'result': 'PASS', 'details': details})


def exact(rows, base):
    paths = set()
    for row in rows:
        p = base/row['path']
        require(row['path'] not in paths and p.is_file() and not p.is_symlink(), 'missing/duplicate/alias '+str(p))
        paths.add(row['path']); b = p.read_bytes()
        require(sha(b) == row['sha256'] and len(b) == row['bytes'], 'bytes drift '+str(p))
    return len(paths)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--review', default='review-r1.raw.txt')
    ap.add_argument('--freeze', default='review-r1-inputs.json')
    args = ap.parse_args()
    frozen = load(X/args.freeze)
    check('reviewed_local_inputs', lambda: exact(frozen['files'],X))
    check('reviewed_root_inputs', lambda: exact(frozen['root_inputs'],ROOT))
    review = (X/args.review).read_text()
    check('bounded_independent_acceptance', lambda: require('ACCEPT_BOUNDED_SDK_SOURCE_CONTRACTS' in review, 'review not accepted'))
    contract = load(X/'contract.json')
    check('previous_program_checkpoint_identity', lambda: require(sha((E/contract['previous_program_checkpoint']['path']).read_bytes()) == contract['previous_program_checkpoint']['sha256'],'old551checkpoint changed'))

    def previous():
        total = 0
        for r in contract['source_packages']:
            p = E/r['manifest']; require(sha(p.read_bytes()) == r['sha256'],'old manifest changed')
            mf = load(p); require(len(mf['files']) == r['files'],'old count changed')
            expected = set()
            for row in mf['files']:
                f = ROOT/row['path'] if row['path'].startswith('docs/') else p.parent/row['path']
                exact([dict(row,path=str(f.relative_to(ROOT)))],ROOT); expected.add(f.resolve())
            actual = {f.resolve() for f in p.parent.rglob('*') if f.is_file() and f != p}
            require(expected == actual,'old package exact file set changed '+r['package'])
            total += len(expected)
        require(total == 460,'old payload count')
        return {'packages':10,'payloads':total,'root_manifests':10}
    check('previous_packages_exact_bytes_and_file_sets',previous)
    cat = load(ROOT/contract['catalog']['path'])

    def catalog():
        require(sha((ROOT/contract['catalog']['path']).read_bytes()) == contract['catalog']['sha256'],'catalog changed')
        require(len(cat['requirements']) == 509 and cat['functional_denominator'] == 487 and cat['mandatory_cvg_controls'] == 22,'denominator changed')
        require(all(r['status'] == r['cvg_validation'] == 'NOT_RUN' and r['receipt'] is None for r in cat['requirements']),'fake qualification')
        observed_only = {'NOT_RUN','SCHEMA_OBSERVED_ONLY','SOURCE_DECLARED','SOURCE_DECLARED; companion schema may corroborate surface only'}
        require(all(r['reference_validation'] == 'NOT_APPLICABLE_CVG_ORACLE' if r['kind'] == 'CVG_CONTROL' else r['reference_validation'] in observed_only for r in cat['requirements']),'reference qualification changed')
        return {'functional':487,'controls':22,'receipts':0}
    check('catalog_identity_and_all_unqualified',catalog)
    py,ts,ref,joined = [load(X/f) for f in ['python/inventory.json','typescript/inventory.json','reference/inventory.json','integration.json']]
    tree = {}
    for row in subprocess.check_output(['git','-C',str(UP),'ls-tree','-rz',contract['pin']]).split(b'\0'):
        if not row: continue
        head,name = row.split(b'\t',1);mode,kind,oid = head.decode().split();tree[name.decode()] = (mode,kind,oid)
    texts = {}

    def sources():
        rows = py['sources']+ts['sources']+ref['sources']; unique = {}
        for r in rows:
            b = (UP/r['path']).read_bytes();oid = hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()
            require(r['path'] in tree and tree[r['path']][0] in ['100644','100755'] and tree[r['path']][1] == 'blob' and tree[r['path']][2] == oid == r['git_blob'],'source Git identity')
            require(r['sha256'] == sha(b) and r['bytes'] == len(b),'source bytes changed')
            unique[r['path']] = oid; texts[r['path']] = b
        return {'unique_git_blobs':len(unique),'source_rows':len(rows)}
    check('all_language_reference_source_git_identities',sources)

    def spans():
        counts = {'python':0,'typescript':0}
        def visit(v, language):
            if isinstance(v,dict):
                start,end,line = ('byte_start','byte_end','line_start') if language == 'python' else ('start_byte','end_byte_exclusive','start_line')
                if all(k in v for k in ['path','sha256',start,end]):
                    b = texts.get(v['path'])
                    if b is None: b = (UP/v['path']).read_bytes();texts[v['path']] = b
                    a,z = v[start],v[end]
                    require(0 <= a <= z <= len(b) and sha(b[a:z]) == v['sha256'],'span digest/offset mismatch')
                    require(b[:a].count(b'\n')+1 == v[line],'span start line mismatch')
                    if 'text' in v: require(b[a:z].decode() == v['text'],'span text mismatch')
                    counts[language] += 1
                for value in v.values():visit(value,language)
            elif isinstance(v,list):
                for value in v:visit(value,language)
        visit(py,'python'); visit(ts,'typescript')
        require(all(counts.values()),'empty span validation')
        return counts
    check('independent_utf8_span_hash_line_validation',spans)

    def owners():
        expected = {r['id']:(r['owner'],sha(json.dumps(r,sort_keys=True,ensure_ascii=False).encode())) for r in cat['requirements']}
        require({r['id']:(r['owner'],r['record_sha256']) for r in joined['canonical_requirements']} == expected,'canonical owners changed')
        roots = joined['root_candidates']; require(len(roots) == len({r['id'] for r in roots}) == 71,'duplicate/root omission')
        require(sum(r['language'] == 'Python' for r in roots) == 37 and sum(r['language'] == 'TypeScript' for r in roots) == 34,'root language census')
        require(all(r['qualification'] == 'NOT_RUN' and r['receipt'] is None for r in roots),'root fake proof')
        return {'canonical':509,'root_candidates':71}
    check('canonical_owners_and_root_candidate_integrity',owners)
    check('six_sdk_gaps_preserved_open',lambda: require(len(joined['mandatory_sdk_gaps']) == 6 and all(r['status'] == 'OPEN' and r['qualification'] == 'NOT_RUN' and r['receipt'] is None for r in joined['mandatory_sdk_gaps']),'gap omission/false closure'))
    check('earlier_remaining_obligations_preserved',lambda: require(joined['previous_registry_remaining_gaps'] == load(E/'g01/variant-registry/integration.json')['remaining_gaps'],'registry obligations dropped'))
    check('source_only_no_native_or_gate_claim',lambda: require(all(v['functional_receipts'] == 0 for v in [py,ts,ref,joined]) and not joined['full_g01_closure'] and not joined['full_codex_parity_claim'] and not ref['build_authorization'] and not ts['analysis_tool']['emit'] and not ts['analysis_tool']['typecheck'],'false native/authority claim'))

    def native():
        for r in ref['cvg_sources']:
            b = (ROOT/r['path']).read_bytes();require(sha(b) == r['sha256'],'native source drift')
            for s in r['spans']:require(sha(b[s['start_byte']:s['end_byte_exclusive']]) == s['sha256'],'native anchor drift')
        require(ref['rust_toolchain']['channel'] == '1.95.0' and ref['reference_binding'] == 'OPEN_G02','reference state wrong')
        return {'CVG_sources':3,'G02':'OPEN','Rust':'1.95.0'}
    check('native_current_anchors_and_reference_not_executed',native)

    def recon():
        d = load(E/'next-g01-closure-recon.json')
        exact(d['inputs'],ROOT)
        seeds = d['acceptance_seeds'];require(len(seeds) == len({r['id'] for r in seeds}) == 179,'acceptance seeds lost')
        require(d['task'] == 'DX100-G01:CONCRETIZE-PUBLIC-VARIANT-ACCEPTANCE' and not d['build_authorization'],'next scope wrong')
        return {'specific_acceptance_seeds':179,'new_private_census':False}
    check('next_acceptance_recon_inputs_and_bounds',recon)
    state = load(E/'state.json')
    check('own_continuity_and_agents_closed',lambda: require(state['goal_status'] == 'active' and state['status'] == 'IN_PROGRESS' and state['no_progress_consecutive'] == 0 and state['sdk_language_contracts']['agents_closed'],'state/agent continuity'))
    result = {'kind':'BOUNDED_T1_SDK_SOURCE_CHECKPOINT_NOT_FUNCTIONAL_PARITY','checks':checks,'passed':len(checks),'failed':0,'functional_receipts':0,'goal_status':'active','full_g01_closure':False}
    (E/'sdk-final-verification.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps({'passed':len(checks),'failed':0,'functional_receipts':0}))


if __name__ == '__main__':
    main()
