import { spawn } from 'node:child_process';
import C from './channel.cjs';
import { selectedFixture } from './fixture-cli.mjs';

const AGGREGATE_CASES = new Set(['SDKTS01', 'SDKTS05', 'SDKTS06', 'SDKTS07', 'SDKTS08', 'SDKTS09']);
const STREAM_CASES = new Set(['SDKTS02', 'SDKTS03', 'SDKTS04', 'SDKTS10']);
function errorData(api, e) {
  const cause = e?.cause == null ? null : { name: String(e.cause.name ?? 'Error'), message: String(e.cause.message ?? e.cause).slice(0, 200) };
  return { api, name: String(e?.name ?? 'Error'), message: String(e?.message ?? e).slice(0, 360), cause };
}
export async function sdkCase(config, ch) {
  // This is the only SDK import. No target can load without a future current admission.
  const a = C.admission(config, 'sdk');
  C.assert(a.files['/profile/sdk-emitted/index.js'], 'unbound SDK entry');
  C.assert(a.files['/profile/node-loader.json'], 'unbound loader profile');
  C.assert(process.execArgv.length === 2 && process.execArgv[0] === '--experimental-loader' && process.execArgv[1] === '/profile/extension-loader.mjs', 'exact runtime loader argv');
  const { Codex } = await import('file:///profile/sdk-emitted/index.js');
  C.assert(typeof Codex === 'function', 'SDK Codex export');
  const thread = new Codex({ codexPathOverride: '/profile/adapter-typescript', env: { HOME: '/work/home', PATH: '/runtime' } }).startThread();
  if (AGGREGATE_CASES.has(config.case)) {
    try {
      const result = await thread.run('synthetic');
      await ch.emit('API_RESULT', { api: 'Thread.run', result, observations: { thread_id: thread.id } });
    } catch (e) { await ch.emit('API_ERROR', errorData('Thread.run', e)); }
    return;
  }
  C.assert(STREAM_CASES.has(config.case), 'unsupported SDK case');
  const abort = new AbortController(); let abortTask;
  let events = 0;
  try {
    const stream = await thread.runStreamed('synthetic', config.case === 'SDKTS10' ? { signal: abort.signal } : {});
    if (config.case === 'SDKTS10') {
      // Supervisor waits for independent child/cgroup + adapter/peer READY witnesses.
      abortTask = ch.control('ABORT_NOW').then(async () => {
        abort.abort();
        await ch.emit('DIAGNOSTIC', { milestone: 'ABORT_CALLED', detail: { source_sdk_claim: false } });
      });
      // Do not leave an unhandled rejection while consuming the iterator.
      abortTask.catch(() => {});
    }
    for await (const event of stream.events) {
      events++;
      // Snapshot at the actual yield boundary; do not rewrite the returned event.
      await ch.emit('API_RESULT', { api: 'Thread.runStreamed.yield', result: event, observations: { thread_id: thread.id, index: events - 1 } });
    }
    if (abortTask) await abortTask;
    await ch.emit('API_RESULT', { api: 'Thread.runStreamed.return', result: null, observations: { events, thread_id: thread.id, abort_called: abort.signal.aborted } });
  } catch (e) {
    if (abortTask && !abort.signal.aborted) throw new Error('SDK ended before abort barrier', { cause: e });
    if (abortTask) await abortTask;
    await ch.emit('API_ERROR', errorData('Thread.runStreamed', e));
  }
}
async function diagnostic(config, ch) {
  C.assert(['DIAG-EMPTY', 'DIAG-ECHO', 'DIAG-ABORT'].includes(config.case), 'unsupported diagnostic');
  const child = spawn('/profile/adapter-typescript', ['exec', '--experimental-json'], { cwd: '/work', env: { HOME: '/work/home', PATH: '/runtime' }, stdio: ['pipe', 'pipe', 'pipe'] });
  const out = []; const err = []; let stdoutBytes = 0; let stderrBytes = 0;
  child.stdout.on('data', b => { stdoutBytes += b.length; if (stdoutBytes > C.CAPS.stdout) child.kill('SIGKILL'); else out.push(b); });
  child.stderr.on('data', b => { stderrBytes += b.length; if (stderrBytes > C.CAPS.stderr) child.kill('SIGKILL'); else err.push(b); });
  const closed = new Promise((resolve, reject) => { child.once('error', reject); child.once('close', (code, signal) => resolve({ code, signal })); });
  child.stdin.on('error', () => {}); // Captured pipe failure remains independent adapter evidence.
  child.stdin.end('synthetic');
  if (config.case === 'DIAG-ABORT') { await ch.control('ABORT_NOW'); C.assert(child.kill('SIGTERM'), 'diagnostic signal delivery'); }
  const status = await closed;
  C.assert(stdoutBytes <= C.CAPS.stdout && stderrBytes <= C.CAPS.stderr, 'diagnostic cap');
  await ch.emit('DIAGNOSTIC', { milestone: 'OWN_FIXTURE_CHILD_CLOSED', detail: { ...status, stdout_bytes: stdoutBytes, stdout_sha256: C.sha(Buffer.concat(out)), stderr_bytes: stderrBytes, stderr_sha256: C.sha(Buffer.concat(err)), source_sdk_claim: false } });
}
export async function main() {
  const config = C.loadConfig(); const ch = new C.Channel(config, 'driver', '/profile/ts-driver.mjs'); let timer;
  try {
    C.assert(process.argv.length === 4 && process.argv[2] === '--case' && process.argv[3] === config.case, 'driver argv');
    selectedFixture(config);
    timer = setTimeout(() => { C.invalid(ch, new Error('driver deadline')); process.exit(125); }, config.deadline_seconds * 1000);
    await ch.start();
    if (config.mode === 'diagnostic') await diagnostic(config, ch);
    else await sdkCase(config, ch);
    await ch.emit('END', { streams: {}, child_exit_code: null, child_signal: null, complete: true });
    ch.close(); clearTimeout(timer);
  } catch (e) { clearTimeout(timer); C.invalid(ch, e); process.exit(125); }
}
if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { C.invalid(null, e); process.exit(125); });
