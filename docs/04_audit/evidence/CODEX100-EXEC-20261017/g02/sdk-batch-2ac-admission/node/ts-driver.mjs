// Contained TypeScript driver. Runtime argv (execution-profile.json):
//   /runtime/node --experimental-loader /profile/extension-loader.mjs /profile/ts-driver.mjs --case CASE_ID
// The SDK is imported only inside sdkCase() after a current admission with sdk_admitted=true.
// No top-level SDK or TypeScript import exists in this file.
// DX100-G02 batch 2A: sdkCase() interprets the frozen sdk_calls of inputs/spec-2a/cases-2a.json step by step.
// Lane conventions read by the evaluator r3: API_RESULT/API_ERROR api = "<step>:<name>"; DIAGNOSTIC
// ERROR_DETAIL, TMP_LISTING (synchronous /work/tmp listing right after each run settles), STEP_WITNESS
// (waits STEP_RELEASE: supervisor zero-spawn witness), RESOLVER_ABSENCE, UNCAUGHT (2A-TS10 only), CALLS_DONE.
// Freeze r4 (2A continuation): F4-08 markers ($REPEAT, $NAN, $INFINITY, $BIGINT, $HOLE, $UNDEFINED in arrays, $DATE, $INSTANCE),
// F4-09 recorder of every uncaughtException in 2A-TS10E (drained 500 ms after the run settles), F4-12 barrier
// WITNESS_WINDOW_OPEN (STEP_WITNESS kind WINDOW_OPEN + STEP_RELEASE), DIAG-TS-PREABORT and DIAG-TS-EPIPE probes.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import C from './channel.cjs';
import { selectedFixture, holds } from './fixture-cli.mjs';

const DIAG_CASES = new Set(['DIAG-TS-ECHO', 'DIAG-TS-LARGE', 'DIAG-TS-ABORT', 'DIAG-TS-ARGVENV', 'DIAG-TS-TMPWATCH', 'DIAG-TS-ENOENT',
  'DIAG-TS-PREABORT', 'DIAG-TS-EPIPE']);
const UNDEF = '$UNDEFINED';
const HOLE = '$HOLE';
const RESOLVER_PATHS = ['/profile/sdk-emitted/node_modules', '/profile/node_modules', '/node_modules', '/work/home/.node_modules', '/work/home/.node_libraries', '/lib/node', '/usr/lib/node'];
const SDK_ENV = Object.freeze({ HOME: '/work/home', PATH: '/runtime' }); // execution-profile typescript.SDK_configuration.env
const SDK_ENTRY = 'file:///profile/sdk-emitted/index.js';

function errorData(api, e) {
  const cause = e == null || e.cause == null ? null : { name: C.clip(e.cause.name ?? 'Error', 120), message: C.clip(e.cause.message ?? e.cause, 200) };
  return { api, name: C.clip(e?.name ?? 'Error', 120), message: C.clip(e?.message ?? e, 360), cause };
}
// Every emitted SDK module must be admission-bound with the loader-manifest hash, and the emitted
// directory must be closed (exactly the manifest plus package.json, regular files only) before import.
export function checkEmitted(cfg, files, listing) {
  const names = Object.keys(cfg.emitted);
  C.assert(names.includes('index.js'), 'emitted manifest lacks index.js');
  for (const n of names) C.assert(files[`/profile/sdk-emitted/${n}`] === cfg.emitted[n], `emitted module not admission-bound: ${n}`);
  C.assert(C.hex(files['/profile/sdk-emitted/package.json'] ?? ''), 'unbound emitted package.json');
  const want = [...names, 'package.json'].sort();
  C.assert(JSON.stringify([...listing.map(e => e.name)].sort()) === JSON.stringify(want), 'emitted directory not closed');
  C.assert(listing.every(e => e.regular), 'non-regular file in emitted directory');
  return true;
}
// The API call alone is inside this try. Telemetry runs after it, so a failed emit is INVALID, never API_ERROR.
async function settle(fn) { try { return { ok: true, value: await fn() }; } catch (error) { return { ok: false, error }; } }


// '$UNDEFINED' values become undefined (key kept, or array element present); '$HOLE' leaves an array hole; F4-08 markers
// become the declared JS values; every other object becomes a plain Object.prototype object.
class CvgInstance { constructor(fields) { Object.assign(this, fields); } }
function onlyKey(x, k) { const ks = Object.keys(x); return ks.length === 1 && ks[0] === k; }
export function materialize(x) {
  if (x === '$NAN') return NaN;
  if (x === '$INFINITY') return Infinity;
  if (Array.isArray(x)) {
    const out = new Array(x.length);
    x.forEach((v, i) => { if (v !== HOLE) out[i] = v === UNDEF ? undefined : materialize(v); });
    return out;
  }
  if (C.object(x)) {
    if (onlyKey(x, '$REPEAT')) { const r = x.$REPEAT; C.assert(C.object(r) && typeof r.text === 'string' && Number.isSafeInteger(r.count) && r.count >= 0 && r.count <= 16777216, '$REPEAT'); return r.text.repeat(r.count); }
    if (onlyKey(x, '$BIGINT')) { C.assert(typeof x.$BIGINT === 'string' && /^-?[0-9]+$/.test(x.$BIGINT), '$BIGINT'); return BigInt(x.$BIGINT); }
    if (onlyKey(x, '$DATE')) { C.assert(Number.isSafeInteger(x.$DATE), '$DATE'); return new Date(x.$DATE); }
    if (onlyKey(x, '$INSTANCE')) { C.assert(C.object(x.$INSTANCE), '$INSTANCE'); return new CvgInstance(materialize(x.$INSTANCE)); }
    const o = {}; for (const [k, v] of Object.entries(x)) o[k] = v === UNDEF ? undefined : materialize(v); return o;
  }
  return x;
}
function plain(x) { return x === undefined ? null : JSON.parse(JSON.stringify(x)); }
function listing() {
  const dirs = [];
  for (const name of fs.readdirSync('/work/tmp').sort()) {
    const p = `/work/tmp/${name}`;
    const st = fs.lstatSync(p);
    dirs.push([name, st.isDirectory() ? fs.readdirSync(p).sort() : null]);
  }
  return dirs;
}
async function emitError(ch, api, e, step) {
  await ch.emit('API_ERROR', errorData(api, e));
  await ch.emit('DIAGNOSTIC', { milestone: 'ERROR_DETAIL', detail: { step, api, code: e?.code == null ? null : C.clip(e.code, 60),
    syscall: e?.syscall == null ? null : C.clip(e.syscall, 60), ctor: C.clip(e?.constructor?.name ?? typeof e, 60) } });
}
async function tmpListing(ch, step) { await ch.emit('DIAGNOSTIC', { milestone: 'TMP_LISTING', detail: { step, entries: listing() } }); }
async function witness(ch, step, kind) {
  await ch.emit('DIAGNOSTIC', { milestone: 'STEP_WITNESS', detail: { step, kind, entries: listing() } });
  await ch.control('STEP_RELEASE');
}
function turnOptions(t, env) {
  const o = materialize(t || {});
  if (o.signal === '$ac.signal') o.signal = env.ac.signal;
  return o;
}

async function streamed(ch, step, thread, it, consume) {
  const n = step.step;
  let index = 0;
  const next = async () => {
    const r = await settle(() => it.next());
    if (!r.ok) { await emitError(ch, `${n}:Thread.runStreamed`, r.error, n); return null; }
    if (r.value.done) { await ch.emit('API_RESULT', { api: `${n}:return`, result: null, observations: { events: index, thread_id: thread.id } }); return null; }
    await ch.emit('API_RESULT', { api: `${n}:yield`, result: plain(r.value.value), observations: { thread_id: thread.id, index: index++ } });
    return r.value;
  };
  if (consume === 'all') { while (await next()); return; }
  if (consume === 'first_next_only') { await next(); return; }
  if (consume === 'first_then_return') {
    if (!(await next())) return;
    const r = await settle(() => it.return());
    if (r.ok) await ch.emit('API_RESULT', { api: `${n}:return()`, result: { done: r.value.done }, observations: { thread_id: thread.id } });
    else await emitError(ch, `${n}:return()`, r.error, n);
    return;
  }
  C.assert(false, `unknown consume mode ${consume}`);
}

export async function sdkCase(config, ch) {
  const a = C.admission(config, 'sdk');
  for (const p of [SDK_ENTRY.slice('file://'.length), '/profile/sdk-emitted/package.json', '/profile/node-loader.json', '/profile/extension-loader.mjs']) C.assert(C.hex(a.files[p] ?? ''), `unbound ${p}`);
  const loaderCfg = C.strictJSON(C.readFile('/profile/node-loader.json'));
  const dir = fs.readdirSync('/profile/sdk-emitted').map(name => ({ name, regular: fs.lstatSync(`/profile/sdk-emitted/${name}`).isFile() }));
  checkEmitted(loaderCfg, a.files, dir);
  const { Codex } = await import(SDK_ENTRY); // the only SDK import
  C.assert(typeof Codex === 'function', 'SDK Codex export');
  const calls = config.case_input.sdk_calls;
  C.assert(Array.isArray(calls) && calls.length > 0, 'frozen sdk_calls');
  const env = {};
  let uncaught = null;
  const recorded = []; // F4-09: every uncaughtException of 2A-TS10E, emitted after the drain
  if (config.case === '2A-TS10E') process.on('uncaughtException', e => recorded.push(e));
  if (config.case === '2A-TS10') {
    // CAP-TS-UNCAUGHT-RECORDER (2A-TS10 only): records an error emitted without listener (form B); observation instrument.
    uncaught = new Promise(resolve => process.on('uncaughtException', e => resolve(e)));
  }
  for (const step of calls) {
    const n = step.step;
    if (step.barrier) {
      C.assert(step.barrier === 'LAZY_POINT' || step.barrier === 'WITNESS_WINDOW_OPEN', `unknown barrier ${step.barrier}`);
      await witness(ch, n, step.barrier === 'LAZY_POINT' ? 'LAZY_POINT' : 'WINDOW_OPEN'); // F4-12
      continue;
    }
    const api = step.api;
    if (api === 'new Codex') {
      if (config.case === '2A-TS01' && n === 1) {
        const paths = Object.fromEntries(RESOLVER_PATHS.map(p => [p, fs.existsSync(p)]));
        await ch.emit('DIAGNOSTIC', { milestone: 'RESOLVER_ABSENCE', detail: { paths, node_path: Object.hasOwn(process.env, 'NODE_PATH') } });
      }
      let value; let error = null;
      try { value = new Codex(materialize(step.options)); } catch (e) { error = e; }
      if (error) await emitError(ch, `${n}:new Codex`, error, n);
      else { env[step.as] = value; await ch.emit('API_RESULT', { api: `${n}:new Codex`, result: null, observations: {} }); }
      if (step.expect) await witness(ch, n, 'ZERO_SPAWN');
      continue;
    }
    if (api === 'new AbortController') {
      const ac = new AbortController();
      if (step.then === 'ac.abort()') ac.abort();
      env[step.as] = ac;
      await ch.emit('API_RESULT', { api: `${n}:new AbortController`, result: { aborted: ac.signal.aborted }, observations: {} });
      continue;
    }
    const m = /^(\w+)\.(startThread|resumeThread)$/.exec(api || '');
    if (m) {
      const target = env[m[1]];
      C.assert(target, `unknown codex ${m[1]}`);
      const thread = m[2] === 'startThread' ? target.startThread(materialize(step.options)) : target.resumeThread(step.id, materialize(step.options));
      env[step.as] = thread;
      await ch.emit('API_RESULT', { api: `${n}:${m[2]}`, result: null, observations: { thread_id: thread.id } });
      continue;
    }
    C.assert(api === 'run' || api === 'run_streamed', `unknown step api ${api}`);
    const thread = env[step.on];
    C.assert(thread, `unknown thread ${step.on}`);
    const input = materialize(step.input);
    const opts = turnOptions(step.turn_options, env);
    if (api === 'run') {
      if (uncaught) {
        const runP = settle(() => thread.run(input, opts)).then(r => ({ kind: 'settled', r }));
        const w = await Promise.race([runP, uncaught.then(e => ({ kind: 'uncaught', e }))]);
        if (w.kind === 'uncaught') {
          const e = w.e;
          await ch.emit('DIAGNOSTIC', { milestone: 'UNCAUGHT', detail: { name: C.clip(e?.name ?? typeof e, 120), code: e?.code == null ? null : C.clip(e.code, 60), syscall: e?.syscall == null ? null : C.clip(e.syscall, 60), message: C.clip(e?.message ?? e, 300) } });
        } else if (w.r.ok) await ch.emit('API_RESULT', { api: `${n}:Thread.run`, result: plain(w.r.value), observations: { thread_id: thread.id } });
        else await emitError(ch, `${n}:Thread.run`, w.r.error, n);
      } else {
        const r = await settle(() => thread.run(input, opts));
        if (r.ok) await ch.emit('API_RESULT', { api: `${n}:Thread.run`, result: plain(r.value), observations: { thread_id: thread.id } });
        else await emitError(ch, `${n}:Thread.run`, r.error, n);
      }
    } else {
      const started = await settle(() => thread.runStreamed(input, opts));
      if (!started.ok) await emitError(ch, `${n}:Thread.runStreamed`, started.error, n);
      else if (step.consume === 'none') {
        env[`events${n}`] = started.value.events; // kept, never iterated
        await ch.emit('API_RESULT', { api: `${n}:Thread.runStreamed`, result: null, observations: { consumed: 'none', thread_id: thread.id } });
      } else await streamed(ch, step, thread, started.value.events, step.consume);
    }
    await tmpListing(ch, n);
    if (step.expect && step.expect.spawns === 0) await witness(ch, n, 'ZERO_SPAWN');
  }
  if (config.case === '2A-TS10E') {
    await new Promise(resolve => setTimeout(resolve, 500)); // F4-09 drain after the run settled
    for (const e of recorded) await ch.emit('DIAGNOSTIC', { milestone: 'UNCAUGHT', detail: uncaughtDetail(e) });
    await ch.emit('DIAGNOSTIC', { milestone: 'UNCAUGHT_DRAIN', detail: { count: recorded.length, wait_ms: 500 } });
  }
  // End-of-case listing: every case reports the final /work/tmp state.
  await ch.emit('DIAGNOSTIC', { milestone: 'TMP_LISTING', detail: { step: 'final', entries: listing() } });
}

function digestStream(readable, cap, onCap) {
  return new Promise((resolve, reject) => {
    const parts = []; let bytes = 0;
    readable.on('data', b => { bytes += b.length; if (bytes > cap) { onCap(); reject(new C.ChannelError('diagnostic stream cap')); } else parts.push(b); });
    readable.once('error', reject);
    readable.once('end', () => { const all = Buffer.concat(parts); resolve({ bytes, sha256: C.sha(all), text: all }); });
  });
}
async function loaderSelftest(ch) {
  const probes = [
    ['node:fs', 'ALLOWED'], ['node:http', 'DENIED'], ['node:vm', 'DENIED'], ['fs', 'DENIED'],
    ['./channel.cjs', 'ALLOWED'], ['../profile/fixture-cli.mjs', 'ALLOWED'],
    ['file:///profile/adapter-config.json', 'DENIED'], [SDK_ENTRY, 'DENIED'], ['/profile/transpile.mjs', 'DENIED'],
    ['data:text/javascript,export default 1', 'DENIED'], ['https://example.invalid/x.mjs', 'DENIED'],
  ];
  let pass = true;
  for (const [spec, expected] of probes) {
    let outcome; let code = null;
    try { await import(spec); outcome = 'ALLOWED'; } catch (e) { code = String(e?.code ?? e?.name ?? 'Error').slice(0, 60); outcome = e?.code === 'ERR_CVG_LOADER_DENIED' ? 'DENIED' : 'ERROR'; }
    pass = pass && outcome === expected;
    await ch.emit('DIAGNOSTIC', { milestone: 'LOADER_PROBE', detail: { spec, expected, outcome, code } });
  }
  await ch.emit('DIAGNOSTIC', { milestone: 'LOADER_SELFTEST', detail: { probes: probes.length, pass } });
  C.assert(pass, 'loader selftest');
}
async function transpileGate(ch) {
  // Constant negative control: compiler_admitted=false must refuse before any compiler require.
  const t = spawn('/runtime/node', ['/profile/transpile.mjs'], { cwd: '/work', env: { ...C.FIXED_ENV }, stdio: ['ignore', 'pipe', 'pipe'] });
  const closed = new Promise((resolve, reject) => { t.once('error', reject); t.once('close', (code, signal) => resolve({ code, signal })); });
  const out = digestStream(t.stdout, 65536, () => t.kill('SIGKILL')); const err = digestStream(t.stderr, 65536, () => t.kill('SIGKILL'));
  const status = await closed; const o = await out; const e = await err;
  let report = null;
  try { report = C.strictJSON(o.text.subarray(0, Math.max(0, o.text.length - 1))); } catch { report = null; }
  const pass = status.code === 3 && status.signal === null && C.object(report) && report.status === 'REFUSED_NOT_ADMITTED' && report.compiler_loaded === false;
  await ch.emit('DIAGNOSTIC', { milestone: 'TRANSPILE_GATE', detail: { code: status.code, signal: status.signal, stdout_sha256: o.sha256, stderr_bytes: e.bytes, status: C.object(report) ? String(report.status) : null, compiler_loaded: C.object(report) ? report.compiler_loaded : null, pass } });
  C.assert(pass, 'transpile gate did not refuse before compiler load');
}

// DIAG-TS-ENOENT: own constant code mirroring exec.ts:203-216 (spawn, error listener, stdin write/end, readline, exit wait)
// with a missing executable; no SDK import. Records which form the pinned Node produces: A (error rethrown after the
// readline loop), B (error event without listener on stdin, caught by the recorder), C (no settlement within the bound).
function uncaughtDetail(e) {
  return { name: C.clip(e?.name ?? typeof e, 120), code: e?.code == null ? null : C.clip(e.code, 60), syscall: e?.syscall == null ? null : C.clip(e.syscall, 60), message: C.clip(e?.message ?? e, 300) };
}
async function enoentProbe(ch, d) {
  await witness(ch, 'enoent', 'WINDOW_OPEN'); // F4-06: inotify window of the adapter executable (expected: zero events)
  const readline = await import('node:readline');
  let recorded = null;
  const onUncaught = e => { recorded = e; };
  process.on('uncaughtException', onUncaught);
  const child = spawn(d.path, ['exec', '--experimental-json'], { env: { HOME: '/work/home', PATH: '/runtime', CODEX_INTERNAL_ORIGINATOR_OVERRIDE: 'codex_sdk_ts' } });
  let spawnError = null; child.once('error', err => { spawnError = err; });
  child.stdin.write('enoent'); child.stdin.end();
  const exitP = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
  const rl = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
  const loop = (async () => { const lines = []; for await (const line of rl) lines.push(line); return lines; })();
  const bound = new Promise(resolve => setTimeout(() => resolve('timeout'), d.wait_ms));
  const w = await Promise.race([loop.then(lines => ({ kind: 'eof', lines: lines.length })), bound.then(() => ({ kind: 'timeout' }))]);
  const exitRace = await Promise.race([exitP.then(s => ({ exit: s })), new Promise(resolve => setTimeout(() => resolve({ exit: null }), 50))]);
  const form = recorded ? 'B' : (w.kind === 'eof' && spawnError ? 'A' : 'C');
  const failure = spawnError ?? recorded; // r4: spawn-failure evidence on the driver lane (R4-03 NO_CHILD)
  await ch.emit('DIAGNOSTIC', { milestone: 'ERROR_DETAIL', detail: { step: 'enoent', api: 'enoent', code: failure?.code == null ? null : C.clip(failure.code, 60),
    syscall: failure?.syscall == null ? null : C.clip(failure.syscall, 60), ctor: C.clip(failure?.constructor?.name ?? typeof failure, 60) } });
  await ch.emit('DIAGNOSTIC', { milestone: 'ENOENT_FORM', detail: { form, readline: w.kind, spawn_error_code: spawnError?.code ?? null,
    uncaught: recorded ? { name: C.clip(recorded.name ?? '', 60), code: recorded.code ?? null, message: C.clip(recorded.message ?? recorded, 200) } : null,
    exit_event: exitRace.exit, pid: child.pid ?? null, source_sdk_claim: false } });
  process.removeListener('uncaughtException', onUncaught);
  try { rl.close(); child.removeAllListeners(); } catch { /* own probe cleanup */ }
}

// DIAG-TS-PREABORT: own code mirroring exec.ts:203-216 with a pre-aborted signal on the real adapter executable; no SDK.
// The supervisor witnesses IN_OPEN of the adapter inode inside the window (F4-06); the error and exit are recorded.
async function preabortProbe(ch, d) {
  await witness(ch, 'preabort', 'WINDOW_OPEN');
  const ac = new AbortController(); ac.abort();
  const child = spawn(d.path, ['exec', '--experimental-json'], { env: { ...SDK_ENV, CODEX_INTERNAL_ORIGINATOR_OVERRIDE: 'codex_sdk_ts' }, signal: ac.signal });
  const errP = new Promise(resolve => child.once('error', e => resolve(e)));
  const exitP = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
  child.stdin.on('error', () => {}); child.stdout.on('error', () => {}); child.stderr.on('error', () => {});
  child.stdin.write('preabort'); child.stdin.end(); child.stdout.resume(); child.stderr.resume();
  const bound = ms => new Promise(resolve => setTimeout(() => resolve(null), ms));
  const err = await Promise.race([errP, bound(d.wait_ms)]);
  const exit = await Promise.race([exitP, bound(d.wait_ms)]);
  await ch.emit('DIAGNOSTIC', { milestone: 'ERROR_DETAIL', detail: { step: 'preabort', api: 'preabort', code: err?.code == null ? null : C.clip(err.code, 60),
    syscall: err?.syscall == null ? null : C.clip(err.syscall, 60), ctor: C.clip(err?.constructor?.name ?? typeof err, 60) } });
  await ch.emit('DIAGNOSTIC', { milestone: 'PREABORT_RESULT', detail: { error: err ? uncaughtDetail(err) : null, exit, pid_present: Number.isInteger(child.pid), source_sdk_claim: false } });
}

// DIAG-TS-EPIPE: own code mirroring exec.ts:209-216 (error listener only on the process, write+end without stdin error
// listener) against the adapter fault adapter_close_stdin_at_start; records every uncaughtException (F4-09); no SDK.
async function epipeProbe(ch, d) {
  const recorded = []; const onUncaught = e => recorded.push(e);
  process.on('uncaughtException', onUncaught);
  const child = spawn('/profile/adapter-typescript', ['exec', '--experimental-json'], { env: { ...SDK_ENV, CODEX_INTERNAL_ORIGINATOR_OVERRIDE: 'codex_sdk_ts' } });
  let childError = null; child.once('error', e => { childError = e; });
  const exitP = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
  const kill = () => child.kill('SIGKILL');
  const out = digestStream(child.stdout, C.CAPS.stdout, kill); const err = digestStream(child.stderr, C.CAPS.stderr, kill);
  child.stdin.write('x'.repeat(d.bytes)); child.stdin.end();
  const exit = await exitP; const o = await out; const e = await err;
  await new Promise(resolve => setTimeout(resolve, 500));
  process.removeListener('uncaughtException', onUncaught);
  for (const u of recorded) await ch.emit('DIAGNOSTIC', { milestone: 'UNCAUGHT', detail: uncaughtDetail(u) });
  await ch.emit('DIAGNOSTIC', { milestone: 'EPIPE_RESULT', detail: { uncaught_count: recorded.length, child_error: childError ? uncaughtDetail(childError) : null, exit,
    stdout_eof: true, stdout_bytes: o.bytes, stdout_sha256: o.sha256, stderr_bytes: e.bytes, stdin_bytes_written: d.bytes, source_sdk_claim: false } });
}

// DIAG-TS-TMPWATCH: mirrors outputSchemaFile.ts (fs.promises mkdtemp/writeFile/rm under os.tmpdir(), libuv threadpool with
// UV_THREADPOOL_SIZE=2) and passes --output-schema to the fixture, which reports SCHEMA_FILE; the driver lists /work/tmp.
async function tmpwatchProbe(ch, d) {
  const os = await import('node:os');
  const path = await import('node:path');
  const fsp = fs.promises;
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'codex-output-schema-'));
  const file = path.join(dir, 'schema.json');
  await fsp.writeFile(file, JSON.stringify(d.schema), 'utf8');
  await ch.emit('DIAGNOSTIC', { milestone: 'TMP_LISTING', detail: { step: 'created', entries: listing(), tmpdir: os.tmpdir(), uv_threadpool_size: process.env.UV_THREADPOOL_SIZE ?? null } });
  const r = await ownChild(ch, ['exec', '--experimental-json', '--output-schema', file], { HOME: '/work/home', PATH: '/runtime', CODEX_INTERNAL_ORIGINATOR_OVERRIDE: 'codex_sdk_ts' }, Buffer.from('tmpwatch'));
  await fsp.rm(dir, { recursive: true, force: true });
  await ch.emit('DIAGNOSTIC', { milestone: 'TMP_LISTING', detail: { step: 'removed', entries: listing(), child_code: r.code } });
}

// Own spawn of the adapter mirroring exec.ts (default stdio, given env, stdin write+end) used by the 2A diagnostics.
async function ownChild(ch, argv, envObj, stdinBytes) {
  const child = spawn('/profile/adapter-typescript', argv, { env: envObj });
  let spawnError = null; child.once('error', e => { spawnError = e; });
  const exit = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
  const closed = new Promise(resolve => child.once('close', () => resolve()));
  const kill = () => child.kill('SIGKILL');
  const out = digestStream(child.stdout, C.CAPS.stdout, kill); const err = digestStream(child.stderr, C.CAPS.stderr, kill);
  child.stdin.on('error', () => {});
  child.stdin.write(stdinBytes); child.stdin.end();
  const status = await exit; await closed; const o = await out; const e = await err;
  C.assert(spawnError === null, `diagnostic spawn error: ${spawnError?.code ?? spawnError}`);
  await ch.emit('DIAGNOSTIC', { milestone: 'OWN_FIXTURE_CHILD_CLOSED', detail: { code: status.code, signal: status.signal, stdin_bytes: stdinBytes.length, stdin_sha256: C.sha(stdinBytes), stdout_bytes: o.bytes, stdout_sha256: o.sha256, stderr_bytes: e.bytes, stderr_sha256: e.sha256, source_sdk_claim: false } });
  return status;
}

async function diagnostic(config, ch) {
  C.assert(DIAG_CASES.has(config.case), 'unsupported diagnostic');
  const input = config.case_input;
  if (config.case === 'DIAG-TS-ARGVENV') {
    const d = input.diag;
    await ch.emit('DIAGNOSTIC', { milestone: 'ARGVENV_SENT', detail: { argv_bytes: Buffer.byteLength(JSON.stringify(d.argv)), argv_count: d.argv.length, env: d.env } });
    await ownChild(ch, d.argv, d.env, Buffer.from('argvenv'));
    return;
  }
  if (config.case === 'DIAG-TS-TMPWATCH') { await tmpwatchProbe(ch, input.diag); return; }
  if (config.case === 'DIAG-TS-ENOENT') { await enoentProbe(ch, input.diag); return; }
  if (config.case === 'DIAG-TS-PREABORT') { await preabortProbe(ch, input.diag); return; }
  if (config.case === 'DIAG-TS-EPIPE') { await epipeProbe(ch, input.diag); return; }
  if (config.case === 'DIAG-TS-ECHO') await loaderSelftest(ch);
  // Mirrors exec.ts: spawn(executablePath, ["exec","--experimental-json"], { env, signal }) with default stdio.
  const child = spawn('/profile/adapter-typescript', ['exec', '--experimental-json'], { env: { ...SDK_ENV, CODEX_INTERNAL_ORIGINATOR_OVERRIDE: 'codex_sdk_ts' } });
  let spawnError = null; child.once('error', e => { spawnError = e; });
  const exit = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
  const closed = new Promise(resolve => child.once('close', () => resolve()));
  const kill = () => child.kill('SIGKILL');
  const out = digestStream(child.stdout, C.CAPS.stdout, kill); const err = digestStream(child.stderr, C.CAPS.stderr, kill);
  const stdinBytes = Buffer.from('synthetic');
  child.stdin.on('error', () => {});
  child.stdin.write(stdinBytes); child.stdin.end();
  if (holds(input) || config.case === 'DIAG-TS-ABORT') { // r4: DIAG-TS-ABORT writes JSONL before holding (prefix under signal)
    await ch.control('ABORT_NOW');
    C.assert(child.kill('SIGTERM'), 'diagnostic signal delivery');
    await ch.emit('DIAGNOSTIC', { milestone: 'ABORT_CALLED', detail: { signal: 'SIGTERM', source_sdk_claim: false } });
  }
  const status = await exit; await closed; const o = await out; const e = await err;
  C.assert(spawnError === null, `diagnostic spawn error: ${spawnError?.code ?? spawnError}`);
  await ch.emit('DIAGNOSTIC', { milestone: 'OWN_FIXTURE_CHILD_CLOSED', detail: { code: status.code, signal: status.signal, stdin_bytes: stdinBytes.length, stdin_sha256: C.sha(stdinBytes), stdout_bytes: o.bytes, stdout_sha256: o.sha256, stderr_bytes: e.bytes, stderr_sha256: e.sha256, source_sdk_claim: false } });
  if (config.case === 'DIAG-TS-ECHO') await transpileGate(ch);
}
export async function main() {
  const config = C.loadConfig('typescript');
  const ch = new C.Channel(config, 'driver', '/profile/ts-driver.mjs');
  let timer = null;
  const fail = e => { C.invalid(ch, e); clearTimeout(timer); process.exit(125); };
  try {
    C.assert(process.argv.length === 4 && process.argv[2] === '--case' && process.argv[3] === config.case, 'driver argv');
    C.assert(process.execArgv.length === 2 && process.execArgv[0] === '--experimental-loader' && process.execArgv[1] === '/profile/extension-loader.mjs', 'exact runtime loader argv');
    for (const p of ['/profile/node-loader.json', '/profile/extension-loader.mjs', '/profile/fixture-cases.json', '/profile/fixture-cli.mjs']) C.assert(C.hex(ch.admission.files[p] ?? ''), `unbound ${p}`);
    selectedFixture(config);
    timer = setTimeout(() => fail(new Error('driver deadline')), Math.max(1, ch.remainingMs()));
    await ch.start();
    if (config.mode === 'diagnostic') await diagnostic(config, ch); else await sdkCase(config, ch);
    // Batch 2A: CALLS_DONE marks the end of the API lane (also the release condition when no child exists).
    await ch.emit('DIAGNOSTIC', { milestone: 'CALLS_DONE', detail: { source_sdk_claim: false } });
    // Final barrier: the supervisor releases the driver only after adapter and peer are terminal
    // (END/INVALID frame or independently witnessed exit), never on a SIGNAL frame alone.
    await ch.control('RELEASE_EXIT');
    ch.finishControls();
    clearTimeout(timer);
    ch.writeNow('END', { streams: {}, child_exit_code: null, child_signal: null, complete: true });
    ch.closeFds(); process.exit(0);
  } catch (e) { fail(e); }
}
if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { C.invalid(null, e); process.exit(125); });
