#!/usr/bin/env python3
"""Capture one check with immutable logs and source sentinels in an owned candidate."""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys


def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def inputs(root):
    excluded = {'node_modules', '.git', '.gauntlet', 'dist', 'build', 'coverage',
                'test-results', 'playwright-report', 'certification'}
    result = {}
    for current, directories, names in os.walk(root):
        directories[:] = sorted(d for d in directories if d not in excluded)
        for name in sorted(names):
            file = Path(current) / name
            relative = file.relative_to(root)
            if name.endswith('.tsbuildinfo') or name == 'playwright-results.xml':
                continue
            if file.is_symlink():
                result[str(relative)] = 'symlink:' + os.readlink(file)
            elif file.is_file():
                result[str(relative)] = hashlib.sha256(file.read_bytes()).hexdigest()
    return result


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--candidate', required=True)
parser.add_argument('--evidence-dir', required=True)
parser.add_argument('--name', required=True)
parser.add_argument('--node-bin-dir', required=True)
parser.add_argument('--env', action='append', default=[])
parser.add_argument('command', nargs=argparse.REMAINDER)
args = parser.parse_args()
root = Path(args.candidate).resolve(strict=True)
output = Path(args.evidence_dir).absolute()
if not (root / '.cvg-audit-candidate.json').is_file():
    raise ValueError('candidate provenance marker missing')
if output.is_relative_to(root) or not re.fullmatch(r'[a-z0-9][a-z0-9-]*', args.name):
    raise ValueError('evidence must be outside candidate; name must be simple')
command = args.command[1:] if args.command[:1] == ['--'] else args.command
if not command:
    raise ValueError('command required')
output.mkdir(parents=True, exist_ok=True)
paths = {suffix: output / (args.name + suffix) for suffix in ['.json', '.log', '-before.json', '-after.json']}
if any(p.exists() for p in paths.values()):
    raise ValueError('refuse overwriting prior evidence')
environment = {k: os.environ[k] for k in ['HOME', 'LANG', 'LC_ALL', 'TMPDIR',
              'XDG_CACHE_HOME', 'DISPLAY', 'TERM'] if k in os.environ}
environment['PATH'] = args.node_bin_dir + os.pathsep + os.environ.get('PATH', '/usr/bin:/bin')
for value in args.env:
    key, val = value.split('=', 1)
    if not re.fullmatch(r'[A-Z][A-Z0-9_]*', key):
        raise ValueError('invalid environment name')
    environment[key] = val
before = inputs(root)
paths['-before.json'].write_text(json.dumps(before, ensure_ascii=False, indent=2) + '\n')
started = now()
with paths['.log'].open('x') as log:
    child = subprocess.run(command, cwd=root, env=environment, stdout=log,
                           stderr=subprocess.STDOUT, check=False)
after = inputs(root)
paths['-after.json'].write_text(json.dumps(after, ensure_ascii=False, indent=2) + '\n')
differences = [p for p in sorted(before.keys() | after.keys()) if before.get(p) != after.get(p)]
record = {'name': args.name, 'command': command, 'cwd': str(root),
          'startedAtUtc': started, 'finishedAtUtc': now(), 'exitCode': child.returncode,
          'environmentKeys': sorted(environment), 'log': paths['.log'].name,
          'logSha256': hashlib.sha256(paths['.log'].read_bytes()).hexdigest(),
          'before': paths['-before.json'].name, 'after': paths['-after.json'].name,
          'inputSentinel': 'MATCH' if not differences else 'DRIFT', 'differences': differences,
          'scope': 'Owned isolated candidate; generated build/test/certification outputs excluded, source/config/docs included; sanitized process environment'}
paths['.json'].write_text(json.dumps(record, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'name': args.name, 'exitCode': child.returncode,
                  'inputSentinel': record['inputSentinel'], 'differences': differences}))
sys.exit(child.returncode if child.returncode else (3 if differences else 0))
