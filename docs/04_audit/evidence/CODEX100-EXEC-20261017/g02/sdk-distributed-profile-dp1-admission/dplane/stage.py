"""CAP-DP-STAGE (DDP-02, DDP-11) of the distributed profile, sub-lot DP-1. Host side, own code; never executes anything it reads.

- Reads the cache archives only through tarfile/zipfile (members streamed in memory), after checking the archive sha256 against
  inputs/acquisition/acquisition-ledger.json and each member sha256 against inputs/acquisition/artifact-metadata.json.
- stage_dist(dst): writes the npm layout of capability-contracts-dp.json#/capabilities[CAP-DP-STAGE]/layout (A7, A2, A3, A4; A1 is
  a DP-2 input) into a private runtime directory outside docs/, preserving the member modes (0755 for ELF and bin scripts, 0644 for
  the rest; directories 0755). The supervisor binds it read-only at /dist.
- materialize(trees, root): builds the fixture trees of one case under the attempt directory (bound read-only at /fixture):
  copy_of_member, file, json, dir, symlink, synthetic_child and copy_of_profile, with the declared modes.
- manifests and checks used by stage.bound_to_cache and fixture.tree_exact.
The acquisition cache is never written.
"""
import hashlib
import json
import os
import stat
import tarfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
UNIT = HERE.parent
ACQ = UNIT / 'inputs' / 'acquisition'
LEDGER_PATH = ACQ / 'acquisition-ledger.json'
META_PATH = ACQ / 'artifact-metadata.json'
LEDGER_SHA = '56c0efdeb8274f400609091f5a750c2256afe7677a5207154b5d99d24d7efb4b'
META_SHA = '19ead15183dec63467fcaba28422599158eec6af117f7fb7c2de9614b39d4e77'
CACHE = '/mnt/dados/cvg-work/cvg-codex100-distributed-cache-20261019'
NPM = 'npm/node_modules/@openai'
LAYOUT = {'A7': 'codex-sdk', 'A2': 'codex', 'A3': 'codex-linux-x64', 'A4': 'codex-responses-api-proxy'}
PROFILE_SOURCES = {'/profile/dp-control-wrapper.mjs': 'dp-control-wrapper.mjs', '/profile/dp-synth-child.mjs': 'dp-synth-child.mjs'}


def sha_bytes(b):
    return hashlib.sha256(b).hexdigest()


def sha_path(p):
    h = hashlib.sha256()
    with open(p, 'rb') as f:
        for block in iter(lambda: f.read(1 << 20), b''):
            h.update(block)
    return h.hexdigest()


def _bound(path, digest):
    raw = path.read_bytes()
    assert sha_bytes(raw) == digest, '%s differs from the bound sha256' % path.name
    return json.loads(raw)


LEDGER = _bound(LEDGER_PATH, LEDGER_SHA)
META = _bound(META_PATH, META_SHA)
ARCHIVES = {a['id']: a for a in LEDGER['artifacts'] if a.get('result') == 'DIGEST_OK'}
MEMBERS = {a['id']: {m['name']: m for m in a['members'] if m.get('type') == 'file'} for a in META['artifacts'] if a.get('inspected')}
_ARCHIVE_OK = {}


def archive_path(aid):
    p = ARCHIVES[aid]['stored']
    assert p.startswith(CACHE + '/artifacts/' + aid + '/'), 'archive outside the cache'
    return p


def check_archive(aid):
    """Archive sha256 recomputed against the ledger (once per process)."""
    if aid not in _ARCHIVE_OK:
        got = sha_path(archive_path(aid))
        assert got == ARCHIVES[aid]['observed']['sha256'], 'cache archive %s differs from acquisition-ledger.json' % aid
        _ARCHIVE_OK[aid] = got
    return _ARCHIVE_OK[aid]


def member_bytes(aid, name):
    """One member read in memory, sha checked against artifact-metadata.json."""
    check_archive(aid)
    m = MEMBERS[aid][name]
    with tarfile.open(archive_path(aid), 'r:gz') as t:
        data = t.extractfile(t.getmember(name)).read()
    assert sha_bytes(data) == m['sha256'] and len(data) == m['size'], 'member %s:%s differs from artifact-metadata.json' % (aid, name)
    return data, int(m['mode'], 8) if isinstance(m.get('mode'), str) else 0o644


def member_ref(ref):
    aid, name = ref.split(':', 1)
    return aid, name


# --------------------------------------------------------------------------------------------- /dist staging

def expected_dist():
    """Manifest of /dist from artifact-metadata.json: relative path -> {bytes, mode, sha256}."""
    out = {}
    for aid, pkg in LAYOUT.items():
        for name, m in MEMBERS[aid].items():
            assert name.startswith('package/'), 'member outside package/'
            mode = m.get('mode')
            out['%s/%s/%s' % (NPM, pkg, name[len('package/'):])] = {'bytes': m['size'], 'mode': mode[2:].rjust(4, '0') if isinstance(mode, str) else '0644',
                                                                     'sha256': m['sha256']}
    return dict(sorted(out.items()))


def dist_manifest(root):
    out = {}
    root = Path(root)
    for top, dirs, names in os.walk(root, followlinks=False):
        dirs.sort()
        for d in dirs:
            p = Path(top) / d
            st = os.lstat(p)
            assert stat.S_ISDIR(st.st_mode), 'non-directory in /dist: %s' % p
            assert (st.st_mode & 0o7777) == 0o755, 'directory mode in /dist: %s' % p
        for n in sorted(names):
            p = Path(top) / n
            st = os.lstat(p)
            assert stat.S_ISREG(st.st_mode), 'non-regular file in /dist: %s' % p
            out[str(p.relative_to(root))] = {'bytes': st.st_size, 'mode': oct(st.st_mode & 0o7777)[2:].rjust(4, '0'), 'sha256': sha_path(p)}
    return dict(sorted(out.items()))


def stage_dist(dst):
    """Write the npm layout from the cache archives (streamed), then check the closed manifest. Refuses an existing directory."""
    dst = Path(dst)
    assert not dst.exists(), 'staging directory already exists: %s' % dst
    dst.mkdir(mode=0o755)
    os.chmod(dst, 0o755)
    for aid, pkg in LAYOUT.items():
        check_archive(aid)
        with tarfile.open(archive_path(aid), 'r:gz') as t:
            for ti in t:
                if not ti.isfile():
                    continue
                m = MEMBERS[aid].get(ti.name)
                assert m is not None, 'member not in artifact-metadata.json: %s:%s' % (aid, ti.name)
                q = dst / NPM / pkg / ti.name[len('package/'):]
                for parent in reversed(q.relative_to(dst).parents):
                    if str(parent) == '.':
                        continue
                    pp = dst / parent
                    if not pp.exists():
                        pp.mkdir(mode=0o755)
                        os.chmod(pp, 0o755)
                h = hashlib.sha256()
                src = t.extractfile(ti)
                with open(q, 'xb') as f:
                    for block in iter(lambda: src.read(1 << 20), b''):
                        h.update(block)
                        f.write(block)
                assert h.hexdigest() == m['sha256'], 'member %s:%s differs from artifact-metadata.json' % (aid, ti.name)
                os.chmod(q, int(m['mode'], 8) & 0o777)
    got = dist_manifest(dst)
    assert got == expected_dist(), 'staged /dist differs from artifact-metadata.json'
    return got


# --------------------------------------------------------------------------------------------- fixture trees

def json_bytes(value):
    return (json.dumps(value, ensure_ascii=False, separators=(',', ':')) + '\n').encode('utf-8')


def entry_bytes(e):
    """Bytes and mode of a regular-file entry."""
    k = e['kind']
    if k == 'copy_of_member':
        data, mode = member_bytes(*member_ref(e['member']))
        return data, int(e['mode'], 8) if 'mode' in e else mode
    if k == 'file':
        return e['content'].encode('utf-8'), int(e['mode'], 8)
    if k == 'json':
        return json_bytes(e['value']), 0o644
    if k == 'synthetic_child':
        return (UNIT / 'node' / 'dp-synth-child.mjs').read_bytes(), int(e.get('mode', '0755'), 8)
    if k == 'copy_of_profile':
        assert e['from'] in PROFILE_SOURCES, 'copy_of_profile from an unknown profile file: %s' % e['from']
        return (UNIT / 'node' / PROFILE_SOURCES[e['from']]).read_bytes(), int(e.get('mode', '0644'), 8)
    raise AssertionError('not a file entry: %s' % k)


def host_path(root, p):
    assert p.startswith('/fixture/') and '/../' not in p and not p.endswith('/..'), 'fixture path outside /fixture: %s' % p
    return Path(root) / p[len('/fixture/'):]


def _mkdirs(root, q):
    for parent in reversed(q.relative_to(root).parents):
        if str(parent) == '.':
            continue
        pp = Path(root) / parent
        if os.path.lexists(pp):
            assert stat.S_ISDIR(os.lstat(pp).st_mode), 'fixture parent is not a directory: %s' % pp
            continue
        pp.mkdir(mode=0o755)
        os.chmod(pp, 0o755)


def materialize(trees, root):
    """Build the declared trees under root (the host side of /fixture). Symlinks last, so no parent is created through one."""
    root = Path(root)
    entries = [e for t in trees for e in t['entries']]
    for e in entries:
        assert e['path'].startswith(t_root(trees, e)), 'entry outside its tree root: %s' % e['path']
    for e in [x for x in entries if x['kind'] != 'symlink']:
        q = host_path(root, e['path'])
        _mkdirs(root, q)
        if e['kind'] == 'dir':
            q.mkdir(mode=0o755)
            os.chmod(q, 0o755)
            continue
        data, mode = entry_bytes(e)
        with open(q, 'xb') as f:
            f.write(data)
        os.chmod(q, mode)
    for e in [x for x in entries if x['kind'] == 'symlink']:
        q = host_path(root, e['path'])
        _mkdirs(root, q)
        assert e['target'].startswith('/fixture/'), 'symlink target outside /fixture'
        os.symlink(e['target'], q)
    return fixture_manifest(trees, root)


def t_root(trees, e):
    for t in trees:
        if e in t['entries']:
            return t['root'] + '/'
    raise AssertionError('entry without tree')


def expected_entry(e):
    """Declared view of one entry (type, mode, bytes, sha256 or target), as fixture.tree_exact compares it."""
    if e['kind'] == 'dir':
        return {'type': 'dir', 'mode': '0755'}
    if e['kind'] == 'symlink':
        return {'type': 'symlink', 'target': e['target']}
    data, mode = entry_bytes(e)
    return {'type': 'file', 'mode': oct(mode)[2:].rjust(4, '0'), 'bytes': len(data), 'sha256': sha_bytes(data)}


def fixture_manifest(trees, root):
    out = {}
    for t in trees:
        for e in t['entries']:
            q = host_path(root, e['path'])
            try:
                st = os.lstat(q)
            except OSError as exc:
                out[e['path']] = {'error': exc.__class__.__name__}
                continue
            if stat.S_ISLNK(st.st_mode):
                out[e['path']] = {'type': 'symlink', 'target': os.readlink(q)}
            elif stat.S_ISDIR(st.st_mode):
                out[e['path']] = {'type': 'dir', 'mode': oct(st.st_mode & 0o7777)[2:].rjust(4, '0')}
            elif stat.S_ISREG(st.st_mode):
                out[e['path']] = {'type': 'file', 'mode': oct(st.st_mode & 0o7777)[2:].rjust(4, '0'), 'bytes': st.st_size, 'sha256': sha_path(q)}
            else:
                out[e['path']] = {'type': 'other'}
    return out


def check_fixture(trees, manifest):
    """Problems of a manifest (host or sandbox view) against the declaration; [] means fixture.tree_exact holds."""
    want = {e['path']: expected_entry(e) for t in trees for e in t['entries']}
    problems = []
    for p, w in want.items():
        got = manifest.get(p)
        if got != w:
            problems.append({'path': p, 'want': w, 'got': got})
    extra = sorted(set(manifest) - set(want))
    if extra:
        problems.append({'extra': extra[:10]})
    return problems


def sandbox_listing_to_manifest(rows):
    """The driver's fixture-listing BLOB (lstat inside the sandbox) in the manifest shape."""
    out = {}
    for r in rows:
        if 'error' in r:
            out[r['path']] = {'error': r['error']}
        elif r['type'] == 'symlink':
            out[r['path']] = {'type': 'symlink', 'target': r['target']}
        elif r['type'] == 'dir':
            out[r['path']] = {'type': 'dir', 'mode': r['mode']}
        elif r['type'] == 'file':
            out[r['path']] = {'type': 'file', 'mode': r['mode'], 'bytes': r['bytes'], 'sha256': r['sha256']}
        else:
            out[r['path']] = {'type': 'other'}
    return out
