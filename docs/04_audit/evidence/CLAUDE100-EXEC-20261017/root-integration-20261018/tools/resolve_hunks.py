#!/usr/bin/env python3
"""Resolve git conflict hunks (default 'merge' style markers) by explicit per-hunk choice.
usage: resolve_hunks.py FILE CHOICE [CHOICE...]   CHOICE in ours|theirs|ours+theirs|theirs+ours
Prints a JSON summary of hunks (line counts) to stdout."""
import sys, json
path, choices = sys.argv[1], sys.argv[2:]
lines = open(path, encoding='utf-8').read().split('\n')
out, hunks, i = [], [], 0
while i < len(lines):
    l = lines[i]
    if l.startswith('<<<<<<< '):
        ours, theirs, j = [], [], i + 1
        while not lines[j].startswith('======='):
            ours.append(lines[j]); j += 1
        j += 1
        while not lines[j].startswith('>>>>>>> '):
            theirs.append(lines[j]); j += 1
        c = choices[len(hunks)] if len(hunks) < len(choices) else None
        if c is None:
            sys.exit(f'missing choice for hunk {len(hunks)+1}')
        parts = {'ours': ours, 'theirs': theirs}
        for k in c.split('+'):
            out.extend(parts[k])
        hunks.append({'hunk': len(hunks) + 1, 'startLine': i + 1, 'oursLines': len(ours), 'theirsLines': len(theirs), 'choice': c})
        i = j + 1
        continue
    out.append(l); i += 1
if len(hunks) != len(choices):
    sys.exit(f'choices={len(choices)} hunks={len(hunks)}')
open(path, 'w', encoding='utf-8').write('\n'.join(out))
print(json.dumps({'file': path, 'hunks': hunks}, ensure_ascii=False))
