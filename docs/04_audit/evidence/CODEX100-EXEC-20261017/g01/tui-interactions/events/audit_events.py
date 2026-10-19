#!/usr/bin/env python3
"""Offline source census. Never imports, expands, compiles, or executes target code."""
import argparse
import bisect
import collections
import copy
import hashlib
import json
import pathlib
import re
import subprocess
import sys

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[6]
EVIDENCE = HERE.parents[2]
UPSTREAM = pathlib.Path('/tmp/cvg-rea-codex-20261017/upstream')
PIN = '8d9f6466ff0294785d56f55b1fe363d132fe4133'
DECL = 'codex-rs/tui/src/app_event.rs'
TASK = 'DX100-G01:TUI-EVENT-SURFACES'
CONTRACT_SHA = 'df6cb7c69a018499ac365311f23ef7fe703922062f4bef34a84934dbf3458239'
PARENT_SHA = '710377abb6a48e79df476cc2dac089a12be702f3104e7d79cc3494d083074fb4'
EXPECTED_FILES = {'audit_events.py', 'inventory.json', 'verification.json',
                  'commands.json', 'README.md', 'HANDOFF.md', 'manifest.json'}
RAW_STRING = re.compile(rb'(?:br|cr|r)(\#{0,255})"')
CHAR_LITERAL = re.compile(rb"'(?:[\xc2-\xf4][\x80-\xbf]{1,3}|[^'\\\n]|\\(?:u\{[0-9a-fA-F_]+\}|x[0-9a-fA-F]{2}|.))'")
IDENTIFIER = re.compile(rb'(?:r#)?[A-Za-z_][A-Za-z_0-9]*')


def sha(data):
    return hashlib.sha256(data).hexdigest()


def encode(obj):
    return (json.dumps(obj, ensure_ascii=False, indent=2) + '\n').encode()


def git(*args, data=None):
    p = subprocess.run(['git', '-C', str(UPSTREAM), *args], input=data,
                       stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    if p.returncode:
        raise ValueError(f'git {args}: {p.returncode}: {p.stderr.decode()}')
    return p.stdout


class Source:
    def __init__(self, path, data):
        self.path, self.data = path, data
        data.decode('utf-8', errors='strict')
        self.lines = [-1] + [m.start() for m in re.finditer(b'\n', data)]
        self.tokens, self.skipped = lex(data)
        self.v = [x[0] for x in self.tokens]
        self.pairs = pairs(self.v)

    def span(self, a, b):
        assert 0 <= a <= b <= len(self.data)
        raw = self.data[a:b]
        return {'path': self.path, 'start_byte': a, 'end_byte': b,
                'start_line': bisect.bisect_left(self.lines, a),
                'end_line': bisect.bisect_left(self.lines, max(a, b - 1)),
                'sha256': sha(raw), 'text': raw.decode('utf-8')}

    def ts(self, a, b):
        assert b > a
        return self.span(self.tokens[a][1], self.tokens[b - 1][2])

    def text(self, a, b):
        return self.ts(a, b)['text']


def lex(data):
    """Byte lexer: comments/strings retained separately; lifetimes remain tokens."""
    out, skipped, i, n = [], [], 0, len(data)
    while i < n:
        a = i
        if data[i:i+1].isspace():
            i += 1
            continue
        if data.startswith(b'//', i):
            j = data.find(b'\n', i)
            i = n if j < 0 else j
            skipped.append(('comment', a, i))
            continue
        if data.startswith(b'/*', i):
            i += 2
            depth = 1
            while depth and i < n:
                if data.startswith(b'/*', i):
                    depth += 1
                    i += 2
                elif data.startswith(b'*/', i):
                    depth -= 1
                    i += 2
                else:
                    i += 1
            assert depth == 0, 'unterminated block comment'
            skipped.append(('comment', a, i))
            continue
        raw = RAW_STRING.match(data, i) if data[i] in b'rbc' else None
        if raw:
            end = b'"' + raw[1]
            j = data.find(end, raw.end())
            assert j >= 0, 'unterminated raw string'
            i = j + len(end)
            out.append(('<literal>', a, i))
            skipped.append(('literal', a, i))
            continue
        prefix = 1 if data[i:i+1] in (b'b', b'c') and data[i+1:i+2] in (b'"', b"'") else 0
        quote = data[i+prefix:i+prefix+1]
        if quote == b'"' or (quote == b"'" and CHAR_LITERAL.match(data, i+prefix)):
            i += prefix + 1
            while i < n:
                if data[i:i+1] == b'\\':
                    i += 2
                elif data[i:i+1] == quote:
                    i += 1
                    break
                else:
                    i += 1
            out.append(('<literal>', a, i))
            skipped.append(('literal', a, i))
            continue
        ident = IDENTIFIER.match(data, i)
        if ident:
            i = ident.end()
        elif data[i] >= 128:
            width = 2 if data[i] < 224 else 3 if data[i] < 240 else 4
            i += width
        else:
            i += 2 if data[i:i+2] in (b'::', b'=>', b'->', b'..', b'&&', b'||') else 1
        out.append((data[a:i].decode('utf-8'), a, i))
    return out, skipped


def pairs(v):
    stack, result = [], {}
    for i, x in enumerate(v):
        if x in ('(', '[', '{'):
            stack.append((x, i))
        elif x in (')', ']', '}'):
            assert stack, ('unpaired close', x, i)
            op, a = stack.pop()
            assert {'(': ')', '[': ']', '{': '}'}[op] == x
            result[a], result[i] = i, a
    assert not stack, stack[-3:]
    return result


def split_types(s, a, b):
    result, begin, angle, i = [], a, 0, a
    while i < b:
        x = s.v[i]
        if x in ('(', '[', '{'):
            i = s.pairs[i] + 1
            continue
        if x == '<':
            angle += 1
        elif x == '>':
            angle = max(0, angle - 1)
        elif x == ',' and angle == 0:
            if begin < i:
                result.append((begin, i))
            begin = i + 1
        i += 1
    if begin < b:
        result.append((begin, b))
    return result


def attrs(s, a, b):
    out = []
    while a + 1 < b and s.v[a] == '#' and s.v[a+1] == '[':
        z = s.pairs[a+1] + 1
        out.append(s.ts(a, z))
        a = z
    return a, out


def preceding_attrs(s, start):
    a = start
    while a > 1 and s.v[a-1] == ']':
        opening = s.pairs[a-1]
        if opening == 0 or s.v[opening-1] != '#':
            break
        a = opening-1
    return attrs(s, a, start)[1] if a < start else []


def documentation(s, before, start):
    return [s.span(a, b) for kind, a, b in s.skipped if kind == 'comment'
            and before <= a < b <= start and s.data[a:a+3] in (b'///', b'/**')]


def enum(s):
    k = next(i for i, x in enumerate(s.v) if x == 'enum' and s.v[i+1] == 'AppEvent')
    op = k + 2
    assert s.v[op] == '{'
    close = s.pairs[op]
    result = []
    previous_end = s.tokens[op][2]
    for order, (a, b) in enumerate(split_types(s, op+1, close)):
        j, attributes = attrs(s, a, b)
        name = s.v[j]
        assert re.fullmatch('[A-Z][A-Za-z0-9_]*', name), (name, s.text(a, b))
        shape = 'unit' if j+1 == b else {'(': 'tuple', '{': 'named'}.get(s.v[j+1])
        assert shape, s.text(a, b)
        fields = []
        if shape != 'unit':
            assert s.pairs[j+1] == b-1
            field_previous = s.tokens[j+1][2]
            for ordinal, (fa, fb) in enumerate(split_types(s, j+2, b-1)):
                fj, field_attrs = attrs(s, fa, fb)
                if shape == 'named':
                    assert s.v[fj+1] == ':', s.text(fa, fb)
                    fname, ta = s.v[fj], fj+2
                else:
                    fname, ta = None, fj
                fields.append({'ordinal': ordinal, 'name': fname,
                               'visibility': 'inherited enum visibility (no public field modifier)',
                               'attributes': field_attrs, 'type_source': s.ts(ta, fb),
                               'documentation': documentation(s, field_previous, s.tokens[fa][1]),
                               'source': s.ts(fa, fb)})
                field_previous = s.tokens[fb-1][2]
        result.append({'variant_id': 'AppEvent::'+name, 'name': name, 'ordinal': order,
                       'shape': shape, 'attributes': attributes,
                       'documentation': documentation(s, previous_end, s.tokens[a][1]),
                       'cfg': [x for x in attributes if x['text'].startswith('#[cfg')],
                       'availability_conditions': [x for x in attributes if x['text'].startswith('#[cfg(')],
                       'conditional_attributes': [x for x in attributes if x['text'].startswith('#[cfg_attr(')],
                       'fields': fields, 'source': s.ts(a, b),
                       'runtime_reachability': 'OPEN'})
        previous_end = s.tokens[b-1][2]
    decl_start = k-4 if s.v[k-4:k] == ['pub', '(', 'crate', ')'] else k
    return {'name': 'AppEvent', 'visibility': 'pub(crate)',
            'attributes': preceding_attrs(s, decl_start),
            'source': s.ts(decl_start, close+1),
            'variants': result}


def identity(path, start, kind):
    return kind+':'+path+':'+str(start)


def scopes(s):
    if hasattr(s, '_scopes'):
        return s._scopes
    functions, attributes = [], []
    v = s.v
    for i, x in enumerate(v):
        if x == 'fn' and i+2 < len(v) and re.fullmatch('[A-Za-z_][A-Za-z0-9_]*', v[i+1]):
            j = i+2
            while j < len(v) and v[j] not in ('{', ';'):
                j = s.pairs[j]+1 if v[j] in ('(', '[') else j+1
            if j < len(v) and v[j] == '{':
                z = s.pairs[j]
                functions.append({'id': identity(s.path, s.tokens[i][1], 'fn'),
                                  'name': v[i+1], 'range': (i, z+1), 'body_range': (j+1, z)})
        if x == '#' and i+1 < len(v) and v[i+1] == '[':
            z = s.pairs[i+1]+1
            j = z
            # Candidate attachment only, not Rust AST/CFG resolution.
            while j < len(v) and v[j] not in ('{', ';', ',', '}'):
                j = s.pairs[j]+1 if v[j] in ('(', '[') else j+1
            end = s.pairs[j]+1 if j < len(v) and v[j] == '{' else min(j+1, len(v))
            attributes.append({'id': identity(s.path, s.tokens[i][1], 'attr'),
                               'range': (i, end), 'source': s.ts(i, z)})
    s._scopes = functions, attributes
    return s._scopes


def imports(s, names):
    """Flatten Rust use trees for explicit enum/variant aliases; retain all globs."""
    result, known = [], {'AppEvent': ('enum', None)}
    v = s.v

    def tree(a, b, prefix):
        i, path = a, list(prefix)
        while i < b:
            if v[i] == '{':
                z = s.pairs[i]
                begin, j = i+1, i+1
                while j <= z:
                    if j == z or v[j] == ',':
                        if begin < j:
                            yield from tree(begin, j, path)
                        begin = j+1
                    elif v[j] == '{':
                        j = s.pairs[j]
                    j += 1
                return
            if v[i] == 'as':
                yield path, v[i+1]
                return
            if v[i] != '::':
                path.append(v[i])
            i += 1
        if path:
            yield path, path[-1]

    for i, x in enumerate(v):
        if x == 'use':
            j = i+1
            while j < len(v) and v[j] != ';':
                j += 1
            if j == len(v):
                continue
            for path, local in tree(i+1, j, []):
                if 'AppEvent' not in path and 'app_event' not in path and '*' not in path:
                    continue
                role = 'other_app_event_type_import'
                variant = None
                if path[-1] == 'AppEvent':
                    role = 'enum_alias' if local != 'AppEvent' else 'enum_import'
                    known[local] = ('enum', None)
                elif 'AppEvent' in path and path[-1] == '*':
                    role = 'variant_glob'
                    for name in names:
                        known[name] = ('variantGlobCandidate', name)
                elif 'AppEvent' in path and path[-1] in names:
                    variant = path[-1]
                    role = 'variant_alias' if local != variant else 'variant_import'
                    known[local] = ('variantAliasCandidate', variant)
                elif path[-1] == '*':
                    role = 'module_glob_OPEN'
                elif path[-1] == 'app_event' and local != 'app_event':
                    role = 'module_alias_OPEN'
                result.append({'import_id': identity(s.path, s.tokens[i][1], 'use')+':'+ '::'.join(path),
                               'path_segments': path, 'local_name': local, 'role': role,
                               'variant_id': 'AppEvent::'+variant if variant else None,
                               'source': s.ts(i, j+1), 'range': (i, j+1),
                               'resolution': 'lexical; module inheritance/reexports/shadowing OPEN'})
        if x == 'type' and i+3 < len(v):
            j = i+1
            while j < len(v) and v[j] not in (';', '{'):
                j += 1
            if j < len(v) and 'AppEvent' in v[i:j] and '=' in v[i:j]:
                local = v[i+1]
                known[local] = ('enum', None)
                result.append({'import_id': identity(s.path, s.tokens[i][1], 'typeAlias'),
                               'path_segments': [], 'local_name': local, 'role': 'type_alias_candidate',
                               'variant_id': None, 'source': s.ts(i, j+1), 'range': (i, j+1),
                               'resolution': 'lexical; not typechecked'})
    return result, known


def match_arms(s):
    result = []
    v = s.v
    for i, x in enumerate(v):
        if x != 'match':
            continue
        j = i+1
        while j < len(v) and v[j] not in ('{', ';'):
            j = s.pairs[j]+1 if v[j] in ('(', '[') else j+1
        if j >= len(v) or v[j] != '{':
            continue
        z, a = s.pairs[j], j+1
        while a < z:
            k = a
            while k < z and v[k] != '=>':
                k = s.pairs[k]+1 if v[k] in ('(', '[', '{') else k+1
            if k >= z:
                break
            body = k+1
            if body >= z:
                break
            if v[body] == '{':
                end = s.pairs[body]+1
            else:
                end = body
                while end < z and v[end] != ',':
                    end = s.pairs[end]+1 if v[end] in ('(', '[', '{') else end+1
            if end > body:
                result.append({'range': (a, end), 'pattern_range': (a, k),
                               'body_range': (body, end), 'match_range': (i, z+1),
                               'scrutinee_range': (i+1, j)})
            a = end+1 if end < z and v[end] == ',' else end
    return result


def calls(s, a, b):
    result = []
    for i in range(a, b-3):
        if s.v[i] == 'self' and s.v[i+1] == '.' and s.v[i+3] == '(':
            result.append({'symbol': 'self.'+s.v[i+2], 'source': s.ts(i, i+3),
                           'dispatch': 'callCandidate; receiver/type/target/async reachability OPEN'})
    return result


def scan(s, names):
    funcs, at = scopes(s)
    imp, known = imports(s, names)
    arms = match_arms(s)
    refs, used_functions, used_attrs, used_arms = [], {}, {}, {}
    type_mentions, unresolved = [], []
    v = s.v

    def fn_at(i):
        fs = [f for f in funcs if f['range'][0] <= i < f['range'][1]]
        return min(fs, key=lambda f: f['range'][1]-f['range'][0]) if fs else None

    def context(i):
        f = fn_at(i)
        if f:
            used_functions[f['id']] = {'function_id': f['id'], 'name': f['name'],
                                       'source': s.ts(*f['range']),
                                       'signature': s.ts(f['range'][0], f['body_range'][0]),
                                       'lexical_attribute_sources': [x['source'] for x in at
                                           if x['range'][0] <= f['range'][0] < x['range'][1]],
                                       'calls': calls(s, *f['body_range'])}
        aa = [x for x in at if x['range'][0] <= i < x['range'][1]]
        for x in aa:
            used_attrs[x['id']] = {'attribute_id': x['id'], 'source': x['source'],
                                   'attachment': 'lexical item/block candidate, not evaluated'}
        test = [x['id'] for x in aa if re.search(r'\btest\b', x['source']['text'])]
        return {'function_id': f['id'] if f else None,
                'attribute_ids': [x['id'] for x in aa], 'test_attribute_evidence_ids': test,
                'path_name_test_hint': bool(re.search(r'(^|/|_)tests?([/_.]|$)', s.path)),
                'module_cfg_reachability': 'OPEN; join Lead module census by source_path; no filename exclusion'}

    def consumer(arm):
        a, b = arm['range']
        aid = identity(s.path, s.tokens[a][1], 'arm')
        if aid not in used_arms:
            p, q = arm['pattern_range']
            body_a, body_b = arm['body_range']
            used_arms[aid] = {'consumer_id': aid, 'kind': 'matchArmConsumerCandidate',
                              'source': s.ts(a, b), 'pattern': s.ts(p, q),
                              'body': s.ts(body_a, body_b),
                              'scrutinee': s.ts(*arm['scrutinee_range']),
                              'calls': calls(s, body_a, body_b),
                              'wildcard_or_binding': not any(x in names for x in v[p:q]),
                              'noop_body_candidate': s.text(body_a, body_b) in ('{}', '{ }', '()'),
                              'context': context(a), 'runtime_reachability': 'OPEN'}
        return aid

    # Matches! is a pattern consumer, not a construction or runtime observation.
    patterns = []
    for i in range(len(v)-3):
        if v[i] == 'matches' and v[i+1] == '!' and v[i+2] in ('(', '{', '['):
            z = s.pairs[i+2]
            j = i+3
            while j < z and v[j] != ',':
                j = s.pairs[j]+1 if v[j] in ('(', '[', '{') else j+1
            if j < z:
                patterns.append((j+1, z, i, z+1))
    for i, x in enumerate(v):
        name, notation, end = None, None, i+1
        if x in known and known[x][0] == 'enum' and v[i+1:i+2] == ['::'] and i+2 < len(v):
            name, notation, end = v[i+2], 'qualified' if x == 'AppEvent' else 'enumAliasCandidate', i+3
        elif x in known and known[x][0] != 'enum' and (i == 0 or v[i-1] != '::'):
            name, notation = known[x][1], known[x][0]
        if x == 'AppEvent':
            if v[i+1:i+2] != ['::']:
                type_mentions.append({'mention_id': identity(s.path, s.tokens[i][1], 'type'),
                                      'source': s.ts(i, i+1), 'context': context(i),
                                      'classification': 'declarationOrTypeReference; generic forwarding OPEN'})
            elif name not in names:
                unresolved.append({'source': s.ts(i, min(len(v), i+3)),
                                   'disposition': 'OPEN_NONVARIANT_QUALIFIED_APP_EVENT', 'context': context(i)})
        if name not in names:
            continue
        in_import = any(a['range'][0] <= i < a['range'][1] for a in imp)
        classification = 'importReference' if in_import else 'lexicalReference'
        consumer_ids = []
        for arm in arms:
            a, b = arm['pattern_range']
            if a <= i < b:
                classification = 'consumerCandidate'
                consumer_ids.append(consumer(arm))
        for a, b, p, q in patterns:
            if a <= i < b:
                classification = 'consumerCandidate'
                cid = identity(s.path, s.tokens[p][1], 'matches')
                used_arms[cid] = {'consumer_id': cid, 'kind': 'matchesMacroPatternCandidate',
                                  'source': s.ts(p, q), 'pattern': s.ts(a, b),
                                  'body': None, 'calls': [], 'wildcard_or_binding': False,
                                  'context': context(p), 'runtime_reachability': 'OPEN'}
                consumer_ids.append(cid)
        # let/if-let destructuring must not be counted as a producer.
        previous = v[max(0, i-6):i]
        if classification == 'lexicalReference' and 'let' in previous:
            j = end
            if j < len(v) and v[j] in ('{', '('):
                j = s.pairs[j]+1
            if j < len(v) and v[j] == '=':
                classification = 'destructureConsumerCandidate'
        if classification == 'lexicalReference' and end < len(v) and v[end] in ('(', '{'):
            classification = 'constructionOrCallCandidate'
        if classification == 'lexicalReference' and end < len(v) and v[end] in (',', ')', '}', ';'):
            classification = 'unitValueOrPatternCandidate'
        # Preserve enclosing macro ambiguity even for construction-looking tokens.
        macros = []
        for j in range(max(0, i-200), i):
            if v[j] == '!' and j+1 < i and v[j+1] in ('(', '[', '{') and s.pairs[j+1] > i:
                macros.append(v[j-1])
        statement_a = max(0, i-18)
        statement_b = min(len(v), end+32)
        refs.append({'reference_id': identity(s.path, s.tokens[i][1], 'ref'),
                     'variant_id': 'AppEvent::'+name, 'source_path': s.path,
                     'notation': notation, 'classification': classification,
                     'source': s.ts(i, end), 'local_context': s.ts(statement_a, statement_b),
                     'consumer_ids': consumer_ids, 'context': context(i),
                     'enclosing_macro_candidates': macros, 'runtime_reachability': 'OPEN'})
    # Retain generic/wildcard sibling arms in every event-bearing match, not just named arms.
    event_matches = {arm['match_range'] for arm in arms
                     if identity(s.path, s.tokens[arm['range'][0]][1], 'arm') in used_arms}
    for arm in arms:
        if arm['match_range'] in event_matches:
            consumer(arm)
    # Generic typed event functions are source evidence even without a named variant reference.
    for f in funcs:
        a, b = f['range']
        if 'AppEvent' in v[a:f['body_range'][0]]:
            context(a)
    return {'references': refs, 'imports': [{k: val for k, val in a.items() if k != 'range'} for a in imp],
            'functions': list(used_functions.values()), 'attributes': list(used_attrs.values()),
            'consumers': list(used_arms.values()), 'type_mentions': type_mentions,
            'unresolved_qualified': unresolved}


def load_sources():
    assert git('rev-parse', 'HEAD').decode().strip() == PIN, 'HEAD pin drift'
    listing = git('ls-tree', '-r', '-z', PIN, '--', 'codex-rs/tui/src/')
    rows = []
    for row in listing.split(b'\0'):
        if not row:
            continue
        meta, path = row.split(b'\t', 1)
        mode, kind, oid = meta.decode().split()
        path = path.decode()
        if path.endswith('.rs'):
            assert kind == 'blob' and mode in ('100644', '100755')
            rows.append((path, oid))
    rows.sort()
    recon = json.loads((EVIDENCE/'next-tui-interactions-recon.json').read_bytes())
    assert [p for p, oid in rows] == sorted(recon['all_tui_rs_paths'])
    assert len(rows) == 1131
    raw = git('cat-file', '--batch', data=('\n'.join(oid for p, oid in rows)+'\n').encode())
    offset, result, files = 0, {}, []
    for path, oid in rows:
        nl = raw.index(b'\n', offset)
        returned_oid, kind, size = raw[offset:nl].decode().split()
        assert returned_oid == oid and kind == 'blob'
        size = int(size)
        data = raw[nl+1:nl+1+size]
        assert hashlib.sha1(b'blob '+str(size).encode()+b'\0'+data).hexdigest() == oid
        actual = (UPSTREAM/path).read_bytes()
        assert actual == data, 'worktree drift '+path
        result[path] = data
        files.append({'source_path': path, 'git_blob_oid': oid, 'sha256': sha(data), 'bytes': size})
        offset = nl+size+2
    assert offset == len(raw)
    return result, files, recon


def build():
    contract = HERE.parent/'events-contract.json'
    parent = HERE.parent/'contract.json'
    assert sha(contract.read_bytes()) == CONTRACT_SHA
    assert sha(parent.read_bytes()) == PARENT_SHA
    inputs = []
    for row in json.loads(parent.read_bytes())['inputs']:
        p = EVIDENCE/row['path']
        assert sha(p.read_bytes()) == row['sha256'], 'contract input drift '+str(p)
        inputs.append(row)
    catalog_path = ROOT/'docs/03_build/tracking/codex100_catalog_v1.json'
    catalog_bytes = catalog_path.read_bytes()
    catalog = json.loads(catalog_bytes)
    assert catalog['functional_denominator'] == 487 and catalog['mandatory_cvg_controls'] == 22
    data, files, recon = load_sources()
    declaration = enum(Source(DECL, data[DECL]))
    variants = declaration['variants']
    assert len(variants) == 291 and len({v['name'] for v in variants}) == 291
    seed = next(x for x in recon['seed_enums'] if x['name'] == 'AppEvent')
    assert [x['name'] for x in variants] == [x['name'] for x in seed['variants']]
    names = {x['name'] for x in variants}
    out = {k: [] for k in ('references', 'imports', 'functions', 'attributes', 'consumers',
                          'type_mentions', 'unresolved_qualified')}
    app_definitions = []
    for path in sorted(data):
        s = Source(path, data[path])
        rows = scan(s, names)
        for k in out:
            out[k].extend(rows[k])
        if path == 'codex-rs/tui/src/app.rs' or path.startswith('codex-rs/tui/src/app/'):
            for f in scopes(s)[0]:
                app_definitions.append((s, f))
    for k, id_key in [('references', 'reference_id'), ('imports', 'import_id'), ('functions', 'function_id'),
                      ('attributes', 'attribute_id'), ('consumers', 'consumer_id')]:
        out[k].sort(key=lambda x: x[id_key])
        assert len({x[id_key] for x in out[k]}) == len(out[k]), k
    # Bind direct self.method calls in App arms to named source definitions in App modules.
    # This deliberately retains duplicate/test definitions as candidates, never resolves types.
    needed_names = {call['symbol'].split('.')[1] for c in out['consumers']
                    if c['source']['path'] == 'codex-rs/tui/src/app/event_dispatch.rs'
                    for call in c['calls']}
    # App has impl blocks outside app/, e.g. app_backtrack. Do not drop them by path.
    for path in sorted(data):
        if path == 'codex-rs/tui/src/app.rs' or path.startswith('codex-rs/tui/src/app/'):
            continue
        if not needed_names.intersection(x.decode() for x in re.findall(rb'\bfn\s+([A-Za-z_][A-Za-z0-9_]*)', data[path])):
            continue
        s = Source(path, data[path])
        for f in scopes(s)[0]:
            if f['name'] in needed_names:
                app_definitions.append((s, f))
    definitions_by_name = collections.defaultdict(list)
    for s, f in app_definitions:
        if f['name'] in needed_names:
            definitions_by_name[f['name']].append(f['id'])
            if not any(row['function_id'] == f['id'] for row in out['functions']):
                out['functions'].append({'function_id': f['id'], 'name': f['name'],
                                         'source': s.ts(*f['range']),
                                         'signature': s.ts(f['range'][0], f['body_range'][0]),
                                         'calls': calls(s, *f['body_range']),
                                         'lexical_attribute_sources': [x['source'] for x in scopes(s)[1]
                                             if x['range'][0] <= f['range'][0] < x['range'][1]],
                                         'definition_role': 'direct App consumer helper definition candidate'})
    out['functions'].sort(key=lambda x: x['function_id'])
    for c in out['consumers']:
        if c['source']['path'] == 'codex-rs/tui/src/app/event_dispatch.rs':
            for call in c['calls']:
                call['definition_candidate_ids'] = definitions_by_name[call['symbol'].split('.')[1]]
                call['definition_resolution'] = 'LEXICAL_NAME_CANDIDATES_NOT_TYPECHECKED' if call['definition_candidate_ids'] else 'OPEN_NO_NAMED_APP_DEFINITION'
    for variant in variants:
        rs = [r for r in out['references'] if r['variant_id'] == variant['variant_id']]
        variant['reference_ids'] = [r['reference_id'] for r in rs]
        variant['producer_candidate_ids'] = [r['reference_id'] for r in rs if r['classification'] in
                                             ('constructionOrCallCandidate', 'unitValueOrPatternCandidate')]
        variant['consumer_candidate_ids'] = sorted({cid for r in rs for cid in r['consumer_ids']})
        variant['central_dispatch_consumer_ids'] = [cid for cid in variant['consumer_candidate_ids']
                                                   if cid.startswith('arm:codex-rs/tui/src/app/event_dispatch.rs:')]
        variant['source_disposition'] = 'NAMED_SOURCE_REFS_RETAINED' if rs else 'OPEN_NO_NAMED_REFS_IN_BOUNDARY'
        variant['producer_disposition'] = 'CANDIDATES_ONLY' if variant['producer_candidate_ids'] else 'OPEN_NO_CLASSIFIED_PRODUCER'
        variant['consumer_disposition'] = 'CANDIDATES_ONLY' if variant['consumer_candidate_ids'] else 'OPEN_NO_NAMED_CONSUMER'
        variant['join'] = {'source_symbol': variant['variant_id'], 'source_path': DECL,
                           'module_census_join': DECL, 'command_view_owner_join': 'OPEN_LEAD_JOIN',
                           'future_variant_family': 'DX100-G01:TUI-EVENT:'+variant['name'],
                           'future_qualification': 'NOT_RUN', 'catalog_mutation': False}
    counts = {k: len(v) for k, v in out.items()}
    counts.update({'variants': len(variants), 'rust_paths_scanned': len(files),
                   'fields': sum(len(x['fields']) for x in variants),
                   'cfg_variants': sum(bool(x['cfg']) for x in variants),
                   'availability_cfg_variants': sum(bool(x['availability_conditions']) for x in variants),
                   'cfg_attr_variants': sum(bool(x['conditional_attributes']) for x in variants),
                   'shapes': dict(sorted(collections.Counter(x['shape'] for x in variants).items())),
                   'reference_classifications': dict(sorted(collections.Counter(x['classification'] for x in out['references']).items())),
                   'import_roles': dict(sorted(collections.Counter(x['role'] for x in out['imports']).items())),
                   'variants_without_named_consumers': sum(not x['consumer_candidate_ids'] for x in variants),
                   'variants_without_producer_candidates': sum(not x['producer_candidate_ids'] for x in variants),
                   'generic_wildcard_arms': sum(x.get('wildcard_or_binding', False) for x in out['consumers']),
                   'refs_with_test_attribute_evidence': sum(bool(x['context']['test_attribute_evidence_ids']) for x in out['references'])})
    counts['central_dispatch_named_variants'] = sum(bool(x['central_dispatch_consumer_ids']) for x in variants)
    counts['central_dispatch_direct_call_names'] = len(needed_names)
    counts['central_dispatch_helper_definitions'] = sum(len(v) for v in definitions_by_name.values())
    counts['central_dispatch_call_names_without_definition'] = len(needed_names-set(k for k,v in definitions_by_name.items() if v))
    return {'schema_version': 'cvg.tui.events.v1', 'task': TASK, 'status': 'IMPLEMENTED',
            'pin': PIN, 'contract_sha256': CONTRACT_SHA, 'parent_contract_sha256': PARENT_SHA,
            'inputs': inputs, 'catalog_readonly': {'path': str(catalog_path.relative_to(ROOT)),
            'sha256': sha(catalog_bytes), 'functional': 487, 'cvg_controls': 22,
            'qualification_status': 'NOT_RUN', 'numerator_pass_current': 0},
            'functional_receipts': 0, 'full_g01_closure': False, 'independent_approval': False,
            'native_full_goal': 'MANDATORY_OPEN; no scope reduction',
            'mandatory_open': ['6 SDK gaps', '5 external runtime/dependency limits', 'G02', 'G03', 'G04'],
            'counts': counts, 'sources': files, 'enum': declaration, **out,
            'limitations': [
                'Lexical source references/declarations/consumerCandidate/callCandidate are not runtime reachability.',
                'Module graph, inherited cfg/test status, Rust name/type resolution, shadowing, reexports and effective availability OPEN; join Lead census.',
                'No Cargo execution, compilation, macro expansion, target imports/execution, cfg evaluation, terminal control, network or functional qualification.',
                'Unqualified enum variants only follow explicit AppEvent variant imports/globs; arbitrary alias chains and module globs remain OPEN.',
                'Byte lexer/match parser is bounded source analysis, not full Rust AST. let patterns, macros, function pointers, dynamic/generic dispatch remain candidates.',
                'Match bodies/calls are retained including noops/wildcards. Named consumer evidence is not a production receipt.',
                'Function/body cfg source attachment is lexical; attributes on external module declarations are Lead-join OPEN.',
                'Path or symbol test names are hints only; all tracked Rust source retained, including test/support sources.',
                'Cross-command/view/owner/requirement joins deferred to Lead; event IDs and source paths stable, catalog unchanged.'
            ]}


def all_spans(obj):
    if isinstance(obj, dict):
        if {'path', 'start_byte', 'end_byte', 'sha256', 'text'} <= obj.keys():
            yield obj
        for v in obj.values():
            yield from all_spans(v)
    elif isinstance(obj, list):
        for v in obj:
            yield from all_spans(v)


def validate(document, expected):
    assert document == expected, 'semantic source-derived inventory mismatch'
    # Equality is deliberately exhaustive: no unknown/limitation/alias may be omitted.
    source_data = {row['source_path']: (UPSTREAM/row['source_path']).read_bytes() for row in document['sources']}
    for row in document['sources']:
        assert sha(source_data[row['source_path']]) == row['sha256']
    count = 0
    for span in all_spans(document):
        data = source_data[span['path']]
        raw = data[span['start_byte']:span['end_byte']]
        assert raw.decode() == span['text'] and sha(raw) == span['sha256']
        assert span['start_line'] == data[:span['start_byte']].count(b'\n')+1
        assert span['end_line'] == data[:max(span['start_byte'],span['end_byte']-1)].count(b'\n')+1
        count += 1
    return count


def snapshot():
    return {p.name: (sha(p.read_bytes()), p.stat().st_mtime_ns, p.stat().st_size)
            for p in HERE.iterdir() if p.is_file()}


def validate_manifest(manifest, file_metadata):
    assert set(file_metadata) == EXPECTED_FILES, ('strict manifest file set', set(file_metadata) ^ EXPECTED_FILES)
    assert set(manifest['files']) == EXPECTED_FILES-{'manifest.json'}
    assert manifest['contract_sha256'] == CONTRACT_SHA and manifest['parent_contract_sha256'] == PARENT_SHA
    for name, row in manifest['files'].items():
        assert file_metadata[name] == row, name


def check_manifest():
    mp = HERE/'manifest.json'
    assert mp.is_file(), 'strict manifest missing; run --verify and --links before --seal'
    manifest = json.loads(mp.read_bytes())
    metadata = {}
    for p in HERE.iterdir():
        assert p.is_file() and not p.is_symlink()
        metadata[p.name] = {'sha256': sha(p.read_bytes()), 'bytes': p.stat().st_size}
    validate_manifest(manifest, metadata)
    return sha(mp.read_bytes())


def manifest_negatives():
    files = {name: {'sha256': sha(name.encode()), 'bytes': len(name)} for name in EXPECTED_FILES}
    baseline = {'files': {k:v for k,v in files.items() if k != 'manifest.json'},
                'contract_sha256': CONTRACT_SHA, 'parent_contract_sha256': PARENT_SHA}
    validate_manifest(baseline, files)
    results = []
    for name in ('missing_artifact', 'undeclared_artifact', 'wrong_digest', 'wrong_contract', 'wrong_parent_contract'):
        manifest, metadata = copy.deepcopy(baseline), copy.deepcopy(files)
        if name == 'missing_artifact':
            metadata.pop('inventory.json')
        elif name == 'undeclared_artifact':
            metadata['unknown.txt'] = {'sha256': '0'*64, 'bytes': 0}
        elif name == 'wrong_digest':
            metadata['README.md']['sha256'] = '0'*64
        elif name == 'wrong_contract':
            manifest['contract_sha256'] = '0'*64
        else:
            manifest['parent_contract_sha256'] = '0'*64
        try:
            validate_manifest(manifest, metadata)
        except AssertionError:
            results.append({'case': name, 'result': 'REJECTED'})
        else:
            raise AssertionError('strict manifest negative accepted '+name)
    return results


def synthetic_checks():
    fixture = b'''// AppEvent::Fake\nconst S: &str = r###"AppEvent::Fake"###;\n/* nested /* AppEvent::Fake */ x */
const CONT: &str = "a\\
{ AppEvent::Fake }"; const C: char = '\\u{1f600}';
const B: &[u8] = br#"AppEvent::Fake"#; const CS: &CStr = cr#"AppEvent::Fake"#;
fn r#match() { let _ = '\xc3\xa9'; }
#[derive(Debug)] pub(crate) enum AppEvent {
 #[cfg(unix)] Unit, Tuple(Vec<Result<u8, String>>, Option<&'static str>),
 Named { #[cfg(test)] field: Option<Vec<u8>>, other: (String, usize) },
}
use crate::app_event::AppEvent as AE;
use crate::app_event::AppEvent::{Unit as Alias, Named};
use crate::app_event::AppEvent::*;
type Other = AppEvent;
#[cfg(test)] fn consume(e: AppEvent) { match e { AE::Tuple(a,b) => sink(a), Named {field,..} => {}, _ => {} } }
fn produce() { let x = AE::Tuple(vec![], None); send(Alias); matches!(x, Other::Unit); }
'''
    s = Source('fixture.rs', fixture)
    d = enum(s)
    assert [x['name'] for x in d['variants']] == ['Unit', 'Tuple', 'Named']
    assert [len(x['fields']) for x in d['variants']] == [0, 2, 2]
    assert d['variants'][0]['cfg'] and d['variants'][2]['fields'][0]['attributes']
    r = scan(s, {'Unit', 'Tuple', 'Named'})
    roles = {x['role'] for x in r['imports']}
    assert {'enum_alias', 'variant_alias', 'variant_glob', 'type_alias_candidate'} <= roles
    assert any(x['notation'] == 'enumAliasCandidate' and x['classification'] == 'consumerCandidate' for x in r['references'])
    assert any(x['notation'] == 'variantAliasCandidate' for x in r['references'])
    assert any(x['context']['test_attribute_evidence_ids'] for x in r['references'])
    assert all('Fake' not in x['variant_id'] for x in r['references'])
    assert not s.v.count('Fake')
    # Mutation controls run on in-memory source, never on target files.
    mutations = {'alias_removed': fixture.replace(b'AppEvent as AE', b'AppEvent as Renamed'),
                 'glob_removed': fixture.replace(b'AppEvent::*', b'Unrelated::*'),
                 'consumer_removed': fixture.replace(b'AE::Tuple(a,b) => sink(a),', b''),
                 'cfg_removed': fixture.replace(b'#[cfg(test)]', b''),
                 'payload_changed': fixture.replace(b'Option<Vec<u8>>', b'Option<Vec<u16>>')}
    for name, changed in mutations.items():
        mutated = Source('fixture.rs', changed)
        assert (enum(mutated), scan(mutated, {'Unit', 'Tuple', 'Named'})) != (d, r), name
    return ['nested comments/raw strings do not create references', 'enum named/tuple/generic/lifetime payloads',
            'enum/type/variant alias and explicit glob candidates', 'test/cfg attributes retained',
            'qualified/alias match consumers and wildcard siblings retained',
            'backslash-newline strings, Unicode char escapes, raw byte/C strings, raw identifiers',
            'in-memory source mutations rejected: '+', '.join(sorted(mutations))]


def verify():
    before = snapshot()
    first = build()
    second = build()
    assert encode(first) == encode(second)
    actual = json.loads((HERE/'inventory.json').read_bytes())
    spans = validate(actual, first)
    negatives = []
    mutations = {
        'omit_variant': lambda d: d['enum']['variants'].pop(),
        'payload_type': lambda d: d['enum']['variants'][0]['fields'][0]['type_source'].update(text='bool'),
        'alias_import_omission': lambda d: d['imports'].pop(),
        'consumer_omission': lambda d: d['consumers'].pop(),
        'cfg_omission': lambda d: next(v for v in d['enum']['variants'] if v['cfg'])['cfg'].clear(),
        'false_runtime_claim': lambda d: d.update(functional_receipts=1, full_g01_closure=True),
        'reference_classification': lambda d: d['references'][0].update(classification='runtime_reachable'),
        'unknowns_erased': lambda d: d['limitations'].clear(),
        'enum_order': lambda d: d['enum']['variants'].reverse(),
        'source_span_digest': lambda d: d['enum']['source'].update(sha256='0'*64),
        'fake_owner': lambda d: d['enum']['variants'][0]['join'].update(command_view_owner_join='QUALIFIED'),
        'test_exclusion': lambda d: d['references'].pop(next(i for i,r in enumerate(d['references']) if r['context']['test_attribute_evidence_ids'])),
        'catalog_false_pass': lambda d: d['catalog_readonly'].update(numerator_pass_current=1),
    }
    for name, mutate in mutations.items():
        bad = copy.deepcopy(first)
        mutate(bad)
        try:
            validate(bad, first)
        except AssertionError:
            negatives.append({'case': name, 'result': 'REJECTED'})
        else:
            raise AssertionError('negative accepted '+name)
    fixtures = synthetic_checks()
    strict_negatives = manifest_negatives()
    after = snapshot()
    assert before == after, 'read-only probe changed package'
    return {'status': 'IMPLEMENTED', 'independent_approval': False, 'task': TASK,
            'contract_sha256': CONTRACT_SHA, 'parent_contract_sha256': PARENT_SHA,
            'inventory_sha256': sha(encode(first)), 'deterministic_builds': 2,
            'exact_utf8_span_occurrences_checked': spans, 'counts': first['counts'],
            'artifact_mutation_negatives': negatives, 'synthetic_reader_checks': fixtures,
            'strict_manifest_negatives': strict_negatives,
            'read_only_probe': {'result': 'UNCHANGED', 'scope': 'own file bytes/mtime/size; Git/target bytes read-only validated'},
            'commands': 'commands.json records actual commands, exit codes and stdout/stderr; no target command used',
            'functional_receipts': 0, 'full_g01_closure': False,
            'remaining': first['limitations'] + first['mandatory_open']}


def links():
    checked = []
    for name in ('README.md', 'HANDOFF.md'):
        text = (HERE/name).read_text()
        for link in re.findall(r'\[[^\]]+\]\(([^)]+)\)', text):
            assert not re.match(r'\w+://', link), 'only local owned links expected'
            p = (HERE/link.split('#')[0]).resolve()
            assert p.is_file(), (name, link)
            checked.append({'from': name, 'to': link})
    assert checked
    return checked


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('mode', choices=['--build', '--check', '--verify', '--seal', '--links'])
    # Accept conventional --check without treating it as an argparse option.
    mode = sys.argv[1] if len(sys.argv) == 2 else None
    assert mode in ('--build', '--check', '--verify', '--seal', '--links')
    if mode == '--build':
        (HERE/'inventory.json').write_bytes(encode(build()))
        print('IMPLEMENTED inventory written')
    elif mode == '--verify':
        result = verify()
        (HERE/'verification.json').write_bytes(encode(result))
        print(json.dumps({k:result[k] for k in ('status', 'inventory_sha256', 'deterministic_builds', 'exact_utf8_span_occurrences_checked')}))
    elif mode == '--links':
        print(json.dumps({'links': links(), 'status': 'PASS_OWN_LINKS'}))
    elif mode == '--seal':
        assert {p.name for p in HERE.iterdir()} <= EXPECTED_FILES
        assert {p.name for p in HERE.iterdir()} >= EXPECTED_FILES-{'manifest.json'}
        result = {'schema_version': 'cvg.strict.manifest.v1', 'task': TASK,
                  'contract_sha256': CONTRACT_SHA, 'parent_contract_sha256': PARENT_SHA,
                  'self_hash': 'external final command; manifest excludes itself',
                  'files': {p.name: {'sha256': sha(p.read_bytes()), 'bytes': p.stat().st_size}
                            for p in sorted(HERE.iterdir()) if p.name != 'manifest.json'}}
        (HERE/'manifest.json').write_bytes(encode(result))
        print('strict_manifest_sha256='+check_manifest())
    else:
        before = snapshot()
        document = json.loads((HERE/'inventory.json').read_bytes())
        report = verify()
        assert (HERE/'verification.json').read_bytes() == encode(report), 'verification regeneration mismatch'
        spans = report['exact_utf8_span_occurrences_checked']
        manifest_sha = check_manifest()
        assert snapshot() == before
        print(json.dumps({'status': 'PASS_SOURCE_ONLY', 'counts': document['counts'],
                          'exact_span_occurrences': spans, 'manifest_sha256': manifest_sha,
                          'contract_sha256': CONTRACT_SHA, 'functional_receipts': 0,
                          'independent_approval': False}))


if __name__ == '__main__':
    main()
