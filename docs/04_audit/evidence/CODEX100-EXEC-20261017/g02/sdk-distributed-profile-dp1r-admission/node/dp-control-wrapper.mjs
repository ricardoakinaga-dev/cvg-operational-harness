#!/runtime/node
// DDP-09: own control wrapper of DP1-CTRL01 (code of the harness, never from the cache). It is the known-bad of PK06.B04:
// it launches the synthetic child placed at ../vendor/child with stdio inherited and ALWAYS exits 0, ignoring the child's code.
// The evaluator must classify the CONTROL as MISMATCH only by wrap.exit_mirror_exact (expected exit 3, the child's code).
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const child = spawn(path.join(here, '..', 'vendor', 'child'), process.argv.slice(2), { stdio: 'inherit' });
child.on('error', () => process.exit(0));
child.on('exit', () => process.exit(0));
