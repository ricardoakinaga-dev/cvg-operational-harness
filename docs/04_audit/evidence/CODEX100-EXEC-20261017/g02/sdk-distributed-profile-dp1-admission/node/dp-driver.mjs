// Contained Node driver of the distributed profile, sub-lot DP-1 (DX100-G02:IMPLEMENT-AND-ADMIT-SDK-DISTRIBUTED-PROFILE-DP-1).
// Runtime argv: /runtime/node --experimental-loader /profile/dp-loader.mjs /profile/dp-driver.mjs --case CASE_ID
// Topology driver_only (erratum DP-SPEC/R2-F01): no adapter, no peer; the processes of the case are wrappers started by this
// driver (wrapper.run), synthetic children and, in DP-REAL01, the published binary started by the published wrapper.
// Vocabulary (CAP-DP-NODE-DRIVER, DDP-03; derived from the ts-driver.mjs admitted in the 2AC, sha 748603cb):
//   import {module, as}; shim.platform {platform, arch}; shim.restore; new Codex {sdk, options, as}; startThread {on, options, as};
//   run {on, input}; probe {id, path}; file.sha256 {id, path_from_probe}; wrapper.run {script, argv, env, cwd, stdin, as,
//   preload_shim?, send_signal?}; child.program {id, program}. Anything else throws (INVALID_CAPTURE).
// Lane conventions read by the evaluator: API_RESULT/API_ERROR api = "<step>:<name>"; DIAGNOSTIC ERROR_DETAIL, PROBE, SHIM_SCOPE,
// NOT_REACHED (EDP-07), WRAPPER_RESULT, SIGNAL_SENT, LEFTOVER, LEFTOVER_CLEANUP, CHILD_RUN, KEYLESS_WITNESS, CALLS_DONE; BLOB names
// fixture-listing, dist-manifest, stdout:<step>, stderr:<step>, child-records:<step>, shim:<step>.
// The published SDK is imported only through the import step, only from the admitted SDK entries of the loader (sha bound).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import C from './dp-channel.cjs';

const DIAG_CASES = new Set(['DIAG-TS-ECHO', 'DIAG-DP-STAGE', 'DIAG-DP-NODE', 'DIAG-DP-SYNTH-CHILD', 'DIAG-DP-REAL-CLI']);
const SHIM_URL = 'file:///profile/dp-platform-shim.mjs';
const SIGNUM = { SIGHUP: 1, SIGINT: 2, SIGTERM: 15 };
const OUT_CAP = 65536;
const WRAPPER_DEADLINE_MS = 20000;
const READY_DEADLINE_MS = 10000;
const SIGCGT_WAIT_MS = 1000;
const CRED_VARS = ['OPENAI_API_KEY', 'CODEX_API_KEY', 'GH_TOKEN', 'GITHUB_TOKEN', 'ANTHROPIC_API_KEY', 'AZURE_OPENAI_API_KEY'];
const STEP_KEYS = {
  import: ['step', 'api', 'module', 'as'],
  'shim.platform': ['step', 'api', 'platform', 'arch'],
  'shim.restore': ['step', 'api'],
  'new Codex': ['step', 'api', 'sdk', 'options', 'as'],
  startThread: ['step', 'api', 'on', 'options', 'as'],
  run: ['step', 'api', 'on', 'input'],
  probe: ['step', 'api', 'id', 'path'],
  'file.sha256': ['step', 'api', 'id', 'path_from_probe'],
  'wrapper.run': ['step', 'api', 'script', 'argv', 'env', 'cwd', 'stdin', 'as', 'preload_shim', 'send_signal'],
  'child.program': ['step', 'api', 'id', 'program'],
};
const REQUIRED = {
  import: ['module', 'as'], 'shim.platform': ['platform', 'arch'], 'new Codex': ['sdk', 'options'], startThread: ['on', 'as'], run: ['on', 'input'],
  probe: ['id', 'path'], 'file.sha256': ['id', 'path_from_probe'], 'wrapper.run': ['script', 'argv', 'env', 'cwd', 'stdin', 'as'], 'child.program': ['id', 'program'],
};
const PROGRAM_KEYS = ['exit_code', 'self_signal', 'ready_barrier', 'on_signal', 'no_signal_timeout_ms', 'no_signal_exit_code', 'read_stdin', 'stdout_jsonl'];

function plain(x) { return x === undefined ? null : JSON.parse(JSON.stringify(x)); }
function errorData(api, e) {
  const cause = e == null || e.cause == null ? null : { name: C.clip(e.cause.name ?? 'Error', 120), message: C.clip(e.cause.message ?? e.cause, 200) };
  return { api, name: C.clip(e?.name ?? 'Error', 120), message: C.clip(e?.message ?? e, 360), cause };
}
async function settle(fn) { try { return { ok: true, value: await fn() }; } catch (error) { return { ok: false, error }; } }
async function emitError(ch, api, e, step) {
  await ch.emit('API_ERROR', errorData(api, e));
  await ch.emit('DIAGNOSTIC', { milestone: 'ERROR_DETAIL', detail: { step, api, code: e?.code == null ? null : C.clip(e.code, 60), ctor: C.clip(e?.constructor?.name ?? typeof e, 60) } });
}

// Closed vocabulary check of one step (keys, required keys, program keys). Throws on anything outside it.
export function checkStep(step) {
  C.assert(C.object(step) && Number.isSafeInteger(step.step) && step.step > 0, 'step number');
  C.assert(typeof step.api === 'string' && Object.hasOwn(STEP_KEYS, step.api), `unknown step api ${C.clip(step.api, 60)}`);
  for (const k of Object.keys(step)) C.assert(STEP_KEYS[step.api].includes(k), `unknown key ${C.clip(k, 40)} in ${step.api} step`);
  for (const k of REQUIRED[step.api] ?? []) C.assert(Object.hasOwn(step, k), `missing key ${k} in ${step.api} step`);
  if (step.api === 'wrapper.run') {
    C.assert(step.stdin === '/dev/null', 'wrapper.run stdin must be /dev/null (DDP-03)');
    C.assert(Array.isArray(step.argv) && step.argv.every(a => typeof a === 'string'), 'wrapper argv');
    C.assert(C.object(step.env) && Object.values(step.env).every(v => typeof v === 'string'), 'wrapper env');
    C.assert(!Object.keys(step.env).some(k => CRED_VARS.includes(k)), 'credential variable in wrapper env');
    if (step.preload_shim !== undefined) C.assert(C.object(step.preload_shim) && /^[a-z0-9]{2,12}$/.test(step.preload_shim.platform) && /^[a-z0-9]{2,12}$/.test(step.preload_shim.arch), 'preload_shim');
    if (step.send_signal !== undefined) C.assert(C.object(step.send_signal) && step.send_signal.after === 'CHILD_READY' && Object.hasOwn(SIGNUM, step.send_signal.signal) && step.send_signal.to === 'wrapper', 'send_signal');
  }
  if (step.api === 'child.program') checkProgram(step.program);
  if (step.api === 'probe') C.assert(Array.isArray(step.path) && step.path.length >= 1 && step.path.every(k => typeof k === 'string'), 'probe path');
  return step.api;
}
export function checkProgram(p) {
  C.assert(C.object(p) && Object.keys(p).every(k => PROGRAM_KEYS.includes(k)), 'program keys');
  if (p.ready_barrier === true || p.on_signal !== undefined) C.assert(Number.isSafeInteger(p.no_signal_timeout_ms) && p.no_signal_timeout_ms > 0, 'bounded child wait (R1-F03)');
}
// Program of the synthetic child from child_script when no child.program step set one.
export function scriptProgram(cs) {
  if (!C.object(cs)) return { id: 'default', program: { exit_code: 0 } };
  const program = {};
  if (Object.hasOwn(cs, 'exit_code')) program.exit_code = cs.exit_code;
  if (cs.read_stdin === true) program.read_stdin = true;
  if (Array.isArray(cs.stdout_jsonl) && cs.stdout_jsonl.length) program.stdout_jsonl = cs.stdout_jsonl;
  if (!Object.hasOwn(program, 'exit_code')) program.exit_code = 0;
  return { id: 'child_script', program };
}
// Probe over own data properties only; an accessor on the path is refused.
export function probeValue(env, path) {
  if (!Object.hasOwn(env, path[0])) return { reached: false };
  let obj = env[path[0]];
  for (const k of path.slice(1)) {
    if (obj === null || (typeof obj !== 'object' && typeof obj !== 'function')) return { reached: true, present: false, value: null };
    const d = Object.getOwnPropertyDescriptor(obj, k);
    if (!d) return { reached: true, present: false, value: null };
    C.assert(Object.hasOwn(d, 'value'), `probe refused: accessor at ${C.clip(k, 40)}`);
    obj = d.value;
  }
  return { reached: true, present: true, value: plain(obj) };
}
export function sigcgtHas(statusText, signal) {
  const m = /^SigCgt:\s+([0-9a-fA-F]+)$/m.exec(statusText);
  if (!m) return null;
  return (BigInt('0x' + m[1]) >> BigInt(SIGNUM[signal] - 1)) & 1n ? true : false;
}
export function procPids(self = process.pid) {
  const out = [];
  for (const n of fs.readdirSync('/proc')) {
    if (!/^\d+$/.test(n)) continue;
    const pid = Number(n);
    if (pid === self || pid === 1) continue;
    let cmd = null; let state = null;
    try { cmd = fs.readFileSync(`/proc/${n}/cmdline`).toString('utf8').split('\0').filter(Boolean).slice(0, 6); } catch { /* gone */ }
    try { state = /^State:\s+(\S)/m.exec(fs.readFileSync(`/proc/${n}/status`, 'utf8'))?.[1] ?? null; } catch { /* gone */ }
    if (cmd === null && state === null) continue;
    out.push({ pid, cmdline: cmd, state });
  }
  return out;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Fixture view from inside the sandbox: lstat, mode, sha256 and readlink of every declared entry (DDP-11).
export function fixtureListing(trees) {
  const out = [];
  for (const t of trees ?? []) {
    for (const e of t.entries) {
      const rec = { path: e.path };
      let st = null;
      try { st = fs.lstatSync(e.path); } catch (x) { rec.error = C.clip(x.code ?? x.message, 40); out.push(rec); continue; }
      rec.type = st.isSymbolicLink() ? 'symlink' : st.isDirectory() ? 'dir' : st.isFile() ? 'file' : 'other';
      rec.mode = (st.mode & 0o7777).toString(8).padStart(4, '0');
      if (rec.type === 'file') { rec.bytes = st.size; rec.sha256 = C.shaFile(e.path); }
      if (rec.type === 'symlink') rec.target = fs.readlinkSync(e.path);
      out.push(rec);
    }
  }
  return out;
}
export function treeManifest(root) {
  const out = {};
  const walk = dir => {
    for (const n of fs.readdirSync(dir).sort()) {
      const p = `${dir}/${n}`;
      const st = fs.lstatSync(p);
      if (st.isDirectory()) { walk(p); continue; }
      out[p] = st.isFile() ? { bytes: st.size, mode: (st.mode & 0o7777).toString(8).padStart(4, '0'), sha256: C.shaFile(p, 536870912) } : { type: 'non-regular' };
    }
  };
  walk(root);
  return out;
}

class Runs {
  constructor(childScript) { this.n = 0; this.program = scriptProgram(childScript); }
  set(id, program) { checkProgram(program); this.program = { id, program }; }
  open() {
    this.n += 1;
    fs.mkdirSync(`/work/child/run-${this.n}`, { recursive: true });
    fs.writeFileSync('/work/child/program.json', JSON.stringify({ run: this.n, id: this.program.id, program: this.program.program }));
    return this.n;
  }
  records(run) {
    const dir = `/work/child/run-${run}`;
    const names = fs.readdirSync(dir).filter(n => /^record-\d+\.json$/.test(n)).sort((a, b) => Number(a.slice(7, -5)) - Number(b.slice(7, -5)));
    return names.map(n => JSON.parse(fs.readFileSync(`${dir}/${n}`, 'utf8')));
  }
  ready(run) { return fs.readdirSync(`/work/child/run-${run}`).filter(n => /^ready-\d+$/.test(n)); }
}

function collect(stream, cap) {
  const parts = []; let bytes = 0; let kept = 0;
  stream.on('data', b => { bytes += b.length; if (kept < cap) { const k = b.subarray(0, cap - kept); parts.push(k); kept += k.length; } });
  return () => ({ bytes, data: Buffer.concat(parts) });
}

async function leftover(ch, step) {
  const left = procPids();
  await ch.emit('DIAGNOSTIC', { milestone: 'LEFTOVER', detail: { step, pids: left.map(p => p.pid), states: left.map(p => p.state) } });
  if (left.length) {
    await C.blob(ch, `leftover:${step}`, JSON.stringify(left));
    for (const p of left) { try { process.kill(p.pid, 'SIGKILL'); } catch { /* gone */ } }
    await sleep(50);
    await ch.emit('DIAGNOSTIC', { milestone: 'LEFTOVER_CLEANUP', detail: { step, killed: left.map(p => p.pid), remaining: procPids().map(p => p.pid) } });
  }
}

// wrapper.run: /runtime/node [--import shim] <script> <argv>, env exactly as declared, stdin /dev/null, settles on 'close'.
export async function wrapperRun(ch, step, runs) {
  const run = runs.open();
  await ch.emit('DIAGNOSTIC', { milestone: 'CHILD_RUN', detail: { step: step.step, run, program_id: runs.program.id } });
  const pre = step.preload_shim ? ['--import', `${SHIM_URL}?platform=${step.preload_shim.platform}&arch=${step.preload_shim.arch}`] : [];
  const t0 = process.hrtime.bigint();
  const child = spawn('/runtime/node', [...pre, step.script, ...step.argv], { env: { ...step.env }, cwd: step.cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  let spawnError = null; child.once('error', e => { spawnError = e; });
  const out = collect(child.stdout, OUT_CAP); const err = collect(child.stderr, OUT_CAP);
  let status = null;
  const exited = new Promise(r => child.once('exit', (code, signal) => { status = { code, signal }; r(); }));
  const closed = new Promise(r => child.once('close', () => r()));
  let sent = null;
  if (step.send_signal) {
    const sig = step.send_signal.signal;
    const tReady = Date.now();
    let ready = [];
    while (!(ready = runs.ready(run)).length && Date.now() - tReady < READY_DEADLINE_MS && status === null) await sleep(5);
    if (!ready.length && status !== null) {
      // The wrapper ended before the child was ready: nothing to signal; signal.delivery_witnessed fails (INVALID_CAPTURE, rule 4).
      sent = { step: step.step, as: step.as, signal: sig, sent: false, reason: 'wrapper exited before CHILD_READY' };
      await ch.emit('DIAGNOSTIC', { milestone: 'SIGNAL_NOT_SENT', detail: sent });
    }
  }
  if (step.send_signal && sent === null) {
    const sig = step.send_signal.signal;
    const ready = runs.ready(run);
    C.assert(ready.length === 1, `CHILD_READY not observed before the signal (step ${step.step})`);
    const tCgt = Date.now(); let bit = null;
    for (;;) {
      try { bit = sigcgtHas(fs.readFileSync(`/proc/${child.pid}/status`, 'utf8'), sig); } catch { bit = null; }
      if (bit === true || Date.now() - tCgt >= SIGCGT_WAIT_MS) break;
      await sleep(2);
    }
    let killOk = false; let killError = null;
    try { killOk = process.kill(child.pid, sig); } catch (e) { killError = C.clip(e.code ?? e.message, 40); }
    sent = { step: step.step, as: step.as, signal: sig, sent: true, after: 'CHILD_READY', ready_marker: ready[0], sigcgt_bit_seen: bit, waited_ms: Date.now() - tCgt, kill_ok: killOk, kill_error: killError,
      note: sig === 'SIGHUP' ? 'SigCgt witnesses the wrapper listener for SIGHUP' : 'SIGINT/SIGTERM bits are also set by Node natively: informational (DP-SPEC/R2-F02)' };
    await ch.emit('DIAGNOSTIC', { milestone: 'SIGNAL_SENT', detail: sent });
  }
  const timer = new Promise(r => setTimeout(() => r('deadline'), WRAPPER_DEADLINE_MS));
  const which = await Promise.race([Promise.all([exited, closed]).then(() => 'close'), timer]);
  C.assert(which === 'close', `wrapper.run deadline (step ${step.step})`);
  C.assert(spawnError === null, `wrapper process spawn error: ${spawnError?.code ?? spawnError}`);
  const o = out(); const e = err();
  const records = runs.records(run);
  let shim = null;
  if (step.preload_shim) { try { shim = JSON.parse(fs.readFileSync(`/work/shim/${child.pid}.json`, 'utf8')); } catch { shim = null; } }
  await ch.emit('DIAGNOSTIC', { milestone: 'WRAPPER_RESULT', detail: { step: step.step, as: step.as, run, pid: child.pid, exit_code: status.code, signal: status.signal,
    stdout_bytes: o.bytes, stdout_sha256: C.sha(o.data), stderr_bytes: e.bytes, stderr_sha256: C.sha(e.data), records: records.length, shim: step.preload_shim ? shim !== null : null,
    settled: 'close', elapsed_ms: Number((process.hrtime.bigint() - t0) / 1000000n) } });
  if (o.data.length) await C.blob(ch, `stdout:${step.step}`, o.data);
  if (e.data.length) await C.blob(ch, `stderr:${step.step}`, e.data);
  await C.blob(ch, `child-records:${step.step}`, JSON.stringify(records));
  if (step.preload_shim) await C.blob(ch, `shim:${step.step}`, JSON.stringify(shim));
  await leftover(ch, step.step);
  return { status, records, stdout: o, stderr: e, shim, sent };
}

// One interpreter for the frozen sdk_calls of the DP-1 slots and for the constant diag_calls of the DIAG rows.
export async function interpret(ch, calls, childScript, opts = {}) {
  C.assert(Array.isArray(calls) && calls.length > 0, 'frozen calls');
  const seen = new Set();
  for (const s of calls) { checkStep(s); C.assert(!seen.has(s.step), 'duplicate step number'); seen.add(s.step); }
  const env = {}; const probes = {}; const runs = new Runs(childScript);
  let shim = null;
  for (const s of calls) {
    const n = s.step;
    switch (s.api) {
      case 'child.program': runs.set(s.id, s.program); await ch.emit('DIAGNOSTIC', { milestone: 'CHILD_PROGRAM', detail: { step: n, id: s.id } }); break;
      case 'wrapper.run': await wrapperRun(ch, s, runs); break;
      case 'import': {
        C.assert(opts.allowImport === true, 'import step outside an SDK case');
        const r = await settle(() => import(s.module));
        if (!r.ok) {
          C.assert(r.error?.code !== 'ERR_CVG_LOADER_DENIED', `loader denial is a harness failure (EDP-07): ${C.clip(r.error?.message, 200)}`);
          await emitError(ch, `${n}:import`, r.error, n);
        } else {
          env[s.as] = r.value;
          await ch.emit('API_RESULT', { api: `${n}:import`, result: null, observations: { exports: Object.keys(r.value).sort() } });
        }
        break;
      }
      case 'shim.platform': {
        C.assert(shim === null, 'nested shim');
        shim = { pd: Object.getOwnPropertyDescriptor(process, 'platform'), ad: Object.getOwnPropertyDescriptor(process, 'arch') };
        Object.defineProperty(process, 'platform', { ...shim.pd, value: s.platform });
        Object.defineProperty(process, 'arch', { ...shim.ad, value: s.arch });
        await ch.emit('DIAGNOSTIC', { milestone: 'SHIM_SCOPE', detail: { step: n, action: 'apply', platform: s.platform, arch: s.arch, observed: [process.platform, process.arch] } });
        break;
      }
      case 'shim.restore': {
        C.assert(shim !== null, 'restore without shim');
        Object.defineProperty(process, 'platform', shim.pd);
        Object.defineProperty(process, 'arch', shim.ad);
        shim = null;
        await ch.emit('DIAGNOSTIC', { milestone: 'SHIM_SCOPE', detail: { step: n, action: 'restore', observed: [process.platform, process.arch] } });
        break;
      }
      case 'new Codex': {
        if (!Object.hasOwn(env, s.sdk)) { await ch.emit('DIAGNOSTIC', { milestone: 'NOT_REACHED', detail: { step: n, missing_alias: s.sdk } }); break; }
        const Codex = env[s.sdk].Codex;
        C.assert(typeof Codex === 'function', 'SDK Codex export');
        const options = plain(s.options);
        const r = await settle(() => new Codex(options));
        if (!r.ok) await emitError(ch, `${n}:new Codex`, r.error, n);
        else { if (s.as) env[s.as] = r.value; await ch.emit('API_RESULT', { api: `${n}:new Codex`, result: null, observations: {} }); }
        break;
      }
      case 'startThread': {
        if (!Object.hasOwn(env, s.on)) { await ch.emit('DIAGNOSTIC', { milestone: 'NOT_REACHED', detail: { step: n, missing_alias: s.on } }); break; }
        const r = await settle(() => env[s.on].startThread(plain(s.options ?? {})));
        if (!r.ok) await emitError(ch, `${n}:startThread`, r.error, n);
        else { env[s.as] = r.value; await ch.emit('API_RESULT', { api: `${n}:startThread`, result: null, observations: {} }); }
        break;
      }
      case 'run': {
        if (!Object.hasOwn(env, s.on)) { await ch.emit('DIAGNOSTIC', { milestone: 'NOT_REACHED', detail: { step: n, missing_alias: s.on } }); break; }
        const run = runs.open();
        await ch.emit('DIAGNOSTIC', { milestone: 'CHILD_RUN', detail: { step: n, run, program_id: runs.program.id } });
        const r = await settle(() => env[s.on].run(s.input));
        if (r.ok) await ch.emit('API_RESULT', { api: `${n}:Thread.run`, result: plain(r.value), observations: {} });
        else await emitError(ch, `${n}:Thread.run`, r.error, n);
        await C.blob(ch, `child-records:${n}`, JSON.stringify(runs.records(run)));
        await leftover(ch, n);
        break;
      }
      case 'probe': {
        const p = probeValue(env, s.path);
        if (!p.reached) { await ch.emit('DIAGNOSTIC', { milestone: 'NOT_REACHED', detail: { step: n, missing_alias: s.path[0] } }); break; }
        probes[s.id] = p.value;
        await ch.emit('DIAGNOSTIC', { milestone: 'PROBE', detail: { step: n, id: s.id, present: p.present, value: p.value } });
        break;
      }
      case 'file.sha256': {
        if (!Object.hasOwn(probes, s.path_from_probe) || typeof probes[s.path_from_probe] !== 'string') {
          await ch.emit('DIAGNOSTIC', { milestone: 'NOT_REACHED', detail: { step: n, missing_alias: s.path_from_probe } }); break;
        }
        const v = C.shaFile(probes[s.path_from_probe], 536870912);
        probes[s.id] = v;
        await ch.emit('DIAGNOSTIC', { milestone: 'PROBE', detail: { step: n, id: s.id, present: true, value: v } });
        break;
      }
      default: C.assert(false, `unhandled step ${s.api}`);
    }
    // spawn.none: /proc sample of the sandbox after every step (pids other than init and this driver).
    await ch.emit('DIAGNOSTIC', { milestone: 'PROC_SAMPLE', detail: { step: n, pids: procPids().map(p => p.pid) } });
  }
  C.assert(shim === null, 'shim left applied at the end of the calls');
  return { env, probes, runs };
}

// Keyless witness at the start of every service (keyless.no_network_no_credential).
function keylessWitness() {
  const dev = fs.readFileSync('/proc/net/dev', 'utf8').split('\n').slice(2).map(l => l.split(':')[0].trim()).filter(Boolean);
  let home = null;
  try { home = fs.readdirSync('/work/home').sort(); } catch (e) { home = 'error:' + (e.code ?? e.message); }
  return { net_devices: dev, codex_home_present: fs.existsSync('/work/home/.codex') || Object.hasOwn(process.env, 'CODEX_HOME'), home_entries: home,
    credential_vars_in_driver_env: CRED_VARS.filter(k => Object.hasOwn(process.env, k)) };
}

async function sdkCase(config, ch) {
  const a = C.admission(config, config.mode === 'control' ? 'helpers' : 'dist');
  for (const p of ['/profile/dp-loader.json', '/profile/dp-loader.mjs', '/profile/dp-platform-shim.mjs', '/profile/dp-synth-child.mjs']) C.assert(C.hex(a.files[p] ?? ''), `unbound ${p}`);
  const ci = config.case_input;
  await C.blob(ch, 'fixture-listing', JSON.stringify(fixtureListing(ci.trees)));
  if ((ci.sdk_calls ?? []).some(s => (s.module ?? s.script ?? '').startsWith('/dist/'))) await C.blob(ch, 'dist-manifest', JSON.stringify(treeManifest('/dist')));
  await interpret(ch, ci.sdk_calls, ci.child_script, { allowImport: config.mode === 'sdk' });
}

// ---------------------------------------------------------------------------------------------- diagnostics (own code, no SDK)
async function loaderSelftest(ch, extra = []) {
  const probes = [
    ['node:fs', 'ALLOWED'], ['node:http', 'DENIED'], ['node:vm', 'DENIED'], ['fs', 'DENIED'],
    ['./dp-channel.cjs', 'ALLOWED'], ['file:///profile/dp-loader.json', 'DENIED'], ['/fixture/none.mjs', 'DENIED'],
    ['/dist/npm/node_modules/@openai/codex-sdk/dist/index.mjs', 'DENIED'], ['data:text/javascript,export default 1', 'DENIED'],
    ['https://example.invalid/x.mjs', 'DENIED'], ...extra,
  ];
  let pass = true; const rows = [];
  for (const [spec, expected] of probes) {
    let outcome; let code = null;
    try { await import(spec); outcome = 'ALLOWED'; } catch (e) { code = String(e?.code ?? e?.name ?? 'Error').slice(0, 60); outcome = e?.code === 'ERR_CVG_LOADER_DENIED' ? 'DENIED' : 'ERROR'; }
    pass = pass && outcome === expected;
    rows.push({ spec, expected, outcome, code });
  }
  await C.blob(ch, 'loader-probes', JSON.stringify(rows));
  await ch.emit('DIAGNOSTIC', { milestone: 'LOADER_SELFTEST', detail: { probes: probes.length, pass } });
  return pass;
}
async function ownChild(ch, argv, env, stdinBytes = Buffer.alloc(0)) {
  const child = spawn('/runtime/node', argv, { env, cwd: '/work', stdio: ['pipe', 'pipe', 'pipe'] });
  let spawnError = null; child.once('error', e => { spawnError = e; });
  child.stdin.on('error', () => {});
  child.stdin.end(stdinBytes);
  const out = collect(child.stdout, OUT_CAP); const err = collect(child.stderr, OUT_CAP);
  const st = await new Promise(r => child.once('close', (code, signal) => r({ code, signal })));
  C.assert(spawnError === null, `diagnostic spawn error: ${spawnError?.code ?? spawnError}`);
  return { ...st, stdout: out(), stderr: err() };
}
async function diagnostic(config, ch) {
  C.assert(DIAG_CASES.has(config.case), 'unsupported diagnostic');
  const ci = config.case_input;
  const runs = new Runs(null);
  if (config.case === 'DIAG-TS-ECHO') {
    await loaderSelftest(ch);
    runs.set('diag-exit3', { exit_code: 3 });
    const run = runs.open();
    const st = await ownChild(ch, ['/profile/dp-synth-child.mjs', 'exec', '--experimental-json'], { HOME: '/work/home', PATH: '/runtime' });
    await ch.emit('DIAGNOSTIC', { milestone: 'OWN_CHILD_CLOSED', detail: { code: st.code, signal: st.signal, records: runs.records(run).length } });
    await C.blob(ch, 'child-records:echo', JSON.stringify(runs.records(run)));
    await leftover(ch, 'echo');
    return;
  }
  if (config.case === 'DIAG-DP-STAGE') {
    await C.blob(ch, 'fixture-listing', JSON.stringify(fixtureListing(ci.trees)));
    await C.blob(ch, 'dist-manifest', JSON.stringify(treeManifest('/dist')));
    const writes = {};
    for (const p of ['/dist/cvg-write-probe', '/fixture/cvg-write-probe', '/profile/cvg-write-probe']) {
      try { fs.writeFileSync(p, 'x'); writes[p] = 'WRITTEN'; } catch (e) { writes[p] = e.code ?? 'ERROR'; }
    }
    await ch.emit('DIAGNOSTIC', { milestone: 'WRITE_PROBES', detail: writes });
    return;
  }
  if (config.case === 'DIAG-DP-NODE') {
    const pass = await loaderSelftest(ch, [['/profile/dp-diag-sdklike.mjs', 'ALLOWED'], ['/profile/dp-diag-sdkbad.mjs', 'DENIED'], ['/profile/dp-diag-sdkdrift.mjs', 'DENIED']]);
    let ownBare = null;
    try { const m = await import('/profile/dp-diag-sdklike.mjs'); ownBare = m.builtins(); } catch (e) { ownBare = { error: String(e?.code ?? e?.message) }; }
    await ch.emit('DIAGNOSTIC', { milestone: 'OWN_ENTRY_BARE', detail: { pass, builtins: ownBare } });
    let refused = false;
    try { probeValue({ o: Object.defineProperty({}, 'g', { get() { return 1; }, enumerable: true }) }, ['o', 'g']); } catch { refused = true; }
    await ch.emit('DIAGNOSTIC', { milestone: 'PROBE_ACCESSOR_REFUSED', detail: { refused } });
    await interpret(ch, ci.diag_calls, ci.child_script, { allowImport: false });
    return;
  }
  if (config.case === 'DIAG-DP-SYNTH-CHILD') {
    await C.blob(ch, 'fixture-listing', JSON.stringify(fixtureListing(ci.trees)));
    await interpret(ch, ci.diag_calls, ci.child_script, { allowImport: false });
    return;
  }
  if (config.case === 'DIAG-DP-REAL-CLI') {
    const bin = '/dist/npm/node_modules/@openai/codex-linux-x64/vendor/x86_64-unknown-linux-musl/bin/codex';
    const before = fs.readdirSync('/work').sort();
    const child = spawn(bin, ['--version'], { env: { HOME: '/work/home', PATH: '/runtime' }, cwd: '/work', stdio: ['ignore', 'pipe', 'pipe'] });
    let spawnError = null; child.once('error', e => { spawnError = e; });
    const out = collect(child.stdout, OUT_CAP); const err = collect(child.stderr, OUT_CAP);
    const t0 = Date.now();
    const st = await Promise.race([new Promise(r => child.once('close', (code, signal) => r({ code, signal }))), sleep(10000).then(() => ({ code: null, signal: 'DEADLINE' }))]);
    if (st.signal === 'DEADLINE') { try { child.kill('SIGKILL'); } catch { /* gone */ } }
    const o = out(); const e = err();
    await ch.emit('DIAGNOSTIC', { milestone: 'REAL_CLI_VERSION', detail: { code: st.code, signal: st.signal, spawn_error: spawnError ? C.clip(spawnError.code ?? spawnError.message, 60) : null,
      elapsed_ms: Date.now() - t0, stdout_bytes: o.bytes, stderr_bytes: e.bytes, work_before: before, work_after: fs.readdirSync('/work').sort(),
      home_after: fs.readdirSync('/work/home').sort() } });
    if (o.data.length) await C.blob(ch, 'stdout:real-cli', o.data);
    if (e.data.length) await C.blob(ch, 'stderr:real-cli', e.data);
    await leftover(ch, 'real-cli');
    return;
  }
}

export async function main() {
  const config = C.loadConfig('node');
  const ch = new C.Channel(config, 'driver', '/profile/dp-driver.mjs');
  let timer = null;
  const fail = e => { C.invalid(ch, e); clearTimeout(timer); process.exit(125); };
  try {
    C.assert(process.argv.length === 4 && process.argv[2] === '--case' && process.argv[3] === config.case, 'driver argv');
    C.assert(process.execArgv.length === 2 && process.execArgv[0] === '--experimental-loader' && process.execArgv[1] === '/profile/dp-loader.mjs', 'exact runtime loader argv');
    for (const p of ['/profile/dp-loader.json', '/profile/dp-loader.mjs']) C.assert(C.hex(ch.admission.files[p] ?? ''), `unbound ${p}`);
    timer = setTimeout(() => fail(new Error('driver deadline')), Math.max(1, ch.remainingMs()));
    await ch.start();
    fs.mkdirSync('/work/child', { recursive: true }); fs.mkdirSync('/work/shim', { recursive: true });
    await ch.emit('DIAGNOSTIC', { milestone: 'KEYLESS_WITNESS', detail: keylessWitness() });
    if (config.mode === 'diagnostic') await diagnostic(config, ch); else await sdkCase(config, ch);
    await ch.emit('DIAGNOSTIC', { milestone: 'CALLS_DONE', detail: { source_sdk_claim: false, topology: 'driver_only' } });
    await ch.control('RELEASE_EXIT');
    ch.finishControls();
    clearTimeout(timer);
    ch.writeNow('END', { streams: {}, child_exit_code: null, child_signal: null, complete: true });
    ch.closeFds(); process.exit(0);
  } catch (e) { fail(e); }
}
if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { C.invalid(null, e); process.exit(125); });
