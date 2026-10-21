"""SPEC0246 measurement on the real root (diagnostic, offline over the v5 tag copy dump and report): proofs a
proof-by-scope rule would emit. Attribution: a tuple on an analysed module belongs to it; on the target of a
contained edge, to each importer (and the target); on node_modules/<pkg>/package.json, to the package; any other
tuple (file '' or root configuration) is global and blocks every proof. A module is proven (K5) when no global
tuple exists, no violation exists, the phases body/postBody/revalidation are COMPLETED, and no tuple and no native
grammar failure is attributed to any file, contained target or package of its closure (resolution edges plus
contained targets, transitively). An edge proof is a proven importer with at least one resolution edge. K7 needs the
origin's module proven (installed origins: every reached entry of the package proven). Scenarios add, one by one,
what each T3 premise would remove: R (root resolution config tuples not global), K0 (pure K0 parameter reads),
NEW (refused `new` of an ECMAScript intrinsic constructor; Promise, Proxy and host objects excluded). Removal is only of
the tuples themselves (gross, in tuples); consequences stay, so the net effect is unknown (lower bound of proofs).
R2/R3: attribution is a union (every owner); a module whose closure contains a resolution cycle (non-trivial SCC or
self-loop) gets no proof; installed[] stays under the global PROVEN rule and installed origins are never resolved by
scope (installedProven is always 0 here).
usage: scope.py <report-label>"""
import gzip, json, sys
from collections import Counter, defaultdict
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

label = sys.argv[1]
rep = json.loads(gzip.decompress((EV / ('real-' + label + '-normal-report.json.gz')).read_bytes()))
dump = json.loads(gzip.decompress((EV / ('diag-' + label + '-normal.json.gz')).read_bytes()))
S = rep['semanticBoundary']
root = dump['root'] + '/'
rel = lambda p: p[len(root):] if p.startswith(root) else p
files = {rel(f) for f in dump['files']}
E = defaultdict(set)
for k, v in dump['edges'].items():
    E[rel(k)] |= {rel(x) for x in v}
contained_importers = defaultdict(set)
for frm, target, reason, spec in dump['contained']:
    frm, target = rel(frm), rel(target)
    if target:
        E[frm].add(target)
        contained_importers[target].add(frm)
    else:
        contained_importers['<edge-of>' + frm].add(frm)
tags = {}
for k, v in dump['tags']:
    i = json.loads(k); tags[(i['file'] or '', i['reason'], i['detail'] or '')] = set(v)
grammar_bad = {rel(f) for f, g in dump['grammar'].items() if g != 'OK'}
def pkg_of(f):
    if 'node_modules/' not in f:
        return None
    i = f.rindex('node_modules/') + len('node_modules/')
    rest = f[i:].split('/')
    return f[:i] + '/'.join(rest[:2] if rest[0].startswith('@') else rest[:1])
ROOTCFG = {'package.json', 'package-lock.json', 'tsconfig.json', 'tsconfig.base.json'}
U = S['unknowns']
key = lambda u: (u.get('file') or '', u['reason'], u.get('detail') or '')
def owners_of(u, relax_root):
    # Union attribution (§3.1): every owner that applies; global only when none applies.
    f = u.get('file') or ''
    if not f: return [('global', None)]
    if f in ROOTCFG: return [('module', f)] if relax_root and u['reason'] == 'UNKNOWN_RESOLUTION_CONFIG' else [('global', None)]
    own = []
    if f in files or f in contained_importers: own.append(('module', f))
    if f.endswith('/package.json') and pkg_of(f) and f == pkg_of(f) + '/package.json': own.append(('package', pkg_of(f)))
    return own or [('global', None)]
memo = {}
def clo(f):
    if f in memo: return memo[f]
    seen, st = set(), [f]
    while st:
        n = st.pop()
        if n in seen: continue
        seen.add(n); st.extend(E.get(n, ()))
    memo[f] = seen
    return seen
# strongly connected components of the resolution graph (Tarjan, iterative)
def sccs():
    index, low, onstack, stack, out, counter = {}, {}, set(), [], [], [0]
    nodes = set(E) | set().union(*E.values()) if E else set()
    for v0 in sorted(nodes):
        if v0 in index: continue
        work = [(v0, iter(sorted(E.get(v0, ()))))]
        index[v0] = low[v0] = counter[0]; counter[0] += 1; stack.append(v0); onstack.add(v0)
        while work:
            v, it = work[-1]
            nxt = next(it, None)
            if nxt is not None:
                if nxt not in index:
                    index[nxt] = low[nxt] = counter[0]; counter[0] += 1; stack.append(nxt); onstack.add(nxt)
                    work.append((nxt, iter(sorted(E.get(nxt, ())))))
                elif nxt in onstack:
                    low[v] = min(low[v], index[nxt])
            else:
                work.pop()
                if work: low[work[-1][0]] = min(low[work[-1][0]], low[v])
                if low[v] == index[v]:
                    comp = []
                    while True:
                        w = stack.pop(); onstack.discard(w); comp.append(w)
                        if w == v: break
                    out.append(comp)
    return out
cyclic = set()
for comp in sccs():
    if len(comp) > 1 or comp[0] in E.get(comp[0], ()):
        cyclic |= set(comp)
phases_ok = all(S['phases'].get(p) == 'COMPLETED' for p in ('acquisition', 'body', 'postBody', 'revalidation'))
violations = len(S['violations']) + len(rep['violations'])
NEW_BUILTINS = {'Set', 'Map', 'WeakMap', 'WeakSet', 'Date', 'Error', 'TypeError', 'RangeError', 'SyntaxError', 'ReferenceError', 'EvalError',
                'URIError', 'AggregateError', 'RegExp', 'Array', 'Object', 'ArrayBuffer', 'DataView', 'Uint8Array', 'Int8Array', 'Uint16Array',
                'Int16Array', 'Uint32Array', 'Int32Array', 'Float32Array', 'Float64Array', 'BigInt64Array', 'BigUint64Array', 'Uint8ClampedArray'}
def removable(u, scen):
    t = tags.get(key(u), set())
    if 'K0' in scen and u['reason'] == 'UNKNOWN_BINDING_VALUE' and t == {'U-binding:parametro-K0'}: return True
    if 'NEW' in scen and u['reason'] == 'UNKNOWN_UNSUPPORTED_SYNTAX' and u.get('detail') == 'NewExpression' and t and all(
            x.startswith('new:') and x.endswith(':global') and x.split(':')[1] in NEW_BUILTINS for x in t): return True
    return False
def evaluate(scen):
    relax = 'R' in scen
    glob, dirty, dirty_pkg = [], defaultdict(list), defaultdict(list)
    for u in U:
        if removable(u, scen): continue
        for kind, owner in owners_of(u, relax):
            if kind == 'global': glob.append(key(u))
            elif kind == 'package': dirty_pkg[owner].append(key(u))
            else:
                dirty[owner].append(key(u))
                for imp in contained_importers.get(owner, ()): dirty[imp].append(key(u))
    for f in grammar_bad: dirty[f].append((f, 'UNKNOWN_RUNTIME_SYNTAX', ''))
    proven = []
    if not glob and not violations and phases_ok:
        for f in sorted(files):
            c = clo(f)
            if any(n in cyclic for n in c): continue
            if any(dirty.get(n) for n in c): continue
            if any(dirty_pkg.get(pkg_of(n)) for n in c if pkg_of(n)): continue
            proven.append(f)
    pset = set(proven)
    edges = [f for f in proven if E.get(f)]
    near = []
    for f in sorted(files):
        if not E.get(f): continue
        c = clo(f)
        bl = sorted({b for n in c for b in dirty.get(n, [])} | {b for n in c if pkg_of(n) for b in dirty_pkg.get(pkg_of(n), [])})
        near.append((len(bl), f, bl[:12]))
    near.sort()
    k7, installed_ok = [], []
    for o in S['origins']:
        f = o['file']
        if o['reason'] == 'UNVERIFIED_INSTALLED_PACKAGE':
            continue  # installed[] stays under the global PROVEN rule (§2/§3.3); never resolved by scope
        elif f in pset:
            k7.append(o['id'])
    # Edge path: importers whose closure blockers fall in exactly one blocker class (reason, or reason:detail for
    # syntax/function refusals); removing that class alone (if it created nothing new) would prove the importer.
    cls = lambda b: b[1] + (':' + b[2] if b[1] in ('UNKNOWN_UNSUPPORTED_SYNTAX', 'UNKNOWN_FUNCTION') else '')
    single, pairs, widest = Counter(), Counter(), Counter()
    for f in sorted(files):
        if not E.get(f) or f in pset: continue
        c = clo(f)
        bl = {b for n in c for b in dirty.get(n, [])} | {b for n in c if pkg_of(n) for b in dirty_pkg.get(pkg_of(n), [])}
        kinds = {cls(b) for b in bl}
        if len(kinds) == 1: single[next(iter(kinds))] += 1
        if len(kinds) == 2: pairs[' + '.join(sorted(kinds))] += 1
        widest[len(kinds)] += 1
    return {'globalBlockers': len(glob), 'importersBlockedBySingleClass': dict(single.most_common(15)), 'importersBlockedByTwoClasses': dict(pairs.most_common(12)),
            'importersByNumberOfBlockerClasses': dict(sorted(widest.items())), 'globalBlockersByReason': dict(Counter(g[1] for g in glob)), 'globalBlockerFiles': sorted({g[0] for g in glob}),
            'k5Proofs': len(proven), 'provenModules': proven[:60], 'edgeProofs': len(edges), 'provenImporters': edges[:30],
            'k7Proofs': len(k7), 'installedProven': len(installed_ok), 'removedTuples': sum(1 for u in U if removable(u, scen)),
            'nearestImporters': [{'file': f, 'blockers': n, 'sample': [list(b) for b in bl]} for n, f, bl in near[:8]]}
scen = {'escopo': (), 'escopo+R': ('R',), 'escopo+R+K0': ('R', 'K0'), 'escopo+R+NEW': ('R', 'NEW'), 'escopo+R+K0+NEW': ('R', 'K0', 'NEW')}
res = {k: evaluate(v) for k, v in scen.items()}
gl = Counter(g for g in dump['grammar'].values())
rec = {'task': TASK, 'observedAt': now(), 'label': label, 'reportSha256': sha(EV / ('real-' + label + '-normal-report.json.gz')),
       'rule': __doc__.split('usage:')[0].strip(), 'tuples': len(U), 'violations': violations, 'phases': S['phases'], 'phasesOk': phases_ok,
       'analysedFiles': len(files), 'importers': sum(1 for f in files if E.get(f)), 'containedEdges': len(dump['contained']),
       'grammar': dict(gl), 'grammarFailures': sorted(grammar_bad)[:40],
       'cyclicFiles': len(cyclic), 'k0Tuples': sum(1 for u in U if removable(u, ('K0',))), 'newBuiltinTuples': sum(1 for u in U if removable(u, ('NEW',))),
       'newCallees': dict(Counter(x for u in U if u['reason'] == 'UNKNOWN_UNSUPPORTED_SYNTAX' and u.get('detail') == 'NewExpression' for x in tags.get(key(u), {'?'})).most_common(25)),
       'scenarios': res}
save('scope-' + label + '.json', rec)
print(json.dumps({k: {x: v[x] for x in ('globalBlockers', 'globalBlockersByReason', 'k5Proofs', 'edgeProofs', 'k7Proofs', 'removedTuples')} for k, v in res.items()}, indent=1, ensure_ascii=False))
print(json.dumps({k: rec[k] for k in ('grammar', 'k0Tuples', 'newBuiltinTuples', 'containedEdges')}), json.dumps(rec['newCallees'])[:800])
