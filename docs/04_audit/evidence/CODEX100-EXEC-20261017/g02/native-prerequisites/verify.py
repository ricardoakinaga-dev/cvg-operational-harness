#!/usr/bin/env python3
"""Read-only verification of signed-index package acquisition and private sysroots."""
from pathlib import Path
import hashlib
import json
import os
import subprocess
import sys

HERE = Path(__file__).resolve().parent
sha = lambda b:hashlib.sha256(b).hexdigest()
FINGERPRINT = 'F6ECB3762474EDA9D21B7022871920D1991BC93C'

def need(ok,why):
    if not ok:raise ValueError(why)

def main():
    records = []
    for base,expected_h,expected_files in [(HERE,'9daf80a18f1ec503203a21712f93cbf9ab8fad8b059de620b560753d49072510',154),(HERE/'combined','cbb845d3635ffcdbfe7af27926a4d37fb27973232cf1c560ba5939bfc9ab6953',246)]:
        raw = (base/'contract.json').read_bytes();need(sha(raw) == expected_h,'native contract changed');c = json.loads(raw);root = Path(c['resource_root']);report = json.loads((base/'acquisition.json').read_text());run = json.loads((base/'run.json').read_text())
        need(run['status'] == 'TERMINAL' and run['exit'] == 0 and run['kernel_guard'] and run['scope_active_state'] == 'inactive','native acquisition not guarded/terminal')
        need(run['helper_sha256'] == sha((base/'acquire.py').read_bytes()),'helper differs from recorded run')
        for name in ['stdout','stderr']:need(sha((base/('acquisition.'+name+'.log')).read_bytes()) == run[name+'_sha256'],'native log drift')
        for name,row in c['existing_public_APT_inputs'].items():
            b = (root/'inputs'/name).read_bytes();need(len(b) == row['bytes'] and sha(b) == row['sha256'],'private APT snapshot drift')
        # Repeat signature verification of immutable own snapshot, not live host lists.
        g = subprocess.run(['/usr/bin/gpgv','--status-fd','1','--keyring',str(root/'inputs/Ubuntu_keyring'),str(root/'inputs/InRelease')],capture_output=True,text=True,timeout=30)
        need(g.returncode == 0 and '[GNUPG:] VALIDSIG '+FINGERPRINT+' ' in g.stdout,'native signature invalid')
        need(g.stdout == report['signature_status'] == (base/'gpgv.stdout.log').read_text(),'signature status drift')
        signed = (root/'inputs/InRelease').read_text();section = signed.split('\nSHA256:\n',1)[1];hashes = {}
        for line in section.splitlines():
            if not line.startswith(' '):break
            h,size,name = line.split();hashes[name] = (h,int(size))
        index = (root/'inputs/Packages').read_bytes();need((sha(index),len(index)) == hashes['main/binary-amd64/Packages'],'index not signed')
        by_name = {}
        for stanza in index.decode().split('\n\n'):
            row = {l.split(':',1)[0]:l.split(':',1)[1].strip() for l in stanza.splitlines() if ':' in l and not l.startswith((' ','\t'))}
            by_name[(row.get('Package'),row.get('Version'),row.get('Architecture'))] = row
        for package in report['packages']:
            p = package['package'];need(p in c['packages'],'unknown package');row = by_name[(p['name'],p['version'],p['architecture'])]
            need(all(str(p[k]) == row[k] for k in ['Filename','Size','SHA256']),'package not signed-index-bound')
            archive = root/Path(p['Filename']).name;need(archive.stat().st_size == p['Size'] and sha(archive.read_bytes()) == p['SHA256'],'archive differs')
            need(not package['maintainer_scripts_executed'],'maintainer execution claimed')
        need(len(report['packages']) == len(c['packages']),'package missing')
        tree = root/'sysroot';actual = {str(p.relative_to(tree)) for p in tree.rglob('*') if p.is_file() or p.is_symlink()};need(actual == {r['path'] for r in report['files']} and len(actual) == expected_files,'native exact set differs')
        for r in report['files']:
            p = tree/r['path'];need(p.resolve().is_relative_to(tree.resolve()),'sysroot escape')
            if r['kind'] == 'SYMLINK':need(p.is_symlink() and os.readlink(p) == r['target'],'native link changed')
            else:need(not p.is_symlink() and p.stat().st_size == r['bytes'] and sha(p.read_bytes()) == r['sha256'],'native member changed')
        records.append({'contract_sha256':expected_h,'package_count':len(c['packages']),'sysroot_entries':expected_files,'signature':FINGERPRINT,'signed_index_sha256':sha(index),'report_sha256':sha((base/'acquisition.json').read_bytes()),'scope':run['unit'],'status':'PASS'})
    q = subprocess.run(['dpkg-query','-W','-f=${Package} ${Status}\n','libssl-dev','libcap-dev'],capture_output=True,text=True,timeout=15)
    need('install ok installed' not in q.stdout,'unexpected host development package installation')
    result = {'kind':'NATIVE_REFERENCE_DATA_VERIFICATION_NOT_FUNCTIONAL_QUALIFICATION','records':records,'passes':len(records),'host_development_packages_installed':False,'maintainer_scripts_executed':False,'functional_receipts':0};data = (json.dumps(result,indent=2)+'\n').encode();p = HERE/'verification.json'
    if '--check' in sys.argv:need(p.read_bytes() == data,'native verification changed')
    else:p.write_bytes(data)
    print(json.dumps({k:result[k] for k in ['passes','host_development_packages_installed','maintainer_scripts_executed','functional_receipts']}))

if __name__ == '__main__':main()
