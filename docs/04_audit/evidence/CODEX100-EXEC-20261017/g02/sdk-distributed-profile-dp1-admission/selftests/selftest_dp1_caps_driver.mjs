// Offline capability self-tests of the DP-1 Node code, written in the grouped repair R1 (review-r1, finding R1-F02). Own processes
// only: no SDK, no cache file, no network. Run: node selftests/selftest_dp1_caps_driver.mjs <unit-dir>  (CVG_SELFTEST_TMP = scratch root)
// Covers CAP-DP-NODE-DRIVER (shim applied and restored to the real values; NOT_REACHED without exception; SigCgt of an own child with
// and without a SIGHUP listener, the R2-F02 observation; LEFTOVER sees an own orphan) and CAP-DP-SYNTH-CHILD (on_signal; CHILD_READY
// only after the listeners: a signal outside on_signal is recorded and the child survives until the declared one).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const unit = process.argv[2];
const results = [];
const t = async (name, fn) => { try { const ok = await fn(); results.push({ name, ok: ok === true }); } catch (e) { results.push({ name, ok: false, error: String(e?.message ?? e).slice(0, 200) }); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const D = await import(path.join(unit, 'node', 'dp-driver.mjs'));
const frames = [];
const ch = { emit: async (kind, data) => { frames.push([kind, data]); } };
const tmpRoot = process.env.CVG_SELFTEST_TMP ?? os.tmpdir();

await t('shim.platform then shim.restore: applied values observed, then the real descriptors back', async () => {
  frames.length = 0;
  const real = [process.platform, process.arch];
  await D.interpret(ch, [{ step: 1, api: 'shim.platform', platform: 'win32', arch: 'arm64' }, { step: 2, api: 'shim.restore' }], null, { allowImport: false });
  const scopes = frames.filter(([k, d]) => k === 'DIAGNOSTIC' && d.milestone === 'SHIM_SCOPE').map(([, d]) => d.detail);
  return scopes.length === 2 && JSON.stringify(scopes[0].observed) === '["win32","arm64"]' && JSON.stringify(scopes[1].observed) === JSON.stringify(real)
    && process.platform === real[0] && process.arch === real[1] && Object.getOwnPropertyDescriptor(process, 'platform').writable === false;
});
await t('shim left applied at the end of the calls is refused', async () => {
  try { await D.interpret(ch, [{ step: 1, api: 'shim.platform', platform: 'darwin', arch: 'x64' }], null, { allowImport: false }); return false; } catch (e) {
    Object.defineProperty(process, 'platform', { value: 'linux', writable: false, enumerable: true, configurable: true });
    Object.defineProperty(process, 'arch', { value: 'x64', writable: false, enumerable: true, configurable: true });
    return /shim left applied/.test(e.message);
  }
});
await t('probe and file.sha256 on unbound aliases give NOT_REACHED, never an exception', async () => {
  frames.length = 0;
  await D.interpret(ch, [{ step: 1, api: 'probe', id: 'p', path: ['nope', 'exec'] }, { step: 2, api: 'file.sha256', id: 's', path_from_probe: 'p' }], null, { allowImport: false });
  const nr = frames.filter(([k, d]) => k === 'DIAGNOSTIC' && d.milestone === 'NOT_REACHED').map(([, d]) => d.detail.step);
  return JSON.stringify(nr) === '[1,2]';
});
const listener = (withHup) => `${withHup ? "process.on('SIGHUP', () => {});" : ''} process.stdout.write('ready\\n'); setTimeout(() => {}, 3000);`;
const info = {};
const statusOf = async (child) => { await new Promise(r => child.stdout.once('data', r)); return fs.readFileSync(`/proc/${child.pid}/status`, 'utf8'); };
await t('SigCgt of an own child: SIGHUP bit only with a listener (the witness used for SIGHUP; R2-F02)', async () => {
  const a = spawn(process.execPath, ['-e', listener(false)], { stdio: ['ignore', 'pipe', 'ignore'] });
  const b = spawn(process.execPath, ['-e', listener(true)], { stdio: ['ignore', 'pipe', 'ignore'] });
  const sa = await statusOf(a); const sb = await statusOf(b);
  a.kill('SIGKILL'); b.kill('SIGKILL');
  info.sigcgt_without_listener = { SIGHUP: D.sigcgtHas(sa, 'SIGHUP'), SIGINT: D.sigcgtHas(sa, 'SIGINT'), SIGTERM: D.sigcgtHas(sa, 'SIGTERM') };
  info.sigcgt_with_sighup_listener = { SIGHUP: D.sigcgtHas(sb, 'SIGHUP'), SIGINT: D.sigcgtHas(sb, 'SIGINT'), SIGTERM: D.sigcgtHas(sb, 'SIGTERM') };
  return D.sigcgtHas(sa, 'SIGHUP') === false && D.sigcgtHas(sb, 'SIGHUP') === true;
});
await t('LEFTOVER scan sees an own orphan process', async () => {
  const o = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 3000)'], { stdio: 'ignore', detached: true });
  o.unref();
  await sleep(150);
  const seen = D.procPids().some(p => p.pid === o.pid);
  process.kill(o.pid, 'SIGKILL');
  return seen;
});
// synthetic child in a temporary /work stand-in
const tmp = fs.mkdtempSync(path.join(tmpRoot, 'dp1-caps-'));
const childPath = path.join(tmp, 'child-under-test');
fs.writeFileSync(childPath, fs.readFileSync(path.join(unit, 'node', 'dp-synth-child.mjs'), 'utf8').replaceAll('/work/child', path.join(tmp, 'child')), { mode: 0o755 });
await t('synthetic child: CHILD_READY after the listeners; a signal outside on_signal is recorded; the declared one ends it with its code', async () => {
  const run = path.join(tmp, 'child', 'run-1');
  fs.mkdirSync(run, { recursive: true });
  fs.writeFileSync(path.join(tmp, 'child', 'program.json'), JSON.stringify({ run: 1, id: 'on', program: { ready_barrier: true, on_signal: { SIGTERM: { exit_code: 0 } }, no_signal_timeout_ms: 4000, no_signal_exit_code: 97 } }));
  const c = spawn(process.execPath, [childPath], { stdio: 'ignore' });
  const exit = new Promise(r => c.once('exit', (code, signal) => r({ code, signal })));
  const t0 = Date.now();
  while (!fs.readdirSync(run).some(n => n.startsWith('ready-')) && Date.now() - t0 < 3000) await sleep(5);
  c.kill('SIGHUP');
  await sleep(100);
  const alive = c.exitCode === null && c.signalCode === null;
  c.kill('SIGTERM');
  const st = await exit;
  const rec = JSON.parse(fs.readFileSync(path.join(run, fs.readdirSync(run).find(n => n.startsWith('record-'))), 'utf8'));
  return alive && st.code === 0 && st.signal === null && JSON.stringify(rec.signals) === '["SIGHUP","SIGTERM"]' && rec.ready === true && JSON.stringify(rec.declared_termination) === '{"exit_code":0}';
});
fs.rmSync(tmp, { recursive: true, force: true });
const passed = results.filter(r => r.ok).length;
process.stdout.write(JSON.stringify({ kind: 'SELFTEST_DP1_CAPS_NODE', node: process.version, passed, failed: results.length - passed, results, info }) + '\n');
process.exit(passed === results.length ? 0 : 1);
