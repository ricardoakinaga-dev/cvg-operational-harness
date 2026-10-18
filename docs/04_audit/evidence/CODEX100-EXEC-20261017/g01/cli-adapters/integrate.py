"""Join static CLI surfaces to existing obligations; no runtime qualification."""
from pathlib import Path
import copy
import hashlib
import json
import sys

OUT = Path(__file__).resolve().parent
ROOT = next(p for p in OUT.parents if (p / 'docs/07_agents/AGENTS.md').exists())
CATALOG = ROOT / 'docs/03_build/tracking/codex100_catalog_v1.json'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read(path):
    return json.loads(path.read_text())


def require(ok, message):
    if not ok:
        raise AssertionError(message)


schema = read(OUT / 'schema/inventory.json')
arg0 = read(OUT / 'arg0/inventory.json')
catalog = read(CATALOG)
requirements = {r['id']: r for r in catalog['requirements']}
cli = 'CDX100-10-01'
branch_obligations = {
    'arg0.linux-sandbox': [cli, 'CDX100-07-06'],
    'arg0.apply-patch-aliases': [cli, 'CDX100-05-03'],
    'argv1.windows-mxc': [cli, 'CDX100-07-08'],
    'argv1.exec-helper': [cli, 'CDX100-06-01'],
    'argv1.fs-helper': [cli, 'CDX100-05-01'],
    'argv1.windows-wrapper': [cli, 'CDX100-07-08'],
    'argv1.apply-patch-mode': [cli, 'CDX100-05-03'],
}
old_graph = read(ROOT / schema['previous_graph']['path'])
expected_adapters = {e['owner'] for e in old_graph['edges']
                     if e.get('relation') == 'dynamic-effective-clap-schema'}
require(expected_adapters == {r['owner'] for r in schema['adapters']}, 'Prior opaque adapter omitted')
require(set(branch_obligations) == {r['id'] for r in arg0['branches']}, 'Arg0 branch mapping differs')


def bind(surface, ids, source):
    return {'surface_id': surface, 'source_package': source,
            'requirements': [{'id': rid, 'owner': requirements[rid]['owner']} for rid in ids],
            'qualification': 'NOT_RUN', 'native_runtime_implemented_by_this_unit': False}


def build():
    rows = [bind('adapter:' + r['owner'], [cli], 'schema/inventory.json') for r in schema['adapters']]
    rows.append(bind('windows:sandbox-setup', [cli, 'CDX100-07-08'], 'schema/inventory.json'))
    rows.extend(bind(r['id'], branch_obligations[r['id']], 'arg0/inventory.json') for r in arg0['branches'])
    return {'kind': 'T1_SOURCE_TO_EXISTING_REQUIREMENT_JOIN', 'task': 'DX100-G01:RESOLVE-CLI-ADAPTERS',
            'inputs': [{'path': path, 'sha256': sha(OUT / path)} for path in
                       ['contract.json', 'arg0-contract.json', 'schema/inventory.json', 'schema/manifest.json',
                        'arg0/inventory.json', 'arg0/manifest.json']],
            'catalog_sha256': sha(CATALOG), 'surfaces': rows,
            'previous_manual_edges': sorted(expected_adapters),
            'previous_edges_disposition': 'SOURCE_BODIES_AND_MUTATIONS_RESOLVED; accepted-clap/runtime still NOT_RUN',
            'predispatch_linux_hook': {'source_package': 'arg0/inventory.json', 'requirements':
                                      ['CDX100-10-01', 'CDX100-06-01'], 'qualification': 'NOT_RUN'},
            'functional_receipts': 0, 'full_g01_closure': False,
            'remaining': ['Scalar parsers, cfg/platform evaluation and transitive effects are not accepted runtime proof.',
                          'External tool factories/component classification, 20 exec-server unknown type references.',
                          'G02 executable binding, G03 reuse, G04 concrete specification and applicable BUILD gates.']}


def validate(value):
    require(value == build(), 'Source join differs from required inputs, surfaces or disposition')
    ids = [r['surface_id'] for r in value['surfaces']]
    require(len(ids) == len(set(ids)) == 12, 'Missing/duplicate surface')
    require(all(not r['native_runtime_implemented_by_this_unit'] and r['qualification'] == 'NOT_RUN'
                for r in value['surfaces']), 'False runtime qualification')


joined = build(); validate(joined)
negative = []
for name, mutate in [
    ('missing_adapter', lambda v: v['surfaces'].pop(0)),
    ('missing_branch', lambda v: v['surfaces'].pop()),
    ('lost_branch_obligation', lambda v: v['surfaces'][-1]['requirements'].pop()),
    ('wrong_owner', lambda v: v['surfaces'][0]['requirements'][0].update(owner='DX100-X02')),
    ('hidden_predispatch_hook', lambda v: v.pop('predispatch_linux_hook')),
    ('false_effective_schema', lambda v: v.update(previous_edges_disposition='FULL_ACCEPTED_CLAP_SCHEMA')),
    ('false_implementation', lambda v: v['surfaces'][0].update(native_runtime_implemented_by_this_unit=True)),
    ('false_qualification', lambda v: v.update(functional_receipts=1)),
]:
    altered = copy.deepcopy(joined); mutate(altered)
    try:
        validate(altered)
    except AssertionError:
        negative.append({'name': name, 'result': 'REJECTED'})
    else:
        raise AssertionError('Bad join accepted: ' + name)

report = {'kind': 'BOUNDED_T1_STATIC_INTEGRATION_ONLY', 'result': 'PASS', 'surfaces': 12,
          'manual_adapters': 4, 'windows_grammars': 1, 'arg0_branches': 7,
          'catalog_requirements_used': len({r['id'] for s in joined['surfaces'] for r in s['requirements']}),
          'negative_controls': negative, 'functional_receipts': 0, 'full_g01_closure': False}
for name, value in [('integration.json', joined), ('integration-verification.json', report)]:
    data = (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode()
    if '--check' in sys.argv:
        require((OUT / name).read_bytes() == data, 'Published join differs: ' + name)
    else:
        (OUT / name).write_bytes(data)
print(json.dumps(report))
