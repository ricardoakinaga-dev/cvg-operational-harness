// Synthetic Node JSONL peer behind the TypeScript stdio adapter. Not a Codex CLI.
// It reports only receipt/write milestones; the adapter's RAW_READ frames are authoritative.
// DX100-G02 batch 2A (inputs/spec-2a/capture-contract.json): EXEC_ENV, SCHEMA_FILE (only when the frozen
// fixture declares read_schema_file_from_argv, read before the first stdout write), STDIN_EMPTY
// (allow_empty_stdin), stdout_chunks_hex with a per-chunk barrier (CHUNK_RELEASE) and write_then_hold.
import C from './channel.cjs';

const sleepSync = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const FIXTURE_KEYS = ['JSONL', 'exit_code', 'stderr', 'behavior', 'allow_empty_stdin', 'read_schema_file_from_argv', 'write_then_hold',
  'stdout_chunks_hex', 'chunk_barrier', 'no_child', 'adapter_close_stdin_at_start'];

// Batch 2A rows carry {sdk_calls, fixture}; constant diagnostic rows are the fixture itself.
export const fixtureOf = input => (Object.hasOwn(input, 'sdk_calls') ? input.fixture : input);

// TS JSONL fixture encoding (cases.json#/wire_fixture_encoding): objects are compact JSON+LF,
// strings are literal raw lines+LF (empty string is one LF). Nothing is prevalidated or dropped.
// stdout_chunks_hex: exact bytes, one write per chunk, no LF added.
export function wireFixture(fx) {
  C.assert(C.object(fx) && Object.keys(fx).every(k => FIXTURE_KEYS.includes(k)), 'fixture keys');
  C.assert(C.integer(fx.exit_code, 255) && typeof fx.stderr === 'string', 'fixture exit/stderr');
  let chunks;
  if (Object.hasOwn(fx, 'stdout_chunks_hex')) {
    C.assert(!Object.hasOwn(fx, 'JSONL') && Array.isArray(fx.stdout_chunks_hex) && fx.stdout_chunks_hex.length > 0
      && fx.stdout_chunks_hex.every(h => typeof h === 'string' && /^(?:[0-9a-f]{2})+$/.test(h)), 'chunk fixture');
    chunks = fx.stdout_chunks_hex.map(h => Buffer.from(h, 'hex'));
  } else {
    C.assert(Array.isArray(fx.JSONL), 'JSONL fixture');
    chunks = [Buffer.from(fx.JSONL.map(line => (typeof line === 'string' ? line : JSON.stringify(line)) + '\n').join(''))];
  }
  const stdout = Buffer.concat(chunks);
  const stderr = Buffer.from(fx.stderr);
  C.assert(stdout.length <= C.CAPS.stdout && stderr.length <= C.CAPS.stderr, 'fixture cap');
  return { stdout, chunks, stderr, code: fx.exit_code };
}
const stable = x => (Array.isArray(x) ? x.map(stable) : C.object(x) ? Object.fromEntries(Object.keys(x).sort().map(k => [k, stable(x[k])])) : x);
export function selectedFixture(config) {
  const rows = C.strictJSON(C.readFile('/profile/fixture-cases.json'));
  C.assert(C.object(rows) && Object.hasOwn(rows, config.case), 'unsupported fixture case');
  C.assert(JSON.stringify(stable(config.case_input)) === JSON.stringify(stable(rows[config.case])), 'fixture differs from frozen case');
  return config.case_input;
}
export const holds = input => C.object(fixtureOf(input)) && Object.hasOwn(fixtureOf(input), 'behavior');

function schemaFile(argv) {
  const i = argv.indexOf('--output-schema');
  if (i < 0 || i + 1 >= argv.length) return { path: null, exists: false };
  const path = argv[i + 1];
  try {
    const b = C.readFile(path, 65536);
    return { path, exists: true, bytes: b.length, sha256: C.sha(b), trailing_lf: b.length > 0 && b[b.length - 1] === 0x0a, text: C.clip(b.toString('utf8'), 240) };
  } catch (e) {
    return { path, exists: false, error: C.clip(e && e.code ? e.code : (e && e.message) || e, 80) };
  }
}

export async function main() {
  const config = C.loadConfig('typescript');
  const ch = new C.Channel(config, 'peer', '/profile/fixture-cli.mjs');
  let timer = null; let done = false;
  const fail = e => { if (!done) { done = true; C.invalid(ch, e); } clearTimeout(timer); process.exit(125); };
  const onSignal = sig => {
    if (!done) {
      done = true;
      for (let i = 0; i < 50; i++) { try { ch.writeNow('SIGNAL', { signal: sig, inflight: false }); break; } catch (e) { if (!['EAGAIN', 'EWOULDBLOCK'].includes(e.code)) break; sleepSync(1); } }
    }
    process.removeAllListeners(sig); process.kill(process.pid, sig);
    process.exit(125); // fallback: only reached if the default disposition was not restored
  };
  for (const s of ['SIGTERM', 'SIGINT']) process.on(s, () => onSignal(s));
  ch.interrupt = () => done; // a delivered signal aborts telemetry backpressure waits
  try {
    C.assert(ch.admission.files['/profile/fixture-cases.json'] === C.sha(C.readFile('/profile/fixture-cases.json')), 'unbound fixtures');
    const fx = fixtureOf(selectedFixture(config));
    C.assert(C.object(fx), 'fixture object');
    C.assert(process.argv.length === 8 && process.argv[2] === '--case' && process.argv[3] === config.case && process.argv[4] === '--sdk-argv-json'
      && process.argv[6] === '--sdk-env-json', 'peer argv');
    C.assert(Buffer.byteLength(process.argv[5]) <= 768 && Buffer.byteLength(process.argv[7]) <= 512, 'SDK argv/env cap');
    const argv = C.strictJSON(Buffer.from(process.argv[5]));
    C.assert(Array.isArray(argv) && argv.length <= 64 && argv.every(x => typeof x === 'string'), 'SDK argv JSON');
    const env = C.strictJSON(Buffer.from(process.argv[7]));
    C.assert(C.object(env) && Object.values(env).every(x => typeof x === 'string'), 'SDK env JSON');
    timer = setTimeout(() => fail(new Error('peer deadline')), Math.max(1, ch.remainingMs()));
    await ch.start();
    await ch.emit('PEER_MILESTONE', { milestone: 'EXEC_ARGV', detail: argv });
    await ch.emit('PEER_MILESTONE', { milestone: 'EXEC_ENV', detail: { ...env } });
    // CAP-TMP-WITNESS: read before any stdout write, while the SDK child (adapter) and the schema exist.
    if (fx.read_schema_file_from_argv === true) await ch.emit('PEER_MILESTONE', { milestone: 'SCHEMA_FILE', detail: schemaFile(argv) });
    const chunks = []; let total = 0;
    for await (const b of process.stdin) { total += b.length; C.assert(total <= C.CAPS.stdin, 'peer stdin cap'); chunks.push(b); }
    const request = Buffer.concat(chunks);
    if (total === 0) {
      C.assert(fx.allow_empty_stdin === true, 'empty SDK stdin');
      await ch.emit('PEER_MILESTONE', { milestone: 'STDIN_EMPTY', detail: { bytes: 0 } });
    } else {
      await ch.emit('REQUEST_HELD', { bytes: total, sha256: C.sha(request) });
    }
    if (holds(config.case_input)) {
      // Holds stdout open. Termination is the adapter-forwarded signal or an explicit finish.
      await ch.control('FINISH_PEER');
      ch.finishControls();
      done = true; clearTimeout(timer);
      ch.writeNow('END', { streams: {}, child_exit_code: 0, child_signal: null, complete: true });
      ch.closeFds(); process.exit(0);
    }
    await ch.control('RELEASE_REPLY');
    const wire = wireFixture(fx);
    const out = C.openSink(1); const err = C.openSink(2);
    out.on('error', () => {}); err.on('error', () => {});
    const chunked = Object.hasOwn(fx, 'stdout_chunks_hex');
    for (let i = 0; i < wire.chunks.length; i++) {
      if (wire.chunks[i].length) await C.writeAll(out, wire.chunks[i], () => ch.check());
      if (chunked) {
        await ch.emit('PEER_MILESTONE', { milestone: 'CHUNK_WRITTEN', detail: { index: i, bytes: wire.chunks[i].length, sha256: C.sha(wire.chunks[i]) } });
        if (i + 1 < wire.chunks.length) await ch.control('CHUNK_RELEASE'); // supervisor: after the adapter committed this chunk
      }
    }
    if (wire.stderr.length) await C.writeAll(err, wire.stderr, () => ch.check());
    await ch.emit('PEER_MILESTONE', { milestone: 'REPLY_WRITTEN', detail: { stdout_bytes: wire.stdout.length, stdout_sha256: C.sha(wire.stdout), stderr_bytes: wire.stderr.length, stderr_sha256: C.sha(wire.stderr) } });
    if (fx.write_then_hold === true) {
      // Stdout stays open; the SDK finally (child.kill) terminates the adapter and the forwarded signal ends this peer.
      await ch.control('FINISH_PEER');
      ch.finishControls();
      done = true; clearTimeout(timer);
      ch.writeNow('END', { streams: {}, child_exit_code: 0, child_signal: null, complete: true });
      ch.closeFds(); process.exit(0);
    }
    await ch.control('RELEASE_EXIT');
    ch.finishControls();
    done = true; clearTimeout(timer);
    ch.writeNow('END', { streams: {}, child_exit_code: wire.code, child_signal: null, complete: true });
    ch.closeFds(); process.exit(wire.code);
  } catch (e) { fail(e); }
}
if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { C.invalid(null, e); process.exit(125); });
