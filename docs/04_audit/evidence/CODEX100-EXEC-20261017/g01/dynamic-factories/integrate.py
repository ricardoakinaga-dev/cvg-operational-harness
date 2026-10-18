"""Join factory source inventories to existing and additive obligations only."""
from pathlib import Path
import copy
import hashlib
import json
import sys

OUT = Path(__file__).resolve().parent
ROOT = next(p for p in OUT.parents if (p / 'docs/07_agents/AGENTS.md').exists())
CATALOG = ROOT / 'docs/03_build/tracking/codex100_catalog_v1.json'


def read(path):
    return json.loads(path.read_text())


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def require(ok, message):
    if not ok:
        raise AssertionError(message)


FAMILY_REQUIREMENTS = {
    'skills': ['CDX100-11-03', 'CDX100-11-07'],
    'agent-message-board': ['CDX100-14-03', 'CDX100-11-07'],
    'goal': ['CDX100-15-01', 'CDX100-15-02'],
    'guardian-conversation-history': ['CDX100-02-04', 'CDX100-11-07'],
    'history-notes': ['CDX100-02-04', 'CDX100-03-08'],
    'memories': ['CDX100-03-07', 'CDX100-03-08'],
    'file-copy': ['CDX100-05-02'],
    'image-generation': ['CDX100-19-03'],
    'web-search': ['CDX100-FACTORY-WEB-STANDALONE'],
}
PIPELINE_REQUIREMENTS = {
    'EXTENSION_EXECUTOR': ['CDX100-11-07', 'CDX100-11-08'],
    'MCP_EXTERNAL': ['CDX100-13-03', 'CDX100-13-08'],
    'DYNAMIC_CLIENT_RESPONSE': ['CDX100-11-08', 'CDX100-22-03'],
    'PROVIDER_HOSTED': ['CDX100-FACTORY-WEB-HOSTED'],
}


def build():
    contributors = read(OUT / 'contributors/inventory.json')
    pipelines = read(OUT / 'pipelines/inventory.json')
    catalog = read(CATALOG)
    requirements = {r['id']: r for r in catalog['requirements']}
    families = {r['family']: r for r in contributors['expanded_families']}
    require(set(families) == set(FAMILY_REQUIREMENTS), 'Known production contributor family not expanded')
    require(all(r['status'] == 'SOURCE_EXPANDED' for r in families.values()), 'Unexpanded production family remains')
    tools = contributors['tools']; ids = [r['id'] for r in tools]
    require(len(ids) == len(set(ids)) == 32, 'Missing/duplicate known source tool')
    require({r['family'] for r in tools} == set(families), 'Tool family mismatch')
    require(set(pipelines['factory_families']) == set(PIPELINE_REQUIREMENTS), 'Factory family mismatch')
    web = next(r for r in tools if r['family'] == 'web-search')
    expected_fields = {'search_query', 'image_query', 'open', 'click', 'find', 'screenshot',
                       'finance', 'weather', 'sports', 'time', 'response_length'}
    require({r['name'] for r in web['input']['fields']} == expected_fields, 'A web/run command group disappeared')
    require(catalog['functional_denominator'] == 487 and len(requirements) == 509,
            'Current catalog denominator mismatch')
    parent = read(OUT / 'catalog-before-factory-expansion.json')
    require(all(requirements.get(r['id']) == r for r in parent['requirements']), 'Prior507normative record changed')
    require(contributors['qualification']['functional_receipts'] == 0 and
            not contributors['qualification']['runtime_catalog_closed'] and
            not contributors['qualification']['cvg_grant'], 'Contributor interface/grant falsely closed')
    require(pipelines['functional_receipts'] == 0 and not pipelines['full_g01_closure'], 'Pipeline falsely qualified')

    def links(reqs):
        return [{'id': rid, 'owner': requirements[rid]['owner']} for rid in reqs]

    joined_tools = [{'tool_id': r['id'], 'family': r['family'],
                     'requirements': links(FAMILY_REQUIREMENTS[r['family']]),
                     'source_package': 'contributors/inventory.json', 'qualification': 'NOT_RUN'} for r in tools]
    joined_pipelines = [{'factory': name, 'requirements': links(reqs),
                         'source_package': 'pipelines/inventory.json', 'qualification': 'NOT_RUN'}
                        for name, reqs in PIPELINE_REQUIREMENTS.items()]
    return {'task': 'DX100-G01:RESOLVE-DYNAMIC-TOOL-FACTORIES', 'kind': 'T1_SOURCE_REQUIREMENT_JOIN_NOT_IMPLEMENTATION',
            'inputs': [{'path': path, 'sha256': sha(OUT / path)} for path in
                       ['contract.json', 'contributors-contract.json', 'contributors-expansion-contract.json',
                        'contributors/inventory.json', 'contributors/manifest.json',
                        'pipelines/inventory.json', 'pipelines/manifest.json', 'catalog-delta.json']],
            'catalog_sha256': sha(CATALOG), 'tool_links': joined_tools, 'pipeline_links': joined_pipelines,
            'web_command_fields': sorted(expected_fields),
            'external_interface': 'OPEN_ARBITRARY_CONTRIBUTORS_AND_RUNTIME_PROVIDER_SCHEMAS',
            'functional_receipts': 0, 'native_runtime_implemented_by_this_unit': False,
            'full_g01_closure': False,
            'remaining': ['Native implementation, source-bound reference executable and variant runtime/platform/effect qualification.',
                          'Full162Cargo and other package/component closure, scalar/cfg/TUI and20exec-server references.',
                          'G02/G03/G04, approval/equivalence decisions and all product-independent CVG controls.']}


fresh = build()


def validate(value):
    require(value == fresh, 'Join differs from frozen source/current catalog obligations')


negative = []
for name, mutate in [
    ('missing_source_tool', lambda v: v['tool_links'].pop()),
    ('wrong_capability_owner', lambda v: v['pipeline_links'][-1]['requirements'][0].update(owner='DX100-T01')),
    ('missing_hosted_web', lambda v: v['pipeline_links'].pop()),
    ('missing_web_command_group', lambda v: v['web_command_fields'].remove('weather')),
    ('hidden_external_interface', lambda v: v.update(external_interface='CLOSED')),
    ('source_manifest_changed', lambda v: v['inputs'][4].update(sha256='0' * 64)),
    ('false_native_implementation', lambda v: v.update(native_runtime_implemented_by_this_unit=True)),
    ('false_functional_receipt', lambda v: v.update(functional_receipts=1)),
]:
    bad = copy.deepcopy(fresh); mutate(bad)
    try:
        validate(bad)
    except AssertionError:
        negative.append({'name': name, 'result': 'REJECTED'})
    else:
        raise AssertionError('Bad factory join accepted: ' + name)

report = {'kind': 'T1_FACTORY_INTEGRATION_ONLY', 'result': 'PASS', 'production_contributor_families': 9,
          'source_tools': 32, 'pipeline_families': 4, 'web_command_groups': 10, 'web_response_options': 1,
          'catalog_functional': 487, 'cvg_controls': 22, 'negative_controls': negative,
          'functional_receipts': 0, 'full_g01_closure': False}
for name, value in [('integration.json', fresh), ('integration-verification.json', report)]:
    data = (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode()
    if '--check' in sys.argv:
        require((OUT / name).read_bytes() == data, 'Published integration changed: ' + name)
    else:
        (OUT / name).write_bytes(data)
print(json.dumps(report))
