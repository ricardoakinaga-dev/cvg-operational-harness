#!/usr/bin/env python3
"""Bind vendored source data to lock checksums/Git revisions; no source execution."""
from pathlib import Path, PurePosixPath
import hashlib
import json
import os
import re
import subprocess
import sys
import tomllib
import urllib.parse

HERE = Path(__file__).resolve().parent
sha = lambda b: hashlib.sha256(b).hexdigest()


def need(ok, why):
    if not ok:raise ValueError(why)


def filehash(p):
    with p.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()


def main():
    raw = (HERE/'contract.json').read_bytes();need(sha(raw) == '7ad8f3de808cf2342ee0f9e7547387145453764c29f6d7134a1b649eaa2184dd','contract changed')
    c = json.loads(raw);root = Path(c['resource_root']);source = root/'source';vendor = root/'vendor'
    env = {'PATH':'/usr/bin:/bin','LANG':'C.UTF-8','GIT_CONFIG_NOSYSTEM':'1','GIT_CONFIG_GLOBAL':'/dev/null','GIT_OPTIONAL_LOCKS':'0','GIT_TERMINAL_PROMPT':'0'}
    def git(path,*args):return subprocess.check_output(['git','-C',str(path),*args],env=env)
    need(git(source,'rev-parse','HEAD').decode().strip() == c['pin'] and not git(source,'status','--porcelain'),'source pin/worktree changed')
    for r in c['source_inputs']:
        # Inputs are upstream-relative; the own source copy has the same tree.
        p = source/r['path'];need(p.stat().st_size == r['bytes'] and filehash(p) == r['sha256'],'source input changed '+r['path'])
    lock = tomllib.loads((source/'codex-rs/Cargo.lock').read_text())
    remote = [p for p in lock['package'] if p.get('source')]
    by_pair = {(p['name'],p['version']):p for p in remote};need(len(by_pair) == len(remote),'ambiguous same-name/version remote identity')
    need({p['source'] for p in remote if p['source'].startswith('git+')} == set(c['locked_git_sources']),'Git origins changed')
    logs = sorted(HERE.glob('vendor-*.json'));attempts = [json.loads(p.read_text()) for p in logs]
    good = [a for a in attempts if a.get('status') == 'TERMINAL' and a.get('exit') == 0 and not a.get('abort_reason')]
    need(len(good) == 1,'exact one successful acquisition expected');run = good[0]
    need(run['actual_kernel_guard_observed'],'missing live kernel limits guard')
    stdout,stderr = (HERE/run['stdout']).read_bytes(),(HERE/run['stderr']).read_bytes()
    need(sha(stdout) == run['stdout_sha256'] and sha(stderr) == run['stderr_sha256'],'acquisition log bytes changed')
    cfg = tomllib.loads(stdout.decode());need(cfg['source']['vendored-sources']['directory'] == '/vendor','vendor config directory mismatch')
    need((HERE/'vendor-config.toml').read_bytes() == stdout,'vendor config not original Cargo stdout')
    origins = {}
    for line in stderr.decode(errors='replace').splitlines():
        m = re.match(r'\s*Vendoring ([A-Za-z0-9_-]+) v([^ ]+) \(([^)]+)\)(?: \(([^)]+)\))? to (/vendor/[^ ]+)$',line)
        if m:
            name,version,label,checkout,destination = m.groups();origins[(name,version)] = {'origin':checkout or label,'source_label':label,'destination':destination}
    packages = [];files = [];seen = set();git_commits = set();registry_count = 0;git_count = 0
    for directory in sorted(vendor.iterdir()):
        need(directory.is_dir() and not directory.is_symlink(),'unexpected vendor entry')
        manifest = tomllib.loads((directory/'Cargo.toml').read_text());p = manifest['package'];key = (p['name'],p['version'])
        need(key in by_pair and key not in seen,'unknown/duplicate vendored package '+str(key));seen.add(key);expected = by_pair[key]
        identity = origins.get(key);need(identity and identity['destination'] == '/vendor/'+directory.name,'missing Cargo acquisition origin')
        checks = json.loads((directory/'.cargo-checksum.json').read_text());source_id = expected['source'];archive = None;commit = None
        if source_id.startswith('registry+'):
            need(source_id in c['allowed_registry_sources'],'unexpected registry')
            need(checks['package'] == expected['checksum'],'vendor package checksum mismatch')
            candidates = list((root/'work/cargo/registry/cache').glob('*/'+p['name']+'-'+p['version']+'.crate'))
            need(len(candidates) == 1,'missing/ambiguous cached archive '+str(key));archive = candidates[0]
            need(not archive.is_symlink() and filehash(archive) == expected['checksum'],'registry archive not lock-authenticated '+str(key));registry_count += 1
        elif source_id.startswith('git+'):
            need(checks['package'] is None,'Git package marked registry')
            u = urllib.parse.urlsplit(source_id[4:]);need(u.scheme == 'https' and u.hostname == 'github.com' and not u.username and re.fullmatch('[0-9a-f]{40}',u.fragment),'unapproved Git identity')
            need(identity['origin'].startswith('/work/cargo/git/checkouts/'),'Git origin not a Cargo checkout')
            checkout_path = root/identity['origin'].lstrip('/');need(checkout_path.resolve().is_relative_to((root/'work/cargo/git/checkouts').resolve()),'Git checkout escape')
            commit = git(checkout_path,'rev-parse','HEAD').decode().strip();need(commit == u.fragment,'locked Git commit differs')
            need(not git(checkout_path,'status','--porcelain','--untracked-files=no'),'tracked Git dependency modified')
            git_commits.add((source_id,commit));git_count += 1
        else:raise ValueError('unexpected remote source scheme')
        members = checks['files'];actual = {str(q.relative_to(directory)) for q in directory.rglob('*') if q.is_file() or q.is_symlink()}
        need(actual == set(members)|{'.cargo-checksum.json'},'vendor exact file set differs '+str(key))
        package_rows = []
        for rel,expected_hash in sorted(members.items()):
            q = PurePosixPath(rel);need(not q.is_absolute() and '..' not in q.parts,'unsafe member path')
            f = directory/rel;need(f.resolve().is_relative_to(directory.resolve()),'vendor link escape')
            actual_hash = filehash(f);need(actual_hash == expected_hash,'vendor member changed '+str(f))
            row = {'path':str(f.relative_to(vendor)),'bytes':f.stat().st_size,'sha256':actual_hash,'kind':'SYMLINK' if f.is_symlink() else 'FILE'}
            if f.is_symlink():row['target'] = os.readlink(f)
            package_rows.append(row);files.append(row)
        checksum_file = directory/'.cargo-checksum.json';files.append({'path':str(checksum_file.relative_to(vendor)),'bytes':checksum_file.stat().st_size,'sha256':filehash(checksum_file),'kind':'FILE'})
        body = (json.dumps(package_rows,sort_keys=True,separators=(',',':'))+'\n').encode()
        packages.append({'name':p['name'],'version':p['version'],'source':source_id,'vendor_directory':directory.name,'Cargo_origin':identity['origin'],'registry_archive_sha256':expected.get('checksum'),'registry_archive':str(archive) if archive else None,'Git_commit':commit,'member_files':len(package_rows),'member_records_sha256':sha(body)})
    need(seen == set(by_pair),'remote package omitted');need(registry_count == 1293 and git_count == 18 and len(git_commits) == 8,'expected locked population differs')
    files.sort(key=lambda r:r['path']);raw_files = (json.dumps(files,sort_keys=True,separators=(',',':'))+'\n').encode();index_path = root/'control/vendor-files.json'
    if '--check' in sys.argv:need(index_path.read_bytes() == raw_files,'vendor file registry changed')
    else:index_path.write_bytes(raw_files)
    report = {'kind':'LOCK_AUTHENTICATED_REFERENCE_DEPENDENCIES_NOT_CODEX_BUILD','pin':c['pin'],'Cargo_lock_sha256':filehash(source/'codex-rs/Cargo.lock'),'successful_acquisition_attempt':run['attempt'],'vendor_config_sha256':sha(stdout),'remote_packages':len(packages),'registry_archives_verified':registry_count,'Git_packages_verified':git_count,'locked_Git_repositories':len(git_commits),'packages':packages,'file_registry':{'path':str(index_path),'entries':len(files),'bytes':len(raw_files),'sha256':sha(raw_files)},'Codex_compiled':False,'Codex_executed':False,'functional_receipts':0}
    data = (json.dumps(report,indent=2)+'\n').encode();path = HERE/'vendor-verification.json'
    if '--check' in sys.argv:need(path.read_bytes() == data,'vendor verification changed')
    else:path.write_bytes(data)
    print(json.dumps({k:report[k] for k in ['remote_packages','registry_archives_verified','Git_packages_verified','locked_Git_repositories','file_registry','Codex_compiled','Codex_executed']}))


if __name__ == '__main__':main()
