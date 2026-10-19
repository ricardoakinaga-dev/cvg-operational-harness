#!/usr/bin/env python3
"""Verify trusted tool setup evidence; no compiler, installer or target execution."""
from pathlib import Path
import hashlib
import json
import shutil
import stat
import subprocess
import sys
import tomllib

HERE = Path(__file__).resolve().parent
E = HERE.parents[1]
ROOT = E.parents[3]
UP = Path('/tmp/cvg-rea-codex-20261017/upstream')
sha = lambda b: hashlib.sha256(b).hexdigest()
load = lambda p: json.loads(p.read_text())
checks = []


def need(ok, why):
    if not ok:raise ValueError(why)


def check(name, action):
    value = action();checks.append({'name':name,'result':'PASS','detail':value})


def main():
    def contracts():
        expected = {'contract.json':'3d5ba72d6c11de4f58b7eff7b395341abfb8c7d4f9beecf56e5e88d4672e1c56','acquisition-contract.json':'260fe526efcba293b14d33fc11cb2708b9254c0c2f6090228a6bc3de6608949f','component-acquisition-contract.json':'94fb96effd630be495a4165faf14d98c08b4092e884a44d32b3356b210d8c373'}
        for name,h in expected.items():need(sha((HERE/name).read_bytes()) == h,'contract drift '+name)
        return len(expected)
    check('three_prior_phase_contracts',contracts)
    pre = load(HERE/'preflight.json');i = load(HERE/'installation.json');c = load(HERE/'component-acquisition-contract.json')
    check('bounded_trusted_containment_guards',lambda:need(pre['bwrap']['status'] == 'BOUNDED_TRUSTED_PROBES_PASS' and pre['bwrap']['owned_listener_connections'] == 0 and pre['bwrap']['owned_thread_stopped'],'preflight guards not proven'))
    check('actual_kernel_resource_limits',lambda:need(load(HERE/'resource-control-probe.json')['result'] == 'KERNEL_SCOPE_LIMITS_MATCH','resource guard absent'))

    def archives():
        b = (HERE/'channel-rust-1.95.0.toml').read_bytes();need(sha(b) == (HERE/'channel-rust-1.95.0.toml.sha256').read_text().split()[0],'manifest SHA')
        m = tomllib.loads(b.decode());need(m['pkg']['rust']['version'].startswith('1.95.0 '),'manifest version')
        rows = [load(HERE/'acquisition-download.json'),load(HERE/'rust-src-acquisition.json')]
        for row in rows:
            p = Path(row.get('archive_path',row.get('path')));expected = row.get('actual_sha256',row.get('sha256'))
            with p.open('rb') as f:need(hashlib.file_digest(f,'sha256').hexdigest() == expected,'archive bytes changed')
            need(row['url'].startswith('https://static.rust-lang.org/dist/'),'unapproved origin')
        need(rows[0]['actual_sha256'] == m['pkg']['rust']['target']['x86_64-unknown-linux-gnu']['xz_hash'],'main manifest binding')
        need(rows[1]['sha256'] == m['pkg']['rust-src']['target']['*']['xz_hash'],'src manifest binding')
        return {'main_bytes':rows[0]['bytes_downloaded'],'rust_src_bytes':rows[1]['bytes']}
    check('official_manifest_and_two_published_archive_hashes',archives)
    check('archive_metadata_no_unsafe_members',lambda:need(not load(HERE/'archive-inspection.json')['unsafe_members'],'unsafe archive members'))

    def extracted():
        d = load(HERE/'extracted-files.json');need(d['file_count'] == len(d['files']) == 2498,'extracted count')
        for row in d['files']:
            p = Path(d['root'])/row['path'];need(not p.is_symlink() and p.stat().st_size == row['bytes'],'extracted alias/size')
            with p.open('rb') as f:need(hashlib.file_digest(f,'sha256').hexdigest() == row['sha256'],'extracted source changed')
        return {'regular_files':2498,'bytes':d['regular_bytes']}
    check('selected_extracted_regular_files_authentic',extracted)

    def installers():
        a = (HERE/'official-installer.sh.txt').read_bytes();b = (HERE/'official-rust-src-installer.sh.txt').read_bytes()
        need(sha(a) == c['installer_inspected_sha256'],'main installer drift')
        need(a.replace(b"TEMPLATE_SUCCESS_MESSAGE='rust installed.'",b"TEMPLATE_SUCCESS_MESSAGE='rust src installed.'") == b,'unexpected source installer difference')
        need(i['installed'] and len(i['invocations']) == 4,'install/verify invocations incomplete')
        for run in i['invocations']:
            out,err = (HERE/run['stdout']).read_bytes(),(HERE/run['stderr']).read_bytes()
            need(run['status'] == 'TERMINAL' and run['exit'] == 0 and sha(out) == run['stdout_sha256'] and sha(err) == run['stderr_sha256'],'unproven tool invocation')
            need(b'"kernel_limits_before_tool": true' in out,'missing actual invocation resource guard')
        need('rustc 1.95.0 ' in i['rustc_version_output'] and 'cargo 1.95.0 ' in i['cargo_version_output'],'tool version mismatch')
        return {'bounded_invocations':4,'versions':'rustc/cargo1.95.0'}
    check('inspected_installers_actual_logs_versions_and_bounds',installers)

    def installed():
        d = load(HERE/'toolchain-files.json');root = Path(d['prefix']);actual = {str(p.relative_to(root)) for p in root.rglob('*') if p.is_file() or p.is_symlink()}
        need(len(d['files']) == d['entry_count'] == 2480 and actual == {r['path'] for r in d['files']},'installed exact file set')
        for row in d['files']:
            p = root/row['path']
            if row['kind'] == 'SYMLINK':need(p.is_symlink() and str(p.readlink()) == row['target'] and p.resolve().is_relative_to(root.resolve()),'installed unsafe link')
            else:
                need(not p.is_symlink() and p.stat().st_size == row['bytes'] and stat.S_IMODE(p.stat().st_mode) == row['mode'],'installed type/size/mode')
                with p.open('rb') as f:need(hashlib.file_digest(f,'sha256').hexdigest() == row['sha256'],'installed bytes changed')
        canonical = (json.dumps(d['files'],sort_keys=True,separators=(',',':'))+'\n').encode();need(sha(canonical) == d['tree_records_sha256'],'toolchain tree binding')
        need(set(d['components']) == set(c['requested_components']),'component omission')
        return {'installed_entries':2480,'components':6,'tree_records_sha256':d['tree_records_sha256']}
    check('installed_toolchain_exact_content_and_components',installed)
    check('owned_resources_terminal',lambda:need(load(HERE/'resource-cleanup.json')['all_owned_scopes_inactive'] and not load(HERE/'resource-cleanup.json')['live_exec_sessions'],'owned resource still live'))
    check('no_host_global_tool_installation',lambda:need(not i['global_installation'] and not i['host_PATH_changed'] and shutil.which('rustc') is None and shutil.which('cargo') is None,'host tool state changed'))

    def source():
        d = load(HERE/'source-build-recon.json');need(subprocess.check_output(['git','-C',str(UP),'rev-parse','HEAD']).decode().strip() == d['pin'],'pin changed')
        need(not subprocess.check_output(['git','-C',str(UP),'status','--porcelain']),'source dirty')
        for row in d['sources']:
            b = (UP/row['path']).read_bytes();need(sha(b) == row['sha256'] and len(b) == row['bytes'],'source build input drift')
        need(d['lock_package_entries'] == 1473 and len(d['git_sources_locked']) == 8,'lock recon drift')
        need(not d['Codex_compiled'] and not d['Codex_executed'],'reference execution falsely claimed')
        return {'source_inputs':6,'lock_entries':1473,'locked_Git_sources':8,'Codex_build':'NOT_STARTED'}
    check('pinned_source_build_inputs_and_open_execution_boundary',source)

    def prior():
        parent = load(E/'g01/public-acceptance/contract.json');packages = parent['source_packages']+[{'manifest':'g01/public-acceptance/manifest.json','sha256':'21237c6f80193c1c60388f7a8dc7dcfc32ac048f653d80538d69cce1ac380544','files':60}]
        total = 0
        for pkg in packages:
            p = E/pkg['manifest'];need(sha(p.read_bytes()) == pkg['sha256'],'prior source packet manifest drift');mf = load(p);need(len(mf['files']) == pkg['files'],'prior source packet count')
            for row in mf['files']:
                q = ROOT/row['path'] if row['path'].startswith('docs/') else p.parent/row['path'];need(q.is_file() and not q.is_symlink() and q.stat().st_size == row['bytes'] and sha(q.read_bytes()) == row['sha256'],'prior packet bytes changed')
            total += len(mf['files'])
        need(total == 548,'prior packet population')
        cat = load(ROOT/parent['catalog']['path']);need(sha((ROOT/parent['catalog']['path']).read_bytes()) == parent['catalog']['sha256'],'catalog changed')
        need(all(r['status'] == r['cvg_validation'] == 'NOT_RUN' and r['receipt'] is None for r in cat['requirements']),'false functional qualification')
        need(load(E/'g01/public-acceptance/integration.json')['counts']['uncovered_named_axes'] == 54,'old public obligations removed')
        return {'source_packets':12,'payloads':548,'root_manifests':12,'functional':487,'CVG_controls':22,'receipts':0}
    check('prior_packets_catalog_and_open_public_obligations',prior)
    state = load(E/'state.json')
    check('own_live_state_and_no_native_build_claim',lambda:need(state['goal_status'] == 'active' and state['reference_environment']['installed'] and state['reference_environment']['live_jobs'] == 0 and not state['reference_environment']['Codex_compiled'] and not state['reference_environment']['Codex_executed'] and state['no_progress_consecutive'] == 0,'own continuity inconsistent'))
    report = {'kind':'LEAD_REFERENCE_TOOL_SETUP_VERIFICATION_NOT_CODEX_OR_CVG_RUNTIME_PROOF','checks':checks,'passed':len(checks),'failed':0,'functional_receipts':0,'G02_reference_executable':'OPEN_NOT_BUILT','goal_status':'active'}
    b = (json.dumps(report,indent=2)+'\n').encode();p = HERE/'verification.json'
    if '--check' in sys.argv:need(p.read_bytes() == b,'verification report drift')
    else:p.write_bytes(b)
    print(json.dumps({'passed':len(checks),'failed':0,'functional_receipts':0,'Codex_executable':'NOT_BUILT'}))


if __name__ == '__main__':main()
