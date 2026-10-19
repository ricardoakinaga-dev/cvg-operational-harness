"""Offline Cargo/component source census. Never execute Cargo or target code."""
from pathlib import Path, PurePosixPath
import ast
import collections
import copy
import hashlib
import json
import posixpath
import re
import subprocess
import sys
import tomllib

OUT = Path(__file__).resolve().parent
ROOT = next(p for p in OUT.parents if (p / 'docs/07_agents/AGENTS.md').exists())
UP = Path('/tmp/cvg-rea-codex-20261017/upstream')
PIN = '8d9f6466ff0294785d56f55b1fe363d132fe4133'
CONTRACT = OUT.parent / 'contract.json'
HELPER = OUT.parents[1] / 'entrypoints/tools/build_tool_graph.py'
CATALOG = ROOT / 'docs/03_build/tracking/codex100_catalog_v1.json'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def require(ok, message):
    if not ok:
        raise AssertionError(message)


def encoded(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode()


def read(path):
    return json.loads(path.read_text())


def git(*args):
    return subprocess.check_output(['git', '-C', str(UP), *args])


def joined(directory, path):
    return posixpath.normpath(posixpath.join(directory, path))


tree = {}
for record in git('ls-tree', '-r', '-z', PIN).split(b'\0'):
    if record:
        header, path = record.split(b'\t', 1); mode, kind, oid = header.decode().split()
        tree[path.decode()] = {'mode': mode, 'kind': kind, 'git_blob': oid}
require(git('rev-parse', 'HEAD').decode().strip() == PIN, 'Wrong source pin')
require(not git('status', '--porcelain').strip(), 'Source tree modified')
env = {'re': re}
nodes = [n for n in ast.parse(HELPER.read_text()).body
         if isinstance(n, ast.FunctionDef) and n.name in ['mask_rust', 'balanced']]
require(len(nodes) == 2, 'Reviewed lexer missing')
exec(compile(ast.Module(body=nodes, type_ignores=[]), '<reviewed-local-lexer>', 'exec'), env)
mask_rust, balanced = env['mask_rust'], env['balanced']


def build():
    sources = {}; bytes_cache = {}; public_cache = {}

    def load(path):
        require(path in tree and tree[path]['mode'] in ['100644', '100755'], 'Missing/nonregular source: ' + path)
        if path not in bytes_cache:
            data = (UP / path).read_bytes()
            # SHA-1 object identity is independently checked below; SHA-256 is artifact identity.
            actual_oid = hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()
            require(actual_oid == tree[path]['git_blob'], 'Working bytes differ from Git blob: ' + path)
            bytes_cache[path] = data
            sources[path] = {'path': path, 'bytes': len(data), 'sha256': sha(data),
                             'git_blob': tree[path]['git_blob'], 'git_mode': tree[path]['mode']}
        return bytes_cache[path]

    def ref(path, start=0, end=None):
        data = load(path); end = len(data) if end is None else end; chunk = data[start:end]
        return {'path': path, 'file_sha256': sha(data), 'start_byte': start, 'end_byte_exclusive': end,
                'start_line': data[:start].count(b'\n') + 1,
                'end_line': max(data[:start].count(b'\n') + 1,
                                data[:end].count(b'\n') + (not data[:end].endswith(b'\n'))),
                'sha256': sha(chunk), 'text': chunk.decode()}

    manifests = {p: tomllib.loads(load(p).decode()) for p in sorted(tree) if p.endswith('Cargo.toml')}
    require(len(manifests) == 164, 'Tracked Cargo manifest census changed')
    package_paths = [p for p, d in manifests.items() if 'package' in d]
    require(len(package_paths) == 163, 'Package census changed')
    workspaces = {p: d['workspace'] for p, d in manifests.items() if 'workspace' in d}
    classification = read(OUT / 'classification.json')['packages']
    require({d['package']['name'] for d in manifests.values() if 'package' in d} == set(classification),
            'Unclassified/extra package')
    catalog = read(CATALOG); requirements = catalog['requirements']
    tasks = set(re.findall(r'^### (DX100-[A-Z]\d\d)\s',
                           (ROOT / 'docs/03_build/0386_backlog_paridade_codex.md').read_text(), re.M))
    require(len(tasks) == 49, 'Task census changed')
    owner_families = collections.defaultdict(set)
    for requirement in requirements:
        if requirement['kind'] == 'FUNCTIONAL_PARITY':
            owner_families[requirement['owner']].add(requirement['family'])

    def workspace_for(path):
        directory = posixpath.dirname(path)
        candidates = [p for p in workspaces if directory == posixpath.dirname(p)
                      or directory.startswith(posixpath.dirname(p) + '/')]
        require(candidates, 'Package has no source workspace: ' + path)
        return max(candidates, key=lambda p: len(posixpath.dirname(p)))

    def inherited(value, ws, key, default=None):
        if isinstance(value, dict) and value.get('workspace'):
            return workspaces[ws].get('package', {}).get(key, default)
        return default if value is None else value

    def public_root(path):
        if path not in public_cache:
            text = load(path).decode(); mask = mask_rust(text); depths = []; depth = 0
            for char in mask:
                depths.append(depth)
                if char == '{': depth += 1
                elif char == '}': depth -= 1
            declarations = []
            for match in re.finditer(r'(?m)^\s*(pub(?:\([^\n)]*\))?\s+)([^\n]+)', mask):
                if depths[match.start()] != 0:
                    continue
                start = match.start(); end = mask.find('\n', match.end())
                end = len(mask) if end < 0 else end
                declarations.append({'visibility_spelling': match[1].strip(),
                                     'source': ref(path, len(text[:start].encode()), len(text[:end].encode()))})
            mains = []
            for match in re.finditer(r'\b(?:async\s+)?fn\s+main\s*\(', mask):
                if depths[match.start()] != 0: continue
                args_end = balanced(mask, match.end() - 1, '(', ')'); brace = mask.find('{', args_end)
                if brace < 0: continue
                end = balanced(mask, brace, '{', '}')
                mains.append(ref(path, len(text[:match.start()].encode()), len(text[:end].encode())))
            cfgs = []
            for match in re.finditer(r'#\s*!?\s*\[\s*(?:cfg|path|proc_macro)', mask):
                bracket = mask.index('[', match.start()); end = balanced(mask, bracket, '[', ']')
                cfgs.append(ref(path, len(text[:match.start()].encode()), len(text[:end].encode())))
            public_cache[path] = {'root_visibility_lines': declarations, 'main_bodies': mains,
                                  'cfg_path_macro_attributes': cfgs,
                                  'scope': 'lexical root declarations only; inline modules/reexports/macros/target cfg not expanded'}
        return public_cache[path]

    edges = []; external = []; target_rows = []; package_rows = []
    by_manifest = {path: manifests[path]['package']['name'] for path in package_paths}

    def source_candidate(path, inspect_root=False):
        if path not in tree:
            return {'path': path, 'status': 'MISSING_OR_GENERATED_SOURCE_OPEN'}
        if tree[path]['mode'] not in ['100644', '100755']:
            return {'path': path, 'status': 'NONREGULAR_SOURCE_BOUNDARY_OPEN', **tree[path]}
        data = load(path); prefix_end = min(len(data), 4096)
        while prefix_end > 0:
            try: data[:prefix_end].decode(); break
            except UnicodeDecodeError: prefix_end -= 1
        result = {'path': path, 'status': 'SOURCE_PRESENT_NOT_COMPILED', 'source': sources[path],
                  'purpose_prefix': ref(path, 0, prefix_end)}
        if inspect_root and path.endswith('.rs'): result['root_index'] = public_root(path)
        return result

    for path in package_paths:
        data = manifests[path]; pkg = data['package']; directory = posixpath.dirname(path); name = pkg['name']
        ws = workspace_for(path); curated = classification[name]
        require(curated['manifest'] == path and curated['primary_owner'] in tasks, 'Bad curated identity/owner')
        edition = inherited(pkg.get('edition'), ws, 'edition', '2015')
        explicit_any = any(key in data for key in ['lib', 'bin', 'test', 'example', 'bench'])
        auto_default = not (str(edition) == '2015' and explicit_any)
        auto = {kind: pkg.get(flag, auto_default) for kind, flag in
                [('lib', 'autolib'), ('bin', 'autobins'), ('test', 'autotests'),
                 ('example', 'autoexamples'), ('bench', 'autobenches')]}
        doc_candidates = [joined(directory, p) for p in ['README.md', 'README.rst']]
        if isinstance(pkg.get('readme'), str): doc_candidates.insert(0, joined(directory, pkg['readme']))
        docs = [source_candidate(p) for p in dict.fromkeys(doc_candidates) if p in tree]
        refs = []
        for requirement in requirements:
            if requirement['kind'] != 'FUNCTIONAL_PARITY': continue
            for source in requirement['sources']:
                if source['path'] == path or source['path'].startswith(directory + '/'):
                    # The longest package prefix owns nested test-support crates independently.
                    nested = [p for p in package_paths if source['path'].startswith(posixpath.dirname(p) + '/')]
                    if nested and max(nested, key=lambda p: len(posixpath.dirname(p))) == path:
                        require(source['path'] in tree, 'Catalog source path missing')
                        require(sha(load(source['path'])) == source['sha256'], 'Catalog source hash drift')
                        refs.append({'requirement': requirement['id'], 'owner': requirement['owner'],
                                     'source_path': source['path']})
        owners = sorted({curated['primary_owner']} | {r['owner'] for r in refs})
        row = {'manifest': path, 'name': name, 'workspace_source': ws, 'package': pkg,
               'manifest_source': ref(path), 'classification': curated,
               'owner_bindings': owners, 'families': sorted({f for o in owners for f in owner_families[o]}),
               'catalog_source_refs': refs, 'features': data.get('features', {}), 'edition_source_value': edition,
               'automatic_discovery_source_flags': auto, 'docs': docs,
               'public_behavior_obligation': 'RETAINED_VIA_CAPABILITY_OWNER_OR_EXPLICIT_TEST_BUILD_DEVELOPMENT_SUPPORT; no feature excluded by publish/name alone',
               'compiler_reachability': 'NOT_RUN'}
        package_rows.append(row)

        # Declared targets retain every attribute; source inference stays a candidate.
        declared_names = collections.defaultdict(set); declared_paths = collections.defaultdict(set)
        for kind in ['lib', 'bin', 'test', 'example', 'bench']:
            entries = [data['lib']] if kind == 'lib' and 'lib' in data else data.get(kind, []) if kind != 'lib' else []
            for index, entry in enumerate(entries):
                target_name = entry.get('name', name.replace('-', '_') if kind == 'lib' else None)
                require(target_name is not None, 'Declared nonlibrary target has no name')
                if 'path' in entry:
                    paths = [joined(directory, entry['path'])]
                elif kind == 'lib': paths = [joined(directory, 'src/lib.rs')]
                else:
                    folder = {'bin': 'src/bin', 'test': 'tests', 'example': 'examples', 'bench': 'benches'}[kind]
                    paths = [joined(directory, folder + '/' + target_name + '.rs'),
                             joined(directory, folder + '/' + target_name + '/main.rs')]
                    if kind == 'bin' and target_name == name: paths.insert(0, joined(directory, 'src/main.rs'))
                    paths = [p for p in paths if p in tree] or paths
                declared_names[kind].add(target_name); declared_paths[kind].update(paths)
                target_rows.append({'id': path + '::' + kind + ':declared:' + str(index), 'manifest': path,
                                    'kind': kind, 'name': target_name, 'origin': 'MANIFEST_DECLARED',
                                    'attributes': entry, 'source_candidates': [source_candidate(p, kind in ['lib', 'bin']) for p in paths],
                                    'resolution': 'SOURCE_CANDIDATE_NOT_CARGO_METADATA',
                                    'role': 'PROCEDURAL_MACRO_BUILD_CONTRACT' if kind == 'lib' and entry.get('proc-macro') else
                                    ('TEST_OR_EXAMPLE_SOURCE' if kind in ['test', 'bench', 'example'] else 'LIBRARY_OR_EXECUTABLE_SOURCE')})
        candidates = [('lib', name.replace('-', '_'), joined(directory, 'src/lib.rs')),
                      ('bin', name, joined(directory, 'src/main.rs'))]
        for kind, folder in [('bin', 'src/bin'), ('test', 'tests'), ('example', 'examples'), ('bench', 'benches')]:
            prefix = joined(directory, folder) + '/'
            for source in sorted(tree):
                if not source.startswith(prefix) or not source.endswith('.rs'): continue
                relative = source[len(prefix):].split('/')
                if len(relative) == 1: candidates.append((kind, relative[0][:-3], source))
                elif len(relative) == 2 and relative[1] == 'main.rs': candidates.append((kind, relative[0], source))
        for kind, target_name, source in candidates:
            if source not in tree: continue
            overlap = target_name in declared_names[kind] or source in declared_paths[kind]
            target_rows.append({'id': path + '::' + kind + ':directory:' + source, 'manifest': path,
                                'kind': kind, 'name': target_name, 'origin': 'DIRECTORY_LAYOUT_CANDIDATE',
                                'autodiscovery_source_flag': auto[kind], 'overlaps_declared_name_or_path': overlap,
                                'status': 'DISABLED_AUTO_SOURCE_RETAINED' if not auto[kind] else
                                ('DECLARED_ALIAS_OR_SHADOW_CANDIDATE_RETAINED' if overlap else 'AUTO_SOURCE_CANDIDATE'),
                                'source_candidates': [source_candidate(source, kind in ['lib', 'bin'])],
                                'resolution': 'NO_COMPILER_MERGE_OR_FEATURE_CLAIM',
                                'role': 'TEST_OR_EXAMPLE_SOURCE' if kind in ['test', 'bench', 'example'] else 'LIBRARY_OR_EXECUTABLE_SOURCE'})
        build_value = pkg.get('build', True)
        build_path = joined(directory, 'build.rs' if build_value is True else build_value) if build_value is not False else None
        if build_path and (build_path in tree or isinstance(build_value, str)):
            target_rows.append({'id': path + '::custom-build', 'manifest': path, 'kind': 'custom-build',
                                'name': 'build-script', 'origin': 'PACKAGE_BUILD_SOURCE', 'package_build_value': build_value,
                                'source_candidates': [source_candidate(build_path)], 'role': 'BUILD_SCRIPT_NOT_EXECUTED'})

        def dependencies(table, dependency_kind, target_cfg=None):
            for alias, value in table.items():
                raw = {'version': value} if isinstance(value, str) else value
                definition = workspaces[ws].get('dependencies', {}).get(alias) if raw.get('workspace') else raw
                require(definition is not None, 'Missing workspace dependency definition')
                definition = {'version': definition} if isinstance(definition, str) else definition
                record = {'from_manifest': path, 'alias': alias, 'kind': dependency_kind, 'target_cfg': target_cfg,
                          'declaration': value, 'workspace_definition': definition if raw.get('workspace') else None,
                          'optional_source_value': raw.get('optional', definition.get('optional', False)),
                          'features_not_resolved': True}
                if definition.get('path'):
                    base = posixpath.dirname(ws) if raw.get('workspace') else directory
                    target = joined(base, definition['path'] + '/Cargo.toml')
                    record.update(to_manifest=target, to_package=by_manifest.get(target),
                                  path_source='workspace' if raw.get('workspace') else 'package',
                                  status='BOUND_LOCAL_DECLARATION' if target in by_manifest else 'UNRESOLVED_LOCAL_PATH_OPEN')
                    edges.append(record)
                else:
                    record.update(package=definition.get('package', alias), external_definition=definition)
                    external.append(record)
        for kind in ['dependencies', 'dev-dependencies', 'build-dependencies']:
            dependencies(data.get(kind, {}), kind)
        for cfg, tables in data.get('target', {}).items():
            for kind in ['dependencies', 'dev-dependencies', 'build-dependencies']:
                dependencies(tables.get(kind, {}), kind, cfg)

    consumers = collections.defaultdict(list)
    for index, edge in enumerate(edges): consumers[edge['to_manifest']].append(index)
    for row in package_rows:
        row['declared_consumer_edge_indexes'] = consumers[row['manifest']]
        row['target_ids'] = [r['id'] for r in target_rows if r['manifest'] == row['manifest']]
    covered_refs = {(r['requirement'], r['source_path']) for p in package_rows for r in p['catalog_source_refs']}
    delegated = []
    for requirement in requirements:
        if requirement['kind'] == 'FUNCTIONAL_PARITY':
            for source in requirement['sources']:
                if (requirement['id'], source['path']) not in covered_refs:
                    delegated.append({'requirement': requirement['id'], 'source': source['path'],
                                      'status': 'NON_CARGO_SOURCE_TO_NON_RUST_OR_TOPLEVEL_INTEGRATION'})
    context = [ref(path) for path in sorted(tree) if path.endswith(('rust-toolchain.toml', '/rust-toolchain',
                                                                 '/.cargo/config.toml', '/.cargo/config'))]
    return {'kind': 'T1_COMPONENT_SOURCE_CLASSIFICATION_NOT_CARGO_METADATA_OR_RUNTIME_PROOF', 'pin': PIN,
            'contract_sha256': sha(CONTRACT.read_bytes()), 'classification_sha256': sha((OUT / 'classification.json').read_bytes()),
            'catalog_sha256': sha(CATALOG.read_bytes()),
            'method_reference': 'https://doc.rust-lang.org/cargo/reference/cargo-targets.html',
            'tracked_git_paths': len(tree), 'cargo_manifest_count': len(manifests), 'toolchain_cargo_context_sources': context,
            'virtual_manifests': [{'path': p, 'data': d, 'source': ref(p)} for p, d in manifests.items() if 'package' not in d],
            'workspace_manifests': [{'path': p, 'workspace': d, 'source': ref(p)} for p, d in workspaces.items()],
            'packages': package_rows, 'target_candidates': target_rows, 'local_dependency_edges': edges,
            'external_dependency_declarations': external, 'delegated_catalog_source_refs': delegated,
            'sources': sorted(sources.values(), key=lambda r: r['path']),
            'limits': ['Directory candidates are retained even when disabled or overlapping declared aliases; no Cargo merge/selection or installed artifact claim.',
                       'Target cfg/features/workspace unification/build scripts/macros/transitive public APIs are not executed or semantically resolved.',
                       'Curated package purposes bind ownership with source/consumer evidence; development/test/build roles do not erase callable behavior obligations.',
                       'NonRust SDK/proxy/runtime/package surfaces are separate lane; G01 remainingtype/scalar/TUI/platform/effects and G02/G03/G04 remain open.'],
            'functional_receipts': 0, 'full_g01_closure': False}


fresh = build(); require(fresh == build(), 'Source generation differs')


def validate(value):
    require(value == fresh, 'Source classification differs from exact fresh generation')
    require(len(value['packages']) == 163 and value['cargo_manifest_count'] == 164, 'Package omission')
    require(value['functional_receipts'] == 0 and not value['full_g01_closure'], 'False qualification')


negatives = []
for name, mutation in [
    ('removed_package', lambda v: v['packages'].pop()),
    ('removed_standalone_linter', lambda v: v.update(packages=[p for p in v['packages'] if p['name'] != 'argument_comment_lint'])),
    ('wrong_owner', lambda v: v['packages'][0]['classification'].update(primary_owner='DX100-Q05')),
    ('lost_feature_table', lambda v: next(p for p in v['packages'] if p['features']).update(features={})),
    ('lost_dependency_edge', lambda v: v['local_dependency_edges'].pop()),
    ('dev_as_runtime_edge', lambda v: next(e for e in v['local_dependency_edges'] if e['kind'] == 'dev-dependencies').update(kind='dependencies')),
    ('lost_target_cfg', lambda v: next(e for e in v['local_dependency_edges'] if e['target_cfg']).update(target_cfg=None)),
    ('lost_target', lambda v: v['target_candidates'].pop()),
    ('claimed_compiler_result', lambda v: v['target_candidates'][0].update(resolution='CARGO_BUILD_PROVED')),
    ('lost_root_decl', lambda v: next(s for t in v['target_candidates'] for s in t['source_candidates'] if s.get('root_index', {}).get('root_visibility_lines'))['root_index']['root_visibility_lines'].pop()),
    ('hidden_nonrust_boundary', lambda v: v.update(delegated_catalog_source_refs=[])),
    ('false_qualification', lambda v: v.update(functional_receipts=1)),
]:
    bad = copy.deepcopy(fresh); mutation(bad)
    try: validate(bad)
    except AssertionError: negatives.append({'name': name, 'result': 'REJECTED'})
    else: raise AssertionError('Known-bad classification accepted: ' + name)
report = {'kind': 'T1_COMPONENT_SOURCE_REPRODUCTION_ONLY', 'result': 'PASS',
          'packages': len(fresh['packages']), 'cargo_manifests': fresh['cargo_manifest_count'],
          'virtual_workspaces': len(fresh['virtual_manifests']), 'workspace_manifests': len(fresh['workspace_manifests']),
          'target_candidates': len(fresh['target_candidates']), 'local_dependency_edges': len(fresh['local_dependency_edges']),
          'external_dependency_declarations': len(fresh['external_dependency_declarations']),
          'source_git_blobs': len(fresh['sources']), 'negative_controls': negatives,
          'functional_receipts': 0, 'full_g01_closure': False}
if '--check' in sys.argv:
    require((OUT / 'inventory.json').read_bytes() == encoded(fresh), 'Inventory regeneration differs')
    require(read(OUT / 'verification.json') == report, 'Verification differs')
    manifest = read(OUT / 'manifest.json')
    expected_manifest = {'kind': 'T1_COMPONENT_SOURCE_PACKAGE_NOT_PARITY', 'pin': PIN,
                         'contract_sha256': sha(CONTRACT.read_bytes()),
                         'files': [{'path': p.name, 'sha256': sha(p.read_bytes()), 'bytes': p.stat().st_size}
                                   for p in sorted(OUT.iterdir()) if p.is_file() and p.name != 'manifest.json']}
    require(manifest == expected_manifest, 'Manifest header, contract, file set or bytes differ')
else:
    (OUT / 'inventory.json').write_bytes(encoded(fresh)); (OUT / 'verification.json').write_bytes(encoded(report))
    manifest = {'kind': 'T1_COMPONENT_SOURCE_PACKAGE_NOT_PARITY', 'pin': PIN,
                'contract_sha256': sha(CONTRACT.read_bytes()),
                'files': [{'path': p.name, 'sha256': sha(p.read_bytes()), 'bytes': p.stat().st_size}
                          for p in sorted(OUT.iterdir()) if p.is_file() and p.name != 'manifest.json']}
    (OUT / 'manifest.json').write_bytes(encoded(manifest))
print(json.dumps(report))
