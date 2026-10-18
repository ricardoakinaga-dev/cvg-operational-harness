#!/usr/bin/env python3
"""Pinned T1 lexical source reader. Never import, build, or run target code.

--generate writes inventory/verification/handoff in this directory.
--freeze writes only manifest.json, after the separately authorized README format.
--check is read-only and checks all artifacts, negative controls, and source bytes.
"""
import argparse
import ast
import copy
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys

OUT = Path(__file__).resolve().parent
UP = Path('/tmp/cvg-rea-codex-20261017/upstream')
PIN = '8d9f6466ff0294785d56f55b1fe363d132fe4133'
CONTRACT = OUT.parent / 'arg0-contract.json'
TASK = 'DX100-G01:ARG0-DISPATCH-SOURCE'
CONTRACT_SHA256 = '14d69cb4d6236df9f91232b35a7e93bf6c7b7ffdcb3e85a034f9a852713c9e38'
ARG = 'codex-rs/arg0/src/lib.rs'
AL = 'codex-rs/apply-patch/src/lib.rs'
STANDALONE = 'codex-rs/apply-patch/src/standalone_executable.rs'
EX = 'codex-rs/exec-server/src/lib.rs'
SB = 'codex-rs/sandboxing/src/lib.rs'
PTY = 'codex-rs/utils/pty/src/lib.rs'
SPAWN = 'codex-rs/utils/pty/src/spawn_helper.rs'
WIN = 'codex-rs/windows-sandbox-rs/src/lib.rs'
WRAP = 'codex-rs/windows-sandbox-rs/src/wrapper.rs'
MXC = 'codex-rs/mxc-sandbox/src/lib.rs'
LINUX = 'codex-rs/linux-sandbox/src/lib.rs'
EXEC = 'codex-rs/exec-server/src/arg0_exec_helper.rs'
FS = 'codex-rs/exec-server/src/fs_helper.rs'
FSMAIN = 'codex-rs/exec-server/src/fs_helper_main.rs'
ARTIFACTS = ['README.md', 'build_arg0_inventory.py', 'handoff.json',
             'inventory.json', 'verification.json']


def require(ok, message):
    if not ok:
        raise ValueError(message)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def dump(value):
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + '\n').encode()


def git(*args):
    return subprocess.check_output(['git', '--no-optional-locks', '-C', str(UP), *args])


# Bounded lexical masking: comments, nested block comments, strings, raw strings,
# byte strings, char literals. Rust lifetime apostrophes are left intact.
# Not a compiler, macro expander, cfg evaluator, or general Rust parser.
def mask_rust(text):
    chars = list(text)
    i = 0
    while i < len(text):
        end = None
        if text.startswith('//', i):
            end = text.find('\n', i)
            if end < 0:
                end = len(text)
        elif text.startswith('/*', i):
            depth, j = 1, i + 2
            while depth and j < len(text):
                if text.startswith('/*', j):
                    depth += 1
                    j += 2
                elif text.startswith('*/', j):
                    depth -= 1
                    j += 2
                else:
                    j += 1
            require(depth == 0, 'Unclosed block comment')
            end = j
        else:
            raw = re.match(r'(?:br|r)(#*)"', text[i:])
            if raw:
                close = '"' + raw[1]
                j = text.find(close, i + len(raw[0]))
                require(j >= 0, 'Unclosed raw string')
                end = j + len(close)
            elif text[i] == '"':
                j = i + 1
                while j < len(text):
                    if text[j] == '\\':
                        j += 2
                    elif text[j] == '"':
                        break
                    else:
                        j += 1
                require(j < len(text), 'Unclosed string')
                end = j + 1
            elif text[i] == "'":
                char = re.match(r"'(?:[^'\\\n]|\\(?:u\{[0-9a-fA-F]+\}|x[0-9a-fA-F]{2}|.))'", text[i:])
                if char:
                    end = i + len(char[0])
        if end is None:
            i += 1
        else:
            for j in range(i, end):
                if chars[j] != '\n':
                    chars[j] = ' '
            i = end
    return ''.join(chars)


def balanced(mask, start, opening='{', closing='}'):
    require(mask[start] == opening, 'Invalid delimiter start')
    depth = 0
    for i in range(start, len(mask)):
        if mask[i] == opening:
            depth += 1
        elif mask[i] == closing:
            depth -= 1
            if depth == 0:
                return i + 1
    raise ValueError('Unclosed delimiter ' + opening)


class Reader:
    def __init__(self):
        require(git('rev-parse', 'HEAD').decode().strip() == PIN, 'HEAD differs from pin')
        self.files = {}
        self.fragments = {}
        self.raw = {}
        self.commit = git('cat-file', 'commit', PIN)
        require(hashlib.sha1(b'commit ' + str(len(self.commit)).encode() + b'\0' + self.commit).hexdigest() == PIN,
                'Commit object identity mismatch')
        self.tree = self.commit.splitlines()[0].decode().removeprefix('tree ')

    def load(self, path):
        if path not in self.raw:
            oid = git('rev-parse', PIN + ':' + path).decode().strip()
            obj = git('cat-file', 'blob', oid)
            data = (UP / path).read_bytes()
            require(data == obj, 'Working source not equal to pinned blob: ' + path)
            require(hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest() == oid,
                    'Blob object identity mismatch: ' + path)
            text = data.decode('utf-8')
            self.raw[path] = (text, mask_rust(text))
            self.files[path] = {'path': path, 'bytes': len(data), 'sha256': sha(data),
                                'git_blob_sha1': oid, 'pin': PIN, 'working_bytes_equal_git_blob': True}
        return self.raw[path]

    def ref(self, key, path, start, end):
        text, _ = self.load(path)
        raw = text[start:end].encode('utf-8')
        value = {'path': path, 'byte_start': len(text[:start].encode('utf-8')),
                 'byte_end_exclusive': len(text[:end].encode('utf-8')),
                 'line_start': text[:start].count('\n') + 1,
                 'line_end_inclusive': text[:end - 1].count('\n') + 1,
                 'text': text[start:end], 'sha256': sha(raw),
                 'file_sha256': self.files[path]['sha256'],
                 'git_blob_sha1': self.files[path]['git_blob_sha1']}
        require(key not in self.fragments or self.fragments[key] == value, 'Conflicting fragment ' + key)
        self.fragments[key] = value
        return key

    def exact(self, key, path, needle):
        text, _ = self.load(path)
        require(text.count(needle) == 1, 'Expected one exact fragment: ' + key)
        pos = text.index(needle)
        return self.ref(key, path, pos, pos + len(needle))

    def line(self, key, path, needle):
        text, _ = self.load(path)
        hits = list(re.finditer(r'^.*' + re.escape(needle) + r'.*$', text, re.M))
        require(len(hits) == 1, 'Expected one line: ' + key)
        hit = hits[0]
        start = hit.start()
        # Preserve immediately preceding cfg attributes on definitions/reexports.
        while start > 0:
            prev = text.rfind('\n', 0, start - 1) + 1
            if not text[prev:start].strip().startswith('#[cfg('):
                break
            start = prev
        return self.ref(key, path, start, hit.end())

    def function(self, key, path, name, occurrence=0):
        text, mask = self.load(path)
        matches = list(re.finditer(r'\b(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?fn\s+' + re.escape(name) + r'\s*(?:<[^{};]*?>)?\s*\(', mask))
        require(occurrence < len(matches), 'Missing function ' + key)
        hit = matches[occurrence]
        args_end = balanced(mask, hit.end() - 1, '(', ')')
        brace = mask.index('{', args_end)
        end = balanced(mask, brace)
        start = hit.start()
        while start > 0:
            prev = text.rfind('\n', 0, start - 1) + 1
            if not text[prev:start].strip().startswith('#[cfg('):
                break
            start = prev
        self.ref(key, path, start, end)
        return start, brace, end


def build_inventory():
    contract_data = CONTRACT.read_bytes()
    require(sha(contract_data) == CONTRACT_SHA256, 'Frozen contract bytes changed')
    contract = json.loads(contract_data)
    require(contract['task'] == TASK and contract['pin'] == PIN, 'Contract identity drift')
    require(contract['functional_receipts'] == 0 and contract['full_g01_closure'] is False, 'Contract qualification drift')
    r = Reader()
    start, brace, end = r.function('arg0_dispatch.full', ARG, 'arg0_dispatch')
    text, mask = r.load(ARG)
    r.ref('arg0.imports', ARG, 0, text.index('const APPLY_PATCH_ARG0'))
    for name in ['APPLY_PATCH_ARG0', 'MISSPELLED_APPLY_PATCH_ARG0', 'ILLEGAL_ENV_VAR_PREFIX']:
        r.line('definition.' + name, ARG, 'const ' + name + ':')
    r.function('arg0_dispatch_or_else.full', ARG, 'arg0_dispatch_or_else')
    for name in ['load_dotenv', 'prepare_path_env_var_with_aliases', 'prepare_path_entry_for_codex_aliases']:
        r.function(name + '.full', ARG, name)
    # Preserve dispatch-adjacent direct helper bodies, without recursively claiming
    # their dependencies, macros or platform outcomes have been resolved.
    entrypoints = {}
    for key, path, name, occurrence in [
        ('linux.run_main.linux', LINUX, 'run_main', 0),
        ('linux.run_main.nonlinux', LINUX, 'run_main', 1),
        ('patch.main', STANDALONE, 'main', 0),
        ('patch.run_main', STANDALONE, 'run_main', 0),
        ('patch.apply_patch', AL, 'apply_patch', 0),
        ('mxc.run_main', MXC, 'run_main', 0),
        ('exec.main.unix', EXEC, 'main', 0),
        ('exec.main.nonunix', EXEC, 'main', 1),
        ('fs.main', FSMAIN, 'main', 0),
        ('windows.wrapper_main', WRAP, 'run_windows_sandbox_wrapper_main', 0),
        ('spawn.init', SPAWN, 'init_spawn_helper', 0),
    ]:
        r.function(key, path, name, occurrence)
        function_source = r.fragments[key]['text']
        entrypoints[key] = {'source': key,
                            'cfg_text_in_full_body': re.findall(r'#\[cfg\([^\n]*\)\]', function_source),
                            'return_signature': function_source.split('{', 1)[0].split('fn ', 1)[1].strip(),
                            'expansion': 'full entry/helper body; transitive callees unexpanded'}
    bindings = {}
    consts = [
        ('APPLY_PATCH_ARG0', ARG, []),
        ('MISSPELLED_APPLY_PATCH_ARG0', ARG, []),
        ('CODEX_LINUX_SANDBOX_ARG0', 'codex-rs/sandboxing/src/landlock.rs', [
            (ARG, 'use codex_sandboxing::landlock::CODEX_LINUX_SANDBOX_ARG0;'),
            (SB, 'pub mod landlock;')]),
        ('CODEX_WINDOWS_MXC_ARG1', MXC, [(SB, 'pub use codex_mxc_sandbox::CODEX_WINDOWS_MXC_ARG1;')]),
        ('CODEX_ARG0_EXEC_HELPER_ARG1', EXEC, [
            (ARG, 'use codex_exec_server::CODEX_ARG0_EXEC_HELPER_ARG1;'),
            (EX, 'pub use arg0_exec_helper::CODEX_ARG0_EXEC_HELPER_ARG1;'),
            (EX, 'mod arg0_exec_helper;')]),
        ('CODEX_FS_HELPER_ARG1', FS, [
            (ARG, 'use codex_exec_server::CODEX_FS_HELPER_ARG1;'),
            (EX, 'pub use fs_helper::CODEX_FS_HELPER_ARG1;'), (EX, 'mod fs_helper;')]),
        ('CODEX_WINDOWS_SANDBOX_ARG1', WRAP, [
            (ARG, 'use codex_windows_sandbox::CODEX_WINDOWS_SANDBOX_ARG1;'),
            (WIN, 'pub use wrapper::CODEX_WINDOWS_SANDBOX_ARG1;'), (WIN, 'mod wrapper;')]),
        ('CODEX_CORE_APPLY_PATCH_ARG1', AL, [
            (ARG, 'use codex_apply_patch::CODEX_CORE_APPLY_PATCH_ARG1;')]),
        ('HELPER_ARG', SPAWN, [(PTY, 'mod spawn_helper;')]),
        ('HELPER_EXE', SPAWN, []),
    ]
    for name, path, chain in consts:
        key = 'definition.' + name
        r.line(key, path, 'const ' + name + ':')
        source = r.fragments[key]['text']
        literal = re.search(r'=\s*("[^"\n]*")\s*;', source)
        require(literal is not None, 'Constant must resolve to a string literal: ' + name)
        bindings[name] = {'name': name, 'literal': ast.literal_eval(literal[1]), 'definition': key,
                          'import_reexport_module_chain': []}
        for i, (p, needle) in enumerate(chain):
            chain_key = f'binding.{name}.{i}'
            r.line(chain_key, p, needle)
            bindings[name]['import_reexport_module_chain'].append(chain_key)
    for key, path, needle in [
        ('call.linux.module', LINUX, 'mod linux_run_main;'),
        ('call.patch.reexport', AL, 'pub use standalone_executable::main;'),
        ('call.patch.module', AL, 'mod standalone_executable;'),
        ('call.mxc.reexport', SB, 'pub use codex_mxc_sandbox::run_main as run_windows_mxc_main;'),
        ('call.exec.reexport', EX, 'pub use arg0_exec_helper::main as run_arg0_exec_helper_main;'),
        ('call.fs.reexport', EX, 'pub use fs_helper_main::main as run_fs_helper_main;'),
        ('call.fs.module', EX, 'mod fs_helper_main;'),
        ('call.windows.reexport', WIN, 'pub use wrapper::run_windows_sandbox_wrapper_main;'),
        ('call.spawn.reexport', PTY, 'pub use spawn_helper::init_spawn_helper;'),
        ('call.spawn.module', PTY, 'mod spawn_helper;'),
        ('call.LOCAL_FS.reexport', EX, 'pub use local_file_system::LOCAL_FS;'),
    ]:
        r.line(key, path, needle)
    # Bind crate Rust identifiers to workspace dependency paths, without Cargo.
    crates = {}
    for package, directory in [('codex-arg0', 'arg0'), ('codex-apply-patch', 'apply-patch'),
                               ('codex-exec-server', 'exec-server'), ('codex-sandboxing', 'sandboxing'),
                               ('codex-linux-sandbox', 'linux-sandbox'), ('codex-mxc-sandbox', 'mxc-sandbox'),
                               ('codex-utils-pty', 'utils/pty'), ('codex-windows-sandbox', 'windows-sandbox-rs')]:
        key = 'crate.' + package
        r.line(key + '.workspace', 'codex-rs/Cargo.toml', package + ' = { path = "' + directory + '" }')
        manifest_path = 'codex-rs/' + directory + '/Cargo.toml'
        manifest_text, _ = r.load(manifest_path)
        package_section = re.search(r'(?ms)^\[package\]\s*\n(.*?)(?=^\[|\Z)', manifest_text)
        require(package_section is not None, 'Missing package section')
        name_match = re.search(r'^name = "' + re.escape(package) + r'"$', package_section[1], re.M)
        require(name_match is not None, 'Wrong package identity')
        package_start = package_section.start(1) + name_match.start()
        r.ref(key + '.package', manifest_path, package_start, package_start + len(name_match[0]))
        crates[package.replace('-', '_')] = {'workspace': key + '.workspace', 'package': key + '.package',
                                           'source_root': 'codex-rs/' + directory + '/src',
                                           'method': 'workspace path and package name; Cargo not evaluated'}
    r.ref('arg0.manifest.full', 'codex-rs/arg0/Cargo.toml', 0, len(r.load('codex-rs/arg0/Cargo.toml')[0]))
    r.line('spawn.HELPER_READY', SPAWN, 'static HELPER_READY:')
    r.line('spawn.Ordering', SPAWN, 'use std::sync::atomic::Ordering;')
    r.line('spawn.AtomicBool', SPAWN, 'use std::sync::atomic::AtomicBool;')
    # Discover every direct-depth selector in the complete function, rejecting
    # any new or reordered branch instead of silently ignoring unknown matches.
    discovered = []
    for hit in re.finditer(r'\bif\s+(?:exe_name|argv1)\s*==', mask[brace + 1:end]):
        pos = brace + 1 + hit.start()
        depth = mask[brace:pos].count('{') - mask[brace:pos].count('}')
        if depth == 1:
            block = mask.index('{', pos)
            finish = balanced(mask, block)
            discovered.append((pos, block, finish, text[pos + 3:block].strip()))
    specs = [
        ('arg0.linux-sandbox', 'exe_name == CODEX_LINUX_SANDBOX_ARG0', [],
         ['CODEX_LINUX_SANDBOX_ARG0'], 'codex_linux_sandbox::run_main', 'codex_linux_sandbox::run_main();',
         ['linux.run_main.linux', 'linux.run_main.nonlinux'], ['call.linux.module']),
        ('arg0.apply-patch-aliases', 'exe_name == APPLY_PATCH_ARG0 || exe_name == MISSPELLED_APPLY_PATCH_ARG0', [],
         ['APPLY_PATCH_ARG0', 'MISSPELLED_APPLY_PATCH_ARG0'], 'codex_apply_patch::main', 'codex_apply_patch::main();',
         ['patch.main', 'patch.run_main'], ['call.patch.reexport', 'call.patch.module']),
        ('argv1.windows-mxc', 'argv1 == codex_sandboxing::CODEX_WINDOWS_MXC_ARG1', [],
         ['CODEX_WINDOWS_MXC_ARG1'], 'codex_sandboxing::run_windows_mxc_main', 'codex_sandboxing::run_windows_mxc_main();',
         ['mxc.run_main'], ['call.mxc.reexport']),
        ('argv1.exec-helper', 'argv1 == CODEX_ARG0_EXEC_HELPER_ARG1', ['#[cfg(unix)]'],
         ['CODEX_ARG0_EXEC_HELPER_ARG1'], 'codex_exec_server::run_arg0_exec_helper_main', 'codex_exec_server::run_arg0_exec_helper_main();',
         ['exec.main.unix', 'exec.main.nonunix'], ['call.exec.reexport']),
        ('argv1.fs-helper', 'argv1 == CODEX_FS_HELPER_ARG1', [],
         ['CODEX_FS_HELPER_ARG1'], 'codex_exec_server::run_fs_helper_main', 'codex_exec_server::run_fs_helper_main();',
         ['fs.main'], ['call.fs.reexport', 'call.fs.module']),
        ('argv1.windows-wrapper', 'argv1 == CODEX_WINDOWS_SANDBOX_ARG1', ['#[cfg(target_os = "windows")]'],
         ['CODEX_WINDOWS_SANDBOX_ARG1'], 'codex_windows_sandbox::run_windows_sandbox_wrapper_main', 'codex_windows_sandbox::run_windows_sandbox_wrapper_main();',
         ['windows.wrapper_main'], ['call.windows.reexport']),
        ('argv1.apply-patch-mode', 'argv1 == CODEX_CORE_APPLY_PATCH_ARG1', [],
         ['CODEX_CORE_APPLY_PATCH_ARG1'], 'codex_apply_patch::apply_patch', None,
         ['patch.apply_patch'], ['call.LOCAL_FS.reexport']),
    ]
    require(len(discovered) == len(specs) == 7, 'Dispatch branch count changed')
    branches = []
    for order, ((pos, block, finish, condition), spec) in enumerate(zip(discovered, specs), 1):
        ident, expected, cfg, names, target, invocation, definitions, exports = spec
        require(condition == expected, 'Dispatch order/selector mismatch: ' + ident)
        prefix = text[brace + 1:pos]
        previous_line = prefix.rstrip().splitlines()[-1].strip()
        actual_cfg = [previous_line] if previous_line.startswith('#[cfg(') else []
        require(actual_cfg == cfg, 'Dispatch cfg mismatch: ' + ident)
        if invocation is None:
            call_start = text.index(target + '(', block, finish)
            call_end = balanced(mask, call_start + len(target), '(', ')')
            invocation = text[call_start:call_end]
        else:
            call_start = text.index(invocation, block, finish)
            call_end = call_start + len(invocation)
        r.ref(ident + '.source', ARG, pos, finish)
        r.ref(ident + '.call', ARG, call_start, call_end)
        if cfg:
            cfg_start = text.rfind(cfg[0], brace, pos)
            r.ref(ident + '.cfg', ARG, cfg_start, cfg_start + len(cfg[0]))
        branches.append({'id': ident, 'order': order, 'condition': condition,
                         'selector_kind': 'basename' if order <= 2 else 'argv1_osstring',
                         'comparison': '==', 'selector_constants': names,
                         'literal_values': [bindings[n]['literal'] for n in names],
                         'cfg_text': cfg, 'cfg_source': ident + '.cfg' if cfg else None,
                         'source': ident + '.source', 'call': {'target': target, 'invocation': invocation,
                         'source': ident + '.call', 'definition_sources': definitions,
                         'reexport_module_sources': exports},
                         'argument_consumption': {'dispatch': 'argv[0] only' if order <= 2 else
                                                 'argv[0] and argv[1]; argv[2] additionally consumed as UTF-8 patch' if order == 7 else 'argv[0] and argv[1]',
                                                  'passed_iterator': False,
                                                  'helper_rereads_global_argv': order in [2, 4, 6],
                                                  'transitive_consumption': 'unqualified; direct entry source retained'},
                         'source_control_flow': 'direct entry declaration returns !; no return to remaining dispatch source' if order < 7 else 'apply result converted to code then std::process::exit(exit_code)',
                         'qualification': 'source_only'})
    r.exact('argv.setup', ARG, 'let mut args = std::env::args_os();\n    let argv0 = args.next().unwrap_or_default();\n    let exe_name = Path::new(&argv0)\n        .file_name()\n        .and_then(|s| s.to_str())\n        .unwrap_or("");')
    r.exact('argv.first', ARG, 'let argv1 = args.next().unwrap_or_default();')
    r.exact('spawn.predispatch', ARG, '#[cfg(target_os = "linux")]\n    codex_utils_pty::init_spawn_helper(std::env::args_os());')
    fallback_start = text.index('    // This modifies the environment', discovered[-1][2])
    r.ref('fallback.source', ARG, fallback_start, end - 1)
    # Distinct same-text error arms are located within the exact patch branch.
    patch_start, patch_end = discovered[-1][0], discovered[-1][2]
    patch = text[patch_start:patch_end]
    failures = []
    for i, hit in enumerate(re.finditer(re.escape('Err(_) => std::process::exit(1),'), patch)):
        key = ['patch.cwd_error', 'patch.runtime_error'][i]
        r.ref(key, ARG, patch_start + hit.start(), patch_start + hit.end())
        failures.append(key)
    require(len(failures) == 2, 'Patch immediate exit arms changed')
    r.exact('patch.result', ARG, 'Ok(_) => 0,\n                    Err(_) => 1,')
    r.exact('patch.missing_or_nonutf8', ARG, 'eprintln!("Error: {CODEX_CORE_APPLY_PATCH_ARG1} requires a UTF-8 PATCH argument.");')
    r.exact('patch.exit', ARG, 'std::process::exit(exit_code);')
    r.exact('patch.consume', ARG, 'let patch_arg = args.next().and_then(|s| s.to_str().map(str::to_owned));')
    inventory = {
        'schema': 'codex100.arg0.source.v1', 'task': TASK, 'status': 'IMPLEMENTED', 'tier': 'T1',
        'contract': {'path': 'arg0-contract.json', 'sha256': sha(contract_data)},
        'pin': PIN, 'upstream': str(UP),
        'git_attestation': {'commit_sha1': PIN, 'commit_object_sha256': sha(r.commit), 'root_tree_sha1': r.tree,
                            'method': 'git rev-parse PIN:path; cat-file blob; independently recompute Git blob SHA-1; byte equality with working source',
                            'coverage': 'all consumed files only; no whole-tree cleanliness assertion'},
        'qualification': {'kind': 'static_source_only', 'functional_receipts': 0, 'runtime_qualified': False,
                          'effective_platform': None, 'full_g01_closure': False, 'independent_review': 'required'},
        'offset_convention': 'UTF-8 bytes, zero-based half-open; lines one-based inclusive; exact text without newline normalization',
        'dispatch_function': 'arg0_dispatch.full', 'imports': 'arg0.imports',
        'argument_setup': {'sources': ['argv.setup', 'argv.first'],
                           'argv0': 'next().unwrap_or_default(); Path::file_name; to_str; missing/non-UTF-8 basename -> empty string',
                           'argv1': 'next().unwrap_or_default(); OsString comparison against string constants',
                           'order': 'spawn hook; argv0 extraction; two basename branches; argv1 extraction; five argv1 branches; fallback',
                           'control_flow': 'basename alternatives form if/else-if; argv1 tests are sequential if statements; no iterator is passed to direct helper entries'},
        'predispatch': {'order': 0, 'cfg_text': ['#[cfg(target_os = "linux")]'], 'source': 'spawn.predispatch',
                        'call': 'codex_utils_pty::init_spawn_helper(std::env::args_os())',
                        'definition': 'spawn.init', 'binding': ['call.spawn.reexport', 'call.spawn.module'],
                        'helper_selector_constant': 'HELPER_ARG', 'helper_executable_constant': 'HELPER_EXE',
                        'direct_source_observations': ['collect full args into a separate Vec; when empty, read /proc/self/cmdline and require final NUL',
                                                       'skip program then compare next arg to HELPER_ARG; call crate::spawn_helper_main::dispatch(args)',
                                                       'if metadata(HELPER_EXE).is_ok(), store true in HELPER_READY with Ordering::Relaxed'],
                        'transitive_dispatch': 'crate::spawn_helper_main::dispatch unexpanded; no spawn/exec effects qualified'},
        'branch_count': len(branches), 'selector_literal_count': sum(len(b['literal_values']) for b in branches),
        'branches': branches, 'constant_bindings': bindings, 'crate_bindings': crates, 'direct_entrypoints': entrypoints,
        'patch_argument_mode': {'branch': 'argv1.apply-patch-mode', 'consume': 'patch.consume',
                                'missing_or_nonutf8': {'source': 'patch.missing_or_nonutf8', 'result': 1},
                                'immediate_failures': [{'reason': 'current_dir Err', 'source': failures[0], 'exit': 1},
                                                       {'reason': 'current-thread Tokio runtime build Err', 'source': failures[1], 'exit': 1}],
                                'apply_result': {'source': 'patch.result', 'Ok': 0, 'Err': 1},
                                'exit': {'source': 'patch.exit', 'expression': 'exit_code'},
                                'extra_args': 'no further dispatch iterator consumption or rejection after argv[2] in this branch',
                                'actual_call_arguments': ['&patch_arg', '&cwd', '&mut stdout', '&mut stderr', 'codex_exec_server::LOCAL_FS.as_ref()', 'None /*sandbox*/'],
                                'call_preparation': 'stdout/stderr; AbsolutePathBuf::current_dir; Builder::new_current_thread().enable_all().build(); cwd.into(); runtime.block_on',
                                'limit': 'apply_patch direct wrapper retained; apply_patch_with_options and filesystem effects unexpanded'},
        'basename_patch_mode': {'sources': ['patch.main', 'patch.run_main'],
                                'consumption': 'rereads args_os; skips argv0; one patch arg or reads stdin when absent; rejects extras',
                                'exit_codes_in_source': {'success': 0, 'patch_nonutf8_stdin_error_cwd_error_runtime_error_apply_error': 1,
                                                         'empty_stdin_or_extra_args': 2},
                                'limit': 'source paths only; patch application not executed'},
        'normal_fallback': {'source': 'fallback.source',
                            'sequence': ['load_dotenv()', 'prepare_path_env_var_with_aliases(InstallContext::current(), std::env::var_os("PATH"), prepare_path_entry_for_codex_aliases)',
                                         'if Some(updated_path_env_var), unsafe std::env::set_var("PATH", updated_path_env_var)', 'return path_entry_guard'],
                            'direct_helpers': ['load_dotenv.full', 'prepare_path_env_var_with_aliases.full', 'prepare_path_entry_for_codex_aliases.full'],
                            'alias_preparation_failure': 'prepare_path_env_var_with_aliases warns and returns (None, package_path)',
                            'caller_continuation_source': 'arg0_dispatch_or_else.full',
                            'caller_continuation': 'calls arg0_dispatch before constructing codex-main thread and Tokio runtime; no Clap invocation inside arg0_dispatch',
                            'limit': 'dotenv/PATH/alias and main_fn transitive effects unqualified'},
        'limitations': ['No Rust parsing/typechecking, macro expansion, cfg evaluation, target import, compilation, execution, or functional receipt.',
                        'Both cfg alternatives retained; textual cfg is not an effective-platform assertion.',
                        'Full direct helper bodies retained for context, not a complete transitive effect graph.',
                        'Unexpanded examples: spawn_helper_main::dispatch, linux_run_main::run_main, windows::run, fs_helper_main::run_main, run_windows_sandbox_wrapper_args, apply_patch_with_options, InstallContext::current, set_filtered, PATH alias preparation dependencies.',
                        'Pre-Clap describes dispatch placement; this lane does not certify the broader CLI graph or G01.',
                        'Contract/root ledgers/catalog/other evidence readonly; lead integration and independent review remain required.'],
        'sources': dict(sorted(r.files.items())), 'fragments': dict(sorted(r.fragments.items())),
    }
    return inventory


def equal_inventory(candidate, expected):
    # Exact regeneration rejects extra qualification fields as well as omissions.
    require(candidate == expected, 'Inventory differs from authenticated source reconstruction')


def negative_controls(expected):
    cases = []
    def case(name, mutate):
        candidate = copy.deepcopy(expected)
        mutate(candidate)
        require(candidate != expected, 'Negative did not change candidate: ' + name)
        rejected = False
        try:
            equal_inventory(candidate, expected)
        except ValueError:
            rejected = True
        require(rejected, 'Accepted negative: ' + name)
        cases.append({'id': name, 'result': 'REJECTED', 'method': 'in-memory candidate mutation against independently regenerated source inventory'})
    case('omission.branch', lambda x: x['branches'].pop(3))
    case('omission.alias', lambda x: x['branches'][1]['literal_values'].pop())
    case('omission.predispatch', lambda x: x.pop('predispatch'))
    case('reorder.branches', lambda x: x['branches'].reverse())
    case('selector.wrong_literal', lambda x: x['branches'][2]['literal_values'].__setitem__(0, '--wrong-mxc'))
    case('selector.wrong_comparison', lambda x: x['branches'][3].__setitem__('comparison', 'starts_with'))
    case('cfg.exec_removed', lambda x: x['branches'][3].__setitem__('cfg_text', []))
    case('cfg.windows_replaced', lambda x: x['branches'][5].__setitem__('cfg_text', ['#[cfg(unix)]']))
    case('cfg.spawn_removed', lambda x: x['predispatch'].__setitem__('cfg_text', []))
    case('call.wrong_target', lambda x: x['branches'][4]['call'].__setitem__('target', 'codex_apply_patch::main'))
    case('call.wrong_patch_fs', lambda x: x['patch_argument_mode']['actual_call_arguments'].__setitem__(4, 'REMOTE_FS'))
    case('consumption.patch_extra', lambda x: x['patch_argument_mode'].__setitem__('extra_args', 'rejected'))
    case('exit.patch_success', lambda x: x['patch_argument_mode']['apply_result'].__setitem__('Ok', 1))
    case('source.wrong_definition', lambda x: x['constant_bindings']['CODEX_WINDOWS_MXC_ARG1'].__setitem__('definition', 'definition.CODEX_FS_HELPER_ARG1'))
    case('source.wrong_byte_span', lambda x: x['fragments']['arg0_dispatch.full'].__setitem__('byte_start', 0))
    case('source.wrong_text', lambda x: x['fragments']['arg0_dispatch.full'].__setitem__('text', 'fn arg0_dispatch() {}'))
    case('source.wrong_blob', lambda x: x['sources'][ARG].__setitem__('git_blob_sha1', '0' * 40))
    case('qualification.runtime', lambda x: x['qualification'].__setitem__('runtime_qualified', True))
    case('qualification.receipt', lambda x: x['qualification'].__setitem__('functional_receipts', 1))
    case('qualification.transitive', lambda x: x.__setitem__('transitive_effects_qualified', True))
    # Attestation oracle itself: altered byte arrays must fail equality and OID.
    original = (UP / ARG).read_bytes()
    altered = original.replace(b'codex_exec_server::run_fs_helper_main();', b'codex_apply_patch::main();', 1)
    require(altered != original, 'Source mutation did not change bytes')
    oid = expected['sources'][ARG]['git_blob_sha1']
    require(altered != git('cat-file', 'blob', oid), 'Source mutation matches original blob')
    require(hashlib.sha1(b'blob ' + str(len(altered)).encode() + b'\0' + altered).hexdigest() != oid,
            'Source mutation retained blob identity')
    cases.append({'id': 'source.mutated_working_bytes', 'result': 'REJECTED',
                  'method': 'in-memory source call mutation differs from pinned blob bytes and recomputed Git object SHA-1'})
    return cases


def artifacts():
    inventory = build_inventory()
    repeated = build_inventory()
    require(dump(inventory) == dump(repeated), 'Non-deterministic regeneration')
    cases = negative_controls(inventory)
    verification = {'task': TASK, 'status': 'PASS_SOURCE_CHECKS', 'functional_receipts': 0,
                    'runtime_qualified': False, 'independent_review': 'required',
                    'contract_sha256': inventory['contract']['sha256'],
                    'generator_sha256': sha(Path(__file__).read_bytes()),
                    'inventory_sha256': sha(dump(inventory)),
                    'checks': {'two_authenticated_generations_byte_equal': True,
                               'git_commit_object_identity': True, 'all_consumed_source_blobs_authenticated': True,
                               'full_dispatch_and_entry_bodies_retained': True, 'ordered_branch_count': 7,
                               'selector_literal_count': 8, 'negative_controls_rejected': len(cases),
                               'source_file_count': len(inventory['sources']), 'fragment_count': len(inventory['fragments']),
                               'all_spans_use_utf8_byte_offsets': True, 'no_target_execution': True},
                    'negative_controls': cases,
                    'method_limit': 'candidate equality to a regenerated, curated lexical source model; no runtime or general compiler proof'}
    handoff = {'task': TASK, 'role': 'workerDX100-G01:ARG0-DISPATCH-SOURCE', 'status': 'IMPLEMENTED',
               'independent_review': 'required from lead; not self-approved DONE',
               'write_scope': 'g01/cli-adapters/arg0/**', 'contract_sha256': inventory['contract']['sha256'],
               'inventory_sha256': sha(dump(inventory)), 'functional_receipts': 0, 'full_g01_closure': False,
               'last_completed_action': 'Authenticated ordered arg0 dispatch inventory and pure source negative controls generated.',
               'next_action': 'Lead independently inspect sources, inventory/checker, README format and manifest; integrate source-only result in own ledgers.',
               'ledger_deltas_for_lead': {'runtime_state': 'ARG0-DISPATCH-SOURCE IMPLEMENTED; source checks pass, independent review pending; no functional qualification.',
                                           'execution_log': 'Seven ordered branches/eight selector literals plus Linux predispatch hook; pure source checker; no target run.',
                                           'backlog': 'G01 stays open; this source slice awaits independent review.'},
               'limitations': inventory['limitations'], 'descendants': 0, 'commits': 0,
               'prohibited_actions_executed': [], 'manifest': 'manifest.json (self-excluded; report its SHA-256 externally)'}
    return {'inventory.json': dump(inventory), 'verification.json': dump(verification), 'handoff.json': dump(handoff)}


def manifest_value():
    require(sorted(p.name for p in OUT.iterdir()) == sorted(ARTIFACTS + (['manifest.json'] if (OUT / 'manifest.json').exists() else [])),
            'Unexpected file in owned scope')
    return {'schema': 'codex100.arg0.manifest.v1', 'task': TASK, 'status': 'IMPLEMENTED',
            'contract_sha256': sha(CONTRACT.read_bytes()), 'pin': PIN,
            'files': {name: {'sha256': sha((OUT / name).read_bytes()), 'bytes': (OUT / name).stat().st_size} for name in ARTIFACTS},
            'self_excluded': 'manifest.json; its digest is supplied in worker final response',
            'readme_format': {'command': '/home/ricardo/.nvm/versions/node/v22.23.2/bin/node node_modules/prettier/bin/prettier.cjs --ignore-path /dev/null --write ' + str(OUT / 'README.md'),
                              'required_order': 'README formatted before manifest freeze; --check does not invoke formatter'},
            'qualification': 'source-only; independent lead review required; zero functional receipts'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--generate', action='store_true')
    mode.add_argument('--freeze', action='store_true')
    mode.add_argument('--check', action='store_true')
    args = parser.parse_args()
    before = {p.name: (sha(p.read_bytes()), p.stat().st_mtime_ns) for p in OUT.iterdir()} if args.check else None
    expected = artifacts()
    if args.generate:
        for name, data in expected.items():
            (OUT / name).write_bytes(data)
        print('GENERATED source-only inventory, verification and handoff')
        return
    for name, data in expected.items():
        if name == 'inventory.json':
            equal_inventory(json.loads((OUT / name).read_bytes()), json.loads(data))
        require((OUT / name).read_bytes() == data, 'Stale or mutated artifact: ' + name)
    manifest = dump(manifest_value())
    if args.freeze:
        (OUT / 'manifest.json').write_bytes(manifest)
        print('FROZEN manifest after explicit README formatting')
    else:
        require((OUT / 'manifest.json').read_bytes() == manifest, 'Stale or mutated manifest')
        after = {p.name: (sha(p.read_bytes()), p.stat().st_mtime_ns) for p in OUT.iterdir()}
        require(before == after, '--check modified owned artifacts')
        info = json.loads(expected['verification.json'])['checks']
        print(json.dumps({'status': 'PASS_SOURCE_CHECKS', 'readonly': True, 'checks': info}, sort_keys=True))


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, subprocess.CalledProcessError, KeyError) as error:
        print('FAIL_SOURCE_CHECK: ' + str(error), file=sys.stderr)
        sys.exit(1)
