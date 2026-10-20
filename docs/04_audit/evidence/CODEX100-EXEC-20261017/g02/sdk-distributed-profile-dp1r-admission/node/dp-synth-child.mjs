#!/runtime/node
// CAP-DP-SYNTH-CHILD (DDP-04): synthetic child placed by the fixtures where a vendor binary would be. Own code, no SDK, no channel.
// Program: /work/child/program.json, written by the driver before every step that can execute it ({run, id, program}).
// Record: /work/child/run-<run>/record-<pid>.json, written and fsynced before any terminal action: exec_path (process.argv[1]),
// argv_tail, env (whole environment), stdin (read to EOF only with read_stdin), signals (in order), program_id, ready,
// declared_termination ({exit_code} or {self_signal}) and no_signal.
// With ready_barrier or on_signal: listeners for SIGINT, SIGTERM and SIGHUP first, then the marker /work/child/run-<run>/ready-<pid>
// (CHILD_READY). Bounded wait: without a signal in no_signal_timeout_ms the record gets no_signal and the child exits with
// no_signal_exit_code (97). self_signal: default disposition, then process.kill(process.pid, sig).
// Valid both as CommonJS and as ES module (the fixture copies are extensionless files under package.json with or without
// "type": "module"): no import/require statement, builtins through process.getBuiltinModule (Node v24.20.0).
const fs = process.getBuiltinModule('node:fs');

const SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP'];
const cfg = JSON.parse(fs.readFileSync('/work/child/program.json', 'utf8'));
const program = cfg.program ?? {};
const dir = `/work/child/run-${cfg.run}`;
const record = {
  pid: process.pid, exec_path: process.argv[1], argv_tail: process.argv.slice(2), env: { ...process.env }, stdin: null,
  signals: [], program_id: cfg.id, ready: false, declared_termination: null, no_signal: false,
};
function save() {
  const p = `${dir}/record-${process.pid}.json`;
  const fd = fs.openSync(p, 'w', 0o644);
  try { fs.writeSync(fd, JSON.stringify(record)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}
function finish(code) { record.declared_termination = { exit_code: code }; save(); process.exit(code); }

if (program.read_stdin === true) record.stdin = fs.readFileSync(0, 'utf8');
for (const line of program.stdout_jsonl ?? []) fs.writeSync(1, (typeof line === 'string' ? line : JSON.stringify(line)) + '\n');
if (program.self_signal !== undefined) {
  if (!SIGNALS.includes(program.self_signal)) throw new Error('self_signal');
  record.declared_termination = { self_signal: program.self_signal };
  save();
  process.kill(process.pid, program.self_signal);
  setTimeout(() => { record.declared_termination = { exit_code: 98, self_signal_survived: true }; save(); process.exit(98); }, 2000);
} else if (program.ready_barrier === true || program.on_signal !== undefined) {
  const on = program.on_signal ?? {};
  for (const sig of SIGNALS) {
    process.on(sig, () => {
      record.signals.push(sig);
      if (Object.hasOwn(on, sig)) finish(on[sig].exit_code);
      else save();
    });
  }
  record.ready = true;
  save();
  fs.writeFileSync(`${dir}/ready-${process.pid}`, '');
  setTimeout(() => { record.no_signal = true; finish(program.no_signal_exit_code ?? 97); }, program.no_signal_timeout_ms ?? 5000);
} else {
  finish(program.exit_code ?? 0);
}
