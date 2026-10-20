#!/runtime/node
// Own diagnostic wrapper (DIAG-DP-NODE and DIAG-DP-SYNTH-CHILD): launches the synthetic child at /fixture/diag/vendor/child with
// stdio inherited except stdout, forwards SIGINT, SIGTERM and SIGHUP to the live child, and prints one JSON line with the
// platform it sees and the child's real termination; exits 0. Code of the harness, never from the cache.
import { spawn } from 'node:child_process';

const child = spawn('/fixture/diag/vendor/child', process.argv.slice(2), { stdio: ['inherit', 'ignore', 'inherit'] });
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { try { child.kill(sig); } catch { /* gone */ } });
child.on('error', e => { process.stdout.write(JSON.stringify({ platform: process.platform, arch: process.arch, error: String(e.code ?? e.message) }) + '\n'); process.exit(0); });
child.on('exit', (code, signal) => { process.stdout.write(JSON.stringify({ platform: process.platform, arch: process.arch, child: { code, signal } }) + '\n'); process.exit(0); });
