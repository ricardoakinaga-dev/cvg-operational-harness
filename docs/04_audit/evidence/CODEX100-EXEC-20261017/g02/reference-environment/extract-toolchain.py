#!/usr/bin/env python3
"""Copy selected regular Rust archive members into a new owned directory; no exec."""
from pathlib import Path, PurePosixPath
import hashlib
import json
import os
import shutil
import tarfile

HERE = Path(__file__).resolve().parent
sha = lambda b: hashlib.sha256(b).hexdigest()


def need(ok, why):
    if not ok:raise ValueError(why)


def main():
    c = json.loads((HERE/'component-acquisition-contract.json').read_text())
    need(sha((HERE/'component-acquisition-contract.json').read_bytes()) == '94fb96effd630be495a4165faf14d98c08b4092e884a44d32b3356b210d8c373','component contract drift')
    need(json.loads((HERE/'resource-control-probe.json').read_text())['result'] == 'KERNEL_SCOPE_LIMITS_MATCH','unproven resource guards')
    main = json.loads((HERE/'acquisition-download.json').read_text());src = json.loads((HERE/'rust-src-acquisition.json').read_text())
    root = Path(c['owned_root'])/'extracted';need(not root.exists(),'existing extraction: inspect prior attempt before retry')
    need(shutil.disk_usage(root.parent).free >= c['limits']['minimum_free_disk_bytes'],'insufficient disk headroom');root.mkdir()
    requested = set(c['requested_components']);rows = [];archives = []
    for record,expected,top in [(main,main['actual_sha256'],'rust-1.95.0-x86_64-unknown-linux-gnu'),(src,src['sha256'],'rust-src-1.95.0')]:
        path = Path(record.get('archive_path',record.get('path')))
        with path.open('rb') as f:need(hashlib.file_digest(f,'sha256').hexdigest() == expected,'archive bytes changed')
        selected = [];expanded = 0;components = [];installer = None
        with tarfile.open(path,'r:xz') as tar:
            members = tar.getmembers();need(len(members) <= 100000,'member count cap')
            for m in members:
                q = PurePosixPath(m.name);parts = q.parts
                need(not q.is_absolute() and '..' not in parts and parts and parts[0] == top,'unsafe archive path')
                need(m.isdir() or m.isfile(),'this extraction accepts regular files/directories only')
                expanded += m.size;need(expanded <= 5000000000,'expanded archive byte cap')
                if m.name == top+'/components':components = tar.extractfile(m).read(32768).decode().splitlines()
                if m.name == top+'/install.sh':
                    need(m.size <= 262144,'installer size');installer = tar.extractfile(m).read()
                if len(parts) <= 2 and (m.isfile() or len(parts) == 1) or len(parts)>1 and parts[1] in requested:selected.append(m)
            need(installer is not None,'installer absent')
            # Fresh output, no links admitted, no archive-generated code executed.
            for m in selected:
                out = root/m.name;need(out.is_relative_to(root),'path escape')
                if m.isdir():out.mkdir(parents=True,exist_ok=True);continue
                out.parent.mkdir(parents=True,exist_ok=True);need(not out.exists(),'duplicate archive output')
                h = hashlib.sha256()
                with tar.extractfile(m) as source, out.open('xb') as target:
                    while True:
                        block = source.read(1024*1024)
                        if not block:break
                        target.write(block);h.update(block)
                os.chmod(out,m.mode & 0o777)
                rows.append({'path':str(out.relative_to(root)),'bytes':m.size,'sha256':h.hexdigest(),'mode':m.mode & 0o777})
        archives.append({'path':str(path),'sha256':expected,'top':top,'components':components,'installer_sha256':sha(installer),'selected_regular_files':sum(r['path'].startswith(top+'/') for r in rows)})
        if top.startswith('rust-src'):(HERE/'official-rust-src-installer.sh.txt').write_bytes(installer)
    need(set(archives[0]['components']) | set(archives[1]['components']) >= requested,'requested component absent')
    report = {'kind':'SELECTED_AUTHENTICATED_RUST_TOOLCHAIN_EXTRACTION_NO_EXECUTION','root':str(root),'archives':archives,'files':rows,'file_count':len(rows),'regular_bytes':sum(r['bytes'] for r in rows),'installer_same_code_bytes':archives[0]['installer_sha256'] == archives[1]['installer_sha256'],'installed':False,'upstream_executed':False,'functional_receipts':0}
    (HERE/'extracted-files.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({k:report[k] for k in ['kind','file_count','regular_bytes','installer_same_code_bytes','installed','upstream_executed','functional_receipts']}))


if __name__ == '__main__':main()
