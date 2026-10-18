#!/usr/bin/env python3
"""Copy and verify only our terminated, disposable reference target cache."""
from pathlib import Path
import hashlib
import json
import os
import shutil
import stat
import subprocess
import time

HERE = Path(__file__).resolve().parent


def save(name, value):
    (HERE / name).write_text(json.dumps(value, indent=2) + '\n')


def snapshot(root):
    rows = []
    for path in sorted(root.rglob('*')):
        info = path.lstat()
        row = {'path': str(path.relative_to(root)), 'mode': stat.S_IMODE(info.st_mode),
               'mtime_ns': info.st_mtime_ns}
        if stat.S_ISLNK(info.st_mode):
            row.update(kind='SYMLINK', target=os.readlink(path))
        elif stat.S_ISDIR(info.st_mode):
            row.update(kind='DIRECTORY')
        else:
            assert stat.S_ISREG(info.st_mode), 'nonregular cache entry'
            with path.open('rb') as f:
                digest = hashlib.file_digest(f, 'sha256').hexdigest()
            row.update(kind='REGULAR', bytes=info.st_size, sha256=digest)
        rows.append(row)
    return rows


def inactive(unit):
    state = subprocess.run(['systemctl', '--user', 'show', unit, '-p', 'ActiveState', '--value'],
                           check=True, capture_output=True, text=True, timeout=10).stdout.strip()
    assert state == 'inactive', 'old owned unit remains active'


def main():
    c = json.loads((HERE / 'contract.json').read_text())
    prior = HERE.parent / (c['prior_attempt'] + '.json')
    assert hashlib.sha256(prior.read_bytes()).hexdigest() == c['prior_attempt_report_sha256']
    run = json.loads(prior.read_text())
    assert run['status'] == 'TERMINAL' and run['exit'] == -9 and run['abort_reason'] == 'DISK_RESERVE_GUARD'
    inactive(run['unit'])
    source = Path(c['cache_source'])
    dest = Path(c['cache_destination'])
    assert str(source) == '/tmp/cvg-codex100-exec-20261017/reference-build/target'
    assert str(dest) == '/mnt/ia/cvg-codex100-exec-20261017/reference-target'
    assert source.is_dir() and not source.is_symlink() and source.resolve() == source
    assert not dest.exists() and not dest.is_symlink() and not dest.parent.exists()
    assert shutil.disk_usage(dest.parent.parent).free >= 32_000_000_000
    before = snapshot(source)
    save('cache-before-move.json', before)
    print(json.dumps({'phase': 'SNAPSHOT', 'entries': len(before),
                      'regular_bytes': sum(r.get('bytes', 0) for r in before)}), flush=True)
    dest.parent.mkdir(mode=0o700)
    # Copy actual bytes: no shared inode, reflink dependency, download or changed input.
    shutil.copytree(source, dest, symlinks=True, copy_function=shutil.copy2)
    copied = snapshot(dest)
    assert copied == before, 'destination copy differs; original must stay'
    after = snapshot(source)
    assert after == before, 'original changed during copy; original must stay'
    for row in before:
        if row['kind'] == 'REGULAR':
            assert (source / row['path']).stat().st_ino != (dest / row['path']).stat().st_ino or source.stat().st_dev != dest.stat().st_dev
    inactive(run['unit'])
    save('cache-copy-verification.json', {'status': 'EXACT_BYTE_MODE_MTIME_LINK_SET_COPY',
                                         'source': str(source), 'destination': str(dest),
                                         'entries': len(before), 'source_rechecked': True,
                                         'independent_physical_storage': True})
    # This removes only the old copy of an unaccepted, own cache after an exact retained backup.
    shutil.rmtree(source)
    assert not source.exists() and dest.is_dir()
    save('relocation.json', {'status': 'VERIFIED_COPY_RELOCATED_OLD_PRIVATE_CACHE_REMOVED',
                            'old': str(source), 'current': str(dest), 'entries': len(before),
                            'regular_bytes': sum(r.get('bytes', 0) for r in before),
                            'root_free_bytes': shutil.disk_usage(source.parent).free,
                            'target_free_bytes': shutil.disk_usage(dest).free,
                            'copied_snapshot_sha256': hashlib.sha256((HERE / 'cache-before-move.json').read_bytes()).hexdigest(),
                            'scope': run['unit'], 'scope_now': 'inactive',
                            'source_profile_features_lock_changed': False,
                            'reference_binary_executed': False, 'functional_receipts': 0})
    print((HERE / 'relocation.json').read_text(), flush=True)


if __name__ == '__main__':
    main()
