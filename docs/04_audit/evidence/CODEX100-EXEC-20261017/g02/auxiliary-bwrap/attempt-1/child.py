#!/usr/bin/env python3
"""Trusted preflight then fixed offline reference build inside private namespace."""
from pathlib import Path
import errno
import json
import os
import subprocess

checks = {}
for name in ['source', 'vendor', 'toolchain', 'native']:
    p = Path('/'+name+'/.cvg-owned-readonly-probe')
    try:
        p.write_bytes(b'guard')
    except OSError as exc:
        assert exc.errno == errno.EROFS, (name, exc)
        checks[name+'_readonly'] = True
    else:
        p.unlink()
        raise AssertionError('expected readonly '+name)
for name in ['work', 'target']:
    p = Path('/'+name+'/.guard-probe');p.write_bytes(b'owned');assert p.read_bytes() == b'owned';p.unlink()
    checks[name+'_owned_write'] = True
assert not Path('/home/ricardo').exists()
assert not Path('/run/user').exists()
assert len(Path('/proc/net/route').read_text().splitlines()) == 1
assert not any(k in os.environ for k in ['HOME', 'CODEX_HOME', 'OPENAI_API_KEY', 'HTTP_PROXY', 'HTTPS_PROXY'])
checks.update({'host_home_absent':True,'host_sockets_absent':True,'network_routes_absent':True,'personal_env_absent':True})
print('CVG_BUILD_NAMESPACE_GUARDS '+json.dumps(checks),flush=True)
versions = {}
for name,args in {'rustc':['/toolchain/bin/rustc','-vV'],'cargo':['/toolchain/bin/cargo','-vV'],'cc':['/usr/bin/cc','--version'],'c++':['/usr/bin/c++','--version'],'ld':['/usr/bin/ld','--version'],'ar':['/usr/bin/ar','--version'],'cmake':['/usr/bin/cmake','--version'],'pkg-config':['/usr/bin/pkg-config','--version'],'perl':['/usr/bin/perl','-v']}.items():
    r = subprocess.run(args,capture_output=True,text=True,timeout=15);assert r.returncode == 0,(name,r.stderr)
    versions[name] = {'args':args,'stdout':r.stdout,'stderr':r.stderr}
Path('/work/tool-versions.json').write_text(json.dumps(versions,indent=2)+'\n')
assert 'host: x86_64-unknown-linux-gnu' in versions['rustc']['stdout']
for name,args,source in [
    ('c',['/usr/bin/cc','-x','c','-','-o','/work/trusted-c-probe'],'int main(void) { return 0; }\n'),
    ('rust',['/toolchain/bin/rustc','--crate-name','cvg_trusted_probe','-','-o','/work/trusted-rust-probe'],'fn main() {}\n')]:
    subprocess.run(args,input=source,text=True,check=True,timeout=45)
    subprocess.run(['/work/trusted-'+name+'-probe'],check=True,timeout=5)
print('CVG_TRUSTED_C_AND_RUST_LINKER_PROBES_PASS',flush=True)
subprocess.run(['/usr/bin/pkg-config','--modversion','libcap'],check=True,timeout=10)
for name,source,libs in [
    ('openssl','#include <openssl/ssl.h>\nint main(void) { return OpenSSL_version_num() != OPENSSL_VERSION_NUMBER; }\n',['-lssl','-lcrypto']),
    ('libcap','#include <sys/capability.h>\nint main(void) { cap_t c=cap_init(); if (!c) return 1; return cap_free(c); }\n',['-lcap'])]:
    args = ['/usr/bin/cc','-I/native/usr/include','-I/native/usr/include/x86_64-linux-gnu','-L/native/usr/lib/x86_64-linux-gnu','-x','c','-','-o','/work/trusted-'+name+'-probe',*libs]
    subprocess.run(args,input=source,text=True,check=True,timeout=45)
    subprocess.run(['/work/trusted-'+name+'-probe'],check=True,timeout=5)
print('CVG_TRUSTED_OPENSSL_AND_LIBCAP_PROBES_PASS',flush=True)
for name,args in {'metadata.json':['metadata','--frozen','--format-version','1','--filter-platform','x86_64-unknown-linux-gnu'],'tree.txt':['tree','--frozen','-p','codex-bwrap','--edges','normal,build','--target','x86_64-unknown-linux-gnu']}.items():
    with Path('/work/'+name).open('xb') as out:
        subprocess.run(['/toolchain/bin/cargo',*args],stdout=out,check=True,timeout=120)
print('CVG_FIXED_REFERENCE_BUILD_START',flush=True)
args = ['/toolchain/bin/cargo','build','--frozen','--release','-p','codex-bwrap','--bin','bwrap','--jobs','1','--message-format=json-render-diagnostics']
os.execv(args[0],args)
