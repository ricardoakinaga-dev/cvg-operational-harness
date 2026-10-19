'use strict';
// Private Linux/Node24 observer. Importing this file performs no I/O.
const fs = require('node:fs');
const crypto = require('node:crypto');
const { TextDecoder } = require('node:util');
const CONFIG = '/profile/adapter-config.json';
const ADMISSION = '/profile/node-admission.json';
const ROLES = ['driver', 'adapter', 'peer'];
const COMMANDS = ['READY', 'RELEASE_REPLY', 'RELEASE_EXIT', 'ABORT_NOW', 'FINISH_PEER'];
const CAPS = Object.freeze({ stdin: 262144, stdout: 262144, stderr: 65536 });
const F = fs.constants;
const CLOEXEC = 0x80000; // Linux O_CLOEXEC; platform is checked before use.
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const pause = () => new Promise(resolve => setTimeout(resolve, 2));
function assert(ok, why) { if (!ok) throw new Error(why); }
function object(x) { return x !== null && typeof x === 'object' && !Array.isArray(x); }
function keys(x, fields) {
  assert(object(x) && Object.keys(x).sort().join('|') === [...fields].sort().join('|'), 'unknown/missing fields');
}
function integer(x, max = Number.MAX_SAFE_INTEGER) { return Number.isSafeInteger(x) && x >= 0 && x <= max; }
function hex(x, n = 64) { return typeof x === 'string' && new RegExp(`^[0-9a-f]{${n}}$`).test(x); }
function jsonValue(x, depth = 0) {
  assert(depth <= 32, 'JSON nesting cap');
  if (x === null || typeof x === 'string' || typeof x === 'boolean') return;
  if (typeof x === 'number') return assert(Number.isFinite(x), 'nonfinite JSON');
  assert(Array.isArray(x) || (object(x) && [Object.prototype, null].includes(Object.getPrototypeOf(x))), 'non JSON value');
  for (const v of Object.values(x)) jsonValue(v, depth + 1);
}
// JSON.parse alone accepts duplicate keys. This finite parser rejects them at every depth.
function strictJSON(bytes) {
  const s = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  let i = 0;
  const ws = () => { while (/\s/.test(s[i] || '') && i < s.length) { assert(/[\x20\t\r\n]/.test(s[i]), 'JSON whitespace'); i++; } };
  function string() {
    const start = i++;
    while (i < s.length) {
      const c = s[i++];
      if (c === '"') return JSON.parse(s.slice(start, i));
      if (c === '\\') i++;
    }
    throw new Error('unterminated JSON string');
  }
  function value(d = 0) {
    assert(d <= 32, 'JSON nesting cap'); ws();
    if (s[i] === '"') return string();
    if (s[i] === '{') {
      i++; ws(); const out = Object.create(null); const seen = new Set();
      if (s[i] === '}') { i++; return out; }
      while (true) {
        ws(); assert(s[i] === '"', 'object key'); const k = string();
        assert(!seen.has(k), 'duplicate JSON key'); seen.add(k); ws(); assert(s[i++] === ':', 'colon');
        out[k] = value(d + 1); ws(); const c = s[i++];
        if (c === '}') return out; assert(c === ',', 'object separator');
      }
    }
    if (s[i] === '[') {
      i++; ws(); const out = []; if (s[i] === ']') { i++; return out; }
      while (true) { out.push(value(d + 1)); ws(); const c = s[i++]; if (c === ']') return out; assert(c === ',', 'array separator'); }
    }
    for (const [token, v] of [['true', true], ['false', false], ['null', null]]) {
      if (s.startsWith(token, i)) { i += token.length; return v; }
    }
    const m = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(s.slice(i));
    assert(m, 'JSON value'); i += m[0].length; const n = Number(m[0]); assert(Number.isFinite(n), 'nonfinite JSON'); return n;
  }
  const result = value(); ws(); assert(i === s.length, 'trailing JSON'); return result;
}
const DATA_FIELDS = {
  BEGIN: ['nonce', 'source_sha256', 'pid_namespace'], READY: [],
  RAW_READ: ['stream', 'offset', 'base64', 'sha256'], FORWARD_COMMIT: ['stream', 'offset', 'bytes'],
  STREAM_END: ['stream', 'read_bytes', 'committed_bytes', 'read_sha256'],
  END: ['streams', 'child_exit_code', 'child_signal', 'complete'],
  REQUEST_HELD: ['bytes', 'sha256'], API_CANCELLED: ['name', 'message'], HOOK_CLOSED: ['turn_id', 'closed'],
  API_RESULT: ['api', 'result', 'observations'], API_ERROR: ['api', 'name', 'message', 'cause'],
  SIGNAL: ['signal', 'inflight'], INVALID: ['reason'], PEER_MILESTONE: ['milestone', 'detail'],
  DIAGNOSTIC: ['milestone', 'detail'],
};
function counters(x) {
  keys(x, ['read_bytes', 'committed_bytes', 'read_sha256']);
  assert(integer(x.read_bytes) && integer(x.committed_bytes) && x.committed_bytes <= x.read_bytes && hex(x.read_sha256), 'stream counters');
}
function validateEvent(e) {
  keys(e, ['v', 'attempt', 'case', 'role', 'seq', 'kind', 'pid', 'mono_ns', 'data']);
  assert(e.v === 1 && hex(e.attempt, 40) && typeof e.case === 'string' && ROLES.includes(e.role) && integer(e.seq, 100000), 'event identity');
  assert(integer(e.pid) && e.pid > 0 && typeof e.mono_ns === 'string' && /^\d+$/.test(e.mono_ns), 'event process');
  assert(Object.hasOwn(DATA_FIELDS, e.kind), 'event kind'); keys(e.data, DATA_FIELDS[e.kind]); jsonValue(e);
  const d = e.data;
  if (e.kind === 'BEGIN') assert(hex(d.nonce, 40) && hex(d.source_sha256) && /^pid:\[\d+\]$/.test(d.pid_namespace), 'BEGIN identity');
  if (['RAW_READ', 'FORWARD_COMMIT', 'STREAM_END'].includes(e.kind)) assert(Object.hasOwn(CAPS, d.stream), 'stream name');
  if (e.kind === 'RAW_READ') {
    assert(integer(d.offset) && typeof d.base64 === 'string' && hex(d.sha256), 'raw data');
    const b = Buffer.from(d.base64, 'base64');
    assert(b.length > 0 && b.length <= 2048 && b.toString('base64') === d.base64 && sha(b) === d.sha256 && d.offset + b.length <= CAPS[d.stream], 'raw bounds/digest');
  }
  if (e.kind === 'FORWARD_COMMIT') assert(integer(d.offset) && integer(d.bytes, 2048) && d.bytes > 0 && d.offset + d.bytes <= CAPS[d.stream], 'commit bounds');
  if (e.kind === 'STREAM_END') { const { stream, ...rest } = d; counters(rest); assert(d.read_bytes <= CAPS[stream], 'stream cap'); }
  if (e.kind === 'END') {
    assert(object(d.streams), 'END streams');
    for (const [s, c] of Object.entries(d.streams)) { assert(Object.hasOwn(CAPS, s), 'END stream'); counters(c); assert(c.read_bytes <= CAPS[s], 'END cap'); if (d.complete) assert(c.read_bytes === c.committed_bytes, 'incomplete commit'); }
    assert((d.child_exit_code === null || integer(d.child_exit_code, 255)) && (d.child_signal === null || /^SIG[A-Z0-9]+$/.test(d.child_signal)) && typeof d.complete === 'boolean', 'END result');
  }
}
function encodeFrame(e, control = false) {
  if (control) validateControl(e); else validateEvent(e);
  const b = Buffer.from(JSON.stringify(e));
  const meta = structuredClone(e); if (!control && e.kind === 'RAW_READ') delete meta.data.base64;
  assert(b.length > 0 && b.length + 4 <= 4096 && Buffer.byteLength(JSON.stringify(meta)) <= 1024, 'frame/metadata cap');
  const out = Buffer.allocUnsafe(b.length + 4); out.writeUInt32BE(b.length); b.copy(out, 4); return out;
}
function validateControl(c) {
  keys(c, ['v', 'attempt', 'case', 'role', 'seq', 'command']);
  assert(c.v === 1 && hex(c.attempt, 40) && typeof c.case === 'string' && ROLES.includes(c.role) && integer(c.seq, 100000) && COMMANDS.includes(c.command), 'control identity/command');
}
class FrameDecoder {
  constructor(validate = validateControl) { this.pending = Buffer.alloc(0); this.validate = validate; }
  push(b) {
    assert(Buffer.isBuffer(b) && b.length <= 4096, 'read frame cap');
    this.pending = Buffer.concat([this.pending, b]); const out = [];
    while (this.pending.length >= 4) {
      const n = this.pending.readUInt32BE(); assert(n > 0 && n <= 4092, 'frame length');
      if (this.pending.length < n + 4) break;
      const x = strictJSON(this.pending.subarray(4, n + 4)); this.validate(x); encodeFrame(x, this.validate === validateControl);
      out.push(x); this.pending = this.pending.subarray(n + 4);
    }
    assert(this.pending.length < 4096, 'partial frame cap'); return out;
  }
  finish() { assert(this.pending.length === 0, 'truncated frame'); }
}
function readFile(path, cap = 2097152) {
  const before = fs.lstatSync(path, { bigint: true }); assert(before.isFile() && before.size <= BigInt(cap), 'regular bounded file required');
  const fd = fs.openSync(path, F.O_RDONLY | F.O_NOFOLLOW | CLOEXEC);
  try {
    const after = fs.fstatSync(fd, { bigint: true }); assert(after.ino === before.ino && after.dev === before.dev, 'file replacement');
    const b = fs.readFileSync(fd); assert(b.length <= cap, 'file read cap'); return b;
  } finally { fs.closeSync(fd); }
}
function verifyFiles(files) {
  assert(object(files) && Object.keys(files).length > 0, 'missing file manifest');
  for (const [path, hash] of Object.entries(files)) {
    assert(path.startsWith('/profile/') && !path.split('/').includes('..') && hex(hash), 'manifest path/hash');
    assert(sha(readFile(path, 16 * 1024 * 1024)) === hash, `file identity: ${path}`);
  }
}
function loadConfig() {
  assert(process.platform === 'linux' && process.version === 'v24.20.0', 'pinned Linux Node24 required');
  const c = strictJSON(readFile(CONFIG));
  keys(c, ['attempt', 'case', 'nonce', 'language', 'deadline_seconds', 'fifo_root', 'fifo_nodes', 'fifo_stat', 'peer_argv', 'case_input', 'mode']);
  assert(hex(c.attempt, 40) && hex(c.nonce, 40) && c.language === 'typescript' && ['diagnostic', 'sdk'].includes(c.mode), 'config identity');
  assert(typeof c.case === 'string' && /^(?:SDKTS(?:0[1-9]|10)|DIAG-[A-Z0-9-]+)$/.test(c.case), 'case ID');
  assert(Number.isFinite(c.deadline_seconds) && c.deadline_seconds > 0 && c.deadline_seconds <= 30 && c.fifo_root === '/observer', 'deadline/root');
  assert(Array.isArray(c.fifo_nodes) && c.fifo_nodes.length === 6 && new Set(c.fifo_nodes).size === 6, 'six FIFO names');
  const names = ROLES.flatMap(r => [`${r}.events`, `${r}.control`]);
  assert(names.every(n => c.fifo_nodes.includes(n)), 'fixed FIFO names');
  keys(c.fifo_stat, names.map(n => `/observer/${n}`));
  assert(Array.isArray(c.peer_argv) && c.peer_argv.length === 5 && c.peer_argv[0] === '/runtime/node' && c.peer_argv[1] === '/profile/fixture-cli.mjs' && c.peer_argv[2] === '--case' && c.peer_argv[3] === c.case && c.peer_argv[4] === '--sdk-argv-json', 'frozen peer argv prefix');
  assert(object(c.case_input), 'fixture input'); return c;
}
function admission(c, stage = 'helpers') {
  const a = strictJSON(readFile(ADMISSION));
  keys(a, ['v', 'attempt', 'case', 'nonce', 'node_sha256', 'files', 'fifo_pipe_buf', 'containment_admitted', 'sdk_admitted', 'compiler_admitted']);
  assert(a.v === 1 && a.attempt === c.attempt && a.case === c.case && a.nonce === c.nonce && a.containment_admitted === true, 'missing current containment admission');
  assert(a.node_sha256 === '89af8424dd53e560b1933f87ba650d8bf57c83ca5a04600eefb31f416aabbae7' && sha(readFile(process.execPath, 134217728)) === a.node_sha256, 'Node identity');
  keys(a.fifo_pipe_buf, Object.keys(c.fifo_stat));
  for (const n of Object.values(a.fifo_pipe_buf)) assert(integer(n) && n >= 4096, 'external fpathconf witness required');
  verifyFiles(a.files);
  assert(a.files[CONFIG] === sha(readFile(CONFIG)), 'unbound config');
  if (stage === 'sdk') assert(c.mode === 'sdk' && a.sdk_admitted === true, 'SDK not admitted');
  if (stage === 'compiler') assert(c.mode === 'sdk' && a.compiler_admitted === true, 'compiler not admitted');
  return a;
}
function openFIFO(c, role, kind) {
  const path = `/observer/${role}.${kind}`; const expected = c.fifo_stat[path];
  assert(Array.isArray(expected) && expected.length === 4 && /^\d+$/.test(expected[0]) && /^\d+$/.test(expected[1]) && ['0600', 384].includes(expected[2]) && expected[3] === 0, 'FIFO stat contract');
  const check = s => assert(s.isFIFO() && String(s.dev) === expected[0] && String(s.ino) === expected[1] && (s.mode & 0o7777n) === 0o600n && s.uid === 0n, 'FIFO identity/type/owner/mode');
  check(fs.lstatSync(path, { bigint: true }));
  const fd = fs.openSync(path, (kind === 'events' ? F.O_WRONLY : F.O_RDONLY) | F.O_NOFOLLOW | F.O_NONBLOCK | CLOEXEC);
  try {
    check(fs.fstatSync(fd, { bigint: true })); check(fs.lstatSync(path, { bigint: true }));
    const info = fs.readFileSync(`/proc/self/fdinfo/${fd}`, 'utf8'); const m = /^flags:\s+([0-7]+)$/m.exec(info);
    assert(m && (parseInt(m[1], 8) & CLOEXEC) && (parseInt(m[1], 8) & F.O_NONBLOCK), 'FIFO flags'); return fd;
  } catch (e) { fs.closeSync(fd); throw e; }
}
class Channel {
  constructor(c, role, sourcePath) {
    assert(ROLES.includes(role), 'role'); this.config = c; this.role = role;
    const a = admission(c); assert(a.files[sourcePath] === sha(readFile(sourcePath)), 'unbound role source');
    assert(a.files['/profile/channel.cjs'] === sha(readFile('/profile/channel.cjs')), 'unbound channel');
    this.deadline = process.hrtime.bigint() + BigInt(Math.floor(c.deadline_seconds * 1e9));
    this.eventFD = openFIFO(c, role, 'events');
    try { this.controlFD = openFIFO(c, role, 'control'); } catch (e) { fs.closeSync(this.eventFD); throw e; }
    this.seq = 0; this.controlSeq = 0; this.bytes = 0; this.chain = Promise.resolve(); this.queue = []; this.decoder = new FrameDecoder();
    this.begin = { nonce: c.nonce, source_sha256: a.files[sourcePath], pid_namespace: fs.readlinkSync('/proc/self/ns/pid') };
  }
  check() { assert(process.hrtime.bigint() < this.deadline, 'case deadline'); }
  frame(kind, data) { return encodeFrame({ v: 1, attempt: this.config.attempt, case: this.config.case, role: this.role, seq: this.seq, kind, pid: process.pid, mono_ns: String(process.hrtime.bigint()), data }); }
  writeNow(kind, data) {
    this.check(); const b = this.frame(kind, data); assert(this.bytes + b.length <= 2097152, 'role artifact cap');
    const n = fs.writeSync(this.eventFD, b); assert(n === b.length, 'short/ambiguous atomic frame write'); this.seq++; this.bytes += n;
  }
  emit(kind, data) {
    const p = this.chain.then(async () => {
      for (;;) { try { this.writeNow(kind, data); return; } catch (e) { if (!['EAGAIN', 'EWOULDBLOCK'].includes(e.code)) throw e; this.check(); await pause(); } }
    }); this.chain = p; return p;
  }
  async start() { await this.emit('BEGIN', this.begin); await this.emit('READY', {}); await this.control('READY'); }
  async control(command) {
    assert(COMMANDS.includes(command), 'wait command');
    for (;;) {
      this.check();
      if (this.queue.length) { const c = this.queue.shift(); assert(c.command === command, `unexpected control ${c.command}; need ${command}`); return c; }
      const b = Buffer.allocUnsafe(4096);
      try {
        const n = fs.readSync(this.controlFD, b, 0, b.length, null); assert(n > 0, 'control EOF/missing keeper'); this.bytes += n; assert(this.bytes <= 2097152, 'artifact cap');
        for (const c of this.decoder.push(b.subarray(0, n))) {
          assert(c.attempt === this.config.attempt && c.case === this.config.case && c.role === this.role && c.seq === this.controlSeq++, 'control binding/sequence'); this.queue.push(c);
        }
      } catch (e) { if (!['EAGAIN', 'EWOULDBLOCK'].includes(e.code)) throw e; await pause(); }
    }
  }
  close() { this.decoder.finish(); assert(this.queue.length === 0, 'unconsumed control'); fs.closeSync(this.controlFD); fs.closeSync(this.eventFD); }
}
class StreamLedger {
  constructor(stream) { assert(Object.hasOwn(CAPS, stream), 'ledger stream'); this.stream = stream; this.read = 0; this.committed = 0; this.hash = crypto.createHash('sha256'); }
  raw(b) {
    assert(Buffer.isBuffer(b) && b.length > 0 && b.length <= 2048 && this.read + b.length <= CAPS[this.stream], 'read cap');
    const data = { stream: this.stream, offset: this.read, base64: b.toString('base64'), sha256: sha(b) }; this.read += b.length; this.hash.update(b); return data;
  }
  commit(n) { assert(integer(n, 2048) && n > 0 && this.committed + n <= this.read, 'zero/false commit'); const d = { stream: this.stream, offset: this.committed, bytes: n }; this.committed += n; return d; }
  summary() { return { read_bytes: this.read, committed_bytes: this.committed, read_sha256: this.hash.copy().digest('hex') }; }
}
function ioRead(fd, b) { return new Promise((resolve, reject) => fs.read(fd, b, 0, b.length, null, (e, n) => e ? reject(e) : resolve(n))); }
function ioWrite(fd, b) { return new Promise((resolve, reject) => fs.write(fd, b, 0, b.length, null, (e, n) => e ? reject(new Error('unknown write completion', { cause: e })) : resolve(n))); }
async function writeAll(fd, b, check, committed = async () => {}) {
  let offset = 0;
  while (offset < b.length) {
    check(); let n;
    try { n = await ioWrite(fd, b.subarray(offset, Math.min(offset + 2048, b.length))); }
    catch (e) {
      // EAGAIN has no completed bytes on these nonblocking Linux descriptors.
      if (['EAGAIN', 'EWOULDBLOCK'].includes(e.cause?.code)) { await pause(); continue; }
      throw e;
    }
    assert(integer(n, Math.min(2048, b.length - offset)) && n > 0, 'zero/ambiguous write');
    await committed(n); offset += n;
  }
}
function invalid(ch, e) { try { ch?.writeNow('INVALID', { reason: String(e.message).slice(0, 400) }); } catch {} process.exitCode = 125; }
module.exports = { CONFIG, ADMISSION, CAPS, Channel, FrameDecoder, StreamLedger, assert, keys, hex, integer, strictJSON, encodeFrame, validateControl, validateEvent, readFile, verifyFiles, loadConfig, admission, sha, pause, ioRead, writeAll, invalid };
