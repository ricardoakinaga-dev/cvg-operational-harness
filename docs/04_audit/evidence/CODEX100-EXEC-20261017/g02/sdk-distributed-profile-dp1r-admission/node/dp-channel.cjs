'use strict';
// Private Linux/Node24 observer channel, distributed profile sub-lot DP-1R (DX100-G02:IMPLEMENT-AND-ADMIT-SDK-DISTRIBUTED-PROFILE-DP-1R).
// Derived from the admitted DP-1 dp-channel.cjs (commit 3ca3fd3b0); the only DP-1R delta is DDP1R-01: case IDs DP-PK07B,
// DP1R-CTRL01 and the three DP-1R DIAG rows. DP-1 history:
// Derived byte-for-byte from the C3-1 channel (sdk-continuation-3-1-admission/node/channel.cjs) with the declared deltas:
//  - DDP-01 case IDs DP-PK01A..DP-PK09A, DP-PK02R, DP-REAL01, DP1-CTRL01 and the DP-1 DIAG rows;
//  - topology driver_only (erratum DP-SPEC/R2-F01): the config carries topology; the six FIFOs stay bound, only the driver writes;
//  - driver kinds BLOB/BLOB_END: base64 chunks of wrapper stdout/stderr, synthetic-child records, shim records and listings
//    (exempt from the 1024-byte metadata cap like RAW_READ, at most 2048 decoded bytes per frame);
//  - config without peer_argv; deadline up to 60 s.
// Importing this file performs no I/O. It never imports SDK or compiler code.
// All I/O here is synchronous or libuv-stream based: no libuv threadpool use,
// because the profile cgroup allows only TasksMax=32 for every thread.
const fs = require('node:fs');
const net = require('node:net');
const crypto = require('node:crypto');
const { TextDecoder } = require('node:util');

const CONFIG = '/profile/adapter-config.json';
const ADMISSION = '/profile/admission.json';
const NODE_SHA256 = '89af8424dd53e560b1933f87ba650d8bf57c83ca5a04600eefb31f416aabbae7';
const ROLES = ['driver', 'adapter', 'peer'];
const COMMANDS = ['READY', 'RELEASE_EXIT'];
const CAPS = Object.freeze({ stdin: 262144, stdout: 262144, stderr: 65536 });
const RAW_CHUNK = 2048;
const FRAME = 4096;
const PAYLOAD = FRAME - 4;
const META = 1024;
const ROLE_BYTES = 2097152;
const MAX_SEQ = 100000;
const FIXED_ENV = Object.freeze({ HOME: '/work/home', TMPDIR: '/work/tmp', PATH: '/runtime', LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8', TZ: 'UTC', PYTHONDONTWRITEBYTECODE: '1', UV_THREADPOOL_SIZE: '2' });
const F = fs.constants;
const O_CLOEXEC = 0o2000000; // Linux x86_64 value; platform is asserted before use.
const ROLE_KINDS = Object.freeze({
  driver: ['BEGIN', 'READY', 'API_RESULT', 'API_ERROR', 'DIAGNOSTIC', 'BLOB', 'BLOB_END', 'END', 'INVALID'],
  adapter: ['BEGIN', 'READY', 'RAW_READ', 'FORWARD_COMMIT', 'STREAM_END', 'FAULT', 'SIGNAL', 'END', 'INVALID'],
  peer: ['BEGIN', 'READY', 'REQUEST_HELD', 'PEER_MILESTONE', 'DIAGNOSTIC', 'SIGNAL', 'END', 'INVALID'],
});
const DATA_FIELDS = Object.freeze({
  BEGIN: ['nonce', 'source_sha256', 'pid_namespace', 'case_input_sha256'], READY: [], FAULT: ['fault'],
  RAW_READ: ['stream', 'offset', 'base64', 'sha256'], FORWARD_COMMIT: ['stream', 'offset', 'bytes'],
  STREAM_END: ['stream', 'read_bytes', 'committed_bytes', 'read_sha256'],
  END: ['streams', 'child_exit_code', 'child_signal', 'complete'],
  REQUEST_HELD: ['bytes', 'sha256'], API_CANCELLED: ['name', 'message'], HOOK_CLOSED: ['turn_id', 'closed'],
  API_RESULT: ['api', 'result', 'observations'], API_ERROR: ['api', 'name', 'message', 'cause'],
  SIGNAL: ['signal', 'inflight'], INVALID: ['reason'], PEER_MILESTONE: ['milestone', 'detail'],
  DIAGNOSTIC: ['milestone', 'detail'], BLOB: ['name', 'offset', 'base64', 'sha256'], BLOB_END: ['name', 'bytes', 'sha256'],
});
const TERMINAL = new Set(['END', 'INVALID']);
// DDP-01 (freeze-r4-dp-delta.json): the DP-1 IDs and the DP-1 DIAG rows.
// DDP1R-01: the DP-1R IDs (one case, its CONTROL and three DIAG rows).
const CASE_ID = /^(?:DP-PK07B|DP1R-CTRL01|DIAG-DP-(?:STAGE|NODE|SYNTH-CHILD))$/;
const BLOB_NAME = /^[A-Za-z0-9_.:-]{1,80}$/;

const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const pause = (ms = 2) => new Promise(resolve => setTimeout(resolve, ms));
class ChannelError extends Error {}
function assert(ok, why) { if (!ok) throw new ChannelError(why); }
function object(x) { return x !== null && typeof x === 'object' && !Array.isArray(x); }
function keys(x, fields) {
  assert(object(x) && Object.keys(x).sort().join('|') === [...fields].sort().join('|'), 'unknown/missing fields');
}
function integer(x, max = Number.MAX_SAFE_INTEGER) { return Number.isSafeInteger(x) && x >= 0 && x <= max; }
function hex(x, n = 64) { return typeof x === 'string' && x.length === n && /^[0-9a-f]+$/.test(x); }
function shortString(x, max = 400) { return typeof x === 'string' && Buffer.byteLength(x) <= max; }
// Truncate to at most `max` UTF-8 bytes without splitting a character (validators count bytes).
function clip(x, max) {
  const b = Buffer.from(String(x));
  if (b.length <= max) return b.toString();
  let end = max;
  while (end > 0 && (b[end] & 0xc0) === 0x80) end--; // never end inside a multi-byte character
  return b.subarray(0, end).toString();
}
function jsonValue(x, depth = 0) {
  assert(depth <= 32, 'JSON nesting cap');
  if (x === null || typeof x === 'string' || typeof x === 'boolean') return;
  if (typeof x === 'number') return assert(Number.isFinite(x), 'nonfinite JSON');
  assert(Array.isArray(x) || (object(x) && [Object.prototype, null].includes(Object.getPrototypeOf(x))), 'non JSON value');
  for (const v of Object.values(x)) jsonValue(v, depth + 1);
}

// JSON.parse alone accepts duplicate keys. This finite parser rejects them at every depth.
// compact=true additionally rejects any whitespace outside strings (frames are compact JSON).
function strictJSON(bytes, compact = false) {
  const s = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  let i = 0;
  const ws = () => {
    while (i < s.length && /\s/.test(s[i])) {
      assert(!compact, 'whitespace in compact JSON');
      assert(/[\x20\t\r\n]/.test(s[i]), 'JSON whitespace'); i++;
    }
  };
  function string() {
    const start = i++;
    while (i < s.length) {
      const c = s[i++];
      if (c === '"') return JSON.parse(s.slice(start, i));
      if (c === '\\') i++;
    }
    throw new ChannelError('unterminated JSON string');
  }
  function value(d = 0) {
    assert(d <= 32, 'JSON nesting cap'); ws();
    if (s[i] === '"') return string();
    if (s[i] === '{') {
      i++; ws(); const out = Object.create(null); const seen = new Set();
      if (s[i] === '}') { i++; return out; }
      for (;;) {
        ws(); assert(s[i] === '"', 'object key'); const k = string();
        assert(!seen.has(k), 'duplicate JSON key'); seen.add(k); ws(); assert(s[i++] === ':', 'colon');
        out[k] = value(d + 1); ws(); const c = s[i++];
        if (c === '}') return out; assert(c === ',', 'object separator');
      }
    }
    if (s[i] === '[') {
      i++; ws(); const out = []; if (s[i] === ']') { i++; return out; }
      for (;;) { out.push(value(d + 1)); ws(); const c = s[i++]; if (c === ']') return out; assert(c === ',', 'array separator'); }
    }
    for (const [token, v] of [['true', true], ['false', false], ['null', null]]) {
      if (s.startsWith(token, i)) { i += token.length; return v; }
    }
    const m = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(s.slice(i));
    assert(m, 'JSON value'); i += m[0].length; const n = Number(m[0]); assert(Number.isFinite(n), 'nonfinite JSON'); return n;
  }
  const result = value(); ws(); assert(i === s.length, 'trailing JSON'); return result;
}

function counters(x) {
  keys(x, ['read_bytes', 'committed_bytes', 'read_sha256']);
  assert(integer(x.read_bytes) && integer(x.committed_bytes) && x.committed_bytes <= x.read_bytes && hex(x.read_sha256), 'stream counters');
}
function validateEvent(e) {
  keys(e, ['v', 'attempt', 'case', 'role', 'seq', 'kind', 'pid', 'mono_ns', 'data']);
  assert(e.v === 1 && hex(e.attempt, 40) && typeof e.case === 'string' && ROLES.includes(e.role) && integer(e.seq, MAX_SEQ), 'event identity');
  assert(integer(e.pid) && e.pid > 0 && typeof e.mono_ns === 'string' && /^\d{1,20}$/.test(e.mono_ns), 'event process');
  assert(Object.hasOwn(DATA_FIELDS, e.kind) && ROLE_KINDS[e.role].includes(e.kind), 'event kind for role');
  keys(e.data, DATA_FIELDS[e.kind]); jsonValue(e);
  const d = e.data;
  switch (e.kind) {
    case 'BEGIN': assert(hex(d.nonce, 40) && hex(d.source_sha256) && /^pid:\[\d+\]$/.test(d.pid_namespace) && hex(d.case_input_sha256), 'BEGIN identity'); break;
    case 'FAULT': assert(d.fault === 'stdin_closed_at_start', 'FAULT kind'); break;
    case 'RAW_READ': {
      assert(Object.hasOwn(CAPS, d.stream) && integer(d.offset) && typeof d.base64 === 'string' && hex(d.sha256), 'raw data');
      const b = Buffer.from(d.base64, 'base64');
      assert(b.length > 0 && b.length <= RAW_CHUNK && b.toString('base64') === d.base64 && sha(b) === d.sha256 && d.offset + b.length <= CAPS[d.stream], 'raw bounds/digest');
      break;
    }
    case 'FORWARD_COMMIT': assert(Object.hasOwn(CAPS, d.stream) && integer(d.offset) && integer(d.bytes, RAW_CHUNK) && d.bytes > 0 && d.offset + d.bytes <= CAPS[d.stream], 'commit bounds'); break;
    case 'STREAM_END': {
      assert(Object.hasOwn(CAPS, d.stream), 'stream name');
      const { stream, ...rest } = d; counters(rest); assert(d.read_bytes <= CAPS[stream], 'stream cap'); break;
    }
    case 'END': {
      assert(object(d.streams), 'END streams');
      for (const [s, c] of Object.entries(d.streams)) {
        assert(Object.hasOwn(CAPS, s), 'END stream'); counters(c); assert(c.read_bytes <= CAPS[s], 'END cap');
        if (d.complete) assert(c.read_bytes === c.committed_bytes, 'complete END with uncommitted bytes');
      }
      if (e.role === 'adapter') keys(d.streams, Object.keys(CAPS)); else keys(d.streams, []);
      assert((d.child_exit_code === null || integer(d.child_exit_code, 255)) && (d.child_signal === null || /^SIG[A-Z0-9]{1,12}$/.test(d.child_signal)) && typeof d.complete === 'boolean', 'END result');
      break;
    }
    case 'REQUEST_HELD': assert(integer(d.bytes, CAPS.stdin) && d.bytes > 0 && hex(d.sha256), 'REQUEST_HELD'); break;
    case 'API_CANCELLED': assert(shortString(d.name, 120) && shortString(d.message), 'API_CANCELLED'); break;
    case 'HOOK_CLOSED': assert(shortString(d.turn_id, 120) && typeof d.closed === 'boolean', 'HOOK_CLOSED'); break;
    case 'API_RESULT': assert(shortString(d.api, 120) && object(d.observations), 'API_RESULT'); break;
    case 'API_ERROR':
      assert(shortString(d.api, 120) && shortString(d.name, 120) && shortString(d.message) && (d.cause === null || object(d.cause)), 'API_ERROR');
      if (d.cause !== null) { keys(d.cause, ['name', 'message']); assert(shortString(d.cause.name, 120) && shortString(d.cause.message, 200), 'API_ERROR cause'); }
      break;
    case 'SIGNAL': assert(['SIGTERM', 'SIGINT'].includes(d.signal) && typeof d.inflight === 'boolean', 'SIGNAL'); break;
    case 'INVALID': assert(shortString(d.reason), 'INVALID'); break;
    case 'BLOB': {
      assert(typeof d.name === 'string' && BLOB_NAME.test(d.name) && integer(d.offset) && typeof d.base64 === 'string' && hex(d.sha256), 'BLOB fields');
      const b = Buffer.from(d.base64, 'base64');
      assert(b.length > 0 && b.length <= RAW_CHUNK && b.toString('base64') === d.base64 && sha(b) === d.sha256, 'BLOB bounds/digest');
      break;
    }
    case 'BLOB_END': assert(typeof d.name === 'string' && BLOB_NAME.test(d.name) && integer(d.bytes, 1048576) && hex(d.sha256), 'BLOB_END'); break;
    case 'PEER_MILESTONE': case 'DIAGNOSTIC': assert(shortString(d.milestone, 80) && /^[A-Z0-9_]+$/.test(d.milestone), 'milestone'); break;
    default: break;
  }
}
function validateControl(c) {
  keys(c, ['v', 'attempt', 'case', 'role', 'seq', 'command']);
  assert(c.v === 1 && hex(c.attempt, 40) && typeof c.case === 'string' && ROLES.includes(c.role) && integer(c.seq, MAX_SEQ) && COMMANDS.includes(c.command), 'control identity/command');
}
function metadataBytes(e, payloadLength) {
  return e && (e.kind === 'RAW_READ' || e.kind === 'BLOB') && e.data && typeof e.data.base64 === 'string' ? payloadLength - Buffer.byteLength(e.data.base64) : payloadLength;
}
function encodeFrame(e, control = false) {
  if (control) validateControl(e); else validateEvent(e);
  const b = Buffer.from(JSON.stringify(e));
  assert(b.length > 0 && b.length <= PAYLOAD && metadataBytes(control ? null : e, b.length) <= META, 'frame/metadata cap');
  const out = Buffer.allocUnsafe(b.length + 4); out.writeUInt32BE(b.length); b.copy(out, 4); return out;
}
class FrameDecoder {
  constructor(validate = validateControl) { this.pending = Buffer.alloc(0); this.validate = validate; }
  push(b) {
    assert(Buffer.isBuffer(b) && b.length <= FRAME, 'read frame cap');
    this.pending = Buffer.concat([this.pending, b]); const out = [];
    while (this.pending.length >= 4) {
      const n = this.pending.readUInt32BE(); assert(n > 0 && n <= PAYLOAD, 'frame length');
      if (this.pending.length < n + 4) break;
      const payload = this.pending.subarray(4, n + 4);
      const x = strictJSON(payload, true); this.validate(x);
      assert(metadataBytes(this.validate === validateEvent ? x : null, n) <= META, 'metadata cap');
      out.push(x); this.pending = this.pending.subarray(n + 4);
    }
    assert(this.pending.length < FRAME, 'partial frame cap'); return out;
  }
  finish() { assert(this.pending.length === 0, 'truncated frame'); }
}

function readFile(path, cap = 2097152) {
  const before = fs.lstatSync(path, { bigint: true }); assert(before.isFile() && before.size <= BigInt(cap), `regular bounded file required: ${path}`);
  const fd = fs.openSync(path, F.O_RDONLY | F.O_NOFOLLOW | O_CLOEXEC);
  try {
    const after = fs.fstatSync(fd, { bigint: true }); assert(after.ino === before.ino && after.dev === before.dev, 'file replacement');
    const b = fs.readFileSync(fd); assert(b.length <= cap, 'file read cap'); return b;
  } finally { fs.closeSync(fd); }
}
// Streaming digest for large executables: never buffers the whole file (cgroup MemoryMax).
function shaFile(path, cap = 268435456) {
  const fd = fs.openSync(path, F.O_RDONLY | O_CLOEXEC);
  try {
    const st = fs.fstatSync(fd, { bigint: true }); assert(st.isFile() && st.size <= BigInt(cap), 'digest file cap');
    const h = crypto.createHash('sha256'); const b = Buffer.allocUnsafe(1048576); let total = 0;
    for (;;) { const n = fs.readSync(fd, b, 0, b.length, null); if (n === 0) break; total += n; assert(total <= cap, 'digest read cap'); h.update(b.subarray(0, n)); }
    return h.digest('hex');
  } finally { fs.closeSync(fd); }
}
function verifyFiles(files) {
  assert(object(files) && Object.keys(files).length > 0, 'missing file manifest');
  for (const [path, hash] of Object.entries(files)) {
    assert(path.startsWith('/profile/') && !path.split('/').includes('..') && !path.split('/').includes('.') && hex(hash), 'manifest path/hash');
    assert(sha(readFile(path, 16 * 1024 * 1024)) === hash, `file identity: ${path}`);
  }
}
function fifoNames() { return ROLES.flatMap(r => [`${r}.events`, `${r}.control`]); }
function loadConfig(language = 'node') {
  assert(process.platform === 'linux' && process.arch === 'x64' && process.version === 'v24.20.0', 'pinned Linux x64 Node24 required');
  assert(process.execPath === '/runtime/node', 'runtime path');
  const c = strictJSON(readFile(CONFIG));
  keys(c, ['attempt', 'case', 'nonce', 'language', 'deadline_seconds', 'fifo_root', 'fifo_nodes', 'fifo_stat', 'topology', 'case_input', 'mode']);
  assert(hex(c.attempt, 40) && hex(c.nonce, 40) && c.language === language && ['diagnostic', 'sdk', 'control'].includes(c.mode), 'config identity');
  assert(typeof c.case === 'string' && CASE_ID.test(c.case), 'case ID'); // DDP-01
  assert((c.mode === 'diagnostic') === c.case.startsWith('DIAG-') && (c.mode === 'control') === (c.case === 'DP1R-CTRL01'), 'mode/case mismatch');
  assert(c.topology === 'driver_only', 'topology (erratum DP-SPEC/R2-F01)');
  assert(integer(c.deadline_seconds, 60) && c.deadline_seconds > 0 && c.fifo_root === '/observer', 'deadline/root');
  const names = fifoNames();
  assert(Array.isArray(c.fifo_nodes) && c.fifo_nodes.length === 6 && new Set(c.fifo_nodes).size === 6 && names.every(n => c.fifo_nodes.includes(n)), 'six fixed FIFO names');
  keys(c.fifo_stat, names.map(n => `/observer/${n}`));
  for (const v of Object.values(c.fifo_stat)) {
    assert(Array.isArray(v) && v.length === 4 && typeof v[0] === 'string' && /^\d{1,20}$/.test(v[0]) && typeof v[1] === 'string' && /^\d{1,20}$/.test(v[1]) && v[2] === '0600' && v[3] === 0, 'FIFO stat contract');
  }
  assert(object(c.case_input), 'case input'); return c;
}
function admission(c, stage = 'helpers') {
  const a = strictJSON(readFile(ADMISSION));
  keys(a, ['v', 'attempt', 'case', 'nonce', 'language', 'runtime_sha256', 'files', 'fifo_pipe_buf', 'containment_admitted', 'sdk_admitted', 'compiler_admitted']);
  assert(a.v === 1 && a.attempt === c.attempt && a.case === c.case && a.nonce === c.nonce && a.language === c.language, 'admission binding');
  assert(a.containment_admitted === true && typeof a.sdk_admitted === 'boolean' && typeof a.compiler_admitted === 'boolean', 'missing current containment admission');
  assert(a.runtime_sha256 === NODE_SHA256 && shaFile(process.execPath) === NODE_SHA256, 'Node identity');
  keys(a.fifo_pipe_buf, Object.keys(c.fifo_stat));
  for (const n of Object.values(a.fifo_pipe_buf)) assert(integer(n) && n >= FRAME, 'external fpathconf PIPE_BUF witness required');
  assert(!Object.hasOwn(a.files, ADMISSION), 'admission cannot bind itself');
  verifyFiles(a.files);
  assert(a.files[CONFIG] === sha(readFile(CONFIG)), 'unbound config');
  if (stage === 'sdk') assert(c.mode === 'sdk' && a.sdk_admitted === true, 'SDK not admitted');
  if (stage === 'dist') assert(a.sdk_admitted === true, 'published artifacts not admitted');
  if (stage === 'compiler') assert(c.mode === 'sdk' && a.compiler_admitted === true, 'compiler not admitted');
  return a;
}
function checkFIFO(s, expected) {
  assert(s.isFIFO() && String(s.dev) === expected[0] && String(s.ino) === expected[1] && (s.mode & 0o7777n) === 0o600n && s.uid === BigInt(expected[3]), 'FIFO identity/type/owner/mode');
}
// Reopen own named FIFO after exec: NOFOLLOW+CLOEXEC+NONBLOCK, stat before/after.
function openFIFOAt(path, kind, expected) {
  checkFIFO(fs.lstatSync(path, { bigint: true }), expected);
  const fd = fs.openSync(path, (kind === 'events' ? F.O_WRONLY : F.O_RDONLY) | F.O_NOFOLLOW | F.O_NONBLOCK | O_CLOEXEC);
  try {
    checkFIFO(fs.fstatSync(fd, { bigint: true }), expected); checkFIFO(fs.lstatSync(path, { bigint: true }), expected);
    const info = fs.readFileSync(`/proc/self/fdinfo/${fd}`, 'utf8'); const m = /^flags:\s+([0-7]+)$/m.exec(info);
    assert(m && (parseInt(m[1], 8) & O_CLOEXEC) && (parseInt(m[1], 8) & F.O_NONBLOCK), 'FIFO flags'); return fd;
  } catch (e) { fs.closeSync(fd); throw e; }
}
class Channel {
  constructor(c, role, sourcePath) {
    assert(ROLES.includes(role), 'role'); this.config = c; this.role = role;
    const a = admission(c); this.admission = a;
    assert(a.files[sourcePath] === sha(readFile(sourcePath)), 'unbound role source');
    assert(a.files['/profile/dp-channel.cjs'] === sha(readFile('/profile/dp-channel.cjs')), 'unbound channel');
    this.deadline = process.hrtime.bigint() + BigInt(c.deadline_seconds) * 1000000000n;
    this.eventFD = openFIFOAt(`/observer/${role}.events`, 'events', c.fifo_stat[`/observer/${role}.events`]);
    try { this.controlFD = openFIFOAt(`/observer/${role}.control`, 'control', c.fifo_stat[`/observer/${role}.control`]); } catch (e) { fs.closeSync(this.eventFD); throw e; }
    this.seq = 0; this.controlSeq = 0; this.bytes = 0; this.terminal = false; this.chain = Promise.resolve(); this.queue = []; this.decoder = new FrameDecoder();
    this.interrupt = null; // optional () => bool: a pending signal aborts telemetry backpressure waits
    // F4-01: role-side witness of the delivered case_input bytes (reserialization of the parsed object, insertion order).
    this.begin = { nonce: c.nonce, source_sha256: a.files[sourcePath], pid_namespace: fs.readlinkSync('/proc/self/ns/pid'), case_input_sha256: sha(Buffer.from(JSON.stringify(c.case_input))) };
  }
  remainingMs() { return Number((this.deadline - process.hrtime.bigint()) / 1000000n); }
  check() { assert(process.hrtime.bigint() < this.deadline, 'case deadline'); }
  frame(kind, data) { return encodeFrame({ v: 1, attempt: this.config.attempt, case: this.config.case, role: this.role, seq: this.seq, kind, pid: process.pid, mono_ns: String(process.hrtime.bigint()), data }); }
  // One atomic nonblocking write; EAGAIN propagates (no partial frame is possible at <=PIPE_BUF).
  // Terminal and SIGNAL declarations are bounded by their callers' short windows, not by the case
  // deadline, so a deadline failure can still be declared; ordinary events never outlive the deadline.
  writeNow(kind, data) {
    assert(!this.terminal, 'frame after terminal frame');
    if (!TERMINAL.has(kind) && kind !== 'SIGNAL') this.check();
    const b = this.frame(kind, data); assert(this.bytes + b.length <= ROLE_BYTES, 'role artifact cap');
    const n = fs.writeSync(this.eventFD, b); assert(n === b.length, 'short/ambiguous atomic frame write');
    this.seq++; this.bytes += n; if (TERMINAL.has(kind)) this.terminal = true;
  }
  emit(kind, data) {
    const p = this.chain.then(async () => {
      for (;;) {
        try { this.writeNow(kind, data); return; } catch (e) {
          if (!['EAGAIN', 'EWOULDBLOCK'].includes(e.code)) throw e;
          this.check(); if (this.interrupt && this.interrupt()) throw new ChannelError('signal during telemetry backpressure');
          await pause();
        }
      }
    });
    this.chain = p.catch(() => {}); return p;
  }
  async start() { await this.emit('BEGIN', this.begin); await this.emit('READY', {}); await this.control('READY'); }
  readControls() {
    const b = Buffer.allocUnsafe(FRAME);
    for (;;) {
      let n;
      try { n = fs.readSync(this.controlFD, b, 0, b.length, null); } catch (e) { if (['EAGAIN', 'EWOULDBLOCK'].includes(e.code)) return; throw e; }
      assert(n > 0, 'control EOF/missing keeper'); this.bytes += n; assert(this.bytes <= ROLE_BYTES, 'artifact cap');
      for (const c of this.decoder.push(b.subarray(0, n))) {
        assert(c.attempt === this.config.attempt && c.case === this.config.case && c.role === this.role && c.seq === this.controlSeq, 'control binding/sequence');
        this.controlSeq++; this.queue.push(c);
      }
    }
  }
  async control(command) {
    assert(COMMANDS.includes(command), 'wait command');
    for (;;) {
      this.check(); this.readControls();
      if (this.queue.length) { const c = this.queue.shift(); assert(c.command === command, `unexpected control ${c.command}; need ${command}`); return c; }
      await pause();
    }
  }
  // Must run BEFORE the terminal END: a late, extra or truncated control invalidates instead of hiding behind END.
  finishControls() { this.readControls(); this.decoder.finish(); assert(this.queue.length === 0, 'unconsumed control'); }
  closeFds() { fs.closeSync(this.controlFD); fs.closeSync(this.eventFD); }
  close() { this.finishControls(); this.closeFds(); }
}
class StreamLedger {
  constructor(stream) { assert(Object.hasOwn(CAPS, stream), 'ledger stream'); this.stream = stream; this.read = 0; this.committed = 0; this.hash = crypto.createHash('sha256'); }
  raw(b) {
    assert(Buffer.isBuffer(b) && b.length > 0 && b.length <= RAW_CHUNK && this.read + b.length <= CAPS[this.stream], 'read cap');
    const data = { stream: this.stream, offset: this.read, base64: b.toString('base64'), sha256: sha(b) }; this.read += b.length; this.hash.update(b); return data;
  }
  commit(n) { assert(integer(n, RAW_CHUNK) && n > 0 && this.committed + n <= this.read, 'zero/false commit'); const d = { stream: this.stream, offset: this.committed, bytes: n }; this.committed += n; return d; }
  summary() { return { read_bytes: this.read, committed_bytes: this.committed, read_sha256: this.hash.copy().digest('hex') }; }
}
// Writable libuv stream over an inherited fd (pipe or AF_UNIX socketpair). Uses epoll, not the threadpool.
function openSink(fd) { return new net.Socket({ fd, readable: false, writable: true }); }
// Resolves only after libuv completed the whole write; an error leaves an unknown partial count.
function writeChunk(stream, b) {
  return new Promise((resolve, reject) => {
    stream.write(b, e => (e ? reject(new ChannelError('unknown write completion', { cause: e })) : resolve(b.length)));
  });
}
async function writeAll(stream, b, check, committed = async () => {}) {
  for (let offset = 0; offset < b.length; offset += RAW_CHUNK) {
    check(); const chunk = b.subarray(offset, Math.min(offset + RAW_CHUNK, b.length));
    const n = await writeChunk(stream, chunk); assert(n === chunk.length, 'zero/ambiguous write'); await committed(n);
  }
}
// Terminal INVALID declaration, bounded to ~50ms of EAGAIN retries; never blocks indefinitely.
// BLOB: bytes relayed in RAW_CHUNK pieces plus a BLOB_END with the total size and digest (observer rebuilds and checks).
async function blob(ch, name, bytes) {
  const b = Buffer.isBuffer(bytes) ? bytes : Buffer.from(String(bytes));
  assert(b.length <= 1048576, 'BLOB cap');
  for (let off = 0; off < b.length; off += RAW_CHUNK) {
    const part = b.subarray(off, Math.min(off + RAW_CHUNK, b.length));
    await ch.emit('BLOB', { name, offset: off, base64: part.toString('base64'), sha256: sha(part) });
  }
  await ch.emit('BLOB_END', { name, bytes: b.length, sha256: sha(b) });
}
function invalid(ch, e) {
  const reason = clip(e && e.message ? e.message : e, 400);
  for (let i = 0; ch && !ch.terminal && i < 50; i++) {
    try { ch.writeNow('INVALID', { reason }); break; } catch (x) {
      if (!['EAGAIN', 'EWOULDBLOCK'].includes(x.code)) break;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1);
    }
  }
  process.exitCode = 125;
}
module.exports = {
  CONFIG, ADMISSION, NODE_SHA256, CAPS, CASE_ID, clip, RAW_CHUNK, FRAME, META, FIXED_ENV, ROLE_KINDS, Channel, ChannelError, FrameDecoder, StreamLedger, blob,
  assert, keys, object, hex, integer, strictJSON, encodeFrame, validateControl, validateEvent, metadataBytes, readFile, shaFile, verifyFiles,
  loadConfig, admission, openFIFOAt, checkFIFO, sha, pause, openSink, writeChunk, writeAll, invalid,
};
