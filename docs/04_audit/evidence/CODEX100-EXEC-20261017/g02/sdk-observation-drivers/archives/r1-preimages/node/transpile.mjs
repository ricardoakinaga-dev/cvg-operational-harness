// Compiler-stage driver: build_argv = ["/runtime/node", "/profile/transpile.mjs"] (execution-profile.json).
// Uses the pinned TypeScript 5.9.2 transpileModule once on each of the ten byte-exact SDK sources.
// No upstream source edit, no custom AST transformer, no bundler/minifier, no typecheck claim.
// PREPARED ONLY in DX100-G02:IMPLEMENT-SDK-OBSERVATION-DRIVERS: it refuses before loading the compiler
// unless the current admission sets compiler_admitted=true and the config mode is "sdk".
import fs from 'node:fs';
import { createRequire } from 'node:module';
import C from './channel.cjs';

const TRANSPILE_CONFIG = '/profile/node-transpile.json';
const SOURCES = ['codex.ts', 'codexOptions.ts', 'events.ts', 'exec.ts', 'index.ts', 'items.ts', 'outputSchemaFile.ts', 'thread.ts', 'threadOptions.ts', 'turnOptions.ts'];
const OPTION_KEYS = ['allowSyntheticDefaultImports', 'declaration', 'esModuleInterop', 'isolatedModules', 'module', 'removeComments', 'sourceMap', 'target', 'verbatimModuleSyntax'];
const FROZEN_OPTIONS = { allowSyntheticDefaultImports: true, declaration: false, esModuleInterop: true, isolatedModules: true, module: 'ESNext', removeComments: false, sourceMap: false, target: 'ES2022', verbatimModuleSyntax: false };

function report(r, code) { fs.writeSync(1, `${JSON.stringify(r)}\n`); process.exit(code); }

export function validateTranspileConfig(t) {
  C.keys(t, ['v', 'typescript', 'sources', 'source_dir', 'out_dir', 'compiler_options', 'allowed_imports']);
  C.assert(t.v === 1 && t.source_dir === '/profile/sdk-ts-src/' && t.out_dir === '/work/sdk-emitted/', 'transpile locations');
  C.keys(t.typescript, ['path', 'sha256', 'bytes', 'version']);
  C.assert(t.typescript.path === '/profile/typescript/lib/typescript.js' && t.typescript.version === '5.9.2' && t.typescript.sha256 === 'e5f1f6b3e82228a89873cc7b941b2465185e839c0692860f83e3e63e53f94c2b' && t.typescript.bytes === 9111680, 'pinned TypeScript 5.9.2 identity');
  C.keys(t.sources, SOURCES);
  for (const h of Object.values(t.sources)) C.assert(C.hex(h), 'source digest');
  C.keys(t.compiler_options, OPTION_KEYS);
  for (const k of OPTION_KEYS) C.assert(t.compiler_options[k] === FROZEN_OPTIONS[k], `frozen compiler option ${k}`);
  C.keys(t.allowed_imports, ['builtins', 'relative']);
  C.assert(Array.isArray(t.allowed_imports.builtins) && t.allowed_imports.builtins.every(b => /^node:[a-z_]+$/.test(b)), 'allowed builtins');
  C.assert(Array.isArray(t.allowed_imports.relative) && t.allowed_imports.relative.every(r => SOURCES.includes(`${r.slice(2)}.ts`) && r.startsWith('./')), 'allowed relative');
  return t;
}

export function main() {
  let config; let admission;
  try { config = C.loadConfig('typescript'); } catch (e) { return report({ status: 'REFUSED_CONFIG', reason: String(e.message).slice(0, 300), compiler_loaded: false }, 3); }
  try { admission = C.admission(config, 'compiler'); } catch (e) { return report({ status: 'REFUSED_NOT_ADMITTED', reason: String(e.message).slice(0, 300), compiler_loaded: false }, 3); }
  // ---- Everything below runs only in a separately admitted compiler stage. ----
  C.assert(config.case === 'TSC-SDK-EMIT', 'compiler stage case');
  const raw = C.readFile(TRANSPILE_CONFIG);
  C.assert(admission.files[TRANSPILE_CONFIG] === C.sha(raw), 'unbound transpile config');
  const t = validateTranspileConfig(C.strictJSON(raw));
  C.assert(admission.files[t.typescript.path] === t.typescript.sha256 && C.shaFile(t.typescript.path) === t.typescript.sha256, 'compiler identity');
  const inputs = SOURCES.map(name => {
    const path = `${t.source_dir}${name}`; const bytes = C.readFile(path, 1048576);
    C.assert(admission.files[path] === t.sources[name] && C.sha(bytes) === t.sources[name], `source identity ${name}`);
    return { name, bytes, text: new TextDecoder('utf-8', { fatal: true }).decode(bytes) };
  });
  const require = createRequire(import.meta.url);
  const ts = require(t.typescript.path); // the only compiler load
  C.assert(ts.version === '5.9.2', 'compiler version');
  const compilerOptions = {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, isolatedModules: true, esModuleInterop: true,
    allowSyntheticDefaultImports: true, sourceMap: false, declaration: false, removeComments: false, verbatimModuleSyntax: false,
  };
  fs.mkdirSync(t.out_dir, { mode: 0o700 });
  const outputs = []; let ok = true; let total = 0;
  for (const input of inputs) {
    const r = ts.transpileModule(input.text, { compilerOptions, fileName: input.name, reportDiagnostics: true });
    const diagnostics = (r.diagnostics ?? []).map(d => ({ code: d.code, category: d.category, start: d.start ?? null, message: ts.flattenDiagnosticMessageText(d.messageText, '\n').slice(0, 300) }));
    const imports = ts.preProcessFile(r.outputText, true, true).importedFiles.map(f => f.fileName);
    const badImports = imports.filter(s => !(t.allowed_imports.builtins.includes(s) || t.allowed_imports.relative.includes(s)));
    const out = Buffer.from(r.outputText, 'utf8'); total += out.length; C.assert(total <= 1048576, 'emit cap');
    const name = input.name.replace(/\.ts$/, '.js');
    fs.writeFileSync(`${t.out_dir}${name}`, out, { flag: 'wx', mode: 0o444 });
    ok = ok && diagnostics.length === 0 && badImports.length === 0;
    outputs.push({ source: input.name, source_sha256: t.sources[input.name], output: name, output_sha256: C.sha(out), bytes: out.length, diagnostics, imports, bad_imports: badImports, base64: out.toString('base64') });
  }
  report({
    status: ok ? 'EMITTED' : 'EMITTED_WITH_FINDINGS', compiler_loaded: true, typescript_version: ts.version, compiler_options: t.compiler_options, outputs,
    limitation: 'exec.js createRequire/require.resolve paths are CommonJS resolution reachable only without codexPathOverride; not governed by the ESM loader and not exercised by this profile.',
  }, ok ? 0 : 4);
}
if (import.meta.url === `file://${process.argv[1]}`) {
  try { main(); } catch (e) { report({ status: 'FAILED', reason: String(e && e.message).slice(0, 300), compiler_loaded: 'UNKNOWN_AFTER_GATE' }, 5); }
}
