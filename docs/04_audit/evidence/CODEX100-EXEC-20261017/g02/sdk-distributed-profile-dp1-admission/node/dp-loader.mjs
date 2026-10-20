// Restricted ESM resolver of the distributed profile, sub-lot DP-1 (DDP-03 of freeze-r4-dp-delta.json).
// Derived from the loader admitted in the 2AC (sdk-batch-2ac-admission/node/extension-loader.mjs): exactly one hook (resolve),
// no load/fetch/transform hook, module source never changed. Declared delta:
//  - SDK entries are the file URLs listed in sdk_entries (the /dist copy and the /fixture copies of the published
//    @openai/codex-sdk dist/index.js, plus own diagnostic modules); before an entry is admitted its bytes are hashed and must equal
//    the sha256 bound for it (the A7 member sha for the published copies);
//  - for a parent that is an admitted SDK entry, the bare specifiers of the closed list sdk_bare (child_process, fs, module, os,
//    path, readline: the static imports of the published dist) resolve to node:<name>, and the node: builtins of sdk_builtins
//    are allowed; any other specifier is denied with ERR_CVG_LOADER_DENIED (the driver turns a denial into INVALID_CAPTURE);
//  - helper files (prebound) get the helper builtin set and may import prebound files and admitted SDK entries by URL or path.
// createRequire().resolve inside the SDK goes through the CommonJS resolver, never through this hook.
import fs from 'node:fs';
import crypto from 'node:crypto';

const CONFIG_PATH = '/profile/dp-loader.json';
const ADMISSION_PATH = '/profile/admission.json';
const SELF_PATH = '/profile/dp-loader.mjs';
const KEYS = ['builtins', 'entry', 'prebound', 'sdk_bare', 'sdk_builtins', 'sdk_entries', 'v'];
const BARE = ['child_process', 'fs', 'module', 'os', 'path', 'readline'];

function denied(specifier, why) {
  const e = new Error(`CVG loader denied ${JSON.stringify(String(specifier)).slice(0, 200)}: ${why}`);
  e.code = 'ERR_CVG_LOADER_DENIED';
  return e;
}
const isObj = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const profileURL = x => typeof x === 'string' && /^file:\/\/\/profile\/[A-Za-z0-9._/-]+$/.test(x) && !x.includes('/../') && !x.includes('/./');
const entryURL = x => typeof x === 'string' && /^file:\/\/\/(?:dist|fixture|profile)\/[A-Za-z0-9._@#/-]+\.(?:m?js)$/.test(x) && !x.includes('/../') && !x.includes('/./');

// Pure validation of a parsed loader config; returns a frozen normalized config or throws.
export function validateConfig(c) {
  if (!isObj(c) || Object.keys(c).sort().join('|') !== KEYS.join('|') || c.v !== 1) throw denied(CONFIG_PATH, 'config keys');
  if (!profileURL(c.entry) || !Array.isArray(c.prebound) || !c.prebound.every(profileURL) || !c.prebound.includes(c.entry)) throw denied(CONFIG_PATH, 'entry/prebound');
  if (!Array.isArray(c.builtins) || !c.builtins.every(b => typeof b === 'string' && /^node:[a-z_]+$/.test(b))) throw denied(CONFIG_PATH, 'builtins');
  if (!Array.isArray(c.sdk_builtins) || !c.sdk_builtins.every(b => typeof b === 'string' && /^node:[a-z_]+$/.test(b))) throw denied(CONFIG_PATH, 'sdk_builtins');
  if (!Array.isArray(c.sdk_bare) || !c.sdk_bare.every(b => BARE.includes(b)) || !c.sdk_bare.every(b => c.sdk_builtins.includes('node:' + b))) throw denied(CONFIG_PATH, 'sdk_bare must be in the closed list and mapped builtins');
  if (!isObj(c.sdk_entries) || !Object.entries(c.sdk_entries).every(([k, v]) => entryURL(k) && typeof v === 'string' && /^[0-9a-f]{64}$/.test(v))) throw denied(CONFIG_PATH, 'sdk_entries');
  if (Object.keys(c.sdk_entries).some(k => c.prebound.includes(k))) throw denied(CONFIG_PATH, 'an SDK entry cannot be prebound');
  return Object.freeze({ ...c, prebound: Object.freeze([...c.prebound]), builtins: Object.freeze([...c.builtins]), sdk_builtins: Object.freeze([...c.sdk_builtins]),
    sdk_bare: Object.freeze([...c.sdk_bare]), sdk_entries: Object.freeze({ ...c.sdk_entries }) });
}

// Pure decision. Returns { url, format, entry? } or null (deny). `entry` asks the caller to verify the bytes of an SDK entry.
export function decide(specifier, parentURL, cfg) {
  if (typeof specifier !== 'string' || specifier.length === 0 || specifier.length > 512) return null;
  const fromEntry = typeof parentURL === 'string' && Object.hasOwn(cfg.sdk_entries, parentURL);
  if (specifier.startsWith('node:')) {
    const allowed = fromEntry ? cfg.sdk_builtins : cfg.builtins;
    return allowed.includes(specifier) ? { url: specifier, format: 'builtin' } : null;
  }
  if (parentURL === undefined) return specifier === cfg.entry ? { url: cfg.entry, format: 'module' } : null;
  if (typeof parentURL !== 'string') return null;
  if (fromEntry) {
    // DDP-03: the closed bare list of the published dist, only for admitted SDK entries.
    if (cfg.sdk_bare.includes(specifier)) return { url: 'node:' + specifier, format: 'builtin' };
    return null;
  }
  if (cfg.prebound.includes(parentURL)) {
    if (!/^(?:\.\.?\/|\/|file:\/\/\/)/.test(specifier)) return null; // bare and other schemes denied for helpers
    let u;
    try { u = new URL(specifier, parentURL); } catch { return null; }
    if (u.protocol !== 'file:' || u.search !== '' || u.hash !== '' || u.host !== '') return null;
    if (cfg.prebound.includes(u.href)) return { url: u.href, format: u.href.endsWith('.cjs') ? 'commonjs' : 'module' };
    if (Object.hasOwn(cfg.sdk_entries, u.href)) return { url: u.href, format: 'module', entry: true };
    return null;
  }
  return null;
}

// Finite strict JSON parser (duplicate keys, nonfinite numbers, trailing data and invalid UTF-8 rejected).
export function strictParse(bytes) {
  const s = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  let i = 0;
  const fail = why => { throw denied(CONFIG_PATH, why); };
  const ws = () => { while (i < s.length && /[\x20\t\r\n]/.test(s[i])) i++; };
  const string = () => {
    const start = i++;
    while (i < s.length) { const c = s[i++]; if (c === '"') return JSON.parse(s.slice(start, i)); if (c === '\\') i++; }
    return fail('unterminated string');
  };
  const value = (d = 0) => {
    if (d > 32) fail('nesting'); ws();
    if (s[i] === '"') return string();
    if (s[i] === '{') {
      i++; ws(); const out = Object.create(null); const seen = new Set();
      if (s[i] === '}') { i++; return out; }
      for (;;) {
        ws(); if (s[i] !== '"') fail('object key'); const k = string();
        if (seen.has(k)) fail('duplicate key'); seen.add(k); ws(); if (s[i++] !== ':') fail('colon');
        out[k] = value(d + 1); ws(); const c = s[i++]; if (c === '}') return out; if (c !== ',') fail('object separator');
      }
    }
    if (s[i] === '[') {
      i++; ws(); const out = []; if (s[i] === ']') { i++; return out; }
      for (;;) { out.push(value(d + 1)); ws(); const c = s[i++]; if (c === ']') return out; if (c !== ',') fail('array separator'); }
    }
    for (const [t, v] of [['true', true], ['false', false], ['null', null]]) if (s.startsWith(t, i)) { i += t.length; return v; }
    const m = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(s.slice(i));
    if (!m) fail('value'); i += m[0].length; const n = Number(m[0]); if (!Number.isFinite(n)) fail('nonfinite'); return n;
  };
  const out = value(); ws(); if (i !== s.length) fail('trailing data');
  return JSON.parse(JSON.stringify(out));
}
function readRegular(path, cap) {
  const st = fs.lstatSync(path);
  if (!st.isFile() || st.size > cap) throw denied(path, 'not a bounded regular file');
  return fs.readFileSync(path);
}
let cached = null;
const verified = new Set();
function config() {
  if (cached) return cached;
  // Integrity before any decision: loader source and config must be bound by the current admission.
  const admission = strictParse(readRegular(ADMISSION_PATH, 2097152));
  if (!isObj(admission) || !isObj(admission.files)) throw denied(ADMISSION_PATH, 'admission');
  if (admission.files[SELF_PATH] !== sha(readRegular(SELF_PATH, 1048576))) throw denied(SELF_PATH, 'unbound loader source');
  const raw = readRegular(CONFIG_PATH, 1048576);
  if (admission.files[CONFIG_PATH] !== sha(raw)) throw denied(CONFIG_PATH, 'unbound loader config');
  cached = validateConfig(strictParse(raw));
  return cached;
}
// Byte identity of an SDK entry, checked once per URL before the first resolution to it.
export function verifyEntry(url, cfg, read = p => readRegular(p, 1048576)) {
  if (verified.has(url)) return true;
  const digest = sha(read(new URL(url).pathname));
  if (digest !== cfg.sdk_entries[url]) throw denied(url, 'SDK entry bytes differ from the bound sha256');
  verified.add(url);
  return true;
}
export async function resolve(specifier, context, nextResolve) {
  const cfg = config();
  const d = decide(specifier, context.parentURL, cfg);
  if (!d) throw denied(specifier, `not allowlisted from ${String(context.parentURL)}`);
  if (d.entry) verifyEntry(d.url, cfg);
  return { url: d.url, format: d.format, shortCircuit: true };
}
