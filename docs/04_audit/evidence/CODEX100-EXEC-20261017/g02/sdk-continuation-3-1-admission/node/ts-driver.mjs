// Contained TypeScript driver. Runtime argv (execution-profile.json):
//   /runtime/node --experimental-loader /profile/extension-loader.mjs /profile/ts-driver.mjs --case CASE_ID
// The SDK is imported only inside sdkCase() after a current admission with sdk_admitted=true.
// No top-level SDK or TypeScript import exists in this file.
// Lane conventions read by the evaluator: API_RESULT/API_ERROR api = "<step>:<name>"; DIAGNOSTIC ERROR_DETAIL, TMP_LISTING
// (synchronous /work/tmp listing right after each run/run_streamed/events.consume step settles), STEP_WITNESS (waits
// STEP_RELEASE), RESOLVER_ABSENCE, CALLS_DONE.
// DX100-G02:IMPLEMENT-AND-ADMIT-SDK-SOURCE-CONTINUATION-3-1 (freeze-r4-c3-delta.json D3-02/D3-03, over the driver admitted
// in the 2AC, sha 748603cb):
//  (a) new Codex without the options key calls new Codex() with no argument;
//  (b) options_as keeps the materialized options object, the same object passed to new Codex / X.startThread / X.resumeThread;
//  (c) step mutate {target, key, value}; (d) step events.consume {events_of_step, consume} over the generator kept by a
//      run_streamed with consume none;
//  (e) consume modes first_then_witness_then_throw {barrier SUSPENDED, throw {name, message}} and next_abort_at_barrier
//      {barrier CHILD_HELD, abort} (ABORT_REQUESTED is emitted before the abort() call, ABORT_RETURNED after it: erratum
//      C3-SPEC/R2-F01; this driver never kills the SDK child);
//  (f) barriers SUSPENDED and CHILD_HELD as STEP_WITNESS + STEP_RELEASE (F4-12);
//  (g) markers $SELF_REF, $NONENUM, $GETTER (optional witness, D3-03), $FUNCTION and $SYMBOL;
//  (h) observation thread_id_is_undefined (the channel JSON cannot carry undefined);
//  (i) RESOLVER_ABSENCE also at step 1 of C3-TS01.
// A step, key, mode or marker outside this closed vocabulary throws, so the driver ends INVALID (INVALID_CAPTURE).
// D3-03 / C3-SPEC/R2-F02: a $GETTER witness counts every invocation; the first one lists /work/tmp synchronously with the
// TMP_LISTING function, inside the getter; a listing error is caught, recorded and never reaches the SDK (the value is still
// returned). GETTER_WITNESS {id, step, invocations, entries} is emitted after the settle of any step with an invocation and
// before its TMP_LISTING; CALLS_DONE carries {id, invocations_total} of every witness declared in the case_input.
// DIAG-TS-C3VOCAB runs the same interpreter over its constant diag_calls with OwnCodex (own code below, no SDK import).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import readline from 'node:readline';
import C from './channel.cjs';
import { selectedFixture, holds } from './fixture-cli.mjs';

const DIAG_CASES = new Set(['DIAG-TS-ECHO', 'DIAG-TS-ABORT', 'DIAG-TS-ARGVENV', 'DIAG-TS-C3VOCAB']);
const UNDEF = '$UNDEFINED';
const HOLE = '$HOLE';
const SIGNAL_REF = /^\$([A-Za-z_][A-Za-z0-9_]{0,31})\.signal$/;
const OBJECT_MARKERS = ['$REPEAT', '$BIGINT', '$DATE', '$INSTANCE', '$SELF_REF', '$NONENUM', '$GETTER'];
const RESOLVER_PATHS = ['/profile/sdk-emitted/node_modules', '/profile/node_modules', '/node_modules', '/work/home/.node_modules', '/work/home/.node_libraries', '/lib/node', '/usr/lib/node'];
const SDK_ENV = Object.freeze({ HOME: '/work/home', PATH: '/runtime' }); // execution-profile typescript.SDK_configuration.env
const SDK_ENTRY = 'file:///profile/sdk-emitted/index.js';
const ERRORS = { Error, TypeError, RangeError };
// Closed step vocabulary: allowed keys per step kind (D3-02).
const STEP_KEYS = {
  'new Codex': ['step', 'api', 'as', 'options', 'options_as', 'expect'],
  'new AbortController': ['step', 'api', 'as', 'then'],
  thread: ['step', 'api', 'as', 'options', 'options_as', 'id'],
  run: ['step', 'api', 'on', 'input', 'turn_options', 'expect'],
  run_streamed: ['step', 'api', 'on', 'input', 'turn_options', 'consume', 'barrier', 'throw', 'abort', 'expect'],
  mutate: ['step', 'api', 'target', 'key', 'value'],
  'events.consume': ['step', 'api', 'events_of_step', 'consume'],
  barrier: ['step', 'barrier', 'witness'],
};
const CONSUME = { all: null, first_next_only: null, first_then_return: null, none: null, first_then_witness_then_throw: 'SUSPENDED', next_abort_at_barrier: 'CHILD_HELD' };

function errorData(api, e) {
  const cause = e == null || e.cause == null ? null : { name: C.clip(e.cause.name ?? 'Error', 120), message: C.clip(e.cause.message ?? e.cause, 200) };
  return { api, name: C.clip(e?.name ?? 'Error', 120), message: C.clip(e?.message ?? e, 360), cause };
}
// Every emitted SDK module must be admission-bound with the loader-manifest hash, and the emitted
// directory must be closed (exactly the manifest plus package.json, regular files only) before import.
export function checkEmitted(cfg, files, listing) {
  const names = Object.keys(cfg.emitted);
  C.assert(names.includes('index.js'), 'emitted manifest lacks index.js');
  for (const n of names) C.assert(files[`/profile/sdk-emitted/${n}`] === cfg.emitted[n], `emitted module not admission-bound: ${n}`);
  C.assert(C.hex(files['/profile/sdk-emitted/package.json'] ?? ''), 'unbound emitted package.json');
  const want = [...names, 'package.json'].sort();
  C.assert(JSON.stringify([...listing.map(e => e.name)].sort()) === JSON.stringify(want), 'emitted directory not closed');
  C.assert(listing.every(e => e.regular), 'non-regular file in emitted directory');
  return true;
}
// The API call alone is inside this try. Telemetry runs after it, so a failed emit is INVALID, never API_ERROR.
async function settle(fn) { try { return { ok: true, value: await fn() }; } catch (error) { return { ok: false, error }; } }

export function listingOf(root) {
  const dirs = [];
  for (const name of fs.readdirSync(root).sort()) {
    const p = `${root}/${name}`;
    const st = fs.lstatSync(p);
    dirs.push([name, st.isDirectory() ? fs.readdirSync(p).sort() : null]);
  }
  return dirs;
}
export const listing = () => listingOf('/work/tmp'); // the TMP_LISTING function (CAP-TS-DRIVER-TMPDIR)
const IO = Object.freeze({ listing });

// D3-03: registry of the $GETTER witnesses of one case. `step` is the step being interpreted when the SDK reads the property.
export class GetterWitnesses {
  constructor(listFn = listing) { this.list = listFn; this.declared = new Map(); this.step = null; this.pending = []; }
  declare(id) {
    C.assert(typeof id === 'string' && /^[A-Za-z0-9_]{1,32}$/.test(id) && !this.declared.has(id), `getter witness id ${id}`);
    this.declared.set(id, { id, total: 0 });
  }
  invoke(id) {
    const w = this.declared.get(id);
    if (!w) return; // undeclared ids cannot exist: materialize only builds declared witnesses
    w.total += 1;
    let rec = this.pending.find(r => r.id === id && r.step === this.step);
    if (!rec) { rec = { id, step: this.step, invocations: 0, entries: null }; this.pending.push(rec); }
    rec.invocations += 1;
    if (w.total === 1) {
      try { rec.entries = this.list(); } catch (e) { rec.error = C.clip(e?.code ?? e?.message ?? e, 80); } // R2-F02: never reaches the SDK
    }
  }
  drain() { const out = this.pending; this.pending = []; return out; }
  summary() { return [...this.declared.values()].map(w => ({ id: w.id, invocations_total: w.total })); }
}
// Witness ids declared anywhere in a step list ($GETTER with witness), in document order.
export function declaredWitnesses(x, out = []) {
  if (Array.isArray(x)) { for (const v of x) declaredWitnesses(v, out); return out; }
  if (C.object(x)) {
    for (const [k, v] of Object.entries(x)) {
      if (k === '$GETTER' && C.object(v) && Object.hasOwn(v, 'witness')) out.push(v.witness);
      declaredWitnesses(v, out);
    }
  }
  return out;
}

// '$UNDEFINED' values become undefined (key kept, or array element present); '$HOLE' leaves an array hole; the F4-08 and D3-02
// markers become the declared JS values; every other object becomes a plain Object.prototype object. Any other '$' string or
// '$' key is an unknown marker and throws.
class CvgInstance { constructor(fields) { Object.assign(this, fields); } }
function onlyKey(x) { const ks = Object.keys(x); return ks.length === 1 ? ks[0] : null; }
function cvgOwnFunction() { return 'cvg'; }
export function materialize(x, w = null) {
  if (typeof x === 'string') {
    if (x === '$NAN') return NaN;
    if (x === '$INFINITY') return Infinity;
    if (x === UNDEF) return undefined;
    if (x === '$FUNCTION') return cvgOwnFunction;
    if (x === '$SYMBOL') return Symbol('cvg');
    C.assert(!x.startsWith('$'), `unknown string marker ${C.clip(x, 40)}`);
    return x;
  }
  if (Array.isArray(x)) {
    const out = new Array(x.length);
    x.forEach((v, i) => { if (v !== HOLE) out[i] = materialize(v, w); });
    return out;
  }
  if (C.object(x)) {
    const k = onlyKey(x);
    if (k !== null && k.startsWith('$')) {
      C.assert(OBJECT_MARKERS.includes(k), `unknown object marker ${C.clip(k, 40)}`);
      const r = x[k];
      if (k === '$REPEAT') { C.assert(C.object(r) && typeof r.text === 'string' && Number.isSafeInteger(r.count) && r.count >= 0 && r.count <= 16777216, '$REPEAT'); return r.text.repeat(r.count); }
      if (k === '$BIGINT') { C.assert(typeof r === 'string' && /^-?[0-9]+$/.test(r), '$BIGINT'); return BigInt(r); }
      if (k === '$DATE') { C.assert(Number.isSafeInteger(r), '$DATE'); return new Date(r); }
      if (k === '$INSTANCE') { C.assert(C.object(r), '$INSTANCE'); return new CvgInstance(materialize(r, w)); }
      if (k === '$SELF_REF') { C.assert(typeof r === 'string' && r.length > 0 && !r.startsWith('$'), '$SELF_REF'); const o = {}; o[r] = o; return o; }
      if (k === '$NONENUM') {
        C.assert(C.object(r) && Object.keys(r).sort().join() === 'non_enumerable,own' && C.object(r.own) && C.object(r.non_enumerable), '$NONENUM');
        const o = materialize(r.own, w);
        for (const [nk, nv] of Object.entries(r.non_enumerable)) {
          C.assert(!nk.startsWith('$') && !Object.hasOwn(o, nk), '$NONENUM key');
          Object.defineProperty(o, nk, { value: materialize(nv, w), enumerable: false, writable: true, configurable: true });
        }
        return o;
      }
      // $GETTER {name, value[, witness]}: enumerable own getter returning the materialized value (the same value every time).
      C.assert(C.object(r) && typeof r.name === 'string' && r.name.length > 0 && !r.name.startsWith('$') && Object.hasOwn(r, 'value')
        && Object.keys(r).every(q => ['name', 'value', 'witness'].includes(q)), '$GETTER');
      const value = materialize(r.value, w);
      const id = Object.hasOwn(r, 'witness') ? r.witness : null;
      C.assert(id === null || (w !== null && w.declared.has(id)), '$GETTER witness not declared');
      const o = {};
      Object.defineProperty(o, r.name, { get() { if (id !== null) w.invoke(id); return value; }, enumerable: true, configurable: true });
      return o;
    }
    const o = {};
    for (const [key, v] of Object.entries(x)) {
      C.assert(!key.startsWith('$'), `unknown marker key ${C.clip(key, 40)}`);
      o[key] = v === UNDEF ? undefined : materialize(v, w);
    }
    return o;
  }
  return x;
}
function plain(x) { return x === undefined ? null : JSON.parse(JSON.stringify(x)); }
// D3-02 (h): thread identity as the channel can carry it.
export function threadObs(thread) { return thread.id === undefined ? { thread_id_is_undefined: true } : { thread_id: thread.id }; }

async function emitError(ch, api, e, step) {
  await ch.emit('API_ERROR', errorData(api, e));
  await ch.emit('DIAGNOSTIC', { milestone: 'ERROR_DETAIL', detail: { step, api, code: e?.code == null ? null : C.clip(e.code, 60),
    syscall: e?.syscall == null ? null : C.clip(e.syscall, 60), ctor: C.clip(e?.constructor?.name ?? typeof e, 60) } });
}
async function tmpListing(ch, step, io) { await ch.emit('DIAGNOSTIC', { milestone: 'TMP_LISTING', detail: { step, entries: io.listing() } }); }
async function getterWitnesses(ch, w) { for (const r of w.drain()) await ch.emit('DIAGNOSTIC', { milestone: 'GETTER_WITNESS', detail: r }); }
async function witness(ch, step, kind, io = IO) {
  await ch.emit('DIAGNOSTIC', { milestone: 'STEP_WITNESS', detail: { step, kind, entries: io.listing() } });
  await ch.control('STEP_RELEASE');
}
function turnOptions(t, env, w) {
  C.assert(C.object(t ?? {}), 'turn_options');
  const raw = t ?? {};
  const ref = typeof raw.signal === 'string' ? SIGNAL_REF.exec(raw.signal) : null;
  const o = materialize(ref ? Object.fromEntries(Object.entries(raw).filter(([k]) => k !== 'signal')) : raw, w);
  if (ref) { C.assert(env[ref[1]] instanceof AbortController, `unknown AbortController ${ref[1]}`); o.signal = env[ref[1]].signal; }
  return o;
}
export function stepKind(step) {
  if (!Object.hasOwn(step, 'api')) return 'barrier';
  if (/^\w+\.(startThread|resumeThread)$/.test(step.api)) return 'thread';
  C.assert(Object.hasOwn(STEP_KEYS, step.api) && step.api !== 'barrier' && step.api !== 'thread', `unknown step api ${C.clip(step.api, 60)}`);
  return step.api;
}
// D3-02: closed vocabulary check of one step (keys, consume mode, barrier of the mode). Throws on anything outside it.
export function checkStep(step) {
  C.assert(C.object(step) && Number.isSafeInteger(step.step) && step.step > 0, 'step number');
  const kind = stepKind(step);
  for (const k of Object.keys(step)) C.assert(STEP_KEYS[kind].includes(k), `unknown key ${C.clip(k, 40)} in ${kind} step`);
  if (kind === 'barrier') C.assert(step.barrier === 'LAZY_POINT', `unknown standalone barrier ${C.clip(step.barrier, 40)}`);
  if (kind === 'run_streamed' || kind === 'events.consume') {
    C.assert(Object.hasOwn(CONSUME, step.consume) && !(kind === 'events.consume' && step.consume === 'none'), `unknown consume mode ${C.clip(step.consume, 60)}`);
    const need = CONSUME[step.consume];
    C.assert((step.barrier ?? null) === need, `barrier ${step.barrier} does not match mode ${step.consume}`);
    C.assert(Object.hasOwn(step, 'throw') === (step.consume === 'first_then_witness_then_throw'), 'throw only with first_then_witness_then_throw');
    C.assert(Object.hasOwn(step, 'abort') === (step.consume === 'next_abort_at_barrier'), 'abort only with next_abort_at_barrier');
    if (step.throw !== undefined) C.assert(C.object(step.throw) && Object.hasOwn(ERRORS, step.throw.name) && typeof step.throw.message === 'string', 'throw');
  }
  if (kind === 'mutate') C.assert(typeof step.target === 'string' && typeof step.key === 'string' && !step.key.startsWith('$') && Object.hasOwn(step, 'value'), 'mutate');
  if (kind === 'events.consume') C.assert(Number.isSafeInteger(step.events_of_step), 'events_of_step');
  if (Object.hasOwn(step, 'options_as')) C.assert(Object.hasOwn(step, 'options') && typeof step.options_as === 'string', 'options_as needs options');
  return kind;
}

async function streamed(ch, n, thread, it, mode, step, env, io) {
  let index = 0;
  const label = `${n}:Thread.runStreamed`;
  const yielded = async value => { await ch.emit('API_RESULT', { api: `${n}:yield`, result: plain(value), observations: { ...threadObs(thread), index: index++ } }); };
  const next = async () => {
    const r = await settle(() => it.next());
    if (!r.ok) { await emitError(ch, label, r.error, n); return null; }
    if (r.value.done) { await ch.emit('API_RESULT', { api: `${n}:return`, result: null, observations: { events: index, ...threadObs(thread) } }); return null; }
    await yielded(r.value.value);
    return r.value;
  };
  if (mode === 'all') { while (await next()); return; }
  if (mode === 'first_next_only') { await next(); return; }
  if (mode === 'first_then_return') {
    if (!(await next())) return;
    const r = await settle(() => it.return());
    if (r.ok) await ch.emit('API_RESULT', { api: `${n}:return()`, result: { done: r.value.done }, observations: threadObs(thread) });
    else await emitError(ch, `${n}:return()`, r.error, n);
    return;
  }
  if (mode === 'first_then_witness_then_throw') {
    // for await over the kept generator: after the first yield, barrier SUSPENDED; once released, throw inside the body.
    const thrown = new ERRORS[step.throw.name](step.throw.message);
    let caught = null; let ended = false;
    try {
      for await (const ev of it) {
        await yielded(ev);
        await witness(ch, n, 'SUSPENDED', io);
        throw thrown;
      }
      ended = true;
    } catch (e) {
      if (e instanceof C.ChannelError) throw e; // telemetry failure: INVALID, never an API outcome
      caught = e;
    }
    if (ended) { await ch.emit('API_RESULT', { api: `${n}:return`, result: null, observations: { events: index, ...threadObs(thread) } }); return; }
    await ch.emit('DIAGNOSTIC', { milestone: 'THROW_PROPAGATED', detail: { step: n, same_object: caught === thrown, cause_present: caught?.cause !== undefined } });
    await emitError(ch, label, caught, n);
    return;
  }
  if (mode === 'next_abort_at_barrier') {
    const ac = env[step.abort];
    C.assert(ac instanceof AbortController, `unknown AbortController ${C.clip(step.abort, 40)}`);
    const pending = settle(() => it.next()); // next() called now, not awaited
    await witness(ch, n, 'CHILD_HELD', io);
    await ch.emit('DIAGNOSTIC', { milestone: 'ABORT_REQUESTED', detail: { step: n, controller: step.abort } }); // before abort() (R2-F01)
    ac.abort();
    await ch.emit('DIAGNOSTIC', { milestone: 'ABORT_RETURNED', detail: { step: n, aborted: ac.signal.aborted } });
    const r = await pending;
    if (!r.ok) await emitError(ch, label, r.error, n);
    else if (r.value.done) await ch.emit('API_RESULT', { api: `${n}:return`, result: null, observations: { events: index, ...threadObs(thread) } });
    else await yielded(r.value.value);
    return;
  }
  C.assert(false, `unknown consume mode ${mode}`);
}

// One interpreter for the frozen sdk_calls (real SDK) and for the constant diag_calls of DIAG-TS-C3VOCAB (OwnCodex).
export async function interpret(caseId, ch, Codex, calls, w, io = IO) {
  C.assert(Array.isArray(calls) && calls.length > 0, 'frozen calls');
  const seen = new Set();
  for (const step of calls) { checkStep(step); C.assert(!seen.has(step.step), 'duplicate step number'); seen.add(step.step); }
  const env = {}; const kept = {};
  for (const step of calls) {
    const n = step.step;
    const kind = stepKind(step);
    w.step = n;
    if (kind === 'barrier') { await witness(ch, n, 'LAZY_POINT', io); await getterWitnesses(ch, w); continue; }
    if (kind === 'new Codex') {
      if (caseId === 'C3-TS01' && n === 1) { // D3-02 (i)
        const paths = Object.fromEntries(RESOLVER_PATHS.map(p => [p, fs.existsSync(p)]));
        await ch.emit('DIAGNOSTIC', { milestone: 'RESOLVER_ABSENCE', detail: { paths, node_path: Object.hasOwn(process.env, 'NODE_PATH') } });
      }
      const has = Object.hasOwn(step, 'options');
      const options = has ? materialize(step.options, w) : undefined;
      if (step.options_as) env[step.options_as] = options;
      let value; let error = null;
      try { value = has ? new Codex(options) : new Codex(); } catch (e) { error = e; }
      if (error) await emitError(ch, `${n}:new Codex`, error, n);
      else { if (step.as) env[step.as] = value; await ch.emit('API_RESULT', { api: `${n}:new Codex`, result: null, observations: {} }); }
      await getterWitnesses(ch, w);
      if (step.expect) await witness(ch, n, 'ZERO_SPAWN', io);
      continue;
    }
    if (kind === 'new AbortController') {
      const ac = new AbortController();
      if (step.then !== undefined) { C.assert(step.then === 'ac.abort()', 'then'); ac.abort(); }
      env[step.as] = ac;
      await ch.emit('API_RESULT', { api: `${n}:new AbortController`, result: { aborted: ac.signal.aborted }, observations: {} });
      continue;
    }
    if (kind === 'thread') {
      const [owner, method] = step.api.split('.');
      const target = env[owner];
      C.assert(target, `unknown codex ${owner}`);
      const has = Object.hasOwn(step, 'options');
      const options = has ? materialize(step.options, w) : undefined;
      if (step.options_as) env[step.options_as] = options;
      let thread;
      if (method === 'startThread') thread = has ? target.startThread(options) : target.startThread();
      else thread = has ? target.resumeThread(step.id, options) : target.resumeThread(step.id);
      env[step.as] = thread;
      await ch.emit('API_RESULT', { api: `${n}:${method}`, result: null, observations: threadObs(thread) });
      await getterWitnesses(ch, w);
      continue;
    }
    if (kind === 'mutate') {
      const target = env[step.target];
      C.assert(target !== null && typeof target === 'object', `unknown mutate target ${C.clip(step.target, 40)}`);
      target[step.key] = materialize(step.value, w);
      await ch.emit('API_RESULT', { api: `${n}:mutate`, result: null, observations: { target: step.target, key: step.key } });
      await getterWitnesses(ch, w);
      continue;
    }
    if (kind === 'events.consume') {
      const k = kept[step.events_of_step];
      C.assert(k && !k.used, `no kept generator of step ${step.events_of_step}`);
      k.used = true;
      await streamed(ch, n, k.thread, k.events, step.consume, step, env, io);
      await getterWitnesses(ch, w);
      await tmpListing(ch, n, io);
      continue;
    }
    const thread = env[step.on];
    C.assert(thread, `unknown thread ${step.on}`);
    const input = materialize(step.input, w);
    const opts = turnOptions(step.turn_options, env, w);
    if (kind === 'run') {
      const r = await settle(() => thread.run(input, opts));
      if (r.ok) await ch.emit('API_RESULT', { api: `${n}:Thread.run`, result: plain(r.value), observations: threadObs(thread) });
      else await emitError(ch, `${n}:Thread.run`, r.error, n);
    } else {
      const started = await settle(() => thread.runStreamed(input, opts));
      if (!started.ok) await emitError(ch, `${n}:Thread.runStreamed`, started.error, n);
      else if (step.consume === 'none') {
        kept[n] = { events: started.value.events, thread, used: false }; // kept, iterated only by events.consume
        await ch.emit('API_RESULT', { api: `${n}:Thread.runStreamed`, result: null, observations: { consumed: 'none', ...threadObs(thread) } });
      } else await streamed(ch, n, thread, started.value.events, step.consume, step, env, io);
    }
    await getterWitnesses(ch, w);
    await tmpListing(ch, n, io);
    if (step.expect && step.expect.spawns === 0) await witness(ch, n, 'ZERO_SPAWN', io);
  }
  return env;
}

export async function sdkCase(config, ch, w) {
  const a = C.admission(config, 'sdk');
  for (const p of [SDK_ENTRY.slice('file://'.length), '/profile/sdk-emitted/package.json', '/profile/node-loader.json', '/profile/extension-loader.mjs']) C.assert(C.hex(a.files[p] ?? ''), `unbound ${p}`);
  const loaderCfg = C.strictJSON(C.readFile('/profile/node-loader.json'));
  const dir = fs.readdirSync('/profile/sdk-emitted').map(name => ({ name, regular: fs.lstatSync(`/profile/sdk-emitted/${name}`).isFile() }));
  checkEmitted(loaderCfg, a.files, dir);
  const { Codex } = await import(SDK_ENTRY); // the only SDK import
  C.assert(typeof Codex === 'function', 'SDK Codex export');
  await interpret(config.case, ch, Codex, config.case_input.sdk_calls, w);
  // End-of-case listing: every case reports the final /work/tmp state.
  await ch.emit('DIAGNOSTIC', { milestone: 'TMP_LISTING', detail: { step: 'final', entries: listing() } });
}

// ------------------------------------------------------------------------------------------ DIAG-TS-C3VOCAB own code (no SDK)
// OwnCodex/OwnThread mirror only what the C3 vocabulary touches: the options object kept by reference (codex.ts:18,
// thread.ts constructor), options read lazily inside the generator (thread.ts:75-79), an outputSchema directory created
// with JSON.stringify of the schema (outputSchemaFile.ts), the config read by Object.entries (exec.ts config flattening),
// thread.started updating the id (thread.ts:107) and, with own_child, one adapter child spawned with the signal and read by
// readline, killed in finally only if not already killed (exec.ts:203-262).
class OwnThread {
  constructor(codex, threadOptions, id = null) { this._codex = codex; this._threadOptions = threadOptions; this._id = id; }
  get id() { return this._id; }
  async runStreamed(input, turnOptions = {}) { return { events: this._gen(input, turnOptions) }; }
  async *_gen(input, turnOptions) {
    let dir = null;
    if (turnOptions.outputSchema !== undefined) {
      dir = fs.mkdtempSync(`${this._codex.tmpRoot}/codex-output-schema-`);
      fs.writeFileSync(`${dir}/schema.json`, JSON.stringify(turnOptions.outputSchema));
    }
    try {
      if (turnOptions.own_report === true) { // options and config read only here, at the first next (lazy, by reference)
        const config = Object.entries(this._codex.options.config ?? {}).map(([k, v]) => [k, Object.entries(v ?? {}).map(([q, x]) => [q, x])]);
        yield { type: 'own.options', model: this._threadOptions?.model ?? null, base_url: this._codex.options.baseUrl ?? null, config };
      }
      for (const ev of turnOptions.own_events ?? []) {
        if (ev.type === 'thread.started') this._id = ev.thread_id;
        yield ev;
      }
      if (turnOptions.own_child === true) {
        const child = spawn('/profile/adapter-typescript', ['exec', '--experimental-json'],
          { env: { ...SDK_ENV, CODEX_INTERNAL_ORIGINATOR_OVERRIDE: 'codex_sdk_ts' }, signal: turnOptions.signal });
        let spawnError = null;
        child.once('error', e => { spawnError = e; });
        child.stdin.write(String(input)); child.stdin.end();
        const rl = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
        try {
          for await (const line of rl) yield JSON.parse(line);
          if (spawnError) throw spawnError;
        } finally {
          rl.close(); child.removeAllListeners();
          try { if (!child.killed) child.kill(); } catch { /* own child already gone */ }
        }
      }
    } finally {
      if (dir) fs.rmSync(dir, { recursive: true, force: true });
    }
  }
}
export class OwnCodex {
  constructor(options = {}) { this.options = options; }
  get tmpRoot() { return '/work/tmp'; } // os.tmpdir() of the sandbox (TMPDIR); the offline selftest overrides it in a subclass
  startThread(threadOptions = {}) { return new OwnThread(this, threadOptions); }
  resumeThread(id, threadOptions = {}) { return new OwnThread(this, threadOptions, id); }
}
// Constant vocabulary probes over own objects: each marker materialized and inspected, unknown steps/modes/markers refused.
export function vocabularyProbes(listFn = () => []) {
  const w = new GetterWitnesses(listFn);
  w.declare('wp');
  const self = materialize({ $SELF_REF: 'self' }, w);
  const ne = materialize({ $NONENUM: { own: { shown: 1 }, non_enumerable: { hidden: 2 } } }, w);
  const g = materialize({ $GETTER: { name: 'lazy', value: 'v', witness: 'wp' } }, w);
  w.step = 0;
  const d = Object.getOwnPropertyDescriptor(g, 'lazy');
  const viaJson = JSON.stringify(g); const viaEntries = Object.entries(g);
  const fn = materialize('$FUNCTION'); const sym = materialize('$SYMBOL');
  const markers = {
    self_ref_cycle: self.self === self && Object.keys(self).join() === 'self',
    nonenum: Object.keys(ne).join() === 'shown' && ne.hidden === 2 && Object.getOwnPropertyDescriptor(ne, 'hidden').enumerable === false,
    getter: typeof d.get === 'function' && d.enumerable === true && viaJson === '{"lazy":"v"}' && viaEntries[0][1] === 'v' && w.summary()[0].invocations_total === 2,
    getter_listing_once: w.drain().length === 1,
    function: typeof fn === 'function' && fn() === 'cvg',
    symbol: typeof sym === 'symbol' && sym.description === 'cvg',
    undefined_top: materialize('$UNDEFINED') === undefined,
    undefined_in_object: (() => { const o = materialize({ u: '$UNDEFINED' }); return Object.hasOwn(o, 'u') && o.u === undefined; })(),
  };
  const refused = {};
  const bad = { unknown_string_marker: () => materialize('$NOPE'), unknown_object_marker: () => materialize({ $NOPE: 1 }),
    dollar_key_in_object: () => materialize({ a: 1, $b: 2 }), undeclared_witness: () => materialize({ $GETTER: { name: 'x', value: 1, witness: 'zz' } }, w),
    unknown_step: () => checkStep({ step: 1, api: 'bogus' }), unknown_key: () => checkStep({ step: 1, api: 'mutate', target: 't', key: 'k', value: 1, extra: 1 }),
    unknown_mode: () => checkStep({ step: 1, api: 'run_streamed', on: 't', input: 'x', turn_options: {}, consume: 'bogus' }),
    mode_barrier_mismatch: () => checkStep({ step: 1, api: 'run_streamed', on: 't', input: 'x', turn_options: {}, consume: 'next_abort_at_barrier', barrier: 'SUSPENDED', abort: 'ac' }),
    unknown_barrier: () => checkStep({ step: 1, barrier: 'BOGUS', witness: {} }),
    getter_listing_error_recorded: () => { const e = new GetterWitnesses(() => { throw Object.assign(new Error('x'), { code: 'EACCES' }); }); e.declare('we'); const o = materialize({ $GETTER: { name: 'p', value: 1, witness: 'we' } }, e); const v = o.p; const r = e.drain()[0]; if (v === 1 && r.error === 'EACCES' && r.entries === null) throw new Error('recorded'); } };
  for (const [name, f] of Object.entries(bad)) { try { f(); refused[name] = false; } catch { refused[name] = true; } }
  return { markers, refused };
}
async function c3vocab(config, ch, w) {
  const probes = vocabularyProbes();
  await ch.emit('DIAGNOSTIC', { milestone: 'VOCAB_MARKERS', detail: probes.markers });
  await ch.emit('DIAGNOSTIC', { milestone: 'VOCAB_REFUSALS', detail: probes.refused });
  const env = await interpret(config.case, ch, OwnCodex, config.case_input.diag_calls, w);
  await ch.emit('DIAGNOSTIC', { milestone: 'OPTIONS_IDENTITY', detail: { codex_options_same_object: env.c?.options === env.co, thread_options_same_object: env.t?._threadOptions === env.to,
    mutated_model: env.to?.model ?? null, mutated_base_url: env.co?.baseUrl ?? null, source_sdk_claim: false } });
  await ch.emit('DIAGNOSTIC', { milestone: 'TMP_LISTING', detail: { step: 'final', entries: listing() } });
}

function digestStream(readable, cap, onCap) {
  return new Promise((resolve, reject) => {
    const parts = []; let bytes = 0;
    readable.on('data', b => { bytes += b.length; if (bytes > cap) { onCap(); reject(new C.ChannelError('diagnostic stream cap')); } else parts.push(b); });
    readable.once('error', reject);
    readable.once('end', () => { const all = Buffer.concat(parts); resolve({ bytes, sha256: C.sha(all), text: all }); });
  });
}
async function loaderSelftest(ch) {
  const probes = [
    ['node:fs', 'ALLOWED'], ['node:http', 'DENIED'], ['node:vm', 'DENIED'], ['fs', 'DENIED'],
    ['./channel.cjs', 'ALLOWED'], ['../profile/fixture-cli.mjs', 'ALLOWED'],
    ['file:///profile/adapter-config.json', 'DENIED'], [SDK_ENTRY, 'DENIED'], ['/profile/transpile.mjs', 'DENIED'],
    ['data:text/javascript,export default 1', 'DENIED'], ['https://example.invalid/x.mjs', 'DENIED'],
  ];
  let pass = true;
  for (const [spec, expected] of probes) {
    let outcome; let code = null;
    try { await import(spec); outcome = 'ALLOWED'; } catch (e) { code = String(e?.code ?? e?.name ?? 'Error').slice(0, 60); outcome = e?.code === 'ERR_CVG_LOADER_DENIED' ? 'DENIED' : 'ERROR'; }
    pass = pass && outcome === expected;
    await ch.emit('DIAGNOSTIC', { milestone: 'LOADER_PROBE', detail: { spec, expected, outcome, code } });
  }
  await ch.emit('DIAGNOSTIC', { milestone: 'LOADER_SELFTEST', detail: { probes: probes.length, pass } });
  C.assert(pass, 'loader selftest');
}
async function transpileGate(ch) {
  // Constant negative control: compiler_admitted=false must refuse before any compiler require.
  const t = spawn('/runtime/node', ['/profile/transpile.mjs'], { cwd: '/work', env: { ...C.FIXED_ENV }, stdio: ['ignore', 'pipe', 'pipe'] });
  const closed = new Promise((resolve, reject) => { t.once('error', reject); t.once('close', (code, signal) => resolve({ code, signal })); });
  const out = digestStream(t.stdout, 65536, () => t.kill('SIGKILL')); const err = digestStream(t.stderr, 65536, () => t.kill('SIGKILL'));
  const status = await closed; const o = await out; const e = await err;
  let report = null;
  try { report = C.strictJSON(o.text.subarray(0, Math.max(0, o.text.length - 1))); } catch { report = null; }
  const pass = status.code === 3 && status.signal === null && C.object(report) && report.status === 'REFUSED_NOT_ADMITTED' && report.compiler_loaded === false;
  await ch.emit('DIAGNOSTIC', { milestone: 'TRANSPILE_GATE', detail: { code: status.code, signal: status.signal, stdout_sha256: o.sha256, stderr_bytes: e.bytes, status: C.object(report) ? String(report.status) : null, compiler_loaded: C.object(report) ? report.compiler_loaded : null, pass } });
  C.assert(pass, 'transpile gate did not refuse before compiler load');
}

// Own spawn of the adapter mirroring exec.ts (default stdio, given env, stdin write+end) used by DIAG-TS-ARGVENV.
async function ownChild(ch, argv, envObj, stdinBytes) {
  const child = spawn('/profile/adapter-typescript', argv, { env: envObj });
  let spawnError = null; child.once('error', e => { spawnError = e; });
  const exit = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
  const closed = new Promise(resolve => child.once('close', () => resolve()));
  const kill = () => child.kill('SIGKILL');
  const out = digestStream(child.stdout, C.CAPS.stdout, kill); const err = digestStream(child.stderr, C.CAPS.stderr, kill);
  child.stdin.on('error', () => {});
  child.stdin.write(stdinBytes); child.stdin.end();
  const status = await exit; await closed; const o = await out; const e = await err;
  C.assert(spawnError === null, `diagnostic spawn error: ${spawnError?.code ?? spawnError}`);
  await ch.emit('DIAGNOSTIC', { milestone: 'OWN_FIXTURE_CHILD_CLOSED', detail: { code: status.code, signal: status.signal, stdin_bytes: stdinBytes.length, stdin_sha256: C.sha(stdinBytes), stdout_bytes: o.bytes, stdout_sha256: o.sha256, stderr_bytes: e.bytes, stderr_sha256: e.sha256, source_sdk_claim: false } });
  return status;
}

async function diagnostic(config, ch, w) {
  C.assert(DIAG_CASES.has(config.case), 'unsupported diagnostic');
  const input = config.case_input;
  if (config.case === 'DIAG-TS-C3VOCAB') { await c3vocab(config, ch, w); return; }
  if (config.case === 'DIAG-TS-ARGVENV') {
    const d = input.diag;
    await ch.emit('DIAGNOSTIC', { milestone: 'ARGVENV_SENT', detail: { argv_bytes: Buffer.byteLength(JSON.stringify(d.argv)), argv_count: d.argv.length, env: d.env } });
    await ownChild(ch, d.argv, d.env, Buffer.from('argvenv'));
    return;
  }
  if (config.case === 'DIAG-TS-ECHO') await loaderSelftest(ch);
  // Mirrors exec.ts: spawn(executablePath, ["exec","--experimental-json"], { env, signal }) with default stdio.
  const child = spawn('/profile/adapter-typescript', ['exec', '--experimental-json'], { env: { ...SDK_ENV, CODEX_INTERNAL_ORIGINATOR_OVERRIDE: 'codex_sdk_ts' } });
  let spawnError = null; child.once('error', e => { spawnError = e; });
  const exit = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
  const closed = new Promise(resolve => child.once('close', () => resolve()));
  const kill = () => child.kill('SIGKILL');
  const out = digestStream(child.stdout, C.CAPS.stdout, kill); const err = digestStream(child.stderr, C.CAPS.stderr, kill);
  const stdinBytes = Buffer.from('synthetic');
  child.stdin.on('error', () => {});
  child.stdin.write(stdinBytes); child.stdin.end();
  if (holds(input) || config.case === 'DIAG-TS-ABORT') { // r4: DIAG-TS-ABORT writes JSONL before holding (prefix under signal)
    await ch.control('ABORT_NOW');
    C.assert(child.kill('SIGTERM'), 'diagnostic signal delivery');
    await ch.emit('DIAGNOSTIC', { milestone: 'ABORT_CALLED', detail: { signal: 'SIGTERM', source_sdk_claim: false } });
  }
  const status = await exit; await closed; const o = await out; const e = await err;
  C.assert(spawnError === null, `diagnostic spawn error: ${spawnError?.code ?? spawnError}`);
  await ch.emit('DIAGNOSTIC', { milestone: 'OWN_FIXTURE_CHILD_CLOSED', detail: { code: status.code, signal: status.signal, stdin_bytes: stdinBytes.length, stdin_sha256: C.sha(stdinBytes), stdout_bytes: o.bytes, stdout_sha256: o.sha256, stderr_bytes: e.bytes, stderr_sha256: e.sha256, source_sdk_claim: false } });
  if (config.case === 'DIAG-TS-ECHO') await transpileGate(ch);
}
export async function main() {
  const config = C.loadConfig('typescript');
  const ch = new C.Channel(config, 'driver', '/profile/ts-driver.mjs');
  let timer = null;
  const fail = e => { C.invalid(ch, e); clearTimeout(timer); process.exit(125); };
  try {
    C.assert(process.argv.length === 4 && process.argv[2] === '--case' && process.argv[3] === config.case, 'driver argv');
    C.assert(process.execArgv.length === 2 && process.execArgv[0] === '--experimental-loader' && process.execArgv[1] === '/profile/extension-loader.mjs', 'exact runtime loader argv');
    for (const p of ['/profile/node-loader.json', '/profile/extension-loader.mjs', '/profile/fixture-cases.json', '/profile/fixture-cli.mjs']) C.assert(C.hex(ch.admission.files[p] ?? ''), `unbound ${p}`);
    selectedFixture(config);
    const w = new GetterWitnesses();
    for (const id of declaredWitnesses(config.case_input)) w.declare(id); // D3-03: every declared witness, before any step
    timer = setTimeout(() => fail(new Error('driver deadline')), Math.max(1, ch.remainingMs()));
    await ch.start();
    if (config.mode === 'diagnostic') await diagnostic(config, ch, w); else await sdkCase(config, ch, w);
    // CALLS_DONE marks the end of the API lane (also the release condition when no child exists) and carries the D3-03 summary.
    await ch.emit('DIAGNOSTIC', { milestone: 'CALLS_DONE', detail: { source_sdk_claim: false, getter_witnesses: w.summary() } });
    // Final barrier: the supervisor releases the driver only after adapter and peer are terminal
    // (END/INVALID frame or independently witnessed exit), never on a SIGNAL frame alone.
    await ch.control('RELEASE_EXIT');
    ch.finishControls();
    clearTimeout(timer);
    ch.writeNow('END', { streams: {}, child_exit_code: null, child_signal: null, complete: true });
    ch.closeFds(); process.exit(0);
  } catch (e) { fail(e); }
}
if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { C.invalid(null, e); process.exit(125); });
