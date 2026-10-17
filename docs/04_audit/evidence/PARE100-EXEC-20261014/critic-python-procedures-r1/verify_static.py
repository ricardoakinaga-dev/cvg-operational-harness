"""Independent reviewer checks. Never imports/executes reference or CVG code.

Only stdlib AST, JSON, TOML, hashing and read-only Git blob access.
Synthetic models below are reviewer-authored interpretations, not runtime tests.
"""
import ast
import collections
import copy
import hashlib
import json
import pathlib
import re
import subprocess
import tomllib

OUT = pathlib.Path(__file__).resolve().parent
PACKET = OUT.with_name('critic-python-procedures-r1-packet')
INV = json.loads((PACKET / 'inventory.json').read_text())
PROC = json.loads((PACKET / 'procedures.json').read_text())
HASHES = json.loads((PACKET / 'source-hashes.json').read_text())
checks = []


def record(name, ok, detail):
    checks.append({'name': name, 'pass': bool(ok), 'detail': detail})


def digest(b):
    return hashlib.sha256(b).hexdigest()


source_bytes = {s['path']: pathlib.Path(s['path']).read_bytes() for s in HASHES['sources']}
record('current_citation_bases', all(digest(source_bytes[s['path']]) == s['citation_basis_sha256'] for s in HASHES['sources']), {'sources': len(source_bytes)})
sentinel = json.loads((PACKET / 'sentinel.json').read_text())
record('packet_sentinel', all(digest((PACKET / n).read_bytes()) == v['sha256'] and (PACKET / n).stat().st_size == v['bytes'] for n, v in sentinel['files'].items()), {'artifacts': len(sentinel['files'])})
for s in HASHES['sources']:
    if s['role'] == 'reference':
        blob = subprocess.run(['git', '-C', '/home/ricardo/deepseek-harness-session-fixes', 'cat-file', 'blob', s['pin'] + ':' + s['pin_path']], check=True, capture_output=True).stdout
        record('pinned_blob:' + s['pin_path'], digest(blob) == digest(source_bytes[s['path']]) == s['pin_sha256'], {'sha256': digest(blob), 'pin': s['pin']})
    if 'reconciliation' in s:
        snap = s['reconciliation']['snapshot_utf8'].encode('utf-8')
        record('backlog_post_snapshot', digest(snap) == s['post_sha256'] == s['citation_basis_sha256'], {'pre_historical': s['pre_sha256'], 'post_basis': s['post_sha256'], 'pre_is_not_required_as_current': True})

citations = []
def walk_json(v, trail):
    if isinstance(v, dict):
        if {'path', 'line_start', 'line_end', 'sha256'} <= v.keys():
            p = v['path']
            ok = p in source_bytes and digest(source_bytes[p]) == v['sha256'] and 1 <= v['line_start'] <= v['line_end'] <= len(source_bytes[p].decode().splitlines())
            citations.append({'location': trail, 'pass': ok, **v})
        for k, val in v.items():
            walk_json(val, trail + '/' + k)
    elif isinstance(v, list):
        for index, val in enumerate(v):
            walk_json(val, trail + '/' + str(index))
walk_json(INV, 'inventory')
walk_json(PROC, 'procedures')
record('all_source_citations', all(c['pass'] for c in citations), {'count': len(citations), 'failed': [c for c in citations if not c['pass']]})

expected = {}
definitions = {}
all_fields = []
trees = {}
def public_name(name):
    return not name.startswith('_') or name in {'__init__', '__enter__', '__exit__'}

def add(id_, node, public, kind):
    expected[id_] = {'line': node.lineno, 'end': node.end_lineno, 'public': public, 'kind': kind, 'node': node}

def defs(node, prefix):
    for child in ast.iter_child_nodes(node):
        if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            key = prefix + '.' + child.name
            definitions[key] = (child.lineno, child.end_lineno)
            defs(child, key)
        else:
            defs(child, prefix)

for module in INV['modules']:
    name = module['module']
    tree = ast.parse(source_bytes[module['source']['path']], filename=module['source']['path'])
    trees[name] = tree
    defs(tree, name)
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            key = name + '.' + node.name
            pub = public_name(node.name)
            add(key, node, pub, 'definition')
            if isinstance(node, ast.ClassDef):
                for member in node.body:
                    if isinstance(member, (ast.FunctionDef, ast.AsyncFunctionDef)):
                        add(key + '.' + member.name, member, pub and public_name(member.name), 'definition')
                        if member.name == '__init__':
                            for stmt in ast.walk(member):
                                targets = stmt.targets if isinstance(stmt, ast.Assign) else [stmt.target] if isinstance(stmt, ast.AnnAssign) else []
                                for target in targets:
                                    if isinstance(target, ast.Attribute) and isinstance(target.value, ast.Name) and target.value.id == 'self' and not target.attr.startswith('_'):
                                        add(key + '.' + target.attr, stmt, pub, 'instance_attribute')
                    elif isinstance(member, ast.AnnAssign) and isinstance(member.target, ast.Name):
                        add(key + '.' + member.target.id, member, pub and public_name(member.target.id), 'field')
                        all_fields.append(key + '.' + member.target.id)
        elif isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name) and ast.unparse(node.annotation) == 'TypeAlias':
            add(name + '.' + node.target.id, node, True, 'type_alias')
        elif isinstance(node, ast.Assign) and isinstance(node.value, ast.Call) and ast.unparse(node.value.func) == 'TypeVar':
            add(name + '.' + node.targets[0].id, node, False, 'typing_helper')

actual = {s['id']: s for s in INV['symbols']}
missing, extra = sorted(expected.keys() - actual.keys()), sorted(actual.keys() - expected.keys())
mismatched = []
for key in expected.keys() & actual.keys():
    e, a = expected[key], actual[key]
    if (e['line'], e['end'], e['public']) != (a['source']['line_start'], a['source']['line_end'], a['contract_public']):
        mismatched.append(key)
    node = e['node']
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and a.get('signature') != ast.unparse(node.args):
        mismatched.append(key + ':signature')
    if isinstance(node, ast.AnnAssign) and a.get('annotation') != ast.unparse(node.annotation):
        mismatched.append(key + ':annotation')
    if isinstance(node, ast.AnnAssign) and e['kind'] == 'field':
        if a.get('default') != (ast.unparse(node.value) if node.value is not None else None):
            mismatched.append(key + ':default')
    if isinstance(node, ast.ClassDef):
        if a.get('bases') != [ast.unparse(b) for b in node.bases] or a.get('decorators') != [ast.unparse(d) for d in node.decorator_list]:
            mismatched.append(key + ':class_metadata')
record('independent_AST_surface', not missing and not extra and not mismatched and len(actual) == len(INV['symbols']), {'expected_records': len(expected), 'public': sum(x['public'] for x in expected.values()), 'class_annotated_fields': len(all_fields), 'missing': missing, 'extra': extra, 'mismatched': mismatched})
ledger = {d['id']: (d['source']['line_start'], d['source']['line_end']) for m in INV['modules'] for d in m['definition_ledger']}
record('all_definitions_including_two_locals', definitions == ledger, {'AST_count': len(definitions), 'ledger_count': len(ledger), 'differences': sorted(definitions.keys() ^ ledger.keys())})
root = trees['deepseek_harness']
exports = next(ast.literal_eval(n.value) for n in root.body if isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id == '__all__' for t in n.targets))
bindings = {a.asname or a.name: 'deepseek_harness.' + n.module + '.' + a.name for n in root.body if isinstance(n, ast.ImportFrom) for a in n.names}
record('explicit_12_exports_resolve', len(exports) == 12 and exports == INV['modules'][0]['all'] and set(exports) == {e['name'] for e in INV['package_exports']} and all(e['target'] == bindings[e['name']] and e['target'] in actual and e['target_source'] == actual[e['target']]['source'] for e in INV['package_exports']), {'exports': exports})
record('incidental_imports_not_promoted', all(x['classification'] == ('declared_reexport' if m['module'] == 'deepseek_harness' and x['binding'] in exports else 'import_binding_not_declared_export') for m in INV['modules'] for x in m['imports']), 'Aliases declared in source remain public; ModelT/local/private declarations do not become exports.')

groups = {g['id']: g for g in PROC['groups']}
cases = {c['id']: c for g in groups.values() for c in g['cases']}
bad_links = []
for s in INV['symbols'] + INV['package_exports']:
    if s.get('contract_public', 'name' in s):
        g = groups.get(s['capability_group'])
        if not g or s['mapping']['status'] not in {'GAP', 'UNKNOWN'} or not s.get('procedure_ids') or any(p not in cases or p not in {c['id'] for c in g['cases']} for p in s['procedure_ids']):
            bad_links.append(s.get('id', s.get('name')))
for g in groups.values():
    if set(g['symbol_ids']) != {s['id'] for s in INV['symbols'] if s['contract_public'] and s['capability_group'] == g['id']}:
        bad_links.append(g['id'] + ':symbol_ids')
record('all_public_links_falsifiable_and_GAP', not bad_links, {'failures': bad_links, 'public_symbol_records': sum(s['contract_public'] for s in INV['symbols'])})
record('19_groups_20_NOT_RUN_cases', len(groups) == 19 and len(cases) == 20 and all(c['status'] == 'NOT_RUN' and c.get('input_synthetic') and c.get('procedure') and c.get('expected_observable') and c.get('negative_control') for c in cases.values()), {'groups': len(groups), 'cases': len(cases), 'behavior_procedures_executed': 0})
mutated = copy.deepcopy(INV)
mutated['symbols'] = [s for s in mutated['symbols'] if not s['id'].endswith('HarnessClient.respond_error')]
record('synthetic_deleted_public_detected', bool(expected.keys() - {s['id'] for s in mutated['symbols']}), 'In-memory removal of respond_error creates missing AST declaration.')
record('synthetic_deleted_export_detected', set(exports) != {e['name'] for e in INV['package_exports'][1:]}, 'In-memory removal of explicit __all__ export rejected.')
mutated = copy.deepcopy(INV)
next(s for s in mutated['symbols'] if s['id'].endswith('.ModelT'))['contract_public'] = True
record('synthetic_typing_promotion_detected', any(expected[s['id']]['public'] != s['contract_public'] for s in mutated['symbols']), 'In-memory promotion of ModelT rejected.')

backlog_source = next(s for s in HASHES['sources'] if '0378_' in s['path'])
backlog = source_bytes[backlog_source['path']].decode()
cards = {n: body for n, body in re.findall(r'(?m)^#{2,3} (P100-\d+) — [^\n]+\n(.*?)(?=^#{2,3} |\Z)', backlog, flags=re.S)}
edges = {n: re.findall(r'`(P100-\d+|AUD0611-G\d+)`', re.search(r'- Dependências: (.*)', body).group(1)) for n, body in cards.items() if re.search(r'- Dependências: (.*)', body)}
record('ownership_dependency_direction', edges['P100-025'] == PROC['ownership_graph']['declared_P100_025_prerequisites'] and all('P100-025' in edges[n] for n in PROC['ownership_graph']['outgoing_consumers_not_inverted']) and all(g['owner'] == 'P100-025' for g in groups.values()), {'025_prerequisites': edges['P100-025'], 'listed_outgoing_consumers': PROC['ownership_graph']['outgoing_consumers_not_inverted'], 'owner_proposed_in_0378': 'Integradores', 'outgoing_list_not_claimed_exhaustive': True})
manifest_source = next(s for s in HASHES['sources'] if s['path'].endswith('pyproject.toml'))
manifest = tomllib.loads(source_bytes[manifest_source['path']].decode())
record('distribution_manifest_only', manifest['project']['requires-python'] == '>=3.10' and manifest['project']['dependencies'] == ['pydantic>=2.12,<3', 'deepseek-harness-runtime-bin==0.0.0.dev0'] and manifest['build-system']['requires'] == ['hatchling==1.30.1'] and manifest['tool']['hatch']['build']['targets']['wheel']['packages'] == ['src/deepseek_harness'], {'wheel_runtime_closure': 'UNKNOWN', 'install_or_runtime_executed': False})

# Reviewer-authored mathematical routing model, based on client.py:492-536.
def descendant(parents, current, root):
    visited = set()
    while current not in visited:
        if current == root:
            return True
        visited.add(current)
        if current not in parents:
            return False
        current = parents[current]
    return False

def route(parents, frame, root):
    p, method = frame.get('params', {}), frame['method']
    if method == 'subagent.started':
        parent, child = p.get('parentSessionId'), p.get('childSessionId')
        if isinstance(parent, str) and parent and isinstance(child, str) and child and parent != child:
            parents[child] = parent
    if method in {'subagent.started', 'subagent.finished'}:
        parent = p.get('parentSessionId')
        return (isinstance(parent, str) and descendant(parents, parent, root)) or p.get('childSessionId') == root
    sid = p.get('sessionId')
    return isinstance(sid, str) and descendant(parents, sid, root)

tree = PROC['shared_vectors']['V-TREE']
parents = {}
indexes = [i for i, line in enumerate(tree['lines']) if route(parents, line, tree['root'])]
record('synthetic_V_TREE_arithmetic', indexes == tree['expected_delivered_indexes'], {'delivered_indexes': indexes, 'interpretation_only': True})
run = PROC['shared_vectors']['V-RUN']
parents, received, callbacks, events = {}, False, [], []
for frame in run['lines']:
    if not route(parents, frame, run['session_id']):
        continue
    p = frame['params']
    event = p.get('event', {})
    if not received:
        inserted = event.get('data', {}).get('inserted', [])
        received = frame['method'] == 'session.event' and p.get('sessionId') == run['session_id'] and event.get('type') == 'agent/inbox/spliced' and any(m.get('id') == run['prompt_response']['messageId'] for m in inserted)
        if not received:
            continue
    callbacks.append(frame)
    if frame['method'] == 'session.event' and p.get('sessionId') == run['session_id']:
        events.append(event)
    if frame['method'] == 'session.status' and p.get('sessionId') == run['session_id'] and p.get('status') == 'idle':
        break
record('synthetic_V_RUN_arithmetic', len(callbacks) == run['expected']['callback_notifications_after_receipt'] and len(events) == run['expected']['root_event_count'] and [e['type'] for e in events] == run['expected']['root_event_types'], {'callbacks': len(callbacks), 'root_events': len(events), 'root_event_types': [e['type'] for e in events], 'interpretation_only': True})

counterexamples = []
for params in [{'parentSessionId': 's'}, {'childSessionId': 's'}, {'parentSessionId': 's', 'childSessionId': 's'}, {}]:
    frame = {'method': 'subagent.started', 'params': params}
    ancestry = {}
    delivered = route(ancestry, frame, 's')
    counterexamples.append({'frame': frame, 'root': 's', 'ancestry_after': ancestry, 'delivery_by_static_interpretation': delivered})
client_tree = trees['deepseek_harness.client']
client_class = next(n for n in client_tree.body if isinstance(n, ast.ClassDef) and n.name == 'HarnessClient')
filter_method = next(n for n in client_class.body if isinstance(n, ast.FunctionDef) and n.name == '_notification_belongs_to_session_tree')
record('counterexample_AST_anchors', any(isinstance(n, ast.Return) and ast.unparse(n.value) == "payload.get('childSessionId') == session_id" for n in ast.walk(filter_method)) and any(isinstance(n, ast.Call) and ast.unparse(n) == 'self._session_is_descendant_of(parent_id, session_id)' for n in ast.walk(filter_method)), {'filter_source_lines': [filter_method.lineno, filter_method.end_lineno], 'child_presence_guard_on_parent_match': 'ABSENT_BY_MANUAL_AST_REVIEW', 'source_hash': next(m['source']['sha256'] for m in INV['modules'] if m['module'] == 'deepseek_harness.client')})
record('SESSION_TREE_missing_ids_oracle_fidelity', not any(c['delivery_by_static_interpretation'] for c in counterexamples[:2]), {'expected_text': groups['SESSION_TREE']['cases'][0]['expected_observable'][0], 'source': 'client.py:492-523', 'counterexamples': counterexamples, 'finding': 'F001: missing ancestry edge is rejected for graph recording, but lifecycle notification delivery can still match root.'})

summary = {'static_checks': len(checks), 'passed': sum(c['pass'] for c in checks), 'failed': [c['name'] for c in checks if not c['pass']], 'behavior_procedures_executed': 0, 'reference_or_CVG_code_imported_or_executed': False, 'checks': checks}
(OUT / 'static-checks.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n')
(OUT / 'citation-checks.json').write_text(json.dumps(citations, ensure_ascii=False, indent=2) + '\n')
(OUT / 'independent-surface.json').write_text(json.dumps({k: {a: b for a, b in v.items() if a != 'node'} for k, v in expected.items()}, ensure_ascii=False, indent=2) + '\n')
(OUT / 'session-tree-counterexamples.json').write_text(json.dumps({'evidence_kind': 'STATIC_INTERPRETATION_WITH_REVIEWER_SYNTHETIC_MODEL', 'no_runtime_claim': True, 'cases': counterexamples}, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({k: v for k, v in summary.items() if k != 'checks'}, ensure_ascii=False))
