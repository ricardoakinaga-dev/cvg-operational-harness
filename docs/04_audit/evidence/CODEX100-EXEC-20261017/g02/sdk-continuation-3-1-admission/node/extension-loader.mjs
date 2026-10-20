// Restricted ESM resolver for the TypeScript reference profile (execution-profile.json#/typescript/loader_contract).
// Exactly one hook: resolve. No load/fetch/transformSource hook; module source is never changed.
// Allowlist: the exact entry, prebound helper file URLs, listed node: builtins, the SDK entry and
// same-directory extensionless specifiers between manifest-listed emitted .js files. Everything else is denied.
import fs from 'node:fs';
import crypto from 'node:crypto';

const CONFIG_PATH = '/profile/node-loader.json';
const ADMISSION_PATH = '/profile/admission.json';
const SELF_PATH = '/profile/extension-loader.mjs';
const KEYS = ['builtins', 'emitted', 'emitted_dir', 'entry', 'prebound', 'sdk_builtins', 'sdk_entry', 'v'];

function denied(specifier, why) {
  const e = new Error(`CVG loader denied ${JSON.stringify(String(specifier)).slice(0, 200)}: ${why}`);
  e.code = 'ERR_CVG_LOADER_DENIED';
  return e;
}
const isObj = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const fileURL = x => typeof x === 'string' && /^file:\/\/\/profile\/[A-Za-z0-9._/-]+$/.test(x) && !x.includes('/../') && !x.includes('/./');

// Pure validation of a parsed loader config; returns a frozen normalized config or throws.
export function validateConfig(c) {
  if (!isObj(c) || Object.keys(c).sort().join('|') !== KEYS.join('|') || c.v !== 1) throw denied(CONFIG_PATH, 'config keys');
  if (!fileURL(c.entry) || !Array.isArray(c.prebound) || !c.prebound.every(fileURL) || !c.prebound.includes(c.entry)) throw denied(CONFIG_PATH, 'entry/prebound');
  if (!Array.isArray(c.builtins) || !c.builtins.every(b => typeof b === 'string' && /^node:[a-z_]+$/.test(b))) throw denied(CONFIG_PATH, 'builtins');
  if (!Array.isArray(c.sdk_builtins) || !c.sdk_builtins.every(b => c.builtins.includes(b))) throw denied(CONFIG_PATH, 'sdk_builtins must be a subset of builtins');
  if (c.sdk_entry !== 'file:///profile/sdk-emitted/index.js' || c.emitted_dir !== 'file:///profile/sdk-emitted/') throw denied(CONFIG_PATH, 'emitted location');
  if (!isObj(c.emitted) || !Object.entries(c.emitted).every(([k, v]) => /^[A-Za-z][A-Za-z0-9_]*\.js$/.test(k) && typeof v === 'string' && /^[0-9a-f]{64}$/.test(v))) throw denied(CONFIG_PATH, 'emitted manifest');
  return Object.freeze({ ...c, prebound: Object.freeze([...c.prebound]), builtins: Object.freeze([...c.builtins]), sdk_builtins: Object.freeze([...c.sdk_builtins]), emitted: Object.freeze({ ...c.emitted }) });
}
// Every manifest-listed emitted module must be bound by the current admission with the same digest.
export function bindEmitted(cfg, admissionFiles) {
  for (const [name, digest] of Object.entries(cfg.emitted)) {
    if (admissionFiles[`/profile/sdk-emitted/${name}`] !== digest) throw denied(name, 'emitted module not bound by admission');
  }
  return cfg;
}

// Pure decision. Returns { url, format } or null (deny).
export function decide(specifier, parentURL, cfg) {
  if (typeof specifier !== 'string' || specifier.length === 0 || specifier.length > 512) return null;
  if (specifier.startsWith('node:')) {
    // Emitted SDK modules get only the SDK builtin set; helper files get the helper set.
    const allowed = typeof parentURL === 'string' && parentURL.startsWith(cfg.emitted_dir) ? cfg.sdk_builtins : cfg.builtins;
    return allowed.includes(specifier) ? { url: specifier, format: 'builtin' } : null;
  }
  if (parentURL === undefined) return specifier === cfg.entry ? { url: cfg.entry, format: 'module' } : null;
  if (typeof parentURL !== 'string') return null;
  if (cfg.prebound.includes(parentURL)) {
    if (!/^(?:\.\.?\/|\/|file:\/\/\/)/.test(specifier)) return null; // bare and other schemes denied
    let u;
    try { u = new URL(specifier, parentURL); } catch { return null; }
    if (u.protocol !== 'file:' || u.search !== '' || u.hash !== '' || u.host !== '') return null;
    if (cfg.prebound.includes(u.href)) return { url: u.href, format: u.href.endsWith('.cjs') ? 'commonjs' : 'module' };
    if (u.href === cfg.sdk_entry && Object.hasOwn(cfg.emitted, 'index.js')) return { url: u.href, format: 'module' };
    return null;
  }
  if (parentURL.startsWith(cfg.emitted_dir)) {
    const parentName = parentURL.slice(cfg.emitted_dir.length);
    if (!Object.hasOwn(cfg.emitted, parentName)) return null;
    const m = /^\.\/([A-Za-z][A-Za-z0-9_]*)$/.exec(specifier); // extensionless, same directory only
    if (!m || !Object.hasOwn(cfg.emitted, `${m[1]}.js`)) return null;
    return { url: `${cfg.emitted_dir}${m[1]}.js`, format: 'module' };
  }
  return null;
}

// Finite strict JSON parser (duplicate keys, nonfinite numbers, trailing data and invalid UTF-8 rejected).
// Kept self-contained so the hooks thread loads no other profile module.
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
function config() {
  if (cached) return cached;
  // Integrity before any decision: loader source and config must be bound by the current admission.
  const admission = strictParse(readRegular(ADMISSION_PATH, 2097152));
  if (!isObj(admission) || !isObj(admission.files)) throw denied(ADMISSION_PATH, 'admission');
  if (admission.files[SELF_PATH] !== sha(readRegular(SELF_PATH, 1048576))) throw denied(SELF_PATH, 'unbound loader source');
  const raw = readRegular(CONFIG_PATH, 1048576);
  if (admission.files[CONFIG_PATH] !== sha(raw)) throw denied(CONFIG_PATH, 'unbound loader config');
  cached = bindEmitted(validateConfig(strictParse(raw)), admission.files);
  return cached;
}
export async function resolve(specifier, context, nextResolve) {
  const d = decide(specifier, context.parentURL, config());
  if (!d) throw denied(specifier, `not allowlisted from ${String(context.parentURL)}`);
  return { url: d.url, format: d.format, shortCircuit: true };
}
