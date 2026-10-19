import C from './channel.cjs';

export function wireFixture(input) {
  C.keys(input, ['JSONL', 'exit_code', 'stderr']);
  C.assert(Array.isArray(input.JSONL) && C.integer(input.exit_code, 255) && typeof input.stderr === 'string', 'JSONL fixture');
  const stdout = Buffer.from(input.JSONL.map(line => (typeof line === 'string' ? line : JSON.stringify(line)) + '\n').join(''));
  const stderr = Buffer.from(input.stderr);
  C.assert(stdout.length <= C.CAPS.stdout && stderr.length <= C.CAPS.stderr, 'fixture cap');
  return { stdout, stderr, code: input.exit_code };
}
export function selectedFixture(config) {
  const rows = C.strictJSON(C.readFile('/profile/fixture-cases.json'));
  C.assert(Object.hasOwn(rows, config.case), 'unsupported fixture case');
  // Structural equality without object insertion-order dependence.
  const stable = x => Array.isArray(x) ? x.map(stable) : x !== null && typeof x === 'object' ? Object.fromEntries(Object.keys(x).sort().map(k => [k, stable(x[k])])) : x;
  C.assert(JSON.stringify(stable(config.case_input)) === JSON.stringify(stable(rows[config.case])), 'fixture differs from frozen case');
  C.assert((config.mode === 'diagnostic') === config.case.startsWith('DIAG-'), 'mode/case mismatch');
  return config.case_input;
}
export async function main() {
  const config = C.loadConfig(); const ch = new C.Channel(config, 'peer', '/profile/fixture-cli.mjs');
  let timer;
  try {
    const a = C.admission(config);
    C.assert(a.files['/profile/fixture-cases.json'] === C.sha(C.readFile('/profile/fixture-cases.json')), 'unbound fixtures');
    const input = selectedFixture(config);
    C.assert(process.argv.length === 6 && process.argv[2] === '--case' && process.argv[3] === config.case && process.argv[4] === '--sdk-argv-json', 'peer argv');
    const argv = C.strictJSON(Buffer.from(process.argv[5]));
    C.assert(Array.isArray(argv) && argv.length <= 64 && argv.every(x => typeof x === 'string') && Buffer.byteLength(process.argv[5]) <= 512, 'SDK argv cap');
    await ch.start();
    timer = setTimeout(() => { C.invalid(ch, new Error('peer deadline')); process.exit(125); }, config.deadline_seconds * 1000);
    const signal = name => { try { ch.writeNow('SIGNAL', { signal: name, inflight: false }); } catch {} process.removeAllListeners(name); process.kill(process.pid, name); };
    for (const s of ['SIGTERM', 'SIGINT']) process.on(s, () => signal(s));
    await ch.emit('PEER_MILESTONE', { milestone: 'EXEC_ARGV', detail: argv });
    const chunks = []; let total = 0;
    for await (const b of process.stdin) { total += b.length; C.assert(total <= C.CAPS.stdin, 'peer stdin cap'); chunks.push(b); }
    const request = Buffer.concat(chunks);
    await ch.emit('REQUEST_HELD', { bytes: total, sha256: C.sha(request) });
    if (config.case === 'SDKTS10' || config.case === 'DIAG-ABORT') {
      // Holds real stdout open. Normal termination is external signal or an explicit finish.
      await ch.control('FINISH_PEER');
      await ch.emit('PEER_MILESTONE', { milestone: 'FINISHED_WITHOUT_ABORT', detail: null });
      clearTimeout(timer); ch.close(); process.exitCode = 0; return;
    }
    await ch.control('RELEASE_REPLY');
    const wire = wireFixture(input);
    await C.writeAll(1, wire.stdout, () => ch.check());
    await C.writeAll(2, wire.stderr, () => ch.check());
    await ch.emit('PEER_MILESTONE', { milestone: 'REPLY_WRITTEN', detail: { stdout_bytes: wire.stdout.length, stderr_bytes: wire.stderr.length } });
    await ch.control('RELEASE_EXIT');
    await ch.emit('END', { streams: {}, child_exit_code: wire.code, child_signal: null, complete: true });
    ch.close(); clearTimeout(timer); process.exitCode = wire.code;
  } catch (e) { clearTimeout(timer); C.invalid(ch, e); process.exit(125); }
}
if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { C.invalid(null, e); process.exit(125); });
