// Contained TypeScript driver. Runtime argv (execution-profile.json):
//   /runtime/node --experimental-loader /profile/extension-loader.mjs /profile/ts-driver.mjs --case CASE_ID
// The SDK is imported only inside sdkCase() after a current admission with sdk_admitted=true.
// No top-level SDK or TypeScript import exists in this file.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import C from './channel.cjs';
import { selectedFixture, holds } from './fixture-cli.mjs';

const AGGREGATE_CASES = new Set(['SDKTS01', 'SDKTS05', 'SDKTS06', 'SDKTS07', 'SDKTS08', 'SDKTS09']);
const STREAM_CASES = new Set(['SDKTS02', 'SDKTS03', 'SDKTS04', 'SDKTS10']);
const DIAG_CASES = new Set(['DIAG-TS-ECHO', 'DIAG-TS-LARGE', 'DIAG-TS-ABORT']);
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

export async function sdkCase(config, ch) {
  const a = C.admission(config, 'sdk');
  for (const p of [SDK_ENTRY.slice('file://'.length), '/profile/sdk-emitted/package.json', '/profile/node-loader.json', '/profile/extension-loader.mjs']) C.assert(C.hex(a.files[p] ?? ''), `unbound ${p}`);
  const loaderCfg = C.strictJSON(C.readFile('/profile/node-loader.json'));
  const listing = fs.readdirSync('/profile/sdk-emitted').map(name => ({ name, regular: fs.lstatSync(`/profile/sdk-emitted/${name}`).isFile() }));
  checkEmitted(loaderCfg, a.files, listing);
  const { Codex } = await import(SDK_ENTRY); // the only SDK import
  C.assert(typeof Codex === 'function', 'SDK Codex export');
  // codexPathOverride is mandatory: without it exec.ts would resolve a binary through CommonJS createRequire,
  // which the ESM loader does not govern.
  // R2-F03: the guarantee is structural (literal override); the supervisor confirms it independently from the
  // adapter cmdline ['/runtime/node','/profile/adapter-typescript','exec','--experimental-json'] seen in /proc.
  const options = { codexPathOverride: '/profile/adapter-typescript', env: { ...SDK_ENV } };
  const thread = new Codex(options).startThread();
  if (AGGREGATE_CASES.has(config.case)) {
    const r = await settle(() => thread.run('synthetic'));
    if (r.ok) await ch.emit('API_RESULT', { api: 'Thread.run', result: r.value, observations: { thread_id: thread.id } });
    else await ch.emit('API_ERROR', errorData('Thread.run', r.error));
    return;
  }
  C.assert(STREAM_CASES.has(config.case), 'unsupported SDK case');
  const abortable = config.case === 'SDKTS10';
  const abort = new AbortController();
  let abortCalled = false; let abortTask = null;
  const started = await settle(() => thread.runStreamed('synthetic', abortable ? { signal: abort.signal } : {}));
  if (!started.ok) { await ch.emit('API_ERROR', errorData('Thread.runStreamed', started.error)); return; }
  if (abortable) {
    // Supervisor sends ABORT_NOW only after independent child/cgroup + adapter/peer READY witnesses.
    abortTask = ch.control('ABORT_NOW').then(async () => {
      abort.abort(); abortCalled = true;
      await ch.emit('DIAGNOSTIC', { milestone: 'ABORT_CALLED', detail: { source_sdk_claim: false } });
    });
    abortTask.catch(() => {});
  }
  const it = started.value.events;
  let index = 0; let apiError = null;
  for (;;) {
    const step = await settle(() => it.next());
    if (!step.ok) { apiError = step.error; break; }
    if (step.value.done) break;
    // Snapshot at the actual yield boundary; the yielded event is not rewritten.
    await ch.emit('API_RESULT', { api: 'Thread.runStreamed.yield', result: step.value.value, observations: { thread_id: thread.id, index: index++ } });
  }
  if (abortable && abortCalled) await abortTask;
  if (apiError) await ch.emit('API_ERROR', errorData('Thread.runStreamed', apiError));
  else await ch.emit('API_RESULT', { api: 'Thread.runStreamed.return', result: null, observations: { events: index, thread_id: thread.id, abort_called: abortCalled } });
  if (abortable) C.assert(abortCalled, 'SDK API ended before the ABORT_NOW barrier');
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
async function diagnostic(config, ch) {
  C.assert(DIAG_CASES.has(config.case), 'unsupported diagnostic');
  const input = config.case_input;
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
  if (holds(input)) {
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
