#!/usr/bin/env python3
"""Type-only rewrite: literal dist imports in the SPEC0225 native tests stop
depending on a prior build for typechecking. Runtime specifiers are unchanged
after type erasure; types come from the corresponding src module.
  typeof import('<rel>/dist/<m>.js')  -> typeof import('<rel-src>/<m>.ts')
  await import('<rel>/dist/<m>.js')   -> ((await import('<rel>/dist/<m>.js' as string)) as typeof import('<rel-src>/<m>.ts'))
"""
import os, re, sys, json
root = sys.argv[1]; files = sys.argv[2:]
report = []
def mapped(file, spec):
    absdist = os.path.normpath(os.path.join(os.path.dirname(file), spec))
    parts = absdist.split(os.sep)
    i = len(parts) - 1 - parts[::-1].index('dist')
    src = os.sep.join(parts[:i] + ['src'] + parts[i+1:])
    assert src.endswith('.js'); src = src[:-3] + '.ts'
    assert os.path.isfile(os.path.join(root, src)), src
    rel = os.path.relpath(src, os.path.dirname(file))
    if not rel.startswith('.'): rel = './' + rel
    return rel
for f in files:
    p = os.path.join(root, f); s = open(p).read(); n0 = s
    counts = {'typeof': 0, 'await': 0}
    def rep_await(m):
        counts['await'] += 1
        spec = m.group(1)
        return f"((await import('{spec}' as string)) as typeof import('{mapped(f, spec)}'))"
    s = re.sub(r"await import\('([^']*/dist/[^']*\.js)'\)", rep_await, s)
    def rep_typeof(m):
        counts['typeof'] += 1
        return f"typeof import('{mapped(f, m.group(1))}')"
    s = re.sub(r"typeof import\('([^']*/dist/[^']*\.js)'\)", rep_typeof, s)
    open(p, 'w').write(s)
    report.append({'file': f, **counts})
print(json.dumps(report, indent=1))
