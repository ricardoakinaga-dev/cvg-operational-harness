// Synthetic Node JSONL peer behind the TypeScript stdio adapter. Not a Codex CLI.
// It reports only receipt/write milestones; the adapter's RAW_READ frames are authoritative.
import C from './channel.cjs';

const sleepSync = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

// TS JSONL fixture encoding (cases.json#/wire_fixture_encoding): objects are compact JSON+LF,
// strings are literal raw lines+LF (empty string is one LF). Nothing is prevalidated or dropped.
export function wireFixture(input) {
  C.keys(input, ['JSONL', 'exit_code', 'stderr']);
  C.assert(Array.isArray(input.JSONL) && C.integer(input.exit_code, 255) && typeof input.stderr === 'string', 'JSONL fixture');
  const stdout = Buffer.from(input.JSONL.map(line => (typeof line === 'string' ? line : JSON.stringify(line)) + '\n').join(''));
  const stderr = Buffer.from(input.stderr);
  C.assert(stdout.length <= C.CAPS.stdout && stderr.length <= C.CAPS.stderr, 'fixture cap');
  return { stdout, stderr, code: input.exit_code };
}
const stable = x => (Array.isArray(x) ? x.map(stable) : C.object(x) ? Object.fromEntries(Object.keys(x).sort().map(k => [k, stable(x[k])])) : x);
export function selectedFixture(config) {
  const rows = C.strictJSON(C.readFile('/profile/fixture-cases.json'));
  C.assert(C.object(rows) && Object.hasOwn(rows, config.case), 'unsupported fixture case');
  C.assert(JSON.stringify(stable(config.case_input)) === JSON.stringify(stable(rows[config.case])), 'fixture differs from frozen case');
  return config.case_input;
}
export const holds = input => Object.hasOwn(input, 'behavior');

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
    const input = selectedFixture(config);
    C.assert(process.argv.length === 6 && process.argv[2] === '--case' && process.argv[3] === config.case && process.argv[4] === '--sdk-argv-json', 'peer argv');
    C.assert(Buffer.byteLength(process.argv[5]) <= 512, 'SDK argv cap');
    const argv = C.strictJSON(Buffer.from(process.argv[5]));
    C.assert(Array.isArray(argv) && argv.length <= 64 && argv.every(x => typeof x === 'string'), 'SDK argv JSON');
    timer = setTimeout(() => fail(new Error('peer deadline')), Math.max(1, ch.remainingMs()));
    await ch.start();
    await ch.emit('PEER_MILESTONE', { milestone: 'EXEC_ARGV', detail: argv });
    const chunks = []; let total = 0;
    for await (const b of process.stdin) { total += b.length; C.assert(total <= C.CAPS.stdin, 'peer stdin cap'); chunks.push(b); }
    const request = Buffer.concat(chunks);
    C.assert(total > 0, 'empty SDK stdin');
    await ch.emit('REQUEST_HELD', { bytes: total, sha256: C.sha(request) });
    if (holds(input)) {
      // Holds stdout open. Termination is the adapter-forwarded signal or an explicit finish.
      await ch.control('FINISH_PEER');
      ch.finishControls();
      done = true; clearTimeout(timer);
      ch.writeNow('END', { streams: {}, child_exit_code: 0, child_signal: null, complete: true });
      ch.closeFds(); process.exit(0);
    }
    await ch.control('RELEASE_REPLY');
    const wire = wireFixture(input);
    const out = C.openSink(1); const err = C.openSink(2);
    out.on('error', () => {}); err.on('error', () => {});
    await C.writeAll(out, wire.stdout, () => ch.check());
    await C.writeAll(err, wire.stderr, () => ch.check());
    await ch.emit('PEER_MILESTONE', { milestone: 'REPLY_WRITTEN', detail: { stdout_bytes: wire.stdout.length, stdout_sha256: C.sha(wire.stdout), stderr_bytes: wire.stderr.length, stderr_sha256: C.sha(wire.stderr) } });
    await ch.control('RELEASE_EXIT');
    ch.finishControls();
    done = true; clearTimeout(timer);
    ch.writeNow('END', { streams: {}, child_exit_code: wire.code, child_signal: null, complete: true });
    ch.closeFds(); process.exit(wire.code);
  } catch (e) { fail(e); }
}
if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { C.invalid(null, e); process.exit(125); });
