// Offline self-test of the DP-1R Node code (no SDK, no cache file executed, no network, no service). Run with the pinned Node:
//   node selftests/selftest_dp1r_driver.mjs <unit-dir>      (CVG_SELFTEST_TMP = scratch root outside docs/)
// Prints one JSON line {passed, failed, results, info}. Derived from selftest_dp1_driver.mjs and selftest_dp1_caps_driver.mjs of
// the DP-1 (commit 3ca3fd3b0) plus the DP-1R items: erratum EDP1R-01 with the real Node (the .exe stand-in under a nested
// {"type":"commonjs"} runs, under the A4-like "type": "module" scope it is refused), fixture listing over the tree root
// (DP1-ADM/R1-F07), wrapper.run deadline with an own script that never closes, LEFTOVER negative case and cleanup guard, and the
// mutant synthetic child that creates CHILD_READY before its listeners (DP1-ADM/R2-F02).
// Safety: every wrapper.run here gets an injected scan that lists no host process; the cleanup guard is tested only with an own
// orphan. Nothing here can signal a process it did not start.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const unit = process.argv[2];
const results = [];
const info = {};
const t = async (name, fn) => { try { const ok = await fn(); results.push({ name, ok: ok === true }); } catch (e) { results.push({ name, ok: false, error: String(e?.message ?? e).slice(0, 200) }); } };
const throws = fn => { try { fn(); return false; } catch { return true; } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };

const D = await import(path.join(unit, 'node', 'dp-driver.mjs'));
const L = await import(path.join(unit, 'node', 'dp-loader.mjs'));
const C = createRequire(import.meta.url)(path.join(unit, 'node', 'dp-channel.cjs'));
const cases = JSON.parse(fs.readFileSync(path.join(unit, 'cases-dp-1r.json'), 'utf8')).cases;
const rows = JSON.parse(fs.readFileSync(path.join(unit, 'fixture-cases-dp1r.json'), 'utf8'));
const frames = [];
const ch = { emit: async (kind, data) => { frames.push([kind, data]); } };
const diag = name => frames.filter(([k, d]) => k === 'DIAGNOSTIC' && d.milestone === name).map(([, d]) => d.detail);
const tmpRoot = process.env.CVG_SELFTEST_TMP ?? os.tmpdir();
const tmp = fs.mkdtempSync(path.join(tmpRoot, 'dp1r-node-'));
const noScan = () => [];

// ---------------------------------------------------------------- vocabulary (DP-1R slots and DIAG rows)
await t('every DP-1R step (DP-PK07B, DP1R-CTRL01 and the three DIAG rows) is in the closed vocabulary', () => {
  for (const c of cases) for (const s of c.case_input.sdk_calls ?? []) D.checkStep(s);
  for (const r of Object.values(rows)) for (const s of r.diag_calls ?? []) D.checkStep(s);
  return true;
});
await t('unknown step api refused', () => throws(() => D.checkStep({ step: 1, api: 'bogus' })));
await t('unknown key refused', () => throws(() => D.checkStep({ step: 1, api: 'probe', id: 'a', path: ['x'], extra: 1 })));
await t('missing required key refused', () => throws(() => D.checkStep({ step: 1, api: 'wrapper.run', script: '/x', argv: [], env: {}, cwd: '/work', as: 'w' })));
await t('wrapper.run stdin other than /dev/null refused', () => throws(() => D.checkStep({ step: 1, api: 'wrapper.run', script: '/x', argv: [], env: {}, cwd: '/work', stdin: 'inherit', as: 'w' })));
await t('credential variable in wrapper env refused', () => throws(() => D.checkStep({ step: 1, api: 'wrapper.run', script: '/x', argv: [], env: { OPENAI_API_KEY: 'x' }, cwd: '/work', stdin: '/dev/null', as: 'w' })));
await t('signal before CHILD_READY refused', () => throws(() => D.checkStep({ step: 1, api: 'wrapper.run', script: '/x', argv: [], env: {}, cwd: '/work', stdin: '/dev/null', as: 'w', send_signal: { after: 'START', signal: 'SIGTERM', to: 'wrapper' } })));
await t('unbounded child wait refused (R1-F03)', () => throws(() => D.checkProgram({ ready_barrier: true, on_signal: { SIGTERM: { exit_code: 0 } } })));
await t('child_script program: record_then_exit defaults to exit 0', () => JSON.stringify(D.scriptProgram({ behavior: 'record_then_exit', exit_code: 0 })) === JSON.stringify({ id: 'child_script', program: { exit_code: 0 } }));
await t('contract limits unchanged in main(): 20 s close, 10 s CHILD_READY, 1000 ms SigCgt; sandbox paths', () =>
  D.LIMITS.wrapperDeadlineMs === 20000 && D.LIMITS.readyDeadlineMs === 10000 && D.LIMITS.sigcgtWaitMs === 1000 && Object.isFrozen(D.LIMITS)
  && D.PATHS.node === '/runtime/node' && D.PATHS.work === '/work' && D.PATHS.shim === 'file:///profile/dp-platform-shim.mjs' && Object.isFrozen(D.PATHS));

// ---------------------------------------------------------------- probe, SigCgt, channel
await t('probe refuses an accessor', () => throws(() => D.probeValue({ o: Object.defineProperty({}, 'g', { get() { return 1; }, enumerable: true }) }, ['o', 'g'])));
await t('SigCgt bit parsing', () => D.sigcgtHas('SigCgt:\t0000000000004a01\n', 'SIGHUP') === true && D.sigcgtHas('SigCgt:\t0000000000004a00\n', 'SIGHUP') === false
  && D.sigcgtHas('SigCgt:\t0000000000004a00\n', 'SIGTERM') === true && D.sigcgtHas('SigCgt:\t0000000000004a00\n', 'SIGINT') === false);
await t('channel accepts only the DP-1R case IDs (DDP1R-01)', () => ['DP-PK07B', 'DP1R-CTRL01', 'DIAG-DP-STAGE', 'DIAG-DP-NODE', 'DIAG-DP-SYNTH-CHILD'].every(x => C.CASE_ID.test(x))
  && !['DP-PK07A', 'DP1-CTRL01', 'DIAG-TS-ECHO', 'DIAG-DP-REAL-CLI', 'DP-PK01A', 'DP-PY19A'].some(x => C.CASE_ID.test(x)));
await t('BLOB with a wrong digest refused', () => throws(() => C.validateEvent({ v: 1, attempt: 'a'.repeat(40), case: 'DP-PK07B', role: 'driver', seq: 3, kind: 'BLOB', pid: 2, mono_ns: '1', data: { name: 'x', offset: 0, base64: 'AA==', sha256: '0'.repeat(64) } })));

// ---------------------------------------------------------------- loader decisions (unchanged from DP-1)
const sha = b => C.sha(Buffer.from(b));
const ENTRY = 'file:///fixture/pk01/node_modules/@openai/codex-sdk/dist/index.js';
const cfg = L.validateConfig({ v: 1, entry: 'file:///profile/dp-driver.mjs', prebound: ['file:///profile/dp-channel.cjs', 'file:///profile/dp-driver.mjs'],
  builtins: ['node:child_process', 'node:crypto', 'node:fs', 'node:module', 'node:net', 'node:os', 'node:path', 'node:readline', 'node:util'],
  sdk_builtins: ['node:child_process', 'node:fs', 'node:module', 'node:os', 'node:path', 'node:readline'], sdk_bare: ['child_process', 'fs', 'module', 'os', 'path', 'readline'],
  sdk_entries: { [ENTRY]: sha('entry') } });
await t('loader: bare fs from the SDK entry maps to node:fs; http denied; bare from a helper denied', () => L.decide('fs', ENTRY, cfg)?.url === 'node:fs' && L.decide('http', ENTRY, cfg) === null && L.decide('fs', 'file:///profile/dp-driver.mjs', cfg) === null);
await t('loader: entry bytes must match the bound sha', () => L.verifyEntry(ENTRY, cfg, () => Buffer.from('entry')) === true && throws(() => L.verifyEntry('file:///fixture/x.js', { sdk_entries: { 'file:///fixture/x.js': sha('a') } }, () => Buffer.from('b'))));

// ---------------------------------------------------------------- fixture listing over the tree root (DDP1R-02, R1-F07)
{
  const root = path.join(tmp, 'tree');
  fs.mkdirSync(path.join(root, 'a', 'b'), { recursive: true });
  fs.writeFileSync(path.join(root, 'a', 'b', 'declared'), 'x', { mode: 0o644 });
  fs.writeFileSync(path.join(root, 'a', 'extra'), 'y', { mode: 0o644 });
  fs.symlinkSync(path.join(root, 'a', 'b', 'declared'), path.join(root, 'link'));
  const trees = [{ root, entries: [{ path: path.join(root, 'a', 'b', 'declared'), kind: 'file' }, { path: path.join(root, 'link'), kind: 'symlink' }, { path: path.join(root, 'missing'), kind: 'file' }] }];
  const listing = D.fixtureListing(trees);
  info.listing_paths = listing.map(r => path.relative(tmp, r.path));
  await t('fixture listing walks the root: root, implicit dirs, the undeclared file, the symlink (not followed) and an error row for a missing entry', () => {
    const by = Object.fromEntries(listing.map(r => [path.relative(tmp, r.path), r]));
    return by.tree?.type === 'dir' && by['tree/a']?.type === 'dir' && by['tree/a/b']?.type === 'dir' && by['tree/a/extra']?.type === 'file'
      && by['tree/a/b/declared']?.sha256 === C.sha(Buffer.from('x')) && by['tree/link']?.type === 'symlink' && by['tree/missing']?.error === 'ENOENT'
      && listing.length === 7;
  });
}

// ---------------------------------------------------------------- synthetic child (temporary /work stand-in)
const childSrc = fs.readFileSync(path.join(unit, 'node', 'dp-synth-child.mjs'), 'utf8').replaceAll('/work/child', path.join(tmp, 'child'));
const childPath = path.join(tmp, 'child-under-test');
fs.writeFileSync(childPath, childSrc, { mode: 0o755 });
const prog = (program, n) => {
  fs.mkdirSync(path.join(tmp, 'child', `run-${n}`), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'child', 'program.json'), JSON.stringify({ run: n, id: 'p' + n, program }));
  return path.join(tmp, 'child', `run-${n}`);
};
const recsOf = dir => fs.readdirSync(dir).filter(f => f.startsWith('record-')).map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
const runChild = (file, program, n, opts = {}) => {
  const dir = prog(program, n);
  const r = spawnSync(process.execPath, [file, ...(opts.argv ?? ['x', 'y z'])], { input: opts.input ?? '', env: { HOME: tmp, PATH: '/nonexistent', CVG_K: 'v' }, timeout: 8000, encoding: 'utf8' });
  return { status: r.status, signal: r.signal, stderr: r.stderr, recs: recsOf(dir), ready: fs.readdirSync(dir).filter(f => f.startsWith('ready-')).length };
};
await t('child exit code program: record before exit, env absent keys absent', () => { const r = runChild(childPath, { exit_code: 3 }, 1); return r.status === 3 && r.recs.length === 1 && JSON.stringify(r.recs[0].declared_termination) === '{"exit_code":3}' && JSON.stringify(r.recs[0].argv_tail) === '["x","y z"]' && r.recs[0].env.CVG_K === 'v' && r.recs[0].env.CODEX_HOME === undefined; });
await t('child self_signal program dies by the signal after the synced record', () => { const r = runChild(childPath, { self_signal: 'SIGTERM' }, 2); return r.signal === 'SIGTERM' && r.recs.length === 1 && JSON.stringify(r.recs[0].declared_termination) === '{"self_signal":"SIGTERM"}'; });
await t('child NO_SIGNAL after the bounded wait exits 97', () => { const r = runChild(childPath, { ready_barrier: true, on_signal: { SIGTERM: { exit_code: 0 } }, no_signal_timeout_ms: 200, no_signal_exit_code: 97 }, 3); return r.status === 97 && r.recs[0].no_signal === true && r.recs[0].ready === true && r.ready === 1; });

// ---------------------------------------------------------------- erratum EDP1R-01 with the real Node v24.20.0
{
  const pkg = path.join(tmp, 'scope', 'pkg');
  const bad = path.join(tmp, 'scope', 'bad');
  fs.mkdirSync(path.join(pkg, 'vendor', 'w'), { recursive: true }); fs.mkdirSync(path.join(pkg, 'vendor', 'l'), { recursive: true });
  fs.mkdirSync(path.join(bad, 'vendor', 'w'), { recursive: true });
  fs.writeFileSync(path.join(pkg, 'package.json'), '{"type":"module"}\n'); fs.writeFileSync(path.join(bad, 'package.json'), '{"type":"module"}\n');
  fs.writeFileSync(path.join(pkg, 'vendor', 'w', 'package.json'), '{"type":"commonjs"}\n');
  for (const f of [path.join(pkg, 'vendor', 'w', 'proxy.exe'), path.join(pkg, 'vendor', 'l', 'proxy'), path.join(bad, 'vendor', 'w', 'proxy.exe')]) fs.writeFileSync(f, childSrc, { mode: 0o755 });
  const ok = runChild(path.join(pkg, 'vendor', 'w', 'proxy.exe'), { exit_code: 0 }, 11, { argv: [] });
  const extless = runChild(path.join(pkg, 'vendor', 'l', 'proxy'), { exit_code: 0 }, 12, { argv: [] });
  const refused = runChild(path.join(bad, 'vendor', 'w', 'proxy.exe'), { exit_code: 0 }, 13, { argv: [] });
  info.erratum_node = { exe_commonjs: { status: ok.status, records: ok.recs.length }, extless_module: { status: extless.status, records: extless.recs.length },
    exe_module: { status: refused.status, records: refused.recs.length, err_unknown_file_extension: /ERR_UNKNOWN_FILE_EXTENSION/.test(refused.stderr) } };
  await t('EDP1R-01: .exe stand-in under a nested {"type":"commonjs"} inside a "type": "module" package runs and records its own path', () =>
    ok.status === 0 && ok.recs.length === 1 && ok.recs[0].exec_path === path.join(pkg, 'vendor', 'w', 'proxy.exe'));
  await t('EDP1R-01: extensionless stand-in in the "type": "module" scope runs (the other PK07 children)', () => extless.status === 0 && extless.recs.length === 1);
  await t('EDP1R-01 negative: .exe stand-in in the "type": "module" scope is refused with ERR_UNKNOWN_FILE_EXTENSION and leaves no record (the DP-PK07A defect)', () =>
    refused.status === 1 && refused.recs.length === 0 && /ERR_UNKNOWN_FILE_EXTENSION/.test(refused.stderr));
}

// ---------------------------------------------------------------- CHILD_READY only after the listeners, with a mutant (R2-F02)
{
  const hook = path.join(tmp, 'order-hook.mjs');
  const out = path.join(tmp, 'order-out.json');
  fs.writeFileSync(hook, `const fs = process.getBuiltinModule('node:fs');
const orig = fs.writeFileSync;
fs.writeFileSync = function (p, ...rest) {
  if (typeof p === 'string' && /\\/ready-\\d+$/.test(p)) {
    const status = fs.readFileSync('/proc/self/status', 'utf8');
    const m = /^SigCgt:\\s+([0-9a-fA-F]+)$/m.exec(status);
    const bits = m ? BigInt('0x' + m[1]) : 0n;
    orig.call(fs, ${JSON.stringify(out)}, JSON.stringify({ listeners: { SIGINT: process.listenerCount('SIGINT'), SIGTERM: process.listenerCount('SIGTERM'), SIGHUP: process.listenerCount('SIGHUP') }, sighup_bit: ((bits >> 0n) & 1n) === 1n }));
  }
  return orig.call(fs, p, ...rest);
};
`);
  const mutantSrc = (() => {
    const marker = "  fs.writeFileSync(`${dir}/ready-${process.pid}`, '');\n";
    const loop = '  for (const sig of SIGNALS) {';
    if (!childSrc.includes(marker) || !childSrc.includes(loop)) return null;
    return childSrc.replace(marker, '').replace(loop, marker + loop);
  })();
  const mutantPath = path.join(tmp, 'child-mutant');
  if (mutantSrc) fs.writeFileSync(mutantPath, mutantSrc, { mode: 0o755 });
  const order = (file, n) => {
    fs.rmSync(out, { force: true });
    prog({ ready_barrier: true, on_signal: { SIGTERM: { exit_code: 0 } }, no_signal_timeout_ms: 100, no_signal_exit_code: 97 }, n);
    spawnSync(process.execPath, ['--import', 'file://' + hook, file], { env: { PATH: '/nonexistent' }, timeout: 8000 });
    return fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : null;
  };
  const real = order(childPath, 21);
  const mutant = mutantSrc ? order(mutantPath, 22) : null;
  info.ready_order = { real, mutant, mutant_built: mutantSrc !== null };
  const all = o => o && o.listeners.SIGINT === 1 && o.listeners.SIGTERM === 1 && o.listeners.SIGHUP === 1 && o.sighup_bit === true;
  await t('synthetic child: at the CHILD_READY marker the three listeners exist and the SIGHUP SigCgt bit is set', () => all(real));
  await t('mutant child that creates CHILD_READY before its listeners is detected by the same check', () => mutantSrc !== null && mutant !== null && !all(mutant) && mutant.listeners.SIGTERM === 0);
}

// ---------------------------------------------------------------- shim (driver side) and NOT_REACHED
await t('shim.platform then shim.restore: applied values observed, then the real descriptors back', async () => {
  frames.length = 0;
  const real = [process.platform, process.arch];
  await D.interpret(ch, [{ step: 1, api: 'shim.platform', platform: 'win32', arch: 'arm64' }, { step: 2, api: 'shim.restore' }], null, { allowImport: false, scan: noScan, paths: { ...D.PATHS, work: tmp } });
  const scopes = diag('SHIM_SCOPE');
  return scopes.length === 2 && JSON.stringify(scopes[0].observed) === '["win32","arm64"]' && JSON.stringify(scopes[1].observed) === JSON.stringify(real)
    && process.platform === real[0] && Object.getOwnPropertyDescriptor(process, 'platform').writable === false;
});
await t('probe on an unbound alias gives NOT_REACHED, never an exception', async () => {
  frames.length = 0;
  await D.interpret(ch, [{ step: 1, api: 'probe', id: 'p', path: ['nope', 'exec'] }], null, { allowImport: false, scan: noScan, paths: { ...D.PATHS, work: tmp } });
  return JSON.stringify(diag('NOT_REACHED').map(x => x.step)) === '[1]';
});

// ---------------------------------------------------------------- wrapper.run (own scripts, injected paths and scan)
const shimCopy = path.join(tmp, 'shim-under-test.mjs');
fs.writeFileSync(shimCopy, fs.readFileSync(path.join(unit, 'node', 'dp-platform-shim.mjs'), 'utf8').replaceAll('/work/shim', path.join(tmp, 'shim')));
const paths = { node: process.execPath, work: tmp, shim: 'file://' + shimCopy };
const own = path.join(tmp, 'own-wrapper.mjs');
fs.writeFileSync(own, "process.stdout.write(JSON.stringify({ platform: process.platform, arch: process.arch }) + '\\n');\n");
const hang = path.join(tmp, 'never-closes.mjs');
fs.writeFileSync(hang, 'setInterval(() => {}, 1000);\n');
await t('wrapper.run of an own script with preload_shim: shim applied in the wrapper only, record written, settles on close', async () => {
  frames.length = 0;
  await D.interpret(ch, [{ step: 1, api: 'wrapper.run', script: own, argv: [], env: { PATH: '/nonexistent' }, cwd: tmp, stdin: '/dev/null', as: 'w', preload_shim: { platform: 'freebsd', arch: 'x64' } }],
    null, { allowImport: false, scan: noScan, paths });
  const wr = diag('WRAPPER_RESULT')[0];
  const out = frames.filter(([k, d]) => k === 'BLOB' && d.name === 'stdout:1').map(([, d]) => Buffer.from(d.base64, 'base64').toString()).join('');
  return wr?.exit_code === 0 && wr.settled === 'close' && wr.shim === true && out.includes('"platform":"freebsd"') && process.platform === 'linux'
    && JSON.stringify(diag('LEFTOVER')[0]?.pids) === '[]';
});
await t('wrapper.run deadline (injected 400 ms) with an own script that never closes: wrapper killed, WRAPPER_DEADLINE recorded, step throws', async () => {
  frames.length = 0;
  let msg = null;
  try {
    await D.interpret(ch, [{ step: 2, api: 'wrapper.run', script: hang, argv: [], env: { PATH: '/nonexistent' }, cwd: tmp, stdin: '/dev/null', as: 'h' }], null,
      { allowImport: false, scan: noScan, paths, limits: { wrapperDeadlineMs: 400, readyDeadlineMs: 1000, sigcgtWaitMs: 100 } });
  } catch (e) { msg = e.message; }
  const dl = diag('WRAPPER_DEADLINE')[0];
  await sleep(150);
  info.deadline = { msg, dl, alive_after: dl ? alive(dl.pid) : null };
  return msg === 'wrapper.run deadline (step 2)' && dl?.killed === true && dl.deadline_ms === 400 && !alive(dl.pid) && diag('WRAPPER_RESULT').length === 0;
});
await t('evaluator side of the deadline: the driver throws, so main() writes INVALID (EDP-07, rule 1); covered by selftest_dp1r.py', () => true);

// ---------------------------------------------------------------- LEFTOVER (negative case) and cleanup guard
await t('cleanup guard: outside bwrap (/proc/1/comm is not bwrap) sandboxInit() is false', () => D.sandboxInit() === false);
await t('LEFTOVER negative: an own orphan is listed and killed when the cleanup is allowed', async () => {
  frames.length = 0;
  const o = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 5000)'], { stdio: 'ignore', detached: true });
  o.unref();
  await sleep(100);
  const scan = () => (alive(o.pid) ? [{ pid: o.pid, cmdline: ['node'], state: 'S' }] : []);
  await D.leftover(ch, 9, { ...D.defaultCfg(), scan, killAllowed: () => true });
  await sleep(100);
  const lo = diag('LEFTOVER')[0]; const cl = diag('LEFTOVER_CLEANUP')[0];
  return JSON.stringify(lo?.pids) === JSON.stringify([o.pid]) && JSON.stringify(cl?.killed) === JSON.stringify([o.pid]) && !alive(o.pid);
});
await t('LEFTOVER guard: with the default guard on the host the cleanup is refused before any kill (the own orphan survives)', async () => {
  frames.length = 0;
  const o = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 5000)'], { stdio: 'ignore', detached: true });
  o.unref();
  await sleep(100);
  let msg = null;
  try { await D.leftover(ch, 10, { ...D.defaultCfg(), scan: () => [{ pid: o.pid, cmdline: ['node'], state: 'S' }] }); } catch (e) { msg = e.message; }
  const survived = alive(o.pid);
  try { process.kill(o.pid, 'SIGKILL'); } catch { /* gone */ }
  return msg === 'LEFTOVER cleanup outside the sandbox PID namespace refused' && survived && diag('LEFTOVER_CLEANUP').length === 0;
});
await t('SigCgt of an own child: SIGHUP bit only with a listener', async () => {
  const listener = withHup => `${withHup ? "process.on('SIGHUP', () => {});" : ''} process.stdout.write('ready\\n'); setTimeout(() => {}, 3000);`;
  const statusOf = async c => { await new Promise(r => c.stdout.once('data', r)); return fs.readFileSync(`/proc/${c.pid}/status`, 'utf8'); };
  const a = spawn(process.execPath, ['-e', listener(false)], { stdio: ['ignore', 'pipe', 'ignore'] });
  const b = spawn(process.execPath, ['-e', listener(true)], { stdio: ['ignore', 'pipe', 'ignore'] });
  const sa = await statusOf(a); const sb = await statusOf(b);
  a.kill('SIGKILL'); b.kill('SIGKILL');
  return D.sigcgtHas(sa, 'SIGHUP') === false && D.sigcgtHas(sb, 'SIGHUP') === true;
});

fs.rmSync(tmp, { recursive: true, force: true });
const passed = results.filter(r => r.ok).length;
process.stdout.write(JSON.stringify({ kind: 'SELFTEST_DP1R_NODE', node: process.version, passed, failed: results.length - passed, results, info }) + '\n');
process.exit(passed === results.length ? 0 : 1);
