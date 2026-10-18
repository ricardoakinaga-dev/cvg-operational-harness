// Pure-data selftest of the Node helpers on the host (pinned Node v24.20.0).
// Imports only own helper modules (no SDK, no compiler, no /profile or /observer I/O).
// Usage: node selftest.mjs <templates-dir> <fixture-cases.json> [--emit-frames] [events-fifo] [control-fifo] [full-fifo]
import fs from 'node:fs';
import C from './channel.cjs';
import { validateConfig, decide, strictParse, bindEmitted } from './extension-loader.mjs';
import { checkEmitted } from './ts-driver.mjs';
import { validateTranspileConfig, qualify } from './transpile.mjs';
import { wireFixture, holds } from './fixture-cli.mjs';

const [templates, fixturesPath, flag] = process.argv.slice(2);
const results = [];
const check = (id, fn) => {
  try { const r = fn(); results.push({ id, status: r === false ? 'FAIL' : 'PASS' }); } catch (e) { results.push({ id, status: 'FAIL', error: String(e.message).slice(0, 200) }); }
};
const rejects = (id, fn) => {
  try { fn(); results.push({ id, status: 'FAIL', error: 'accepted known-bad input' }); } catch (e) { results.push({ id, status: 'PASS', rejected: String(e.message).slice(0, 120) }); }
};
const A = 'a'.repeat(40); const N = 'b'.repeat(40);
const ev = (role, seq, kind, data, extra = {}) => ({ v: 1, attempt: A, case: 'DIAG-TS-ECHO', role, seq, kind, pid: 7, mono_ns: String(1000 + seq), data, ...extra });
const chunk = Buffer.from('hello');
const raw = { stream: 'stdout', offset: 0, base64: chunk.toString('base64'), sha256: C.sha(chunk) };
const ctl = (seq, command) => ({ v: 1, attempt: A, case: 'DIAG-TS-ECHO', role: 'peer', seq, command });

// strict JSON
check('json.valid', () => C.strictJSON(Buffer.from('{"a":[1,2,{"b":null}]}')).a.length === 3);
rejects('json.duplicate_key', () => C.strictJSON(Buffer.from('{"a":1,"a":2}')));
rejects('json.nested_duplicate_key', () => C.strictJSON(Buffer.from('{"a":{"b":1,"b":1}}')));
rejects('json.nan', () => C.strictJSON(Buffer.from('{"a":NaN}')));
rejects('json.trailing', () => C.strictJSON(Buffer.from('{"a":1} x')));
rejects('json.invalid_utf8', () => C.strictJSON(Buffer.from([0x7b, 0x22, 0xff, 0x22, 0x3a, 0x31, 0x7d])));
rejects('json.compact_whitespace', () => C.strictJSON(Buffer.from('{"a": 1}'), true));
check('json.compact_whitespace_in_string_ok', () => C.strictJSON(Buffer.from('{"a":"x y"}'), true).a === 'x y');
rejects('json.depth', () => C.strictJSON(Buffer.from('['.repeat(40) + ']'.repeat(40))));

// events
const good = [ev('adapter', 0, 'BEGIN', { nonce: N, source_sha256: 'c'.repeat(64), pid_namespace: 'pid:[4026531836]' }), ev('adapter', 1, 'READY', {}), ev('adapter', 2, 'RAW_READ', raw), ev('adapter', 3, 'FORWARD_COMMIT', { stream: 'stdout', offset: 0, bytes: 5 })];
check('event.roundtrip', () => {
  const d = new C.FrameDecoder(C.validateEvent); const out = d.push(Buffer.concat(good.map(e => C.encodeFrame(e)))); d.finish();
  return out.length === 4 && JSON.stringify(out.map(x => ({ ...x }))) === JSON.stringify(good.map(x => ({ ...x })));
});
rejects('event.kind_for_role', () => C.encodeFrame(ev('driver', 2, 'RAW_READ', raw)));
rejects('event.unknown_field', () => C.encodeFrame(ev('adapter', 2, 'RAW_READ', { ...raw, extra: 1 })));
rejects('event.base64_noncanonical', () => C.encodeFrame(ev('adapter', 2, 'RAW_READ', { ...raw, base64: 'aGVsbG8' })));
rejects('event.sha_mismatch', () => C.encodeFrame(ev('adapter', 2, 'RAW_READ', { ...raw, sha256: 'd'.repeat(64) })));
rejects('event.chunk_over_2048', () => { const b = Buffer.alloc(2049, 1); return C.encodeFrame(ev('adapter', 2, 'RAW_READ', { stream: 'stdout', offset: 0, base64: b.toString('base64'), sha256: C.sha(b) })); });
check('event.chunk_2048_fits_frame', () => { const b = Buffer.alloc(2048, 1); return C.encodeFrame(ev('adapter', 2, 'RAW_READ', { stream: 'stdout', offset: 0, base64: b.toString('base64'), sha256: C.sha(b) })).length <= 4096; });
rejects('event.zero_commit', () => C.encodeFrame(ev('adapter', 3, 'FORWARD_COMMIT', { stream: 'stdout', offset: 0, bytes: 0 })));
rejects('event.complete_end_uncommitted', () => C.encodeFrame(ev('adapter', 4, 'END', { streams: { stdin: { read_bytes: 1, committed_bytes: 0, read_sha256: 'e'.repeat(64) }, stdout: { read_bytes: 0, committed_bytes: 0, read_sha256: 'e'.repeat(64) }, stderr: { read_bytes: 0, committed_bytes: 0, read_sha256: 'e'.repeat(64) } }, child_exit_code: 0, child_signal: null, complete: true })));
rejects('event.adapter_end_missing_stream', () => C.encodeFrame(ev('adapter', 4, 'END', { streams: {}, child_exit_code: 0, child_signal: null, complete: false })));
rejects('event.signal_name', () => C.encodeFrame(ev('adapter', 4, 'SIGNAL', { signal: 'SIGKILL', inflight: false })));
rejects('event.milestone_lowercase', () => C.encodeFrame(ev('driver', 2, 'DIAGNOSTIC', { milestone: 'bad', detail: null })));
rejects('event.metadata_over_1024', () => C.encodeFrame(ev('driver', 2, 'API_RESULT', { api: 'x', result: 'r'.repeat(1100), observations: {} })));
rejects('event.nonfinite', () => C.encodeFrame(ev('driver', 2, 'API_RESULT', { api: 'x', result: Infinity, observations: {} })));
rejects('event.undefined_value', () => C.encodeFrame(ev('driver', 2, 'API_RESULT', { api: 'x', result: { a: undefined }, observations: {} })));

// controls
check('control.roundtrip_split', () => {
  const b = Buffer.concat([C.encodeFrame(ctl(0, 'READY'), true), C.encodeFrame(ctl(1, 'RELEASE_REPLY'), true)]);
  const d = new C.FrameDecoder(); const a = d.push(b.subarray(0, 7)); const c = d.push(b.subarray(7)); d.finish();
  return a.length === 0 && c.length === 2 && c[1].command === 'RELEASE_REPLY';
});
rejects('control.unknown_command', () => C.encodeFrame({ ...ctl(0, 'READY'), command: 'RUN' }, true));
rejects('control.zero_length', () => new C.FrameDecoder().push(Buffer.from([0, 0, 0, 0])));
rejects('control.oversize_length', () => new C.FrameDecoder().push(Buffer.from([0, 0, 0x0f, 0xfd])));
rejects('control.duplicate_key_frame', () => { const p = Buffer.from('{"v":1,"v":1,"attempt":"' + A + '","case":"x","role":"peer","seq":0,"command":"READY"}'); const f = Buffer.alloc(4); f.writeUInt32BE(p.length); return new C.FrameDecoder().push(Buffer.concat([f, p])); });
rejects('control.noncompact_frame', () => { const p = Buffer.from(JSON.stringify(ctl(0, 'READY'), null, 1)); const f = Buffer.alloc(4); f.writeUInt32BE(p.length); return new C.FrameDecoder().push(Buffer.concat([f, p])); });
rejects('control.truncated_finish', () => { const d = new C.FrameDecoder(); d.push(C.encodeFrame(ctl(0, 'READY'), true).subarray(0, 10)); d.finish(); });

// ledger
check('ledger.partial_commits', () => { const l = new C.StreamLedger('stdin'); l.raw(Buffer.from('abcdef')); l.commit(2); l.commit(4); const s = l.summary(); return s.read_bytes === 6 && s.committed_bytes === 6; });
rejects('ledger.false_commit', () => { const l = new C.StreamLedger('stdin'); l.raw(Buffer.from('ab')); l.commit(3); });
rejects('ledger.cap', () => { const l = new C.StreamLedger('stderr'); for (let i = 0; i < 33; i++) l.raw(Buffer.alloc(2048)); });

// loader
const loaderCfg = JSON.parse(fs.readFileSync(`${templates}/node-loader.json`));
const cfg = validateConfig(loaderCfg);
const emittedCfg = validateConfig({ ...loaderCfg, emitted: { 'index.js': 'f'.repeat(64), 'thread.js': 'f'.repeat(64) } });
const E = 'file:///profile/ts-driver.mjs';
const table = [
  ['entry', 'file:///profile/ts-driver.mjs', undefined, cfg, true], ['other_entry', 'file:///profile/fixture-cli.mjs', undefined, cfg, false],
  ['builtin_listed', 'node:fs', E, cfg, true], ['builtin_unlisted', 'node:http', E, cfg, false], ['bare_builtin', 'fs', E, cfg, false],
  ['prebound_relative', './channel.cjs', E, cfg, true], ['prebound_dotdot', '../profile/fixture-cli.mjs', E, cfg, true],
  ['unbound_profile_file', 'file:///profile/adapter-config.json', E, cfg, false], ['absolute_path_unbound', '/profile/transpile.mjs', E, cfg, false],
  ['sdk_entry_without_emit', 'file:///profile/sdk-emitted/index.js', E, cfg, false], ['sdk_entry_with_emit', 'file:///profile/sdk-emitted/index.js', E, emittedCfg, true],
  ['data_url', 'data:text/javascript,export default 1', E, cfg, false], ['https', 'https://example.invalid/x.mjs', E, cfg, false],
  ['bare_package', '@openai/codex', E, cfg, false], ['query', './channel.cjs?x=1', E, cfg, false],
  ['emitted_extensionless', './thread', 'file:///profile/sdk-emitted/index.js', emittedCfg, true],
  ['emitted_with_extension', './thread.js', 'file:///profile/sdk-emitted/index.js', emittedCfg, false],
  ['emitted_unlisted', './exec', 'file:///profile/sdk-emitted/index.js', emittedCfg, false],
  ['emitted_parent_unlisted', './thread', 'file:///profile/sdk-emitted/exec.js', emittedCfg, false],
  ['emitted_dotdot', '../channel.cjs', 'file:///profile/sdk-emitted/index.js', emittedCfg, false],
  ['emitted_bare', '@modelcontextprotocol/sdk/types.js', 'file:///profile/sdk-emitted/index.js', emittedCfg, false],
  ['unknown_parent', './x.mjs', 'file:///work/x.mjs', cfg, false],
];
for (const [id, spec, parent, c, allow] of table) check(`loader.${id}`, () => (decide(spec, parent, c) !== null) === allow);
check('loader.cjs_format', () => decide('./channel.cjs', E, cfg).format === 'commonjs');
check('loader.emitted_parent_sdk_builtin', () => decide('node:fs', 'file:///profile/sdk-emitted/index.js', emittedCfg) !== null);
check('loader.emitted_parent_helper_builtin_denied', () => decide('node:net', 'file:///profile/sdk-emitted/index.js', emittedCfg) === null);
check('loader.helper_parent_helper_builtin', () => decide('node:net', E, cfg) !== null);
rejects('loader.sdk_builtins_not_subset', () => validateConfig({ ...loaderCfg, sdk_builtins: ['node:http'] }));
check('loader.bind_emitted_ok', () => bindEmitted(emittedCfg, { '/profile/sdk-emitted/index.js': 'f'.repeat(64), '/profile/sdk-emitted/thread.js': 'f'.repeat(64) }) === emittedCfg);
rejects('loader.bind_emitted_unbound', () => bindEmitted(emittedCfg, { '/profile/sdk-emitted/index.js': 'f'.repeat(64) }));
rejects('loader.bind_emitted_digest_drift', () => bindEmitted(emittedCfg, { '/profile/sdk-emitted/index.js': 'f'.repeat(64), '/profile/sdk-emitted/thread.js': 'e'.repeat(64) }));
const boundFiles = { '/profile/sdk-emitted/index.js': 'f'.repeat(64), '/profile/sdk-emitted/thread.js': 'f'.repeat(64), '/profile/sdk-emitted/package.json': 'a'.repeat(64) };
const goodListing = ['index.js', 'thread.js', 'package.json'].map(name => ({ name, regular: true }));
check('emitted.closed_and_bound', () => checkEmitted(emittedCfg, boundFiles, goodListing));
rejects('emitted.extra_file', () => checkEmitted(emittedCfg, boundFiles, [...goodListing, { name: 'evil.js', regular: true }]));
rejects('emitted.non_regular', () => checkEmitted(emittedCfg, boundFiles, goodListing.map(e => (e.name === 'thread.js' ? { ...e, regular: false } : e))));
rejects('emitted.unbound_module', () => checkEmitted(emittedCfg, { ...boundFiles, '/profile/sdk-emitted/thread.js': 'e'.repeat(64) }, goodListing));
rejects('emitted.missing_package_json', () => checkEmitted(emittedCfg, { '/profile/sdk-emitted/index.js': 'f'.repeat(64), '/profile/sdk-emitted/thread.js': 'f'.repeat(64) }, goodListing));
check('clip.utf8_bytes', () => [['ação'.repeat(200), 400], ['😀'.repeat(150), 400], ['é', 1]].every(([x, n]) => Buffer.byteLength(C.clip(x, n)) <= n && !C.clip(x, n).includes('\ufffd')));
rejects('loader.config_extra_key', () => validateConfig({ ...loaderCfg, extra: 1 }));
rejects('loader.config_entry_not_prebound', () => validateConfig({ ...loaderCfg, entry: 'file:///profile/other.mjs' }));
rejects('loader.strict_duplicate', () => strictParse(Buffer.from('{"v":1,"v":1}')));

// transpile config (no compiler load)
const tcfg = JSON.parse(fs.readFileSync(`${templates}/node-transpile.json`));
check('transpile.template_valid', () => validateTranspileConfig(tcfg) === tcfg);
rejects('transpile.option_drift', () => validateTranspileConfig({ ...tcfg, compiler_options: { ...tcfg.compiler_options, target: 'ES2020' } }));
rejects('transpile.compiler_hash_drift', () => validateTranspileConfig({ ...tcfg, typescript: { ...tcfg.typescript, sha256: '0'.repeat(64) } }));
rejects('transpile.missing_source', () => { const s = { ...tcfg.sources }; delete s['exec.ts']; return validateTranspileConfig({ ...tcfg, sources: s }); });
// compiler qualification predicates with a constant stand-in object (no compiler load on the host)
const fakeTs = outputs => ({ preProcessFile: () => ({ importedFiles: [] }), transpileModule: (src) => outputs[src] });
const goodOut = {
  'const a: number = 1;\nexport { a };\n': { outputText: 'const a = 1;\nexport { a };\n', diagnostics: [] },
  'import type { T } from "./t";\nexport function f(x: T): T { return x; }\n': { outputText: 'export function f(x) { return x; }\n', diagnostics: [] },
  'export const = ;\n': { outputText: 'export const ;\n', diagnostics: [{ code: 1134 }] },
};
check('qualify.good_compiler_passes', () => qualify(fakeTs(goodOut), {}).pass === true);
check('qualify.type_kept_fails', () => qualify(fakeTs({ ...goodOut, 'const a: number = 1;\nexport { a };\n': { outputText: 'const a: number = 1;\n', diagnostics: [] } }), {}).pass === false);
check('qualify.type_import_kept_fails', () => qualify(fakeTs({ ...goodOut, 'import type { T } from "./t";\nexport function f(x: T): T { return x; }\n': { outputText: 'import "./t";\nexport function f(x) { return x; }\n', diagnostics: [] } }), {}).pass === false);
check('qualify.silent_syntax_error_fails', () => qualify(fakeTs({ ...goodOut, 'export const = ;\n': { outputText: '', diagnostics: [] } }), {}).pass === false);
check('qualify.missing_api_fails', () => qualify({}, {}).pass === false);

// TS fixtures
const rows = JSON.parse(fs.readFileSync(fixturesPath));
const tsCases = Object.keys(rows).filter(k => k.startsWith('SDKTS') || k.startsWith('DIAG-TS-'));
check('fixtures.ts_case_count', () => tsCases.length === 13);
for (const id of tsCases) {
  check(`fixtures.${id}`, () => {
    const input = rows[id];
    if (holds(input)) return id === 'SDKTS10' || id === 'DIAG-TS-ABORT';
    const w = wireFixture(input);
    const expected = input.JSONL.map(l => (typeof l === 'string' ? l : JSON.stringify(l)) + '\n').join('');
    return w.stdout.toString() === expected && w.code === input.exit_code && w.stderr.toString() === input.stderr;
  });
}
check('fixtures.blank_line_kept', () => wireFixture(rows.SDKTS03).stdout.toString() === '\n');
check('fixtures.broken_line_kept', () => wireFixture(rows.SDKTS02).stdout.toString() === '{broken\n');

// Terminal declarations after the case deadline (real FIFO path supplied by the Python selftest).
const fifoPath = process.argv[5];
if (fifoPath) {
  const ch = Object.create(C.Channel.prototype);
  Object.assign(ch, { config: { attempt: A, case: 'DIAG-TS-ECHO' }, role: 'driver', seq: 2, bytes: 0, terminal: false, deadline: process.hrtime.bigint() - 1n,
    eventFD: fs.openSync(fifoPath, fs.constants.O_WRONLY | fs.constants.O_NONBLOCK) });
  rejects('deadline.ordinary_event_refused_after_deadline', () => ch.writeNow('DIAGNOSTIC', { milestone: 'LATE', detail: null }));
  check('deadline.invalid_declared_after_deadline', () => { C.invalid(ch, new Error('driver deadline')); return ch.terminal === true && ch.seq === 3; });
  rejects('deadline.no_frame_after_terminal', () => ch.writeNow('END', { streams: {}, child_exit_code: null, child_signal: null, complete: true }));
  fs.closeSync(ch.eventFD); process.exitCode = 0;
}
const controlPath = process.argv[6];
if (controlPath) {
  const ch = Object.create(C.Channel.prototype);
  Object.assign(ch, { config: { attempt: A, case: 'DIAG-TS-ECHO' }, role: 'driver', controlSeq: 0, bytes: 0, queue: [], decoder: new C.FrameDecoder(),
    controlFD: fs.openSync(controlPath, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK) });
  rejects('controls.unconsumed_before_end', () => ch.finishControls());
  fs.closeSync(ch.controlFD);
}
const fullPath = process.argv[7];
if (fullPath) {
  const fd = fs.openSync(fullPath, fs.constants.O_WRONLY | fs.constants.O_NONBLOCK);
  const filler = Buffer.alloc(4096, 0x20);
  for (;;) { try { fs.writeSync(fd, filler); } catch (e) { if (e.code === 'EAGAIN') break; throw e; } }
  const ch = Object.create(C.Channel.prototype);
  Object.assign(ch, { config: { attempt: A, case: 'DIAG-TS-ECHO' }, role: 'driver', seq: 2, bytes: 0, terminal: false, chain: Promise.resolve(),
    deadline: process.hrtime.bigint() + 5000000000n, eventFD: fd, interrupt: () => true });
  try { await ch.emit('DIAGNOSTIC', { milestone: 'X', detail: null }); results.push({ id: 'interrupt.backpressure_wait_aborted', status: 'FAIL', error: 'emit completed' }); }
  catch (e) { results.push({ id: 'interrupt.backpressure_wait_aborted', status: /signal during telemetry backpressure/.test(e.message) ? 'PASS' : 'FAIL', rejected: String(e.message).slice(0, 120) }); }
  fs.closeSync(fd);
}
const failed = results.filter(r => r.status !== 'PASS');
const report = { kind: 'NODE_PURE_DATA_SELFTEST', node: process.version, checks: results.length, failed: failed.length, results };
if (flag === '--emit-frames') {
  const seq = [...good, ev('adapter', 4, 'STREAM_END', { stream: 'stdout', read_bytes: 5, committed_bytes: 5, read_sha256: C.sha(chunk) })];
  report.frames_hex = Buffer.concat(seq.map(e => C.encodeFrame(e))).toString('hex');
  report.frames_expect = { attempt: A, nonce: N, source_sha256: 'c'.repeat(64), case: 'DIAG-TS-ECHO' };
}
process.stdout.write(`${JSON.stringify(report)}\n`);
process.exit(failed.length ? 1 : 0);
