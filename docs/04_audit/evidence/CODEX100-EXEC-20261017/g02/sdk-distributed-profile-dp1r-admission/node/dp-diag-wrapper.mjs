#!/runtime/node
// Own diagnostic wrapper (DIAG-DP-NODE and DIAG-DP-SYNTH-CHILD): launches the synthetic child with stdio inherited except stdout,
// forwards SIGINT, SIGTERM and SIGHUP to the live child, and prints one JSON line with the platform it sees and the child's real
// termination; exits 0. Code of the harness, never from the cache.
// DP-1R delta DDP1R-06: an optional first argument --child=<absolute /fixture path> selects the child (default
// /fixture/diag/vendor/child) and is not passed on; DIAG-DP-SYNTH-CHILD uses it for the module-scope rows of the erratum EDP1R-01.
import { spawn } from 'node:child_process';

const args = process.argv.slice(2);
let target = '/fixture/diag/vendor/child';
if (args.length && args[0].startsWith('--child=')) {
  target = args.shift().slice('--child='.length);
  if (!target.startsWith('/fixture/diag/') || target.split('/').includes('..')) throw new Error('dp-diag-wrapper: child outside /fixture/diag');
}
const child = spawn(target, args, { stdio: ['inherit', 'ignore', 'inherit'] });
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { try { child.kill(sig); } catch { /* gone */ } });
child.on('error', e => { process.stdout.write(JSON.stringify({ platform: process.platform, arch: process.arch, error: String(e.code ?? e.message) }) + '\n'); process.exit(0); });
child.on('exit', (code, signal) => { process.stdout.write(JSON.stringify({ platform: process.platform, arch: process.arch, child: { code, signal } }) + '\n'); process.exit(0); });
