import { spawn } from 'node:child_process'
const c = spawn('/usr/bin/bwrap', ['--ro-bind','/','/','--unshare-pid','--die-with-parent','--json-status-fd','3','--','/bin/sh','-c','echo "{\\"exit-code\\": 99}" >&3; echo rc=$? >&2; ls -l /proc/self/fd >&2'], { stdio: ['ignore','pipe','pipe','pipe'] })
let s=''; c.stdio[3].on('data', d => s += d)
let e=''; c.stderr.on('data', d => e += d)
await new Promise(r => c.on('close', r))
console.log('STATUS', JSON.stringify(s)); console.log('STDERR', e)
