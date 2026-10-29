#!/usr/bin/env python3
"""Applies each mutation to its source, runs the focused tests, restores the
source byte for byte, and records whether the mutant was killed.
usage: run-mutations.py mutations.json out.json test-file [test-file...]"""
import json, subprocess, sys, hashlib, os
muts = json.load(open(sys.argv[1])); out = sys.argv[2]; tests = sys.argv[3:]
results = []
for m in muts:
    path = m['file']; original = open(path, 'rb').read()
    text = original.decode()
    if text.count(m['old']) != 1:
        results.append({'id': m['id'], 'status': 'NOT_APPLIED', 'count': text.count(m['old'])}); continue
    try:
        open(path, 'w').write(text.replace(m['old'], m['new'], 1))
        r = subprocess.run(['npx', 'vitest', 'run', *tests, '--maxWorkers=2'], capture_output=True, text=True, timeout=300)
        killed = r.returncode != 0
        results.append({'id': m['id'], 'what': m['what'], 'status': 'KILLED' if killed else 'SURVIVED'})
    finally:
        open(path, 'wb').write(original)
        assert hashlib.sha256(open(path,'rb').read()).hexdigest() == hashlib.sha256(original).hexdigest()
json.dump(results, open(out, 'w'), indent=2)
for r in results: print(r['id'], r['status'])
sys.exit(0 if all(r['status'] == 'KILLED' for r in results) else 1)
