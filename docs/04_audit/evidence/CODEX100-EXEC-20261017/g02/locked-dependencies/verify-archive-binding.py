#!/usr/bin/env python3
"""Compare Cargo's vendor member checksums to independently authenticated inputs."""
from pathlib import Path, PurePosixPath
import hashlib
import json
import tarfile
import sys

HERE = Path(__file__).resolve().parent
sha = lambda b:hashlib.sha256(b).hexdigest()

def need(ok, why):
    if not ok:raise ValueError(why)

def main():
    raw = (HERE/'vendor-verification.json').read_bytes();d = json.loads(raw)
    root = Path(json.loads((HERE/'contract.json').read_text())['resource_root'])
    registry = [];git = []
    for package in d['packages']:
        name = package['vendor_directory'];v = root/'vendor'/name
        checks = json.loads((v/'.cargo-checksum.json').read_text())['files']
        if package['registry_archive']:
            archive = Path(package['registry_archive'])
            with archive.open('rb') as f:need(hashlib.file_digest(f,'sha256').hexdigest() == package['registry_archive_sha256'],'archive drift '+name)
            names = set();omitted_metadata = []
            with tarfile.open(archive,'r:gz') as tar:
                for m in tar:
                    p = PurePosixPath(m.name)
                    need(not p.is_absolute() and '..' not in p.parts and p.parts[0] == name,'unsafe archive member '+name)
                    if m.isdir():continue
                    need(m.isfile(),'nonregular registry input '+name+':'+m.name)
                    rel = str(PurePosixPath(*p.parts[1:]));need(rel not in names,'duplicate archive member '+name+':'+rel)
                    if rel not in checks:
                        need(PurePosixPath(rel).name in ['.gitignore','.gitattributes','.gitmodules'],'unexpected archive member omitted from vendor '+name+':'+rel)
                        with tar.extractfile(m) as f:omitted_metadata.append({'path':rel,'sha256':hashlib.file_digest(f,'sha256').hexdigest()})
                        continue
                    names.add(rel)
                    with tar.extractfile(m) as f:need(hashlib.file_digest(f,'sha256').hexdigest() == checks[rel],'vendor not authenticated by archive '+name+':'+rel)
            need(names == set(checks),'vendor contains unauthenticated member '+name)
            registry.append({'directory':name,'archive_sha256':package['registry_archive_sha256'],'exact_members':len(names),'Cargo_omitted_Git_metadata':omitted_metadata})
        else:
            original = root/package['Cargo_origin'].lstrip('/')
            for rel,h in checks.items():
                if rel == 'Cargo.toml':continue
                q = original/rel;need(q.is_file(),'Git member missing '+name+':'+rel)
                with q.open('rb') as f:need(hashlib.file_digest(f,'sha256').hexdigest() == h,'Git vendor body differs '+name+':'+rel)
            git.append({'directory':name,'locked_commit':package['Git_commit'],'unchanged_members':len(checks)-1,'Cargo_toml_original_sha256':sha((original/'Cargo.toml').read_bytes()),'Cargo_toml_normalized_sha256':sha((v/'Cargo.toml').read_bytes()),'manifest_transform':'Cargo1.95.0 vendor normalizes Git package manifests; generated manifest is recorded separately, not claimed byte-identical to Git original'})
    report = {'kind':'INDEPENDENT_ARCHIVE_TO_VENDOR_MEMBER_BINDING','vendor_verification_sha256':sha(raw),'registry_packages':len(registry),'registry_member_files':sum(p['exact_members'] for p in registry),'registry':registry,'Git_packages':len(git),'Git_member_files_unchanged':sum(p['unchanged_members'] for p in git),'Git':git,'Git_manifest_normalizations':18,'source_code_executed':False,'functional_receipts':0}
    data = (json.dumps(report,indent=2)+'\n').encode();p = HERE/'archive-binding.json'
    if '--check' in sys.argv:need(p.read_bytes() == data,'archive binding changed')
    else:p.write_bytes(data)
    print(json.dumps({k:v for k,v in report.items() if k not in ['registry','Git']}))

if __name__ == '__main__':main()
