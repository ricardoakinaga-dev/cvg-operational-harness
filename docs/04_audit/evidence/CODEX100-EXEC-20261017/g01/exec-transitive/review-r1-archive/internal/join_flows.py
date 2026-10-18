"""Join the additive field/alias/codec graph to frozen operation source links."""
from pathlib import Path
import collections
import copy
import hashlib
import json
import sys

OUT = Path(__file__).resolve().parent
E = OUT.parents[2]
ROOT = next(p for p in OUT.parents if (p / 'docs/07_agents/AGENTS.md').exists())


def read(path):
    return json.loads(path.read_text())


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def require(ok, detail):
    if not ok: raise AssertionError(detail)


def encoded(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode()


def build():
    parent_path = E / 'g01/exec-server/types/inventory.json'
    flow_path = E / 'g01/exec-server/flows.json'
    links_path = E / 'g01/exec-server/type-links.json'
    inventory_path = OUT / 'inventory.json'
    parent, flows, links, added = map(read, [parent_path, flow_path, links_path, inventory_path])
    catalog_path = ROOT / 'docs/03_build/tracking/codex100_catalog_v1.json'
    catalog = {r['id']: r for r in read(catalog_path)['requirements']}
    all_types = {t['id']: t for t in parent['types'] + added['types']}
    require(len(all_types) == 168, 'Prior/new type collision or omission')
    original = {(r['original']['owner'], r['original']['symbol']): r['binding']
                for r in added['original_reference_bindings']}
    require(len(original) == 20, 'Historical owner/symbol collision')
    adjacency = collections.defaultdict(set); external = collections.defaultdict(set)
    unresolved = []
    for typ in all_types.values():
        fields = typ['fields'] + [f for v in typ['variants'] for f in v['fields']]
        for owner, refs in [(f['id'], f.get('type_references', [])) for f in fields] + [(typ['id'], typ.get('type_references', []))]:
            for ref in refs:
                if ref.get('resolution') == 'unresolved_import_or_transitive':
                    require((owner, ref['symbol']) in original, 'Unbound prior reference omitted')
                    ref = original[(owner, ref['symbol'])]
                if ref.get('target_id'):
                    require(ref['target_id'] in all_types, 'Unknown target')
                    adjacency[typ['id']].add(ref['target_id'])
                if ref.get('external_type'): external[typ['id']].add(ref['external_type'])
                if ref.get('status', '').startswith('OPEN'):
                    unresolved.append({'owner': owner, 'reference': ref})
    for row in added['codec_private_type_links']:
        if row.get('target_id'):
            require(row['target_id'] in all_types, 'Unknown private codec target')
            adjacency[row['owner']].add(row['target_id'])
    flow_by_id = {r['requirement']: r for r in flows['operations']}
    operations = []
    for op in links['operations']:
        flow = flow_by_id[op['requirement']]; req = catalog[op['requirement']]
        require(req['owner'] == flow['owner'] and op['method'] == flow['method'], 'Operation owner/method changed')
        roots = sorted({r['type_id'] for key in ['params', 'response', 'handler_domain_params']
                        for r in [op[key]] if r.get('type_id')})
        direct_external = sorted({r['rust_type'] for key in ['params', 'response', 'handler_domain_params']
                                  for r in [op[key]] if r.get('rust_type') in ['serde_json::Value']})
        visited = set(); pending = list(roots)
        while pending:
            current = pending.pop(0)
            require(current in all_types, 'Missing root/reachable type')
            if current in visited: continue
            visited.add(current); pending.extend(sorted(adjacency[current] - visited))
        boundaries = sorted(set(direct_external) | {r for tid in visited for r in external[tid]})
        original_reached = [r['original'] for r in added['original_reference_bindings'] if r['owner_type'] in visited]
        operations.append({'requirement': op['requirement'], 'owner': flow['owner'], 'method': op['method'],
                           'root_type_ids': roots, 'reachable_selected_type_ids': sorted(visited),
                           'new_transitive_type_ids': sorted(visited & {t['id'] for t in added['types']}),
                           'historical_owner_references_reached': original_reached,
                           'external_source_boundaries': boundaries, 'qualification': 'NOT_RUN',
                           'reachability': 'LEXICAL_FIELD_ALIAS_AND_SELECTED_PRIVATE_CODEC_GRAPH_ONLY'})
    require(len(operations) == 32, 'Operation census differs')
    dispositions = []
    for binding in added['original_reference_bindings']:
        owners = [op['requirement'] for op in operations if binding['owner_type'] in op['reachable_selected_type_ids']]
        dispositions.append({'original': binding['original'], 'binding': binding['binding'],
                             'payload_operation_requirements': owners,
                             'additional_scope': 'SHARED_JSONRPC_TRANSPORT' if '::rpc::' in binding['owner_type']
                             else 'PRESERVED_SOURCE_TYPE_OUTSIDE_OPERATION_PAYLOAD_REACHABILITY' if not owners else None,
                             'qualification': 'NOT_RUN'})
    return {'kind': 'T1_EXEC_FIELD_CODEC_OPERATION_SOURCE_JOIN',
            'inputs': [{'path': str(p.relative_to(E)), 'sha256': sha(p)} for p in [parent_path, flow_path, links_path, inventory_path]],
            'catalog_sha256': sha(catalog_path), 'operations': operations, 'historical_reference_dispositions': dispositions,
            'remaining_open_field_references': unresolved,
            'counts': {'operations': 32, 'prior_types': 137, 'new_types': 31, 'unique_selected_types': 168,
                       'historical_reference_dispositions': 20,
                       'operations_reaching_new_types': sum(bool(op['new_transitive_type_ids']) for op in operations),
                       'operations_with_external_boundary': sum(bool(op['external_source_boundaries']) for op in operations)},
            'limits': ['Operation payload closure is lexical; shared transport boundaries are classified separately.',
                       'A non-reached type or reference is retained with explicit disposition, never erased.',
                       'No runtime/handler/platform reachability or accepted JSON grammar is proven.',
                       'External source contracts still require parent integration and future functional oracle.'],
            'functional_receipts': 0, 'full_g01_closure': False}


fresh = build(); require(fresh == build(), 'Join nondeterministic')
negatives = []
for name, mutation in [
    ('lost_operation', lambda v: v['operations'].pop()),
    ('lost_unknown_disposition', lambda v: v['historical_reference_dispositions'].pop()),
    ('wrong_owner', lambda v: v['operations'][0].update(owner='DX100-Q05')),
    ('lost_private_codec_reachability', lambda v: next(o for o in v['operations'] if o['new_transitive_type_ids']).update(new_transitive_type_ids=[])),
    ('external_value_as_primitive', lambda v: next(o for o in v['operations'] if o['external_source_boundaries']).update(external_source_boundaries=[])),
    ('false_functional_receipt', lambda v: v.update(functional_receipts=1)),
]:
    bad = copy.deepcopy(fresh); mutation(bad)
    try: require(bad == fresh, 'Rejected mutated join')
    except AssertionError: negatives.append({'id': name, 'result': 'REJECTED'})
    else: raise AssertionError('Accepted known-bad join')
report = {'result': 'PASS', 'counts': fresh['counts'], 'negative_controls': negatives,
          'functional_receipts': 0, 'full_g01_closure': False}
for name, value in [('flow-links.json', fresh), ('flow-verification.json', report)]:
    if '--check' in sys.argv: require((OUT / name).read_bytes() == encoded(value), 'Join differs: ' + name)
    else: (OUT / name).write_bytes(encoded(value))
print(json.dumps(report))
