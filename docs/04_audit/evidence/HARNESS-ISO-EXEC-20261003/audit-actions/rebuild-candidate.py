#!/usr/bin/env python3
"""Rebuild an owned, isolated source candidate; never reuse an existing target."""
import argparse
import datetime
import hashlib
import json
from pathlib import Path
import shutil
import subprocess


def digest(data):
    return hashlib.sha256(data).hexdigest()


def selected(source):
    raw = subprocess.check_output(
        ['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'],
        cwd=source,
    )
    result = {}
    for name in sorted(set(raw.decode().rstrip('\0').split('\0'))):
        relative = Path(name)
        if not name or relative.is_absolute() or '..' in relative.parts:
            raise ValueError('invalid source path')
        if any(p in {'node_modules', '.git', '.gauntlet', 'dist', 'coverage',
                     'test-results', 'playwright-report'} for p in relative.parts):
            continue
        if relative.name.startswith('.env') and relative.name != '.env.example':
            raise ValueError('environment file not permitted: ' + name)
        current = source / relative
        if current.is_symlink():
            raise ValueError('source symlink not permitted: ' + name)
        if current.is_file():
            result[name] = digest(current.read_bytes())
    return result


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--source-root', required=True)
parser.add_argument('--candidate', required=True)
parser.add_argument('--receipt', required=True)
args = parser.parse_args()
source = Path(args.source_root).resolve(strict=True)
target = Path(args.candidate).absolute()
receipt = Path(args.receipt).absolute()
if target.exists() or target.is_symlink() or receipt.exists():
    raise ValueError('candidate and receipt must be new paths')
if target.is_relative_to(source) or receipt.is_relative_to(target):
    raise ValueError('candidate must be outside source; receipt outside candidate')
target.parent.mkdir(parents=True, exist_ok=True)
before = selected(source)
subprocess.run(['git', 'clone', '--quiet', '--no-hardlinks', '--', str(source),
                str(target)], check=True)
tracked = subprocess.check_output(['git', 'ls-files', '-z'], cwd=target)
# Only remove clone-owned files absent from the observed source selection.
for name in tracked.decode().rstrip('\0').split('\0'):
    if name not in before:
        file = target / name
        if file.is_file() or file.is_symlink():
            file.unlink()
for name, expected in before.items():
    data = (source / name).read_bytes()
    if digest(data) != expected:
        raise ValueError('source changed during copy: ' + name)
    destination = target / name
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.is_symlink():
        destination.unlink()
    destination.write_bytes(data)
    shutil.copymode(source / name, destination)
after = selected(source)
if before != after:
    raise ValueError('source selection changed during copy; preserve failed candidate')
if any(digest((target / p).read_bytes()) != h for p, h in before.items()):
    raise ValueError('candidate copy mismatch')
record = {
    'createdAtUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'sourceRoot': str(source), 'candidate': str(target),
    'sourceHead': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=source).decode().strip(),
    'files': before, 'sourceSentinel': 'MATCH',
    'scope': 'Current repository selection; isolated Git metadata; no dependencies or real environment files copied',
    'next': 'Install from unchanged lock with Node22 npm ci --offline --ignore-scripts, then capture checks',
}
receipt.parent.mkdir(parents=True, exist_ok=True)
with receipt.open('x') as handle:
    json.dump(record, handle, ensure_ascii=False, indent=2)
    handle.write('\n')
(target / '.cvg-audit-candidate.json').write_text(json.dumps({
    'sourceRoot': str(source), 'receipt': str(receipt),
    'receiptSha256': digest(receipt.read_bytes()),
}, indent=2) + '\n')
print(json.dumps({'candidate': str(target), 'files': len(before), 'sentinel': 'MATCH'}))
