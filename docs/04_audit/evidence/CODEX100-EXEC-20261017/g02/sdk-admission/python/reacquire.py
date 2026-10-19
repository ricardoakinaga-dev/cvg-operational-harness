"""Bounded HTTPS re-acquisition of the seven lock-selected artifacts AS DATA (DX100-G02 ADMIT, Lead authority).

Same public sources as the original acquisition (files.pythonhosted.org, registry.npmjs.org), no redirect,
timeout 30 s per request, at most two attempts per artifact and only after a transient failure.
Every raw artifact must equal the authenticated bytes/SHA256 of ../sdk-profile-artifacts/validation.json
and the lock digest of ../sdk-reference-profile/dependency-proposal.json; any divergence stops the run
before extraction. Extraction is data-only (no installer, no import, no script, no executable), and every
extracted file must equal the authenticated tree file by file (path, bytes, SHA256); the six RECORDs are
recomputed. Fix of the original collector: the socket is never touched after the response reports EOF.
Usage: python3 -I reacquire.py <evidence-dir>
"""
import base64
import csv
import hashlib
import http.client
import io
import json
import os
import ssl
import stat
import sys
import tarfile
import time
import urllib.parse
import zipfile
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
UNIT = HERE.parent
G02 = UNIT.parent
PROPOSAL = G02 / 'sdk-reference-profile' / 'dependency-proposal.json'
VALIDATION = G02 / 'sdk-profile-artifacts' / 'validation.json'
RUNTIME = Path('/mnt/ia/cvg-codex100-exec-20261017/sdk-admission')
RAW, TREES, MERGED = RUNTIME / 'raw', RUNTIME / 'trees', RUNTIME / 'python-deps'
ALLOWED = {'files.pythonhosted.org', 'registry.npmjs.org'}
CA = '/etc/ssl/certs/ca-certificates.crt'
MAX_TOTAL, PER_FILE = 67108864, 33554432


def sha(b):
    return hashlib.sha256(b).hexdigest()


def now():
    return datetime.now(timezone.utc).isoformat()


def fetch(spec, limit, ctx, attempt):
    url = urllib.parse.urlsplit(spec['artifact_url'])
    assert url.scheme == 'https' and url.hostname in ALLOWED and not url.username and not url.password and not url.query and not url.fragment and url.port in (None, 443)
    name = Path(url.path).name
    assert name and '/' not in name and '..' not in name
    part = RAW / ('%s.attempt%d.part' % (name, attempt))
    row = {'name': spec['name'], 'version': spec['version'], 'url': spec['artifact_url'], 'attempt': attempt, 'observed_at': now(), 'code_executed': False}
    begin = time.monotonic()
    deadline = begin + 30
    conn = None
    digest, digest512, size = hashlib.sha256(), hashlib.sha512(), 0
    try:
        conn = http.client.HTTPSConnection(url.hostname, 443, timeout=30, context=ctx)
        conn.connect()
        row['TLS'] = {'version': conn.sock.version(), 'cipher': conn.sock.cipher()[0], 'peer_certificate_sha256': sha(conn.sock.getpeercert(binary_form=True))}
        conn.request('GET', url.path, headers={'User-Agent': 'CVG-CODEX100-data-reacquisition/1', 'Accept': 'application/octet-stream',
                                               'Accept-Encoding': 'identity', 'Connection': 'close'})
        resp = conn.getresponse()
        row['http_status'] = resp.status
        row['headers'] = {k: resp.getheader(k) for k in ('Content-Type', 'Content-Length', 'ETag', 'Last-Modified', 'Date', 'Server') if resp.getheader(k) is not None}
        if resp.status != 200:
            raise ValueError('HTTP_STATUS_%d; no redirect or substitute' % resp.status)
        assert resp.getheader('Content-Encoding') in (None, 'identity')
        length = resp.getheader('Content-Length')
        assert length is not None and 0 < int(length) <= limit, 'Content-Length bound'
        with part.open('xb') as out:
            while True:
                if time.monotonic() > deadline:
                    raise TimeoutError('whole request deadline 30s')
                chunk = resp.read(65536)  # socket timeout set once at connect; never touched after EOF
                if not chunk:
                    break
                size += len(chunk)
                assert size <= limit, 'raw-byte cap exceeded'
                out.write(chunk)
                digest.update(chunk)
                digest512.update(chunk)
        assert size == int(length), 'Content-Length mismatch'
        row.update({'status': 'RECEIVED', 'bytes': size, 'sha256': digest.hexdigest(), 'sha512_hex': digest512.hexdigest(), 'raw_path': str(part)})
    except Exception as exc:  # noqa: BLE001 - preserved, never substituted
        row.update({'status': 'FAILED_NOT_SUBSTITUTED', 'error_type': type(exc).__name__, 'error': str(exc)[:400],
                    'transient': isinstance(exc, (TimeoutError, ConnectionError, OSError)) or row.get('http_status') in (408, 429, 500, 502, 503, 504)})
        if part.exists():
            row['partial'] = {'path': str(part), 'bytes': part.stat().st_size, 'sha256': sha(part.read_bytes())}
    finally:
        if conn is not None:
            conn.close()
    row['elapsed_seconds'] = round(time.monotonic() - begin, 6)
    return row


def safe(name, is_dir=False):
    assert name and not name.startswith(('/', '\\')) and '\\' not in name and '\x00' not in name, name
    text = name[:-1] if is_dir and name.endswith('/') else name
    parts = text.split('/')
    assert all(x and x not in ('.', '..') and ':' not in x for x in parts), name
    assert all(not x.endswith('.pth') and x not in ('sitecustomize.py', 'usercustomize.py') for x in parts), name
    return str(PurePosixPath(text))


def wheel_files(raw):
    out = {}
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        assert len(z.infolist()) <= 5000
        for item in z.infolist():
            assert item.orig_filename == item.filename
            mode = item.external_attr >> 16
            assert stat.S_IFMT(mode) in (0, stat.S_IFREG, stat.S_IFDIR) and not item.flag_bits & 1
            name = safe(item.filename, item.is_dir())
            if item.is_dir():
                continue
            assert name not in out and item.compress_type in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED)
            assert item.file_size == 0 or item.file_size / max(1, item.compress_size) <= 500
            b = z.read(item)
            assert len(b) == item.file_size <= PER_FILE
            out[name] = b
    record = [n for n in out if n.endswith('.dist-info/RECORD')]
    assert len(record) == 1
    entries = list(csv.reader(io.StringIO(out[record[0]].decode())))
    assert {e[0] for e in entries} == set(out) and len(entries) == len(out)
    for n, h, ln in entries:
        if n == record[0]:
            assert h == ln == ''
        else:
            assert int(ln) == len(out[n]) and h == 'sha256=' + base64.urlsafe_b64encode(hashlib.sha256(out[n]).digest()).decode().rstrip('=')
    return out


def npm_files(raw):
    out = {}
    with tarfile.open(fileobj=io.BytesIO(raw), mode='r:gz') as t:
        for item in t:
            name = safe(item.name, item.isdir())
            assert name == 'package' or name.startswith('package/'), name
            assert (item.isfile() or item.isdir()) and not item.issparse(), name
            if item.isdir():
                continue
            rel = name[len('package/'):]
            assert rel and rel not in out
            b = t.extractfile(item).read(PER_FILE + 1)
            assert len(b) == item.size <= PER_FILE
            out[rel] = b
    return out


def write_tree(root, files):
    root.mkdir(mode=0o700, parents=True, exist_ok=False)
    for rel, b in sorted(files.items()):
        p = root / rel
        p.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        with p.open('xb') as f:
            f.write(b)
        os.chmod(p, 0o600)


def tree_equals(root, want):
    got = {}
    for top, dirs, names in os.walk(root, followlinks=False):
        for n in names:
            p = Path(top) / n
            st = os.lstat(p)
            assert stat.S_ISREG(st.st_mode)
            got[str(p.relative_to(root))] = {'bytes': st.st_size, 'sha256': sha(p.read_bytes())}
    return got == want, len(got)


def main(evidence):
    evidence = Path(evidence)
    proposal = {a['name']: a for a in json.loads(PROPOSAL.read_text())['artifacts']}
    validation = json.loads(VALIDATION.read_text())
    rows = validation['rows']
    assert len(rows) == 7 and len(proposal) == 7
    assert not RAW.exists() and not TREES.exists() and not MERGED.exists(), 'no implicit re-run over existing data'
    RAW.mkdir(mode=0o700, parents=True)
    ctx = ssl.create_default_context(cafile=CA)
    ctx.minimum_version = ssl.TLSVersion.TLSv1_2
    admission = {'kind': 'DATA_REACQUISITION_ADMISSION', 'helper_sha256': sha(Path(__file__).read_bytes()), 'proposal_sha256': sha(PROPOSAL.read_bytes()),
                 'validation_sha256': sha(VALIDATION.read_bytes()), 'TLS_CA_bundle': {'path': CA, 'sha256': sha(Path(CA).read_bytes())},
                 'authority': 'Lead CONT-20261018-D9EF (claim.json#/lead_authority/reacquisition)', 'admitted_at': now()}
    (evidence / 'reacquisition-admission.json').write_text(json.dumps(admission, ensure_ascii=False, indent=2) + '\n')
    log, total, raws, stop = [], 0, {}, None
    for row in rows:
        spec = proposal[row['name']]
        limit = PER_FILE if row['name'] == 'typescript' else 8388608
        final = None
        for attempt in (1, 2):
            r = fetch(spec, limit, ctx, attempt)
            log.append(r)
            if r['status'] == 'RECEIVED' or not r.get('transient'):
                final = r
                break
            final = r
        if final['status'] != 'RECEIVED':
            stop = 'acquisition failed for %s: %s' % (row['name'], final.get('error'))
            break
        data = Path(final['raw_path']).read_bytes()
        total += len(data)
        checks = {'authenticated_bytes': len(data) == row['raw']['bytes'], 'authenticated_sha256': sha(data) == row['raw']['sha256']}
        if 'expected_sha256' in spec:
            checks['lock_sha256'] = sha(data) == spec['expected_sha256'] and len(data) == spec['expected_bytes']
        else:
            checks['lock_sha512_integrity'] = 'sha512-' + base64.b64encode(hashlib.sha512(data).digest()).decode() == spec['expected_integrity']
        final['digest_checks'] = checks
        if not all(checks.values()) or total > MAX_TOTAL:
            stop = 'HASH_DIVERGENCE for %s: %s' % (row['name'], checks)
            break
        raw = RAW / Path(urllib.parse.urlsplit(spec['artifact_url']).path).name
        os.rename(final['raw_path'], raw)
        final['raw_path'] = str(raw)
        os.chmod(raw, 0o400)
        raws[row['name']] = data
        (evidence / 'reacquisition-live.json').write_text(json.dumps({'status': 'IN_PROGRESS', 'rows': log}, ensure_ascii=False, indent=2) + '\n')
    result = {'kind': 'EXECUTED_BOUNDED_HTTPS_DATA_REACQUISITION', 'rows': log, 'raw_total_bytes': total, 'stop': stop,
              'status': 'STOPPED' if stop else 'ALL_SEVEN_AUTHENTICATED', 'SDK_imports': 0, 'compiler_executions': 0, 'installers': 0,
              'functional_receipts': 0, 'observed_at': now()}
    (evidence / 'reacquisition.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    if stop:
        print(json.dumps({'status': 'STOPPED', 'stop': stop}))
        return 1
    mats, merged = [], {}
    for row in rows:
        files = npm_files(raws[row['name']]) if row['name'] == 'typescript' else wheel_files(raws[row['name']])
        want = {f['path']: {'bytes': f['bytes'], 'sha256': f['sha256']} for f in row['files']}
        assert {k: {'bytes': len(v), 'sha256': sha(v)} for k, v in files.items()} == want, 'extracted tree differs from authenticated tree: ' + row['name']
        root = TREES / (row['name'] + '-' + row['version'])
        write_tree(root, files)
        same, n = tree_equals(root, want)
        assert same, 'physical tree differs: ' + row['name']
        mats.append({'name': row['name'], 'version': row['version'], 'tree_root': str(root), 'files': n, 'equals_authenticated_tree': True,
                     'RECORD_recomputed': row['name'] != 'typescript'})
        if row['name'] != 'typescript':
            for k, v in files.items():
                assert k not in merged
                merged[k] = v
    want_merged = {f['path']: {'bytes': f['bytes'], 'sha256': f['sha256']} for f in validation['merged_python']['files']}
    write_tree(MERGED, merged)
    same, n = tree_equals(MERGED, want_merged)
    assert same and n == 169, 'merged python-deps differs from the authenticated merge'
    mat = {'kind': 'DATA_ONLY_MATERIALIZATION_EQUAL_TO_AUTHENTICATED_TREES', 'trees': mats, 'trees_files': sum(m['files'] for m in mats),
           'merged_python': {'root': str(MERGED), 'files': n, 'equals_authenticated_merge': True},
           'installer_used': False, 'imports': 0, 'scripts_executed': 0, 'observed_at': now()}
    (evidence / 'materialization.json').write_text(json.dumps(mat, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'status': 'ALL_SEVEN_AUTHENTICATED', 'raw_total_bytes': total, 'trees_files': mat['trees_files'], 'merged': n}))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1]))
