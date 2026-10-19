#!/usr/bin/env python3
"""T1 reference preparation: read Git/TOML/JSON/source bytes; no target execution."""
from pathlib import Path
import hashlib
import json
import subprocess
import sys
import tomllib

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[6]
UP = Path('/tmp/cvg-rea-codex-20261017/upstream')
PIN = '8d9f6466ff0294785d56f55b1fe363d132fe4133'
PARENT = '182723fb6159aad4c13d769c106d250ab8d7dec0f7edaadc861553a3757ff2a7'
sha = lambda b: hashlib.sha256(b).hexdigest()


def require(ok, text):
    if not ok:
        raise ValueError(text)


def git(*args):
    return subprocess.check_output(['git', '-C', str(UP), *args])


def build():
    require(sha((HERE.parent/'contract.json').read_bytes()) == PARENT, 'parent drift')
    require(git('rev-parse', 'HEAD').decode().strip() == PIN, 'wrong pin')
    require(not git('status', '--porcelain'), 'dirty upstream')
    files = ['codex-rs/rust-toolchain.toml', 'codex-rs/Cargo.toml',
             'codex-rs/cli/Cargo.toml', 'codex-rs/cli/build.rs',
             'codex-rs/.cargo/config.toml', 'codex-rs/Cargo.lock',
             'sdk/python/pyproject.toml', 'sdk/typescript/package.json']
    sources = []
    parsed = {}
    for name in files:
        b = (UP/name).read_bytes()
        require(git('show', PIN+':'+name) == b, 'source blob changed: '+name)
        oid = hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()
        sources.append({'path': name, 'bytes': len(b), 'sha256': sha(b), 'git_blob': oid})
        if name.endswith('.toml') and not name.endswith('Cargo.lock'):
            parsed[name] = tomllib.loads(b.decode())
    tc = parsed['codex-rs/rust-toolchain.toml']['toolchain']
    cli = parsed['codex-rs/cli/Cargo.toml']
    require(tc['channel'] == '1.95.0', 'toolchain changed')
    require(any(b['name'] == 'codex' and b['path'] == 'src/main.rs' for b in cli['bin']), 'CLI bin changed')
    cvg = []
    for name, needles in [
        ('packages/sdk/src/server.ts', ["runtimeProfile: 'single_pass'"]),
        ('packages/contracts/src/contracts.ts', ['export interface ModelGateway {', 'complete(request: ModelRequest): Promise<ModelResult>']),
        ('packages/harness/src/createOperationalHarness.ts', ['options.iterativeOrchestrator && options.stepStore']),
    ]:
        b = (ROOT/name).read_bytes()
        spans = []
        for needle in needles:
            n = needle.encode(); require(b.count(n) == 1, 'CVG source anchor missing/ambiguous: '+needle)
            start = b.index(n); end = start+len(n)
            spans.append({'start_byte': start, 'end_byte_exclusive': end,
                          'start_line': b[:start].count(b'\n')+1,
                          'sha256': sha(n), 'text': needle})
        cvg.append({'path': name, 'bytes': len(b), 'sha256': sha(b), 'spans': spans})
    return {'schema_version': 'cvg.codex100.reference-preparation.v1', 'pin': PIN,
            'parent_contract_sha256': PARENT, 'sources': sources, 'cvg_sources': cvg,
            'rust_toolchain': tc, 'cargo_package': cli['package']['name'],
            'cargo_binary': [b for b in cli['bin'] if b['name'] == 'codex'][0],
            'cargo_config': parsed['codex-rs/.cargo/config.toml'],
            'source_pyproject_dependencies': parsed['sdk/python/pyproject.toml']['project']['dependencies'],
            'candidate_engine': 'NATIVE_CVG_NOT_INSTALLED_CODEX_FORWARDER',
            'reference_binding': 'OPEN_G02', 'first_native_journey': 'PROPOSED_G04',
            'target_execution': False, 'build_authorization': False, 'functional_receipts': 0}


def main():
    value = build()
    require(value == build(), 'nondeterministic evidence')
    data = (json.dumps(value, ensure_ascii=False, indent=2)+'\n').encode()
    path = HERE/'inventory.json'
    if '--check' in sys.argv:
        require(path.read_bytes() == data, 'reference preparation drift')
    else:
        path.write_bytes(data)
    print(json.dumps({'result': 'PASS_T1_PREPARATION_ONLY', 'source_files': len(value['sources']),
                      'cvg_sources': len(value['cvg_sources']), 'functional_receipts': 0}))


if __name__ == '__main__':
    main()
