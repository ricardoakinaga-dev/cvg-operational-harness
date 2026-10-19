#!/usr/bin/env python3
"""Offline AST evidence reader. Target bytes are data; never imported or evaluated."""
import argparse
import ast
import copy
import hashlib
import json
import pathlib
import re
import stat
import subprocess
import sys
import tomllib

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[6]
PACKET = HERE.parents[2]
UPSTREAM = pathlib.Path('/tmp/cvg-rea-codex-20261017/upstream')
PIN = '8d9f6466ff0294785d56f55b1fe363d132fe4133'
PARENT_SHA = '182723fb6159aad4c13d769c106d250ab8d7dec0f7edaadc861553a3757ff2a7'
CHILD_SHA = 'd349bb9bbcbb8740db5ba61b029e974df80b808404efa522af4985bd15977740'
BASELINE = 'g01/component-surfaces/non-rust/inventory.json'
RECON = 'next-sdk-language-recon.json'
FILES = {'reader.py', 'inventory.json', 'schema.json', 'verification.json',
         'README.md', 'handoff.md', 'manifest.json', 'failures.json'}
EXTRA = ['sdk/python/README.md', 'sdk/python/RELEASING.md',
         'sdk/python/BUILD.bazel', 'sdk/python/docs/api-reference.md',
         'sdk/python/docs/faq.md', 'sdk/python/docs/getting-started.md',
         'sdk/python/src/openai_codex/py.typed', 'sdk/python-runtime/README.md',
         'sdk/python/examples/_bootstrap.py']


def require(ok, message):
    if not ok:
        raise ValueError(message)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))


def load(path):
    def pairs(items):
        result = {}
        for key, value in items:
            require(key not in result, 'duplicate JSON key: ' + key)
            result[key] = value
        return result
    return json.loads(path.read_text(encoding='utf-8'), object_pairs_hook=pairs)


def git(*args):
    return subprocess.run(['git', '-C', str(UPSTREAM), *args], check=True,
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE).stdout


def identity(path, data, mode='100644'):
    return {'path': path, 'bytes': len(data), 'sha256': sha(data), 'mode': mode,
            'git_blob': hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()}


def inputs():
    parent_path, child_path = HERE.parent / 'contract.json', HERE.parent / 'python-contract.json'
    require(sha(parent_path.read_bytes()) == PARENT_SHA, 'parent contract drift')
    require(sha(child_path.read_bytes()) == CHILD_SHA, 'child contract drift')
    parent, child = load(parent_path), load(child_path)
    require(child['parent_contract_sha256'] == PARENT_SHA and parent['pin'] == PIN, 'contract binding')
    require(sha((PACKET / RECON).read_bytes()) == parent['recon']['sha256'], 'recon drift')
    recon = load(PACKET / RECON)
    for item in recon['inputs']:
        require(sha((ROOT / item['path']).read_bytes()) == item['sha256'], 'recon input drift: ' + item['path'])
    require(sha((ROOT / parent['catalog']['path']).read_bytes()) == parent['catalog']['sha256'], 'catalog drift')
    preserved = []
    for package in parent['source_packages']:
        path = PACKET / package['manifest']
        require(sha(path.read_bytes()) == package['sha256'], 'previous manifest drift: ' + str(path))
        manifest = load(path)
        entries = manifest['files']
        # Previously accepted manifests are read as data, never imported as helpers.
        require(isinstance(entries, list), 'previous manifest files must be array')
        for entry in entries:
            p = pathlib.Path(entry['path'])
            candidates = [ROOT / p, path.parent / p, PACKET / p]
            matches = [q for q in candidates if q.is_file() and sha(q.read_bytes()) == entry['sha256']]
            require(bool(matches), 'previous file drift: ' + str(p))
        preserved.append({'package': package['package'], 'manifest_sha256': package['sha256'], 'files': len(entries)})
    baseline = load(PACKET / BASELINE)
    expected = {x['path']: x for x in recon['scope']['sdk_sources']}
    tree = {}
    for line in git('ls-tree', '-r', PIN, '--', 'sdk/python', 'sdk/python-runtime').decode().splitlines():
        meta, path = line.split('\t'); mode, kind, blob = meta.split()
        tree[path] = (mode, blob)
    paths = sorted({p for p in expected if p.startswith(('sdk/python/', 'sdk/python-runtime/'))} | set(EXTRA))
    sources, texts = [], {}
    for path in paths:
        mode, blob = tree[path]
        data = git('cat-file', 'blob', blob)
        require(mode in ('100644', '100755'), 'nonregular tracked source')
        require((UPSTREAM / path).read_bytes() == data and not (UPSTREAM / path).is_symlink(), 'source worktree drift: ' + path)
        info = identity(path, data, mode)
        require(info['git_blob'] == blob, 'Git blob mismatch')
        if path in expected:
            require(info == expected[path], 'recon source identity drift: ' + path)
        info['scope'] = 'PRIOR_RECON_PYTHON' if path in expected else 'ADDITIONAL_PACKAGING_OR_DOC_SOURCE'
        sources.append(info); texts[path] = data.decode('utf-8', errors='strict')
    # TS is a parent lane. Authenticate its census identities without parsing it as Python.
    ts = [x for x in expected.values() if x['path'].startswith('sdk/typescript/')]
    for item in ts:
        data = git('show', PIN + ':' + item['path'])
        require(identity(item['path'], data, item['mode']) == item, 'TS census drift')
    return texts, sources, baseline, preserved, ts


def module_name(path):
    if '/src/' in path:
        name = path.split('/src/')[1][:-3].replace('/', '.')
        return name.removesuffix('.__init__')
    return '@support.' + path[:-3].replace('/', '.')


def expression(node):
    return ast.unparse(node) if node is not None else None


def strings(node):
    """Only recognize literal strings in containers; no evaluation of expressions."""
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return [node.value]
    if isinstance(node, (ast.List, ast.Tuple, ast.Set)):
        return [s for elt in node.elts for s in strings(elt)]
    return []


class Reader:
    def __init__(self, path, text):
        self.path, self.text = path, text
        self.data = text.encode('utf-8')
        self.lines = self.data.splitlines(keepends=True)
        self.starts = [0]
        for line in self.lines:
            self.starts.append(self.starts[-1] + len(line))
        self.module = module_name(path)
        self.blob = identity(path, self.data)['git_blob']
        self.tree = ast.parse(text, filename=path, type_comments=True)
        self.defs, self.imports, self.unknowns = [], [], []

    def span(self, node):
        start = self.starts[node.lineno - 1] + node.col_offset
        end = self.starts[node.end_lineno - 1] + node.end_col_offset
        return {'path': self.path, 'line_start': node.lineno, 'line_end': node.end_lineno,
                'byte_start': start, 'byte_end': end, 'sha256': sha(self.data[start:end]),
                'git_blob': self.blob}

    def exp(self, node):
        if node is None:
            return None
        return {'text': expression(node), 'source': self.span(node)}

    def signature(self, node):
        args = node.args
        positional = args.posonlyargs + args.args
        defaults = [None] * (len(positional) - len(args.defaults)) + list(args.defaults)
        parameters = []
        for i, (arg, default) in enumerate(zip(positional, defaults)):
            parameters.append({'name': arg.arg, 'kind': 'positional_only' if i < len(args.posonlyargs) else 'positional_or_keyword',
                               'annotation': self.exp(arg.annotation), 'default': self.exp(default),
                               'required_syntax': default is None, 'source': self.span(arg), 'type_comment': arg.type_comment})
        for arg, kind, default in ([(args.vararg, 'var_positional', None)] +
                                  [(a, 'keyword_only', d) for a, d in zip(args.kwonlyargs, args.kw_defaults)] +
                                  [(args.kwarg, 'var_keyword', None)]):
            if arg is not None:
                parameters.append({'name': arg.arg, 'kind': kind, 'annotation': self.exp(arg.annotation),
                                   'default': self.exp(default), 'required_syntax': kind == 'keyword_only' and default is None,
                                   'source': self.span(arg), 'type_comment': arg.type_comment})
        return {'text': expression(args), 'parameters': parameters, 'returns': self.exp(node.returns),
                'async': isinstance(node, ast.AsyncFunctionDef), 'type_comment': node.type_comment,
                'type_parameters': [expression(n) for n in getattr(node, 'type_params', [])]}

    def field(self, node, owner):
        value = node.value
        annotation = node.annotation if isinstance(node, ast.AnnAssign) else None
        targets = [node.target] if isinstance(node, ast.AnnAssign) else node.targets
        field_calls = []
        for part in [annotation, value]:
            if part is not None:
                for call in ast.walk(part):
                    if isinstance(call, ast.Call) and expression(call.func).split('.')[-1] in ('Field', 'field'):
                        field_calls.append({'callee': expression(call.func), 'args': [self.exp(a) for a in call.args],
                                            'keywords': [{'name': k.arg, 'value': self.exp(k.value)} for k in call.keywords],
                                            'source': self.span(call)})
        return [{'id': owner + '.' + expression(t), 'name': expression(t), 'annotation': self.exp(annotation),
                 'value': self.exp(value), 'required_syntax': value is None,
                 'runtime_requiredness': 'OPEN', 'field_declarations': field_calls,
                 'source': self.span(node)} for t in targets]

    def body(self, node):
        """Lexical facts, without executing branches, nested functions or callbacks."""
        calls, controls, assignments, rpc = [], [], [], []
        def walk(n, deferred=False):
            if n is not node and isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                return
            deferred = deferred or isinstance(n, ast.Lambda)
            if isinstance(n, ast.Call):
                rec = {'callee': expression(n.func), 'args': [self.exp(a) for a in n.args],
                       'keywords': [{'name': k.arg, 'value': self.exp(k.value)} for k in n.keywords],
                       'deferred_lambda': deferred, 'source': self.span(n)}
                calls.append(rec)
                leaf = rec['callee'].split('.')[-1]
                forwarding = (leaf == '_call_sync' and n.args and expression(n.args[0]).split('.')[-1] in ('request', 'notify', 'request_with_retry_on_overload'))
                if leaf in ('request', '_request_raw', 'notify', 'request_with_retry_on_overload') or forwarding:
                    args = n.args[1:] if forwarding else n.args
                    selector = next((k.value for k in n.keywords if k.arg == 'method'), args[0] if args else None)
                    literal = selector.value if isinstance(selector, ast.Constant) and isinstance(selector.value, str) else None
                    rpc.append({**rec, 'selector': self.exp(selector), 'literal_method': literal,
                                'selector_kind': 'LITERAL' if literal is not None else 'DYNAMIC_OPEN',
                                'forwarded_callable': self.exp(n.args[0]) if forwarding else None,
                                'response_model': next((self.exp(k.value) for k in n.keywords if k.arg == 'response_model'), None),
                                'dispatch': 'LEXICAL_CALL_CANDIDATE_RUNTIME_OPEN'})
            if isinstance(n, (ast.Assign, ast.AnnAssign, ast.AugAssign)):
                assignments.append({'text': expression(n), 'source': self.span(n)})
            if isinstance(n, (ast.If, ast.For, ast.AsyncFor, ast.While, ast.With, ast.AsyncWith, ast.Try,
                              ast.ExceptHandler, ast.Raise, ast.Return, ast.Yield, ast.YieldFrom, ast.Await, ast.Match)):
                control = {'kind': type(n).__name__, 'source': self.span(n)}
                for attr in ('test', 'iter', 'exc', 'cause', 'value', 'type', 'subject'):
                    if hasattr(n, attr):
                        control[attr] = self.exp(getattr(n, attr))
                if isinstance(n, (ast.With, ast.AsyncWith)):
                    control['contexts'] = [self.exp(i.context_expr) for i in n.items]
                if isinstance(n, ast.Try):
                    control['finally_sources'] = [self.span(i) for i in n.finalbody]
                    control['else_sources'] = [self.span(i) for i in n.orelse]
                controls.append(control)
            for child in ast.iter_child_nodes(n):
                walk(child, deferred)
        for stmt in node.body:
            walk(stmt)
        return {'calls': calls, 'controls': controls, 'assignments': assignments, 'rpc_calls': rpc,
                'body_source': {'path': self.path, 'byte_start': self.span(node.body[0])['byte_start'],
                                'byte_end': self.span(node.body[-1])['byte_end'],
                                'line_start': node.body[0].lineno, 'line_end': node.body[-1].end_lineno,
                                'git_blob': self.blob,
                                'sha256': sha(self.data[self.span(node.body[0])['byte_start']:self.span(node.body[-1])['byte_end']])},
                'runtime': 'OPEN_NOT_EXECUTED'}

    def scan(self, body=None, parent=None, container='module', guards=()):
        body = self.tree.body if body is None else body
        parent = self.module if parent is None else parent
        for node in body:
            if isinstance(node, (ast.Import, ast.ImportFrom)):
                base = ''
                if isinstance(node, ast.ImportFrom):
                    package = self.module if self.path.endswith('/__init__.py') else self.module.rpartition('.')[0]
                    parts = package.split('.')
                    base = '.'.join(parts[:len(parts) - node.level + 1]) if node.level else ''
                    base = '.'.join(x for x in [base, node.module] if x)
                for a in node.names:
                    name = a.asname or (a.name.split('.')[0] if isinstance(node, ast.Import) else a.name)
                    target = (base + '.' + a.name) if isinstance(node, ast.ImportFrom) else a.name
                    self.imports.append({'id': parent + '.' + name, 'name': name, 'target': target,
                                         'scope': parent, 'guards': list(guards), 'source': self.span(node),
                                         'support_only': not target.startswith(('openai_codex.', 'codex_cli_bin.'))})
            elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                identifier = parent + '.' + node.name
                rec = {'id': identifier, 'module': self.module, 'name': node.name, 'container': container,
                       'parent': parent, 'kind': 'class' if isinstance(node, ast.ClassDef) else 'function',
                       'public_syntax': not node.name.startswith('_') or node.name in ('__init__', '__enter__', '__exit__', '__aenter__', '__aexit__'),
                       'source': self.span(node), 'guards': list(guards),
                       'decorators': [self.exp(d) for d in node.decorator_list],
                       'runtime': 'OPEN_NOT_EXECUTED'}
                if isinstance(node, ast.ClassDef):
                    rec.update(bases=[self.exp(b) for b in node.bases],
                               keywords=[{'name': k.arg, 'value': self.exp(k.value)} for k in node.keywords],
                               fields=[f for s in node.body if isinstance(s, (ast.Assign, ast.AnnAssign)) for f in self.field(s, identifier)],
                               constructor='SOURCE_DECLARED' if any(isinstance(s, (ast.FunctionDef, ast.AsyncFunctionDef)) and s.name == '__init__' for s in node.body) else 'DERIVED_OR_LANGUAGE_DEFAULT_OPEN',
                               mro='OPEN_DECLARATIONS_ONLY_NO_C3_OR_METACLASS_EVALUATION')
                else:
                    rec.update(signature=self.signature(node), body=self.body(node))
                self.defs.append(rec)
                self.scan(node.body, identifier, 'class' if rec['kind'] == 'class' else 'function', guards)
            elif isinstance(node, (ast.Assign, ast.AnnAssign)):
                if container == 'module':
                    for f in self.field(node, parent):
                        self.defs.append({**f, 'module': self.module, 'parent': parent, 'container': container,
                                          'kind': 'value_or_alias', 'public_syntax': not f['name'].startswith('_'),
                                          'guards': list(guards), 'runtime': 'OPEN_NOT_EXECUTED'})
            elif isinstance(node, (ast.If, ast.Try, ast.With, ast.For, ast.While, ast.AsyncWith, ast.AsyncFor)):
                guard = type(node).__name__ + ':' + expression(getattr(node, 'test', None) or getattr(node, 'iter', None) or ast.Constant(value='conditional'))
                for attr in ('body', 'orelse', 'finalbody'):
                    self.scan(getattr(node, attr, []), parent, container, guards + (guard,))
                for handler in getattr(node, 'handlers', []):
                    self.scan(handler.body, parent, container, guards + ('except:' + str(expression(handler.type)),))
            elif container in ('module', 'class') and not isinstance(node, (ast.Expr, ast.Pass)):
                self.unknowns.append({'kind': type(node).__name__, 'source': self.span(node),
                                      'disposition': 'OPEN_UNRECOGNIZED_DECLARATION_SYNTAX', 'scope': parent})
        return self


def analyze(texts):
    readers = [Reader(p, t).scan() for p, t in sorted(texts.items()) if p.endswith('.py')]
    definitions = [d for r in readers for d in r.defs]
    imports = [i for r in readers for i in r.imports]
    by_id = {}
    for d in definitions:
        by_id.setdefault(d['id'], []).append(d)
    imap = {}
    for i in imports:
        imap.setdefault(i['id'], []).append(i)

    def resolve(identifier, seen=()):
        if identifier in seen:
            return {'status': 'OPEN_CYCLE', 'targets': [], 'chain': [*seen, identifier]}
        if identifier in by_id:
            ds = by_id[identifier]
            return {'status': 'SOURCE_DECLARATION' if len(ds) == 1 and not ds[0]['guards'] else 'OPEN_CONDITIONAL_OR_REDEFINED',
                    'targets': [identifier], 'chain': [*seen, identifier]}
        if identifier in imap:
            refs = imap[identifier]
            if len(refs) == 1 and not refs[0]['guards']:
                return resolve(refs[0]['target'], (*seen, identifier))
            return {'status': 'OPEN_IMPORT_VARIANTS', 'targets': sorted({i['target'] for i in refs}), 'chain': [*seen, identifier]}
        return {'status': 'OPEN_EXTERNAL_OR_DYNAMIC', 'targets': [], 'chain': [*seen, identifier]}

    def type_refs(rec):
        parts = []
        if rec['kind'] == 'function':
            parts = [p['annotation'] for p in rec['signature']['parameters']] + [rec['signature']['returns']]
        elif rec['kind'] == 'class':
            parts = rec['bases'] + [f['annotation'] for f in rec['fields']]
        else:
            parts = [rec['annotation'], rec['value']]
        refs = set()
        for part in parts:
            if part:
                for n in ast.walk(ast.parse(part['text'], mode='eval')):
                    if isinstance(n, ast.Name):
                        refs.add(n.id)
                    elif isinstance(n, ast.Constant) and isinstance(n.value, str) and re.fullmatch(r'[A-Za-z_]\w*(\.\w+)*', n.value):
                        # Could be a forward ref or a literal value. Keep ambiguity explicit.
                        refs.add(n.value)
        return [{'name': name, **resolve(rec['module'] + '.' + name)} for name in sorted(refs)]

    for d in definitions:
        d['type_references'] = type_refs(d)
        if d['kind'] == 'class':
            d['base_bindings'] = [{'expression': b, **resolve(d['module'] + '.' + b['text'].split('[')[0])} for b in d['bases']]
            d['declared_members'] = [x['id'] for x in definitions if x['parent'] == d['id']]
    roots = []
    modules = []
    for r in readers:
        all_records = [d for d in r.defs if d['id'] == r.module + '.__all__']
        all_names = []
        all_status = 'IMPLICIT_NAMESPACE_NO_RUNTIME_CLAIM'
        if all_records:
            val = ast.parse(all_records[-1]['value']['text'], mode='eval').body
            all_names = strings(val)
            all_status = 'LITERAL_DECLARATION' if isinstance(val, (ast.List, ast.Tuple)) and len(all_names) == len(val.elts) else 'OPEN_DYNAMIC_ALL'
        public = sorted({d['name'] for d in r.defs if d['parent'] == r.module and d['public_syntax']} |
                        {i['name'] for i in r.imports if i['scope'] == r.module and not i['name'].startswith('_')} | set(all_names))
        names = [{'name': n, 'id': r.module + '.' + n, **resolve(r.module + '.' + n),
                  'disposition': 'DECLARED_ALL' if n in all_names else 'MODULE_NAMESPACE_CANDIDATE_NOT_NEW_REQUIREMENT'} for n in public]
        modules.append({'id': r.module, 'path': r.path, 'all_names': all_names, 'all_status': all_status,
                        'namespace': names, 'unknown_syntax': r.unknowns,
                        'role': 'SDK_MODULE' if '/src/' in r.path else 'PACKAGING_CODEGEN_SUPPORT_ONLY'})
        if r.module == 'openai_codex':
            roots = [n for n in names if n['name'] in all_names]
    # Receiver bindings are constructor/annotation candidates. They never claim dynamic reachability.
    receiver_types = {}
    for r in readers:
        for cls in [d for d in r.defs if d['kind'] == 'class']:
            candidates = {}
            for method in [d for d in r.defs if d['parent'] == cls['id'] and d['kind'] == 'function']:
                args = {p['name']: p['annotation']['text'].strip("'\"") for p in method['signature']['parameters'] if p['annotation']}
                for stmt in method['body']['assignments']:
                    n = ast.parse(stmt['text']).body[0]
                    if isinstance(n, (ast.Assign, ast.AnnAssign)):
                        targets = n.targets if isinstance(n, ast.Assign) else [n.target]
                        typ = expression(n.value.func) if isinstance(n.value, ast.Call) else args.get(expression(n.value))
                        if typ:
                            for target in targets:
                                if expression(target).startswith('self.'):
                                    res = resolve(r.module + '.' + typ.split('[')[0])
                                    candidates.setdefault(expression(target), set()).update(res['targets'])
            receiver_types[cls['id']] = candidates
    edges, rpc = [], []
    for d in definitions:
        if d['kind'] != 'function':
            continue
        for call in d['body']['calls']:
            callee = call['callee']; targets = []
            if callee.startswith('self.'):
                own = d['parent'] + callee[4:]
                if own in by_id:
                    targets = [own]
                else:
                    receiver, _, attr = callee.rpartition('.')
                    targets = [t + '.' + attr for t in receiver_types.get(d['parent'], {}).get(receiver, []) if t + '.' + attr in by_id]
            else:
                targets = resolve(d['module'] + '.' + callee)['targets']
            edges.append({'from': d['id'], 'callee': callee, 'to_candidates': sorted(targets),
                          'status': 'SOURCE_CANDIDATES_RUNTIME_OPEN' if targets else 'OPEN_DYNAMIC_OR_EXTERNAL_RECEIVER',
                          'source': call['source']})
        for call in d['body']['rpc_calls']:
            rpc.append({'from': d['id'], **call})
    registry = []
    for r in readers:
        if r.module == 'openai_codex.generated.notification_registry':
            for n in r.tree.body:
                if isinstance(n, ast.AnnAssign) and expression(n.target) == 'NOTIFICATION_MODELS' and isinstance(n.value, ast.Dict):
                    registry = [{'id': 'PYNOTIFY:' + expression(k), 'method': k.value if isinstance(k, ast.Constant) else None,
                                 'model': expression(v), **resolve(r.module + '.' + expression(v)),
                                 'source': r.span(v), 'method_source': r.span(k), 'runtime': 'DECLARATION_ONLY_OPEN'} for k, v in zip(n.value.keys, n.value.values)]
    return {'modules': modules, 'definitions': definitions, 'imports': imports,
            'root_exports': roots, 'call_edges': edges, 'rpc': rpc,
            'rpc_method_parameters': [{'definition_id': d['id'], 'parameters': [p for p in d['signature']['parameters'] if p['name'] in ('method', 'method_name')], 'runtime': 'DYNAMIC_SELECTOR_OPEN'} for d in definitions if d['kind'] == 'function' and any(p['name'] in ('method', 'method_name') for p in d['signature']['parameters'])],
            'notification_registry': registry}


def build(texts, sources, baseline, preserved, ts):
    result = analyze(texts)
    defs = {d['id']: d for d in result['definitions']}
    historical = []
    for old in baseline['python']['root_public_api']:
        historical.append({'id': 'PYROOT:' + old['name'], 'baseline_record': old,
                           'definition_join': old['definition'] if old['definition'] in defs else None,
                           'member_joins': [{'id': m, 'status': 'SOURCE_DECLARATION' if m in defs else 'OPEN_UNRESOLVED'} for m in old['members']]})
    packaging = []
    for source in sources:
        p = source['path']
        if p.endswith('.toml'):
            packaging.append({'id': 'PYPACK:' + p, 'path': p, 'kind': 'TOML_METADATA_DECLARATION',
                              'declaration': tomllib.loads(texts[p]), 'runtime': 'OPEN_NOT_EXECUTED'})
        elif '/src/openai_codex/' not in p or p.endswith('_runtime_requirements.py'):
            packaging.append({'id': 'PYPACK:' + p, 'path': p, 'kind': 'SUPPORT_SOURCE_OR_DOCUMENTATION',
                              'definitions': [d['id'] for d in result['definitions'] if d['source']['path'] == p],
                              'runtime': 'OPEN_NOT_EXECUTED'})
    lifecycle = []
    for d in result['definitions']:
        if d['kind'] == 'function' and '/src/' in d['source']['path']:
            tags = sorted({token for token in ['close', 'cancel', 'interrupt', 'request', 'response', 'waiter', 'retry', 'initialize', 'start', 'route', 'login', 'error', 'notification', 'goal', 'stream', 'shield', 'to_thread', 'terminate', 'kill', 'join']
                           if token in d['name'].lower() or any(token in c['callee'].lower() for c in d['body']['calls'])})
            if tags or d['name'] in ('__enter__', '__exit__', '__aenter__', '__aexit__'):
                lifecycle.append({'id': 'PYFLOW:' + d['id'], 'definition_id': d['id'], 'lexical_tags': tags,
                                  'controls_count': len(d['body']['controls']), 'source': d['source'],
                                  'claim': 'LEXICAL_BODY_ONLY_RUNTIME_OPEN'})
    gaps = [{'baseline_record': old, 'id': old['id'], 'status': 'OPEN',
             'source_progress': 'PYTHON_AST_DECLARATIONS_ADDED' if old['id'] != 'GAP-TS-LANGUAGE' else 'LEAD_TYPESCRIPT_LANE_NO_PYTHON_SUBSTITUTION',
             'runtime_status': 'OPEN_NOT_RUN', 'receipt': None} for old in baseline['open_contracts']]
    # Preserve accepted behavior owners as source-anchor joins. Never assign methods by nearest name.
    owner_joins = []
    for old in baseline['behavior_and_provenance']:
        if not old['id'].startswith('PY-'):
            continue
        s = old['source']
        owner_joins.append({'id': 'PYOWNER:' + old['id'], 'baseline_record': old,
                            'source_candidates': [d['id'] for d in result['definitions'] if d['source']['path'] == s['path'] and d['source']['byte_start'] < s['byte_end'] and d['source']['byte_end'] > s['byte_start']],
                            'disposition': 'SOURCE_SPAN_OVERLAP_ONLY_METHOD_SEMANTIC_OWNERSHIP_OPEN',
                            'qualification': 'NOT_RUN', 'receipt': None})
    result.update(schema_version=1, task='DX100-G01:PYTHON-PUBLIC-SDK-CONTRACTS', status='IMPLEMENTED', pin=PIN,
                  parent_contract_sha256=PARENT_SHA, contract_sha256=CHILD_SHA,
                  catalog_sha256=baseline['catalog_sha256'],
                  baseline_sha256=sha((PACKET / BASELINE).read_bytes()), sources=sources,
                  authenticated_ts_census_not_analyzed=ts, previous_packages=preserved,
                  baseline_public_api=historical, packaging=packaging, lifecycle=lifecycle,
                  owner_joins=owner_joins, open_gaps=gaps,
                  census_discrepancy={'status': 'OPEN', 'reported_generated_rawdefs': 1075,
                                      'source_ast_top_classes': 1056, 'source_ast_top_assignments': 1,
                                      'source_ast_nested_methods': 4,
                                      'accepted_prior_generated_definition_records': sum(d['source']['path'].endswith('/generated/v2_all.py') for d in baseline['python']['definitions']),
                                      'disposition': 'PRESERVE_REPORTED_COUNT_WITH_SOURCE_RECOUNT_NO_SILENT_NORMALIZATION'},
                  version_boundary={'source_cli_dependency': '0.153.4', 'reported_installed_companion': '0.163.0',
                                    'installed_observation': 'PARENT_REPORTED_NOT_EXECUTED_BY_THIS_LANE',
                                    'source_binary_binding': 'OPEN_NEITHER_VERSION_AUTHENTICATES_PIN'},
                  limitations=['No SDK or dependency import, evaluation, build, codegen or execution.',
                               'AST facts and call/receiver candidates do not prove runtime dispatch, C3 MRO, platform or behavioral parity.',
                               'Pydantic, dataclass, Enum, RootModel, Field, default_factory and decorators are declarations only; constructors/requiredness remain OPEN.',
                               'Type references include ambiguous string literals; external library bindings, dynamic names, guards and inherited runtime members remain OPEN.',
                               'Explicit module namespaces include support imports; these are not additional functional obligations.',
                               'All six historical gaps retained, including TS which remains the separate Lead lane.',
                               'Fresh independent critic and parent integration reserved to Lead; no approval or full G01 claim.'],
                  functional_receipts=0, receipt=None, full_g01_closure=False, full_codex_parity_claim=False)
    result['counts'] = {'sources': len(sources), 'modules': len(result['modules']), 'definitions': len(result['definitions']),
                        'root_exports': len(result['root_exports']), 'historical_member_candidates': sum(len(x['member_joins']) for x in historical),
                        'generated_raw_top_definitions': sum(d['source']['path'].endswith('/generated/v2_all.py') and d['container'] == 'module' for d in result['definitions']),
                        'generated_all_definitions': sum(d['source']['path'].endswith('/generated/v2_all.py') for d in result['definitions']),
                        'fields': sum(len(d.get('fields', [])) for d in result['definitions']),
                        'rpc_calls': len(result['rpc']), 'dynamic_rpc': sum(r['literal_method'] is None for r in result['rpc']),
                        'call_edges': len(result['call_edges']), 'lifecycle': len(lifecycle), 'open_gaps': len(gaps),
                        'notification_registry': len(result['notification_registry'])}
    validate(result)
    validate_spans(result, texts)
    return result


def validate_spans(result, texts):
    checked = set()
    source_bytes = {p: t.encode('utf-8') for p, t in texts.items()}
    blobs = {p: identity(p, data)['git_blob'] for p, data in source_bytes.items()}
    offsets = {}
    for p, data in source_bytes.items():
        offsets[p] = [0]
        for line in data.splitlines(keepends=True):
            offsets[p].append(offsets[p][-1] + len(line))
    import bisect
    def walk(item):
        if isinstance(item, dict):
            if all(k in item for k in ('byte_start', 'byte_end', 'path', 'sha256')) and item['path'] in texts:
                key = (item['path'], item['byte_start'], item['byte_end'], item['sha256'])
                if key not in checked:
                    data = source_bytes[item['path']]
                    a, b = item['byte_start'], item['byte_end']
                    require(0 <= a <= b <= len(data), 'source span bounds')
                    require(sha(data[a:b]) == item['sha256'], 'source span hash')
                    data[a:b].decode('utf-8', errors='strict')
                    if 'line_start' in item:
                        require(bisect.bisect_right(offsets[item['path']], a) == item['line_start'], 'source line start')
                        require(bisect.bisect_right(offsets[item['path']], max(a, b - 1)) == item['line_end'], 'source line end: ' + str(key[:3]) + ' expected ' + str(item['line_end']))
                    if 'git_blob' in item:
                        require(blobs[item['path']] == item['git_blob'], 'span Git blob')
                    checked.add(key)
            for v in item.values():
                walk(v)
        elif isinstance(item, list):
            for v in item:
                walk(v)
    walk(result)
    return len(checked)


def validate(result):
    require(result['functional_receipts'] == 0 and result['receipt'] is None and not result['full_g01_closure'] and not result['full_codex_parity_claim'], 'fake qualification')
    require(result['status'] == 'IMPLEMENTED', 'unsupported approval')
    require(result['counts']['root_exports'] == 37 and result['counts']['historical_member_candidates'] == 63, 'baseline count drift')
    require(result['counts']['generated_raw_top_definitions'] == 1057 and result['counts']['generated_all_definitions'] == 1061, 'generated census drift')
    require(len(result['open_gaps']) == 6 and all(g['status'] == 'OPEN' and g['runtime_status'] == 'OPEN_NOT_RUN' and g['receipt'] is None for g in result['open_gaps']), 'gap erasure or closure')
    require(all(x['definition_join'] and all(m['status'] == 'SOURCE_DECLARATION' for m in x['member_joins']) for x in result['baseline_public_api']), 'historical join unresolved')


def schema(result):
    # Root closed schema. Reader regeneration verifies all nested semantics and exact joins.
    types = {k: ('array' if isinstance(v, list) else 'object' if isinstance(v, dict) else 'boolean' if isinstance(v, bool) else 'integer' if isinstance(v, int) else 'null' if v is None else 'string') for k, v in result.items()}
    properties = {k: {'type': types[k]} for k in sorted(result)}
    properties['sources']['items'] = {'type': 'object', 'required': ['path', 'git_blob', 'sha256', 'bytes', 'mode', 'scope']}
    properties['definitions']['items'] = {'type': 'object', 'required': ['id', 'module', 'kind', 'source', 'runtime', 'type_references'],
                                        'properties': {'source': {'$ref': '#/$defs/source_span'}, 'kind': {'enum': ['class', 'function', 'value_or_alias']}}}
    properties['functional_receipts'] = {'const': 0}
    properties['receipt'] = {'type': 'null'}
    properties['status'] = {'const': 'IMPLEMENTED'}
    properties['full_g01_closure'] = {'const': False}
    properties['full_codex_parity_claim'] = {'const': False}
    properties['contract_sha256'] = {'const': CHILD_SHA}
    properties['parent_contract_sha256'] = {'const': PARENT_SHA}
    return {'$schema': 'https://json-schema.org/draft/2020-12/schema', 'title': 'Python source-only SDK inventory v1',
            'type': 'object', 'additionalProperties': False, 'required': sorted(result),
            'properties': properties,
            '$defs': {'source_span': {'type': 'object', 'required': ['path', 'byte_start', 'byte_end', 'line_start', 'line_end', 'sha256', 'git_blob'],
                                      'properties': {'path': {'type': 'string'}, 'byte_start': {'type': 'integer', 'minimum': 0}, 'byte_end': {'type': 'integer', 'minimum': 0},
                                                     'line_start': {'type': 'integer', 'minimum': 1}, 'line_end': {'type': 'integer', 'minimum': 1},
                                                     'sha256': {'type': 'string', 'pattern': '^[0-9a-f]{64}$'}, 'git_blob': {'type': 'string', 'pattern': '^[0-9a-f]{40}$'}},
                                      'additionalProperties': False}},
            '$comment': 'Nested source facts are checked against deterministic regeneration by reader.py --check; no runtime API schema is asserted.'}


def assert_inventory(actual, expected):
    require(canonical(actual) == canonical(expected), 'artifact differs from source-derived inventory')


def manifest_validate(manifest, files):
    require(set(manifest) == {'schema_version', 'task', 'contract_sha256', 'parent_contract_sha256', 'files', 'excludes'}, 'manifest keys')
    require(manifest['schema_version'] == 1 and manifest['task'] == 'DX100-G01:PYTHON-PUBLIC-SDK-CONTRACTS', 'manifest identity')
    require(manifest['contract_sha256'] == CHILD_SHA and manifest['parent_contract_sha256'] == PARENT_SHA, 'manifest contract binding')
    require(manifest['excludes'] == ['manifest.json'], 'manifest exclusion')
    require(set(files) == FILES - {'manifest.json'}, 'strict manifest file set')
    entries = manifest['files']
    require([e['path'] for e in entries] == sorted(files), 'manifest order/duplicates/extras/missing')
    for entry in entries:
        require(set(entry) == {'path', 'sha256', 'bytes', 'mode'}, 'manifest entry keys')
        data, mode = files[entry['path']]
        require(entry == {'path': entry['path'], 'sha256': sha(data), 'bytes': len(data), 'mode': mode}, 'manifest hash/size/mode')


def snapshot():
    files = {}
    require({p.name for p in HERE.iterdir()} <= FILES, 'unexpected lane file or directory')
    for p in sorted(HERE.iterdir()):
        require(not p.is_symlink() and stat.S_ISREG(p.lstat().st_mode), 'nonregular lane path')
        files[p.name] = (p.read_bytes(), stat.S_IMODE(p.stat().st_mode))
    return files


def semantic_tests(texts, inventory):
    cases = []
    def probe(name, path, old, new, select):
        require(old in texts[path], 'mutation witness not found: ' + name)
        changed = dict(texts); changed[path] = texts[path].replace(old, new, 1)
        before = analyze({path: texts[path]}); after = analyze({path: changed[path]})
        require(select(before) != select(after), 'mutation did not change semantic field: ' + name)
        cases.append({'id': name, 'kind': 'INMEMORY_SOURCE_AST_MUTATION', 'result': 'PASS',
                      'derived_before': select(before), 'derived_after': select(after), 'source_path': path})
    api = 'sdk/python/src/openai_codex/api.py'
    client = 'sdk/python/src/openai_codex/client.py'
    gen = 'sdk/python/src/openai_codex/generated/v2_all.py'
    async_path = 'sdk/python/src/openai_codex/async_client.py'
    def definition(a, name):
        return next(d for d in a['definitions'] if d['id'] == name)
    probe('signature_keyword', client, 'include_hidden: bool = False', 'include_hidden: bool = False, *, synthetic: int = 1',
          lambda a: [p['name'] for p in definition(a, 'openai_codex.client.CodexClient.model_list')['signature']['parameters']])
    probe('default', client, 'include_hidden: bool = False', 'include_hidden: bool = True',
          lambda a: definition(a, 'openai_codex.client.CodexClient.model_list')['signature']['parameters'][1]['default']['text'])
    probe('alias', gen, 'alias="usesCodexManagedCredentials"', 'alias="changedAlias"',
          lambda a: definition(a, 'openai_codex.generated.v2_all.AmazonBedrockAccount')['fields'][2]['field_declarations'][0]['keywords'][0]['value']['text'])
    probe('async', async_path, 'async def close(self)', 'def close(self)',
          lambda a: definition(a, 'openai_codex.async_client.AsyncCodexClient.close')['signature']['async'])
    probe('lifecycle', client, 'proc.terminate()', 'proc.kill()',
          lambda a: [c['callee'] for c in definition(a, 'openai_codex.client.CodexClient.close')['body']['calls']])
    probe('rpc_literal', client, '"account/logout",', '"changed/logout",',
          lambda a: [r['literal_method'] for r in a['rpc'] if r['from'].endswith('.account_logout')])
    probe('rpc_dynamic', client, 'self._request_raw(method, params)', 'self._request_raw("fixed", params)',
          lambda a: [r['selector_kind'] for r in a['rpc'] if r['from'].endswith('.request')])
    probe('decorator', client, '@dataclass(slots=True)\nclass CodexConfig', '@dataclass(frozen=True)\nclass CodexConfig',
          lambda a: [d['text'] for d in definition(a, 'openai_codex.client.CodexConfig')['decorators']])
    probe('error_mapping', 'sdk/python/src/openai_codex/_message_router.py', 'int(err.get("code", -32000))', 'int(err.get("code", -32700))',
          lambda a: [x['args'][0]['text'] for x in definition(a, 'openai_codex._message_router.MessageRouter.route_response')['body']['calls'] if x['callee'] == 'map_jsonrpc_error'])
    probe('rpc_forwarding', async_path, 'self._sync.request,', 'self._sync.notify,',
          lambda a: [r['forwarded_callable']['text'] for r in a['rpc'] if r['forwarded_callable']])
    probe('request_correlation', client, 'str(uuid.uuid4())', '"synthetic-id"',
          lambda a: [s['text'] for s in definition(a, 'openai_codex.client.CodexClient._request_raw')['body']['assignments']])
    probe('default_factory_declaration', client, 'field(default_factory=threading.Lock)', 'field(default_factory=dict)',
          lambda a: definition(a, 'openai_codex.client._ThreadStartLock')['fields'][0]['field_declarations'][0]['keywords'][0]['value']['text'])
    probe('notification_registry', 'sdk/python/src/openai_codex/generated/notification_registry.py', '"account/updated": AccountUpdatedNotification', '"account/changed": AccountUpdatedNotification',
          lambda a: [n['method'] for n in a['notification_registry']])
    probe('return_annotation', client, 'def default_codex_home() -> str:', 'def default_codex_home() -> bytes:',
          lambda a: definition(a, 'openai_codex.client.default_codex_home')['signature']['returns']['text'])
    fixture = 'class Sample:\n    def run(self, /, x: str = "é", *args, flag: bool, **kwargs) -> str:\n        return x\n'
    left = analyze({'sdk/python/src/openai_codex/synthetic.py': fixture})
    right = analyze({'sdk/python/src/openai_codex/synthetic.py': fixture + 'match selector:\n    case _: pass\n'})
    require(not left['modules'][0]['unknown_syntax'] and right['modules'][0]['unknown_syntax'][0]['kind'] == 'Match', 'unknown syntax not explicit')
    cases.append({'id': 'unknown_syntax', 'kind': 'INMEMORY_SOURCE_AST_MUTATION', 'result': 'PASS', 'derived_before': [],
                  'derived_after': ['Match:OPEN_UNRECOGNIZED_DECLARATION_SYNTAX']})
    params = left['definitions'][1]['signature']['parameters']
    require([p['kind'] for p in params] == ['positional_only', 'positional_or_keyword', 'var_positional', 'keyword_only', 'var_keyword'], 'parameter kinds')
    cases.append({'id': 'posonly_kwonly_varargs_unicode', 'result': 'PASS'})
    added = analyze({'sdk/python/src/openai_codex/synthetic.py': fixture.replace('class Sample:', 'class Sample:\n    @property\n    def extra(self): return "candidate"')})
    require(len(added['definitions'][0]['declared_members']) == len(left['definitions'][0]['declared_members']) + 1, 'class member dropped')
    cases.append({'id': 'added_public_class_member', 'kind': 'INMEMORY_SOURCE_AST_MUTATION', 'result': 'PASS', 'derived_before': ['run'], 'derived_after': ['extra', 'run']})
    malicious = 'import unimportable_sdk\n@never_execute()\nclass Model(BaseModel):\n    x: str = Field(default_factory=never_execute)\n'
    parsed = analyze({'sdk/python/src/openai_codex/synthetic.py': malicious})
    require(parsed['definitions'][0]['constructor'] == 'DERIVED_OR_LANGUAGE_DEFAULT_OPEN' and parsed['definitions'][0]['base_bindings'][0]['status'].startswith('OPEN'), 'runtime constructor or base invented')
    require(parsed['definitions'][0]['fields'][0]['field_declarations'][0]['keywords'][0]['value']['text'] == 'never_execute', 'factory declaration dropped')
    cases.append({'id': 'unevaluated_import_decorator_factory_inherited_base', 'result': 'PASS', 'runtime': 'NOT_RUN'})
    synthetic = {'sdk/python/src/openai_codex/synthetic.py': 'from .other import Alias\nValue = Alias | None\n',
                 'sdk/python/src/openai_codex/other.py': 'class Alias: pass\n'}
    graph = analyze(synthetic)
    value = next(d for d in graph['definitions'] if d['name'] == 'Value')
    require(value['type_references'][0]['targets'] == ['openai_codex.other.Alias'], 'transitive alias binding')
    cases.append({'id': 'transitive_type_import_join', 'result': 'PASS'})
    # Unicode checks use byte offsets, independently slicing the original UTF-8 bytes.
    validate_spans(left, {'sdk/python/src/openai_codex/synthetic.py': fixture})
    cases.append({'id': 'unicode_source_spans', 'result': 'PASS'})
    def negative(name, bad, good=inventory):
        try:
            assert_inventory(bad, good)
        except ValueError:
            cases.append({'id': name, 'kind': 'INMEMORY_ARTIFACT_NEGATIVE', 'result': 'PASS_REJECTED'})
            return
        raise ValueError('artifact negative accepted: ' + name)
    for key, value in [('receipt', {'fake': True}), ('functional_receipts', 1), ('contract_sha256', '0' * 64), ('owner_joins', []), ('rpc', [])]:
        bad = dict(inventory); bad[key] = value; negative('artifact_' + key, bad)
    small_files = {name: (name.encode(), 420) for name in FILES - {'manifest.json'}}
    m = make_manifest(small_files); manifest_validate(m, small_files)
    mutations = []
    x = copy.deepcopy(m); x['files'].append(x['files'][0]); mutations.append(('duplicate', x, small_files))
    x = copy.deepcopy(m); x['files'].pop(); mutations.append(('missing', x, small_files))
    x = copy.deepcopy(m); x['files'][0]['path'] = '../escape'; mutations.append(('traversal', x, small_files))
    x = copy.deepcopy(m); x['files'][0]['mode'] = 493; mutations.append(('mode', x, small_files))
    x = copy.deepcopy(m); x['files'][0]['sha256'] = '0' * 64; mutations.append(('hash', x, small_files))
    x = copy.deepcopy(m); x['excludes'].append('inventory.json'); mutations.append(('exclusion', x, small_files))
    x = copy.deepcopy(m); x['contract_sha256'] = '0' * 64; mutations.append(('contract', x, small_files))
    x = copy.deepcopy(m); x['files'][0]['bytes'] += 1; mutations.append(('size', x, small_files))
    x = dict(small_files); x['extra'] = (b'extra', 420); mutations.append(('extra', m, x))
    for name, bad_manifest, bad_files in mutations:
        try:
            manifest_validate(bad_manifest, bad_files)
        except ValueError:
            cases.append({'id': 'manifest_' + name, 'kind': 'INMEMORY_STRICT_MANIFEST_NEGATIVE', 'result': 'PASS_REJECTED'})
            continue
        raise ValueError('manifest negative accepted: ' + name)
    return {'task': 'DX100-G01:PYTHON-PUBLIC-SDK-CONTRACTS', 'contract_sha256': CHILD_SHA,
            'scope': 'reader source-only controls; no SDK runtime tests', 'cases': cases,
            'count': len(cases), 'functional_receipts': 0, 'independent_review': 'RESERVED_LEAD_NOT_RUN'}


def make_manifest(files):
    return {'schema_version': 1, 'task': 'DX100-G01:PYTHON-PUBLIC-SDK-CONTRACTS', 'parent_contract_sha256': PARENT_SHA,
            'contract_sha256': CHILD_SHA, 'excludes': ['manifest.json'],
            'files': [{'path': name, 'sha256': sha(data), 'bytes': len(data), 'mode': mode} for name, (data, mode) in sorted(files.items())]}


def own_links():
    count = 0
    for name in ('README.md', 'handoff.md'):
        text = (HERE / name).read_text(encoding='utf-8')
        for target in re.findall(r'\[[^\]]*\]\(([^)]+)\)', text):
            require('://' not in target and not target.startswith('#'), 'only local file links in lane docs')
            require((HERE / target.split('#')[0]).is_file(), 'broken link: ' + target)
            count += 1
    return count


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    for name in ('write', 'check', 'seal', 'self-test', 'links'):
        group.add_argument('--' + name, action='store_true')
    args = parser.parse_args()
    if args.links:
        print(json.dumps({'links': own_links(), 'exit': 0})); return
    texts, sources, baseline, preserved, ts = inputs()
    first = build(texts, sources, baseline, preserved, ts)
    second = build(texts, sources, baseline, preserved, ts)
    require(canonical(first) == canonical(second), 'nondeterministic double derivation')
    if args.write:
        for name, obj in [('inventory.json', first), ('schema.json', schema(first)), ('verification.json', semantic_tests(texts, first))]:
            (HERE / name).write_text(json.dumps(obj, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    elif args.seal:
        # Formatting and scoped link checks must precede this operation.
        own_links()
        assert_inventory(load(HERE / 'inventory.json'), first)
        require(load(HERE / 'schema.json') == schema(first), 'schema drift')
        require(load(HERE / 'verification.json') == semantic_tests(texts, first), 'verification drift')
        files = snapshot(); files.pop('manifest.json', None)
        require(set(files) == FILES - {'manifest.json'}, 'seal requires exact deliverables')
        manifest_text = json.dumps(make_manifest(files), indent=2)
        # Prettier prints this one-element scalar array inline. Keep the stdlib
        # sealer byte-compatible so the sealed manifest needs no later edits.
        manifest_text = manifest_text.replace('"excludes": [\n    "manifest.json"\n  ]', '"excludes": ["manifest.json"]')
        (HERE / 'manifest.json').write_text(manifest_text + '\n', encoding='utf-8')
    elif args.self_test:
        report = semantic_tests(texts, first)
        print(json.dumps({'cases': report['count'], 'results': [x['id'] + ':' + x['result'] for x in report['cases']], 'exit': 0})); return
    elif args.check:
        before = snapshot()
        require(set(before) == FILES, 'check requires sealed exact file set')
        assert_inventory(load(HERE / 'inventory.json'), first)
        require(load(HERE / 'schema.json') == schema(first), 'schema drift')
        require(load(HERE / 'verification.json') == semantic_tests(texts, first), 'verification drift')
        manifest_validate(load(HERE / 'manifest.json'), {k: v for k, v in before.items() if k != 'manifest.json'})
        own_links()
        require(snapshot() == before, '--check wrote lane files')
    print(json.dumps({'mode': vars(args), 'deterministic_double': True, 'counts': first['counts'], 'exit': 0}))


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, KeyError, SyntaxError, subprocess.CalledProcessError) as exc:
        print(json.dumps({'error': str(exc), 'exit': 1}), file=sys.stderr)
        sys.exit(1)
