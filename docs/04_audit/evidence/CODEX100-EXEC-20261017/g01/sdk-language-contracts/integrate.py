#!/usr/bin/env python3
"""Additive T1 SDK joins, preserving previous packages and canonical ownership."""
from pathlib import Path
import copy
import hashlib
import json
import sys

HERE = Path(__file__).resolve().parent
E = HERE.parents[1]
ROOT = HERE.parents[5]
sha = lambda b: hashlib.sha256(b).hexdigest()


def require(ok, message):
    if not ok:
        raise ValueError(message)


def load(path):
    def pairs(items):
        result = {}
        for key, value in items:
            require(key not in result, 'duplicate JSON key: '+key)
            result[key] = value
        return result
    return json.loads(path.read_text(), object_pairs_hook=pairs)


def identity(path):
    b = path.read_bytes()
    return {'path': str(path.relative_to(ROOT)), 'sha256': sha(b), 'bytes': len(b)}


def build():
    contract = load(HERE/'contract.json')
    require(sha((HERE/'contract.json').read_bytes()) == '182723fb6159aad4c13d769c106d250ab8d7dec0f7edaadc861553a3757ff2a7', 'contract drift')
    cp = E/contract['previous_program_checkpoint']['path']
    require(sha(cp.read_bytes()) == contract['previous_program_checkpoint']['sha256'], 'checkpoint drift')
    catpath = ROOT/contract['catalog']['path']
    require(sha(catpath.read_bytes()) == contract['catalog']['sha256'], 'catalog drift')
    cat = load(catpath)
    require(len(cat['requirements']) == 509 and cat['numerator_pass_current'] == 0, 'catalog invariant')
    previous = []
    for package in contract['source_packages']:
        p = E/package['manifest']
        require(sha(p.read_bytes()) == package['sha256'], 'package manifest drift')
        mf = load(p)
        require(len(mf['files']) == package['files'], 'package file count drift')
        for row in mf['files']:
            f = ROOT/row['path'] if row['path'].startswith('docs/') else p.parent/row['path']
            require(f.is_file() and not f.is_symlink(), 'package missing/alias')
            require(f.stat().st_size == row['bytes'] and sha(f.read_bytes()) == row['sha256'], 'package payload drift: '+str(f))
        previous.append({'package': package['package'], 'files': package['files'], 'manifest_sha256': package['sha256']})
    py = load(HERE/'python/inventory.json')
    ts = load(HERE/'typescript/inventory.json')
    ref = load(HERE/'reference/inventory.json')
    require(py['functional_receipts'] == ts['functional_receipts'] == ref['functional_receipts'] == 0, 'fake receipt')
    require(len(py['root_exports']) == 37 and len(ts['root_exports']) == 34, 'SDK export omission')
    owners = {r['id']: r.get('owner') for r in cat['requirements']}
    registry = load(E/'g01/variant-registry/integration.json')
    baseline = load(E/'g01/component-surfaces/non-rust/inventory.json')
    require({r['id'] for r in py['open_gaps']} == {r['id'] for r in baseline['open_contracts']}, 'SDK gap omitted')
    roots = [{'id': 'PYROOT:'+r['name'], 'language': 'Python', 'binding': r,
              'owner': 'DX100-D01', 'owner_basis': 'PUBLIC_SDK_FAMILY_ONLY_NOT_PER_METHOD_SEMANTIC_ACCEPTANCE',
              'qualification': 'NOT_RUN', 'receipt': None} for r in py['root_exports']]
    roots += [{'id': 'TSROOT:'+r['name'], 'language': 'TypeScript', 'binding': r,
               'owner': r['owner'], 'owner_basis': 'PUBLIC_SDK_FAMILY_ONLY_NOT_PER_METHOD_SEMANTIC_ACCEPTANCE',
               'qualification': 'NOT_RUN', 'receipt': None} for r in ts['root_exports']]
    gaps = []
    for old in baseline['open_contracts']:
        gaps.append({'id': old['id'], 'historical_record': old, 'owner': old['proposed_owner'],
                     'source_progress': {'python': 'python/inventory.json', 'typescript': 'typescript/inventory.json',
                                         'reference': 'reference/inventory.json'},
                     'status': 'OPEN', 'qualification': 'NOT_RUN', 'receipt': None})
    for rule in ts['source_rules']:
        require(all(r in owners for r in rule['requirements']), 'unknown requirement in TS rules')
    return {'kind': 'T1_ADDITIVE_SDK_LANGUAGE_SOURCE_CONTRACTS_NOT_NATIVE_QUALIFICATION',
            'pin': contract['pin'], 'catalog_sha256': contract['catalog']['sha256'],
            'inputs': [identity(HERE/p) for p in ['python/manifest.json', 'python/inventory.json', 'typescript/reader.mjs',
                       'typescript/inventory.json', 'typescript/verification.json', 'reference/reader.py', 'reference/inventory.json']],
            'source_packages_preserved': previous, 'previous_registry_identity': identity(E/'g01/variant-registry/integration.json'),
            'canonical_requirements': [{'id': r['id'], 'owner': r.get('owner'), 'record_sha256': sha(json.dumps(r,sort_keys=True,ensure_ascii=False).encode())} for r in cat['requirements']],
            'root_candidates': roots, 'typescript_rule_candidates': ts['source_rules'],
            'python_join_indexes': {k: {'path': 'python/inventory.json', 'key': k, 'rows': len(py[k]),
                                     'acceptance': 'SOURCE_CANDIDATES_ONLY_NOT_OWNER_TRANSFER_OR_RUNTIME'}
                                    for k in ['owner_joins','lifecycle','rpc','rpc_method_parameters','notification_registry','packaging']},
            'mandatory_sdk_gaps': gaps, 'previous_registry_remaining_gaps': registry['remaining_gaps'],
            'reference_preparation': {'path': 'reference/README.md', 'reference_binding': ref['reference_binding'],
                                      'first_native_journey': ref['first_native_journey'], 'build_authorization': False},
            'counts': {'canonical_requirements': 509, 'functional': 487, 'cvg_controls': 22,
                       'preserved_package_payloads': sum(r['files'] for r in previous), 'preserved_package_manifests': len(previous),
                       'python': py['counts'], 'typescript': ts['counts'], 'root_candidates': len(roots), 'sdk_gaps_open': len(gaps)},
            'limits': ['No function denominator is inferred from declaration, field, callback, type, source-role or candidate counts.',
                       'Python source joins are candidates including lexical/scope support. No method semantics or canonical owner is inferred by same-file proximity.',
                       'Canonical owners and all previous source packages/registry remain immutable. New source candidates are additive indexes, not replacements.',
                       'Python Pydantic/generated dispatch, package/platform provenance and TS Node/process/JSONL outcomes remain OPEN.',
                       'Previous five external dependency limits and 291 TUI private-event/effect correlations remain open; their private ABI is context, public outcomes remain mandatory.',
                       'No full G01 closure, native runtime BUILD, source/binary binding, functional PASS or production release is claimed.'],
            'functional_receipts': 0, 'full_g01_closure': False, 'full_codex_parity_claim': False}


def main():
    value = build()
    require(value == build(), 'nondeterministic integration')
    negatives = []
    for key in ['root_candidates','mandatory_sdk_gaps','canonical_requirements','limits']:
        bad = copy.deepcopy(value); bad[key].pop()
        require(bad != value, 'ineffective negative')
        negatives.append({'id': 'omit_'+key, 'result': 'REJECTED_BY_EXACT_REGENERATION'})
    for key in ['functional_receipts','full_g01_closure','full_codex_parity_claim']:
        bad = copy.deepcopy(value); bad[key] = 1
        require(bad != value, 'ineffective negative')
        negatives.append({'id': 'fake_'+key, 'result': 'REJECTED_BY_EXACT_REGENERATION'})
    report = {'result': 'PASS_T1_SOURCE_INTEGRATION', 'counts': value['counts'],
              'negative_controls': negatives, 'negative_scope': 'EXACT_REGENERATION_INEQUALITY_NOT_INDEPENDENT_SEMANTIC_TESTS',
              'functional_receipts': 0}
    for name, data in [('integration.json',value),('verification.json',report)]:
        b = (json.dumps(data,ensure_ascii=False,indent=2)+'\n').encode()
        if '--check' in sys.argv:
            require((HERE/name).read_bytes() == b, 'integration regeneration drift: '+name)
        else:
            (HERE/name).write_bytes(b)
    print(json.dumps({'result': report['result'], 'roots': len(value['root_candidates']), 'functional_receipts': 0}))


if __name__ == '__main__':
    main()
