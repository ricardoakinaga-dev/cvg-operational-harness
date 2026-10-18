#!/usr/bin/env python3
"""Acquire one hash-bound official Rust archive. Never install or execute it."""
from pathlib import Path
import hashlib
import json
import shutil
import ssl
import time
import tomllib
import urllib.parse
import urllib.request

HERE = Path(__file__).resolve().parent
CONTRACT = '260fe526efcba293b14d33fc11cb2708b9254c0c2f6090228a6bc3de6608949f'
sha = lambda b: hashlib.sha256(b).hexdigest()


def need(ok, why):
    if not ok:
        raise ValueError(why)


def main():
    raw = (HERE/'acquisition-contract.json').read_bytes();need(sha(raw) == CONTRACT,'contract changed')
    c = json.loads(raw);need(sha((HERE/'preflight.json').read_bytes()) == c['preflight_sha256'],'preflight changed')
    manifest = (HERE/'channel-rust-1.95.0.toml').read_bytes()
    need(sha(manifest) == (HERE/'channel-rust-1.95.0.toml.sha256').read_text().split()[0],'manifest not authenticated')
    target = tomllib.loads(manifest.decode())['pkg']['rust']['target']['x86_64-unknown-linux-gnu']
    url,expected = target['xz_url'],target['xz_hash'];u = urllib.parse.urlparse(url)
    need(u.scheme == 'https' and u.netloc == 'static.rust-lang.org' and u.path.startswith('/dist/'),'unauthorized archive URL')
    base = Path(c['resource_root'])/'download';base.mkdir(exist_ok=True);path = base/Path(u.path).name;partial = Path(str(path)+'.part')
    limits = c['limits'];need(shutil.disk_usage(base).free >= limits['minimum_free_disk_bytes'],'insufficient owned resource disk headroom')
    need(not partial.exists(),'existing partial download: inspect prior job/attempt before retry')
    report = {'kind':'HASH_BOUND_OFFICIAL_RUST_ARCHIVE_ACQUISITION','contract_sha256':CONTRACT,'manifest_sha256':sha(manifest),'url':url,'archive_path':str(path),'expected_sha256':expected,'bytes_downloaded':0,'installed':False,'archive_executed':False,'upstream_executed':False,'functional_receipts':0}
    started = time.monotonic()
    try:
        need(not path.exists(),'complete archive already exists; authenticate it explicitly before another acquisition')
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}),urllib.request.HTTPSHandler(context=ssl.create_default_context()))
        digest = hashlib.sha256()
        with opener.open(url,timeout=limits['network_timeout_seconds']) as r, partial.open('xb') as out:
            need(r.status == 200 and urllib.parse.urlparse(r.url).netloc == 'static.rust-lang.org','archive response origin/status')
            length = r.headers.get('Content-Length');report['content_length'] = int(length) if length else None
            if length:need(int(length) <= limits['download_bytes_max'],'archive exceeds byte cap')
            while True:
                need(time.monotonic()-started <= limits['overall_download_seconds_max'],'download time budget exhausted')
                block = r.read(1024*1024)
                if not block:break
                report['bytes_downloaded'] += len(block);need(report['bytes_downloaded'] <= limits['download_bytes_max'],'stream exceeds byte cap')
                out.write(block);digest.update(block)
        report['actual_sha256'] = digest.hexdigest();need(digest.hexdigest() == expected,'archive checksum mismatch')
        partial.rename(path);report['result'] = 'ARCHIVE_HASH_VERIFIED_NOT_EXTRACTED_OR_EXECUTED'
    except Exception as e:
        report.update({'result':'ACQUISITION_FAILED_NO_INSTALL_OR_EXECUTION','error_type':type(e).__name__,'error':str(e),'partial_preserved':partial.exists()})
    report['elapsed_seconds'] = round(time.monotonic()-started,3)
    (HERE/'acquisition-download.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report))
    if report['result'] != 'ARCHIVE_HASH_VERIFIED_NOT_EXTRACTED_OR_EXECUTED':raise SystemExit(1)


if __name__ == '__main__':
    main()
