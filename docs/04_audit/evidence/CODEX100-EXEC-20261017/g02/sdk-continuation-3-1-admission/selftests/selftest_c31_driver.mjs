// Offline selftest of the C3-1 TypeScript driver vocabulary (freeze-r4-c3-delta.json D3-01, D3-02, D3-03), run by
// selftests/selftest_c31.py with the pinned host Node: no SDK import, no sandbox, no adapter, no network.
// argv: node selftest_c31_driver.mjs <input.json>  where input.json = {cases: [C3-1 TypeScript case objects], c3vocab_calls, scratch}
// Every frame the interpreter emits goes through channel.cjs encodeFrame (field, prototype and size validation of the channel).
// Prints one JSON object {tests: [{test, ok, detail}]} on stdout.
import fs from 'node:fs';
import C from '../node/channel.cjs';
import { materialize, checkStep, interpret, GetterWitnesses, OwnCodex, vocabularyProbes, listingOf, declaredWitnesses, threadObs } from '../node/ts-driver.mjs';

const input = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const tests = [];
const check = (test, ok, detail = null) => tests.push({ test, ok: Boolean(ok), detail });

class FakeCh {
  constructor(caseId) { this.caseId = caseId; this.seq = 0; this.out = []; }
  async emit(kind, data) {
    C.encodeFrame({ v: 1, attempt: 'a'.repeat(40), case: this.caseId, role: 'driver', seq: this.seq++, kind, pid: 1, mono_ns: '1', data });
    this.out.push({ kind, data: JSON.parse(JSON.stringify(data)) });
  }
  async control(command) { this.out.push({ control: command }); return { command }; }
  milestones(name) { return this.out.filter(x => x.kind === 'DIAGNOSTIC' && x.data.milestone === name).map(x => x.data.detail); }
  api(label) { return this.out.filter(x => (x.kind === 'API_RESULT' || x.kind === 'API_ERROR') && x.data.api === label); }
  index(pred) { return this.out.findIndex(pred); }
}

// ------------------------------------------------------------------ D3-01 IDs (channel.cjs CASE_ID)
const accepted = [...input.cases.map(c => c.id), 'DIAG-TS-C3VOCAB', 'DIAG-TS-ECHO', '2A-TS12R', 'TSC-SDK-EMIT'];
const rejected = ['C3-TS00', 'C3-TS16', 'C3-TS09C', 'C3-TS9A', 'c3-ts01', 'C3-PY02', 'C31-CTRL01', 'C32-CTRL01', '2B-PY01A', 'DIAG-PY-RPC'];
check('D3-01 TS case IDs accepted and rejected by channel.cjs', accepted.every(x => C.CASE_ID.test(x)) && !rejected.some(x => C.CASE_ID.test(x)),
  { accepted, rejected, wrongly: [...accepted.filter(x => !C.CASE_ID.test(x)), ...rejected.filter(x => C.CASE_ID.test(x))] });

// ------------------------------------------------------------------ D3-02 closure over the frozen C3-1 table (R3-12 of the vocabulary)
const closure = [];
for (const c of input.cases) {
  const calls = c.case_input.sdk_calls;
  const w = new GetterWitnesses(() => []);
  let problem = null;
  try {
    for (const id of declaredWitnesses(c.case_input)) w.declare(id);
    for (const s of calls) {
      checkStep(s);
      for (const k of ['options', 'input', 'value']) if (Object.hasOwn(s, k)) materialize(s[k], w);
      if (s.turn_options) materialize(Object.fromEntries(Object.entries(s.turn_options).filter(([k]) => k !== 'signal')), w);
    }
  } catch (e) { problem = String(e.message); }
  const wantIds = (c.expected.getter_witnesses || []).map(x => x.id);
  closure.push({ id: c.id, problem, declared: declaredWitnesses(c.case_input), expected_witness_ids: wantIds });
}
check('D3-02 every step, mode and marker of the 14 C3-1 TypeScript slots is in the closed vocabulary (checkStep + materialize)',
  input.cases.length === 14 && closure.every(x => x.problem === null), closure.filter(x => x.problem));
check('D3-03 witnesses declared in each case_input are exactly the ids of expected.getter_witnesses',
  closure.every(x => JSON.stringify([...x.declared].sort()) === JSON.stringify([...x.expected_witness_ids].sort())), closure.map(x => [x.id, x.declared]));

// ------------------------------------------------------------------ markers and refusals (own objects)
const vp = vocabularyProbes();
check('D3-02 (g) markers $SELF_REF, $NONENUM, $GETTER (witness counted, one listing), $FUNCTION, $SYMBOL, $UNDEFINED', Object.values(vp.markers).every(Boolean), vp.markers);
check('D3-02 unknown step, key, mode, barrier/mode mismatch and marker are refused; R2-F02 listing error recorded, value returned',
  Object.values(vp.refused).every(Boolean), vp.refused);

// ------------------------------------------------------------------ (a) new Codex without options
class ArgCodex { constructor(...args) { ArgCodex.calls.push(args.length); this.options = args[0]; } startThread() { return { id: null }; } }
ArgCodex.calls = [];
{
  const ch = new FakeCh('C3-TS01');
  await interpret('C3-TS99', ch, ArgCodex, [{ step: 1, api: 'new Codex', as: 'c' }, { step: 2, api: 'new Codex', as: 'd', options: {}, options_as: 'o' }],
    new GetterWitnesses(() => []), { listing: () => [] });
  check('D3-02 (a) new Codex without the options key calls new Codex() with no argument; with options, one argument', JSON.stringify(ArgCodex.calls) === '[0,1]', ArgCodex.calls);
}

// ------------------------------------------------------------------ DIAG-TS-C3VOCAB calls 1..10 over OwnCodex (offline: scratch tmp)
const scratch = input.scratch;
fs.rmSync(scratch, { recursive: true, force: true }); fs.mkdirSync(scratch, { recursive: true });
class TestCodex extends OwnCodex { get tmpRoot() { return scratch; } }
{
  const io = { listing: () => listingOf(scratch) };
  const w = new GetterWitnesses(io.listing);
  const ch = new FakeCh('DIAG-TS-C3VOCAB');
  const callsAll = input.c3vocab_calls;
  for (const id of declaredWitnesses(callsAll)) w.declare(id);
  const env = await interpret('DIAG-TS-C3VOCAB', ch, TestCodex, callsAll.slice(0, 10), w, io);
  const y8 = ch.api('8:yield').map(x => x.data);
  const r8 = ch.api('8:return').map(x => x.data);
  check('D3-02 (b) options_as keeps the object passed to the constructor and to startThread (identity)', env.c.options === env.co && env.t._threadOptions === env.to);
  check('D3-02 (c)(d) mutate after run_streamed(consume none) is seen by the kept generator consumed by events.consume (lazy read)',
    y8.length === 3 && y8[0].result.model === 'own-m-b' && y8[0].result.base_url === 'http://127.0.0.1:9/own-b' && ch.api('3:yield').length === 0
    && ch.api('3:Thread.runStreamed')[0].data.observations.consumed === 'none', y8.map(x => x.result));
  check('D3-02 (h) thread_id_is_undefined observation after a thread.started without thread_id (yield and return)',
    JSON.stringify(y8[1].observations) === '{"thread_id":"own-1","index":1}' && JSON.stringify(y8[2].observations) === '{"thread_id_is_undefined":true,"index":2}'
    && JSON.stringify(r8[0].observations) === '{"events":3,"thread_id_is_undefined":true}' && JSON.stringify(threadObs({ id: undefined })) === '{"thread_id_is_undefined":true}',
    { yields: y8.map(x => x.observations), ret: r8.map(x => x.observations) });
  const gw = ch.milestones('GETTER_WITNESS');
  const wa = gw.filter(x => x.id === 'wA'); const wb = gw.filter(x => x.id === 'wB');
  const dir = wa.length === 1 && wa[0].entries.length === 1 ? wa[0].entries[0][0] : null;
  check('D3-03 getter witness read by JSON.stringify: one invocation at step 8, listing of the own directory before the schema file',
    wa.length === 1 && wa[0].step === 8 && wa[0].invocations === 1 && /^codex-output-schema-[A-Za-z0-9]{6}$/.test(dir) && JSON.stringify(wa[0].entries[0][1]) === '[]', wa);
  check('D3-03 getter witness read by Object.entries: one invocation at step 8 (declared at step 1), listing with schema.json',
    wb.length === 1 && wb[0].step === 8 && wb[0].invocations === 1 && JSON.stringify(wb[0].entries) === JSON.stringify([[dir, ['schema.json']]]), wb);
  check('D3-03 summary lists every declared witness, including 0 invocations', JSON.stringify(w.summary()) === JSON.stringify([
    { id: 'wB', invocations_total: 1 }, { id: 'wA', invocations_total: 1 }, { id: 'wZ', invocations_total: 0 }]), w.summary());
  const outIdx = ch.index(x => x.kind === 'API_RESULT' && x.data.api === '8:return');
  const gwIdx = ch.index(x => x.kind === 'DIAGNOSTIC' && x.data.milestone === 'GETTER_WITNESS');
  const tlIdx = ch.index(x => x.kind === 'DIAGNOSTIC' && x.data.milestone === 'TMP_LISTING' && x.data.detail.step === 8);
  check('D3-03 GETTER_WITNESS after the settle of the step and before its TMP_LISTING', outIdx < gwIdx && gwIdx < tlIdx, { outIdx, gwIdx, tlIdx });
  const sw = ch.out.filter(x => x.kind === 'DIAGNOSTIC' && x.data.milestone === 'STEP_WITNESS').map(x => x.data.detail);
  const s10 = sw.filter(x => x.kind === 'SUSPENDED' && x.step === 10);
  const th = ch.milestones('THROW_PROPAGATED');
  const e10 = ch.api('10:Thread.runStreamed').filter(x => x.kind === 'API_ERROR');
  const l10 = ch.milestones('TMP_LISTING').filter(x => x.step === 10);
  const iY = ch.index(x => x.kind === 'API_RESULT' && x.data.api === '10:yield');
  const iW = ch.index(x => x.kind === 'DIAGNOSTIC' && x.data.milestone === 'STEP_WITNESS' && x.data.detail.kind === 'SUSPENDED');
  const iR = ch.out.findIndex((x, i) => i > iW && x.control === 'STEP_RELEASE');
  const iE = ch.index(x => x.kind === 'API_ERROR' && x.data.api === '10:Thread.runStreamed');
  check('D3-02 (e)(f) first_then_witness_then_throw: first yield, SUSPENDED witness (listing with the open schema dir), release, throw of the same object, return() cleanup',
    s10.length === 1 && s10[0].entries.length === 1 && JSON.stringify(s10[0].entries[0][1]) === '["schema.json"]' && th.length === 1 && th[0].same_object === true
    && e10.length === 1 && e10[0].data.name === 'Error' && e10[0].data.message === 'cvg own throw' && e10[0].data.cause === null
    && l10.length === 1 && l10[0].entries.length === 0 && iY < iW && iW < iR && iR < iE, { s10, th, e10: e10.map(x => x.data), order: [iY, iW, iR, iE] });
  const lazy = sw.filter(x => x.kind === 'LAZY_POINT');
  check('D3-02 standalone LAZY_POINT barrier witnessed with no schema dir', lazy.length === 1 && lazy[0].step === 4 && lazy[0].entries.length === 0, lazy);
  check('frames of the interpreter pass the channel encoder (fields, prototypes, 1024-byte metadata cap)', ch.out.filter(x => x.kind).length >= 20, ch.out.length);
}

// ------------------------------------------------------------------ next_abort_at_barrier over an own abortable generator
{
  const ch = new FakeCh('C3-TS12');
  class AbortCodex {
    constructor(options) { this.options = options; }
    startThread() {
      return { id: null, runStreamed: async (inputValue, opts) => ({ events: (async function* gen() {
        await new Promise((resolve, reject) => opts.signal.addEventListener('abort', () => {
          ch.out.push({ marker: 'abort-listener' });
          reject(Object.assign(new Error('The operation was aborted'), { name: 'AbortError', code: 'ABORT_ERR' }));
        }, { once: true }));
        yield { type: 'never' };
      })() }) };
    }
  }
  await interpret('C3-TS12', ch, AbortCodex, [
    { step: 1, api: 'new Codex', as: 'c', options: {} }, { step: 2, api: 'c.startThread', options: {}, as: 't' },
    { step: 3, api: 'new AbortController', as: 'ac' },
    { step: 4, on: 't', api: 'run_streamed', input: 'x', turn_options: { signal: '$ac.signal' }, consume: 'next_abort_at_barrier', barrier: 'CHILD_HELD', abort: 'ac' }],
  new GetterWitnesses(() => []), { listing: () => [] });
  const iW = ch.index(x => x.kind === 'DIAGNOSTIC' && x.data.milestone === 'STEP_WITNESS' && x.data.detail.kind === 'CHILD_HELD');
  const iRel = ch.out.findIndex((x, i) => i > iW && x.control === 'STEP_RELEASE');
  const iReq = ch.index(x => x.kind === 'DIAGNOSTIC' && x.data.milestone === 'ABORT_REQUESTED');
  const iL = ch.index(x => x.marker === 'abort-listener');
  const iRet = ch.index(x => x.kind === 'DIAGNOSTIC' && x.data.milestone === 'ABORT_RETURNED');
  const iErr = ch.index(x => x.kind === 'API_ERROR' && x.data.api === '4:Thread.runStreamed');
  const det = ch.milestones('ERROR_DETAIL').filter(x => x.step === 4);
  check('D3-02 (e)(f) next_abort_at_barrier: CHILD_HELD witness, release, ABORT_REQUESTED before abort(), ABORT_RETURNED after it, API_ERROR AbortError ABORT_ERR, no yield (R2-F01)',
    iW >= 0 && iW < iRel && iRel < iReq && iReq < iL && iL < iRet && iRet < iErr && det.length === 1 && det[0].code === 'ABORT_ERR'
    && ch.api('4:yield').length === 0 && ch.out[iErr].data.name === 'AbortError', { order: [iW, iRel, iReq, iL, iRet, iErr], det });
}

// ------------------------------------------------------------------ a step outside the vocabulary invalidates before any step runs
{
  const ch = new FakeCh('C3-TS01');
  let refused = false;
  try { await interpret('C3-TS01', ch, OwnCodex, [{ step: 1, api: 'new Codex', as: 'c' }, { step: 2, api: 'c.startThread', as: 't', options: {}, extra: 1 }], new GetterWitnesses(() => []), { listing: () => [] }); }
  catch { refused = true; }
  check('D3-02 a step with a key outside the vocabulary throws before the first step (INVALID_CAPTURE, never a partial run)', refused && ch.out.length === 0, ch.out.length);
}
fs.rmSync(scratch, { recursive: true, force: true });
process.stdout.write(JSON.stringify({ tests }) + '\n');
