// Offline self-test of the DP-1 Node code (no SDK, no cache file executed, no network). Run with the pinned Node v24.20.0:
//   node selftests/selftest_dp1_driver.mjs <unit-dir>
// Prints one JSON line {passed, failed, results}. Covers: closed vocabulary of every frozen DP-1 step (checkStep over the copy of
// cases-dp-1.json), program checks (bounded wait), child_script programs, probe over data properties (accessor refused), SigCgt
// parsing, the loader decisions of dp-loader.mjs (SDK entries, closed bare list, denials, entry sha check), BLOB framing of
// dp-channel.cjs and the synthetic child programs run as own processes in a temporary /work stand-in.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const unit = process.argv[2];
const results = [];
const t = (name, fn) => { try { const ok = fn(); results.push({ name, ok: ok === true }); } catch (e) { results.push({ name, ok: false, error: String(e?.message ?? e).slice(0, 200) }); } };
const throws = fn => { try { fn(); return false; } catch { return true; } };

const D = await import(path.join(unit, 'node', 'dp-driver.mjs'));
const L = await import(path.join(unit, 'node', 'dp-loader.mjs'));
const C = createRequire(import.meta.url)(path.join(unit, 'node', 'dp-channel.cjs'));
const cases = JSON.parse(fs.readFileSync(path.join(unit, 'inputs', 'spec-dp', 'cases-dp-1.json'), 'utf8')).cases;

// ---------------------------------------------------------------- vocabulary
t('every frozen DP-1 step is in the closed vocabulary (artifact.check excluded: evaluator only)', () => {
  for (const c of cases) for (const s of c.case_input.sdk_calls ?? []) if (s.api !== 'artifact.check') D.checkStep(s);
  return true;
});
t('artifact.check is refused by the driver', () => throws(() => D.checkStep({ step: 1, api: 'artifact.check', id: 'x', member: 'A2:x' })));
t('unknown step api refused', () => throws(() => D.checkStep({ step: 1, api: 'bogus' })));
t('unknown key refused', () => throws(() => D.checkStep({ step: 1, api: 'probe', id: 'a', path: ['x'], extra: 1 })));
t('missing required key refused', () => throws(() => D.checkStep({ step: 1, api: 'wrapper.run', script: '/x', argv: [], env: {}, cwd: '/work', as: 'w' })));
t('wrapper.run stdin other than /dev/null refused', () => throws(() => D.checkStep({ step: 1, api: 'wrapper.run', script: '/x', argv: [], env: {}, cwd: '/work', stdin: 'inherit', as: 'w' })));
t('credential variable in wrapper env refused', () => throws(() => D.checkStep({ step: 1, api: 'wrapper.run', script: '/x', argv: [], env: { OPENAI_API_KEY: 'x' }, cwd: '/work', stdin: '/dev/null', as: 'w' })));
t('signal before CHILD_READY refused', () => throws(() => D.checkStep({ step: 1, api: 'wrapper.run', script: '/x', argv: [], env: {}, cwd: '/work', stdin: '/dev/null', as: 'w', send_signal: { after: 'START', signal: 'SIGTERM', to: 'wrapper' } })));
t('unbounded child wait refused (R1-F03)', () => throws(() => D.checkProgram({ ready_barrier: true, on_signal: { SIGTERM: { exit_code: 0 } } })));
t('unknown program key refused', () => throws(() => D.checkProgram({ exit_code: 1, sleep: 3 })));
t('child_script program: record_then_exit with stdin', () => JSON.stringify(D.scriptProgram({ behavior: 'record_then_exit', read_stdin: true, stdout_jsonl: [], exit_code: 0 })) === JSON.stringify({ id: 'child_script', program: { exit_code: 0, read_stdin: true } }));
t('child_script program: programmable defaults to exit 0', () => JSON.stringify(D.scriptProgram({ behavior: 'programmable', programs_from_steps: true })) === JSON.stringify({ id: 'child_script', program: { exit_code: 0 } }));

// ---------------------------------------------------------------- probe and SigCgt
class Exec { constructor() { this.executablePath = '/x/bin/codex'; this.pathDirs = ['/x/codex-path']; } }
class Codex { constructor() { this.exec = new Exec(); } get hidden() { return 1; } }
t('probe reads own data properties (exec is a plain field in the dist)', () => {
  const r = D.probeValue({ c: new Codex() }, ['c', 'exec', 'executablePath']);
  return r.reached && r.present && r.value === '/x/bin/codex';
});
t('probe of an absent property is present=false', () => { const r = D.probeValue({ c: new Codex() }, ['c', 'exec', 'nope']); return r.reached && r.present === false && r.value === null; });
t('probe of an unbound alias is NOT_REACHED', () => D.probeValue({}, ['c', 'exec']).reached === false);
t('probe refuses an accessor', () => throws(() => D.probeValue({ o: Object.defineProperty({}, 'g', { get() { return 1; }, enumerable: true }) }, ['o', 'g'])));
t('SigCgt bit parsing', () => D.sigcgtHas('Name:\tnode\nSigCgt:\t0000000000004a01\n', 'SIGHUP') === true && D.sigcgtHas('SigCgt:\t0000000000004a00\n', 'SIGHUP') === false
  && D.sigcgtHas('SigCgt:\t0000000000004a00\n', 'SIGTERM') === true && D.sigcgtHas('SigCgt:\t0000000000004a00\n', 'SIGINT') === false);

// ---------------------------------------------------------------- loader decisions
const sha = b => C.sha(Buffer.from(b));
const ENTRY = 'file:///fixture/pk01/node_modules/@openai/codex-sdk/dist/index.js';
const cfg = L.validateConfig({ v: 1, entry: 'file:///profile/dp-driver.mjs', prebound: ['file:///profile/dp-channel.cjs', 'file:///profile/dp-driver.mjs'],
  builtins: ['node:child_process', 'node:crypto', 'node:fs', 'node:module', 'node:net', 'node:os', 'node:path', 'node:readline', 'node:util'],
  sdk_builtins: ['node:child_process', 'node:fs', 'node:module', 'node:os', 'node:path', 'node:readline'], sdk_bare: ['child_process', 'fs', 'module', 'os', 'path', 'readline'],
  sdk_entries: { [ENTRY]: sha('entry') } });
const dec = (s, p) => L.decide(s, p, cfg);
t('loader: driver imports an admitted SDK entry by path (entry check requested)', () => { const d = dec('/fixture/pk01/node_modules/@openai/codex-sdk/dist/index.js', 'file:///profile/dp-driver.mjs'); return d?.url === ENTRY && d.entry === true; });
t('loader: bare fs from the SDK entry maps to node:fs', () => dec('fs', ENTRY)?.url === 'node:fs');
t('loader: every bare of the closed list maps for the entry', () => ['child_process', 'fs', 'module', 'os', 'path', 'readline'].every(b => dec(b, ENTRY)?.url === 'node:' + b));
t('loader: bare http from the SDK entry denied', () => dec('http', ENTRY) === null);
t('loader: node:net from the SDK entry denied (SDK builtin set)', () => dec('node:net', ENTRY) === null);
t('loader: bare fs from a helper denied', () => dec('fs', 'file:///profile/dp-driver.mjs') === null);
t('loader: relative import from the SDK entry denied', () => dec('./other.js', ENTRY) === null);
t('loader: non-entry fixture module denied', () => dec('/fixture/other.mjs', 'file:///profile/dp-driver.mjs') === null);
t('loader: unknown parent denied; only the entry without parent', () => dec('./x.mjs', 'file:///other/y.mjs') === null && dec('/profile/x.mjs', undefined) === null && dec('file:///profile/dp-driver.mjs', undefined)?.url === 'file:///profile/dp-driver.mjs');
t('loader: entry bytes must match the bound sha', () => L.verifyEntry(ENTRY, cfg, () => Buffer.from('entry')) === true && throws(() => L.verifyEntry('file:///fixture/x.js', { sdk_entries: { 'file:///fixture/x.js': sha('a') } }, () => Buffer.from('b'))));
t('loader: config with a bare outside the closed list refused', () => throws(() => L.validateConfig({ ...cfg, sdk_bare: ['http'], sdk_builtins: ['node:http'], prebound: [...cfg.prebound], builtins: [...cfg.builtins], sdk_entries: {} })));
t('loader: SDK entry outside /dist, /fixture or /profile refused', () => throws(() => L.validateConfig({ ...cfg, prebound: [...cfg.prebound], builtins: [...cfg.builtins], sdk_builtins: [...cfg.sdk_builtins], sdk_bare: [...cfg.sdk_bare], sdk_entries: { 'file:///tmp/x.js': sha('x') } })));

// ---------------------------------------------------------------- channel BLOB framing
t('BLOB frame validates and is exempt from the 1024-byte metadata cap', () => {
  const b = Buffer.alloc(2048, 7);
  const e = { v: 1, attempt: 'a'.repeat(40), case: 'DP-PK04A', role: 'driver', seq: 3, kind: 'BLOB', pid: 2, mono_ns: '1', data: { name: 'stdout:1', offset: 0, base64: b.toString('base64'), sha256: C.sha(b) } };
  return C.encodeFrame(e).length > 2048 + 4;
});
t('BLOB with a wrong digest refused', () => throws(() => C.validateEvent({ v: 1, attempt: 'a'.repeat(40), case: 'DP-PK04A', role: 'driver', seq: 3, kind: 'BLOB', pid: 2, mono_ns: '1', data: { name: 'x', offset: 0, base64: 'AA==', sha256: '0'.repeat(64) } })));
t('channel accepts only the DP-1 case IDs', () => C.CASE_ID.test('DP-PK05A') && C.CASE_ID.test('DP1-CTRL01') && C.CASE_ID.test('DIAG-DP-REAL-CLI') && !C.CASE_ID.test('C3-TS01') && !C.CASE_ID.test('DP-PY19A'));

// ---------------------------------------------------------------- synthetic child programs (own processes, temporary /work stand-in)
const tmp = fs.mkdtempSync(path.join(process.env.CVG_SELFTEST_TMP ?? os.tmpdir(), 'dp1-child-'));
const childSrc = fs.readFileSync(path.join(unit, 'node', 'dp-synth-child.mjs'), 'utf8').replaceAll('/work/child', path.join(tmp, 'child'));
const childPath = path.join(tmp, 'child-under-test');
fs.writeFileSync(childPath, childSrc, { mode: 0o755 });
const runChild = (program, n, opts = {}) => {
  fs.mkdirSync(path.join(tmp, 'child', `run-${n}`), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'child', 'program.json'), JSON.stringify({ run: n, id: 'p' + n, program }));
  const r = spawnSync(process.execPath, [childPath, 'x', 'y z'], { input: opts.input ?? '', env: { HOME: tmp, PATH: '/nonexistent', CVG_K: 'v' }, timeout: 8000 });
  const dir = path.join(tmp, 'child', `run-${n}`);
  const recs = fs.readdirSync(dir).filter(f => f.startsWith('record-')).map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
  return { status: r.status, signal: r.signal, recs, ready: fs.readdirSync(dir).filter(f => f.startsWith('ready-')).length };
};
t('child exit code program: record before exit', () => { const r = runChild({ exit_code: 3 }, 1); return r.status === 3 && r.recs.length === 1 && JSON.stringify(r.recs[0].declared_termination) === '{"exit_code":3}' && JSON.stringify(r.recs[0].argv_tail) === '["x","y z"]' && r.recs[0].env.CVG_K === 'v' && r.recs[0].env.CODEX_HOME === undefined; });
t('child self_signal program dies by the signal', () => { const r = runChild({ self_signal: 'SIGTERM' }, 2); return r.signal === 'SIGTERM' && JSON.stringify(r.recs[0].declared_termination) === '{"self_signal":"SIGTERM"}'; });
t('child read_stdin program records stdin', () => { const r = runChild({ exit_code: 0, read_stdin: true }, 3, { input: 'p' }); return r.status === 0 && r.recs[0].stdin === 'p'; });
t('child NO_SIGNAL after the bounded wait exits 97', () => { const r = runChild({ ready_barrier: true, on_signal: { SIGTERM: { exit_code: 0 } }, no_signal_timeout_ms: 200, no_signal_exit_code: 97 }, 4); return r.status === 97 && r.recs[0].no_signal === true && r.recs[0].ready === true && r.ready === 1 && JSON.stringify(r.recs[0].signals) === '[]'; });
fs.rmSync(tmp, { recursive: true, force: true });

const passed = results.filter(r => r.ok).length;
process.stdout.write(JSON.stringify({ kind: 'SELFTEST_DP1_NODE', node: process.version, passed, failed: results.length - passed, results }) + '\n');
process.exit(passed === results.length ? 0 : 1);
