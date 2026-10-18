#!/usr/bin/env python3
"""Attest one terminal pinned CLI build from bytes/logs; never execute the ELF."""
from pathlib import Path
import hashlib
import json
import os
import stat
import struct
import subprocess
import sys
import tomllib

HERE = Path(__file__).resolve().parent
sha = lambda b:hashlib.sha256(b).hexdigest()

def need(ok,why):
    if not ok:raise ValueError(why)

def main():
    run = json.loads((HERE/'live.json').read_text())
    need(run['status'] == 'TERMINAL','inspect SAME live job; verifier cannot attest a running build')
    need(run['exit'] == 0 and not run['abort_reason'],'build has not succeeded; preserve original failure')
    need(run['actual_kernel_guard_observed'] and run['namespace_guards_observed'] and run['build_started'],'guarded compilation not proven')
    c = json.loads((HERE/'contract.json').read_text());root = Path(c['resource_root'])
    for name in ['stdout','stderr']:
        need(sha((HERE/run[name]).read_bytes()) == run[name+'_sha256'],'build log drift')
    out = (HERE/run['stdout']).read_text();err = (HERE/run['stderr']).read_text()
    for marker in ['CVG_TRUSTED_C_AND_RUST_LINKER_PROBES_PASS','CVG_TRUSTED_OPENSSL_AND_LIBCAP_PROBES_PASS','CVG_FIXED_REFERENCE_BUILD_START']:
        need(marker in out,'pre-upstream trusted proof missing '+marker)
    first = err.splitlines()[0];need(first.startswith('CVG_KERNEL_LIMITS '),'kernel proof absent');limits = json.loads(first.split(' ',1)[1])
    need(limits['memory_max'] == str(run['effective_limits']['memory_bytes']) == '19327352832' and limits['memory_swap_max'] == '0' and limits['pids_max'] == '256','resource proof differs')
    cpu = limits['cpu_max'];need(cpu[0] != 'max' and int(cpu[0])/int(cpu[1]) == 4,'CPU limit differs')
    events = [json.loads(line) for line in out.splitlines() if line.startswith('{"reason":')]
    finish = [e for e in events if e['reason'] == 'build-finished'];need(len(finish) == 1 and finish[0]['success'],'Cargo success event absent')
    cli = [e for e in events if e['reason'] == 'compiler-artifact' and e['target']['name'] == 'codex' and 'bin' in e['target']['kind']]
    need(len(cli) == 1,'CLI artifact event missing/ambiguous');cli = cli[0]
    need(cli['manifest_path'] == '/source/codex-rs/cli/Cargo.toml' and cli['executable'] == '/target/release/codex','unexpected CLI output target')
    need(cli['features'] == [] and cli['profile']['opt_level'] == '3' and not cli['profile']['debug_assertions'],'unexpected CLI features/profile')
    need(run['effective_build_command'] == ['/toolchain/bin/cargo','build','--frozen','--release','-p','codex-cli','--bin','codex','--jobs','1','--message-format=json-render-diagnostics'] and run['environment']['CARGO_BUILD_JOBS'] == '1','unexpected compiler scheduling command')
    need(not any(k.startswith(('RUSTFLAGS','CARGO_PROFILE_','CODEX_SKIP_BWRAP_BUILD')) for k in run['environment']),'reference build options changed')
    manifest = tomllib.loads((root/'source/codex-rs/Cargo.toml').read_text());profile = manifest['profile']['release']
    need(profile['lto'] == 'thin' and profile['debug'] == 'line-tables-only' and profile['split-debuginfo'] == 'off' and profile['strip'] is False and profile['codegen-units'] == 4,'original release profile changed')
    storage_raw = (HERE/'storage-recovery-contract.json').read_bytes()
    need(sha(storage_raw) == run['storage_recovery_contract_sha256'] == 'd4a34ccce8f49a3c86d0bc84400db73aa28d60e433c3d13bc6eeeca62ab40322','storage recovery binding changed')
    storage = json.loads(storage_raw);target = Path(storage['target_storage'])
    need(str(target) == run['target_storage'] == '/mnt/ia/cvg-codex100-exec-20261017/reference-target' and target.resolve() == target and not target.is_symlink(),'unexpected target storage')
    artifact = target/'release/codex';need(artifact.is_file() and not artifact.is_symlink() and stat.S_IMODE(artifact.stat().st_mode)&0o111,'artifact not regular executable')
    with artifact.open('rb') as f:
        header = f.read(64);f.seek(0);digest = hashlib.file_digest(f,'sha256').hexdigest()
    need(header[:6] == b'\x7fELF\x02\x01' and struct.unpack_from('<H',header,18)[0] == 62,'expected x86_64 little-endian ELF64')
    need(run['artifact'] == {'path':str(artifact),'bytes':artifact.stat().st_size,'sha256':digest},'recorded artifact differs')
    # Existing acquisition verifiers recheck readonly input trees after code execution.
    for script in [HERE.parent/'locked-dependencies/verify-vendor.py',HERE.parent/'reference-environment/verify.py',HERE.parent/'native-prerequisites/verify.py']:
        subprocess.run(['/usr/bin/python3','-I',str(script),'--check'],check=True,timeout=180,stdout=subprocess.DEVNULL)
    snapshot = json.loads((HERE.parent/'locked-dependencies/source-snapshot.json').read_text());source = root/'source'
    git_env = {'PATH':'/usr/bin:/bin','LANG':'C.UTF-8','GIT_CONFIG_NOSYSTEM':'1','GIT_CONFIG_GLOBAL':'/dev/null','GIT_OPTIONAL_LOCKS':'0'}
    need(subprocess.check_output(['git','-C',str(source),'rev-parse','HEAD'],env=git_env,text=True).strip() == c['pin'],'source pin changed')
    need(not subprocess.check_output(['git','-C',str(source),'status','--porcelain'],env=git_env),'source worktree changed')
    for row in snapshot['files']:
        p = source/row['path']
        if row['git_mode'] == '120000':need(p.is_symlink() and p.resolve().is_relative_to(source.resolve()) and sha(os.fsencode(os.readlink(p))) == row['sha256'],'source link drift')
        else:
            with p.open('rb') as f:need(not p.is_symlink() and hashlib.file_digest(f,'sha256').hexdigest() == row['sha256'],'source bytes drift')
    uid = os.getuid();env = {'PATH':'/usr/bin:/bin','XDG_RUNTIME_DIR':'/run/user/'+str(uid),'DBUS_SESSION_BUS_ADDRESS':'unix:path=/run/user/'+str(uid)+'/bus'}
    active = subprocess.run(['systemctl','--user','show',run['unit'],'-p','ActiveState','--value'],env=env,capture_output=True,text=True,timeout=10).stdout.strip();need(active in ['inactive','failed',''],'owned build scope remains active')
    work = root/'build-work';inputs = {}
    for name in ['metadata.json','tree.txt','tool-versions.json','cargo/config.toml']:
        p = work/name;inputs[name] = {'path':str(p),'bytes':p.stat().st_size,'sha256':sha(p.read_bytes())}
    versions = json.loads((work/'tool-versions.json').read_text());need('rustc 1.95.0 ' in versions['rustc']['stdout'] and 'cargo 1.95.0 ' in versions['cargo']['stdout'],'compiler version differs')
    # readelf parses bytes; ldd and the target executable are deliberately not invoked.
    elf = subprocess.check_output(['/usr/bin/readelf','-h','-d',str(artifact)],timeout=30)
    if '--check' in sys.argv:need((HERE/'artifact-readelf.txt').read_bytes() == elf,'ELF parse changed')
    else:(HERE/'artifact-readelf.txt').write_bytes(elf)
    artifact_events = [e for e in events if e['reason'] == 'compiler-artifact']
    feature_rows = [{'package_id':e['package_id'],'target':e['target']['name'],'kind':e['target']['kind'],'features':e['features'],'profile':e['profile'],'fresh':e['fresh']} for e in artifact_events]
    feature_raw = (json.dumps(feature_rows,sort_keys=True,separators=(',',':'))+'\n').encode()
    if '--check' in sys.argv:need((HERE/'compiled-target-features.json').read_bytes() == feature_raw,'compiled feature registry changed')
    else:(HERE/'compiled-target-features.json').write_bytes(feature_raw)
    bwrap = [e for e in events if e['reason'] == 'build-script-executed' and 'bwrap' in e['package_id']]
    # codex-bwrap is a separate workspace binary, not a dependency of codex-cli.
    # Preserve its pending obligation rather than claiming the CLI build covers it.
    bwrap_disposition = {'status':'COMPILED_IN_THIS_LINEAGE' if bwrap else 'SEPARATE_BINARY_NOT_COMPILED_BY_CLI_TARGET','build_events':bwrap,'remaining':'Build/qualify pinned standalone bwrap and other workspace binaries separately; libcap prerequisites are prepared, not proof that helper was built'}
    report = {'kind':'PINNED_SOURCE_DEFAULT_LINUX_CLI_BUILD_PROVENANCE_NOT_PARITY','pin':c['pin'],'attempt':run['attempt'],'attempt_report_sha256':sha((HERE/(run['attempt']+'.json')).read_bytes()),'artifact':run['artifact'],'compiled_artifact_events':len(artifact_events),'compiled_target_features_sha256':sha(feature_raw),'CLI_artifact_event':cli,'standalone_bwrap':bwrap_disposition,'source_paths_rechecked':9288,'input_trees_rechecked':['source','vendor','toolchain','native'],'build_inputs':inputs,'compiler_and_linker_versions':versions,'actual_kernel_limits':limits,'scope_now':active,'native_dependencies':'4 signed-index Ubuntu packages in readonly private sysroot; libcap prepares separate bwrap, not a claim of CLI dependency','build_command':run['effective_build_command'],'base_initial_build_command':c['build_command'],'platform':c['platform'],'one_compilation_lineage_only':'Partial own cache resume lineage recorded; no claim of independent bit-for-bit reproducibility','Codex_binary_executed':False,'functional_receipts':0,'native_CVG_feature_BUILD':False,'full_G01_G02_closure':False,'remaining':'Other binaries/platforms/opt-in variants, actual reference runtime oracles/SDK compatibility, all CVG functionality still require evidence'}
    raw = (json.dumps(report,indent=2)+'\n').encode();path = HERE/'build-provenance.json'
    if '--check' in sys.argv:need(path.read_bytes() == raw,'provenance changed')
    else:path.write_bytes(raw)
    print(json.dumps({k:report[k] for k in ['kind','pin','attempt','artifact','compiled_artifact_events','source_paths_rechecked','scope_now','Codex_binary_executed','functional_receipts']}))

if __name__ == '__main__':main()
