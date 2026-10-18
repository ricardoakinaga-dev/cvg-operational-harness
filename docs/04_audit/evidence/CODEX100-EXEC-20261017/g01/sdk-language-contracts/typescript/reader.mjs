/** Syntax-only source evidence. Never imports, emits or executes target files. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const OUT = path.dirname(fileURLToPath(import.meta.url));
let ROOT = OUT;
while (!fs.existsSync(path.join(ROOT, 'docs/07_agents/AGENTS.md'))) {
  const parent = path.dirname(ROOT);
  if (parent === ROOT) throw new Error('Repository root missing');
  ROOT = parent;
}
const E = path.join(ROOT, 'docs/04_audit/evidence/CODEX100-EXEC-20261017');
const PARENT = path.dirname(OUT);
const UP = '/tmp/cvg-rea-codex-20261017/upstream';
const PIN = '8d9f6466ff0294785d56f55b1fe363d132fe4133';
const CONTRACT = '182723fb6159aad4c13d769c106d250ab8d7dec0f7edaadc861553a3757ff2a7';
const PREFIX = 'sdk/typescript/src/';
const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const sha = (data) => crypto.createHash('sha256').update(data).digest('hex');
const requireThat = (ok, message) => { if (!ok) throw new Error(message); };
const encoded = (v) => Buffer.from(JSON.stringify(v, null, 2) + '\n');
function stable(v) {
  if (Array.isArray(v)) return v.map(stable);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, stable(v[k])]));
  return v;
}
const canonical = (v) => JSON.stringify(stable(v));
const objectHash = (v) => sha(canonical(v));

requireThat(sha(fs.readFileSync(path.join(PARENT, 'contract.json'))) === CONTRACT, 'Parent contract changed');
const contract = read(path.join(PARENT, 'contract.json'));
requireThat(process.versions.node === '22.23.2', 'Use the pinned Node22 analysis runtime');
requireThat(sha(fs.readFileSync(path.join(E, contract.previous_program_checkpoint.path))) === contract.previous_program_checkpoint.sha256, 'Previous551checkpoint changed');
for (const tool of contract.analysis_tools.typescript_files) {
  const bytes = fs.readFileSync(path.join(ROOT, tool.path));
  requireThat(bytes.length === tool.bytes && sha(bytes) === tool.sha256, 'Analysis tool changed: ' + tool.path);
}
// Load the installed analysis parser only. Target TS files are read as text and
// passed to createSourceFile; no Program/typecheck/transpile/emit or target import.
const toolRequire = createRequire(path.join(ROOT, 'package.json'));
const ts = toolRequire(path.join(ROOT, 'node_modules/typescript/lib/typescript.js'));
requireThat(ts.version === '6.0.3', 'Unexpected AST analysis tool version');

function sourceModule(file, text) {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  requireThat(sf.parseDiagnostics.length === 0, 'Syntax parser diagnostics: ' + file + ': ' + sf.parseDiagnostics.map(d => d.code + ':' + ts.flattenDiagnosticMessageText(d.messageText, '\n')).join(';'));
  const raw = Buffer.from(text);
  const range = (first, last) => {
    const a = Buffer.byteLength(text.slice(0, first)), b = Buffer.byteLength(text.slice(0, last));
    const bytes = raw.subarray(a, b);
    return { path: file, file_sha256: sha(raw), start_byte: a, end_byte_exclusive: b,
      start_line: sf.getLineAndCharacterOfPosition(first).line + 1,
      end_line: sf.getLineAndCharacterOfPosition(Math.max(first, last - 1)).line + 1,
      sha256: sha(bytes), text: bytes.toString('utf8') };
  };
  const span = (node) => range(node.getStart(sf, false), node.end);
  const comments = (node) => (ts.getLeadingCommentRanges(text, node.pos) || []).map(c => range(c.pos, c.end));
  const nodeText = (node) => node ? node.getText(sf) : null;
  const modifiers = (node) => (ts.canHaveModifiers(node) ? ts.getModifiers(node) || [] : []).map(m => ts.SyntaxKind[m.kind]);
  const decorators = (node) => (ts.canHaveDecorators(node) ? ts.getDecorators(node) || [] : []).map(nodeText);
  const name = (node) => {
    if (ts.isConstructorDeclaration(node)) return 'constructor';
    if (node.name) return nodeText(node.name);
    if (node.parent && ts.isVariableDeclaration(node.parent)) return nodeText(node.parent.name);
    return '<anonymous@' + node.getStart(sf) + '>';
  };
  const nameKind = (node) => !node.name ? 'ANONYMOUS_OR_CONSTRUCTOR' : ts.isComputedPropertyName(node.name) ? 'COMPUTED_NAME_OPEN' : ts.isPrivateIdentifier(node.name) ? 'ECMASCRIPT_PRIVATE' : 'SOURCE_NAME';
  const ancestry = (node) => {
    const a = [];
    for (let p = node.parent; p && p !== sf; p = p.parent) {
      if (ts.isClassDeclaration(p) || ts.isClassExpression(p) || ts.isInterfaceDeclaration(p) || ts.isTypeAliasDeclaration(p) || ts.isFunctionDeclaration(p) || ts.isMethodDeclaration(p)) a.unshift({ kind: ts.SyntaxKind[p.kind], name: name(p), start_byte: Buffer.byteLength(text.slice(0, p.getStart(sf))) });
    }
    return a;
  };
  const parameter = (p) => ({ name: nodeText(p.name), name_kind: ts.isIdentifier(p.name) ? 'IDENTIFIER' : 'BINDING_PATTERN_OPEN',
    type_source: nodeText(p.type), initializer_source: nodeText(p.initializer), optional_token: !!p.questionToken,
    rest_token: !!p.dotDotDotToken, modifiers: modifiers(p), decorators: decorators(p), source: span(p),
    runtime_default: 'NOT_EVALUATED' });
  const declarations = [], functions = [], fields = [], exports = [], imports = [], references = [], calls = [], syntax = [];
  function record(node, stack = []) {
    if (ts.isImportDeclaration(node)) {
      const bindings = [];
      const clause = node.importClause;
      if (clause?.name) bindings.push({ local: clause.name.text, imported: 'default', type_only: !!clause.isTypeOnly });
      if (clause?.namedBindings) {
        if (ts.isNamespaceImport(clause.namedBindings)) bindings.push({ local: clause.namedBindings.name.text, imported: '*', type_only: !!clause.isTypeOnly });
        else for (const b of clause.namedBindings.elements) bindings.push({ local: b.name.text, imported: b.propertyName?.text || b.name.text, type_only: !!clause.isTypeOnly || !!b.isTypeOnly });
      }
      imports.push({ module: node.moduleSpecifier.text, bindings, side_effect_import: !clause, source: span(node), resolution: 'STATIC_SOURCE_IMPORT_NOT_LOADED' });
    }
    if (ts.isExportDeclaration(node)) {
      if (node.exportClause && ts.isNamedExports(node.exportClause)) {
        for (const b of node.exportClause.elements) exports.push({ exported: b.name.text, imported: b.propertyName?.text || b.name.text,
          module: node.moduleSpecifier?.text || null, type_only: !!node.isTypeOnly || !!b.isTypeOnly, source: span(b) });
      } else exports.push({ exported: '*', imported: '*', module: node.moduleSpecifier?.text || null,
        type_only: !!node.isTypeOnly, source: span(node), resolution: 'OPEN_STAR_OR_NAMESPACE_EXPORT' });
    }
    if (ts.isExportAssignment(node)) exports.push({ exported: 'default', imported: nodeText(node.expression), module: null,
      type_only: false, source: span(node), resolution: ts.isIdentifier(node.expression) ? 'LOCAL_IDENTIFIER_CANDIDATE' : 'OPEN_DYNAMIC_DEFAULT_EXPORT' });
    const declaration = ts.isClassDeclaration(node) || ts.isClassExpression(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isFunctionDeclaration(node) || ts.isEnumDeclaration(node) || ts.isVariableDeclaration(node);
    if (declaration) {
      const mods = modifiers(node);
      const row = { id: 'ts:' + file + '#' + ts.SyntaxKind[node.kind] + ':' + name(node) + ':' + Buffer.byteLength(text.slice(0, node.getStart(sf))),
        name: name(node), name_kind: nameKind(node), kind: ts.SyntaxKind[node.kind], modifiers: mods, decorators: decorators(node),
        top_level: node.parent === sf || (ts.isVariableDeclaration(node) && node.parent?.parent?.parent === sf),
        ancestry: ancestry(node), type_source: nodeText(node.type), initializer_source: nodeText(node.initializer),
        heritage: node.heritageClauses?.map(nodeText) || [], type_parameters: node.typeParameters?.map(nodeText) || [],
        source: span(node), leading_comments: comments(node), runtime_reachability: 'OPEN_SYNTAX_ONLY' };
      declarations.push(row);
      const parentMods = ts.isVariableDeclaration(node) ? modifiers(node.parent.parent) : [];
      if (row.top_level && [...mods, ...parentMods].includes('ExportKeyword')) exports.push({ exported: mods.includes('DefaultKeyword') ? 'default' : row.name,
        imported: row.name, module: null, type_only: ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node), source: row.source });
    }
    let nextStack = stack;
    if (ts.isFunctionLike(node)) {
      const row = { id: 'ts-fn:' + file + ':' + Buffer.byteLength(text.slice(0, node.getStart(sf))), name: name(node), kind: ts.SyntaxKind[node.kind],
        name_kind: nameKind(node), ancestry: ancestry(node), modifiers: modifiers(node), decorators: decorators(node),
        parameters: node.parameters.map(parameter), return_type_source: nodeText(node.type),
        type_parameters: node.typeParameters?.map(nodeText) || [], generator: !!node.asteriskToken,
        async: modifiers(node).includes('AsyncKeyword'), optional_token: !!node.questionToken,
        has_body: !!node.body, body_source: node.body ? span(node.body) : null, source: span(node), leading_comments: comments(node),
        documented_internal: comments(node).some(c => /@internal\b/.test(c.text)),
        visibility: nameKind(node) === 'ECMASCRIPT_PRIVATE' || modifiers(node).includes('PrivateKeyword') ? 'PRIVATE_SOURCE_SUPPORT' : modifiers(node).includes('ProtectedKeyword') ? 'PROTECTED_SOURCE_SUPPORT' : 'PUBLIC_OR_LEXICAL_CANDIDATE_NOT_COMPILER_PROOF' };
      functions.push(row);nextStack = [...stack, row.id];
    }
    if (ts.isPropertyDeclaration(node) || ts.isPropertySignature(node) || ts.isIndexSignatureDeclaration(node) || ts.isEnumMember(node)) {
      fields.push({ id: 'ts-field:' + file + ':' + Buffer.byteLength(text.slice(0, node.getStart(sf))), name: name(node),
        name_kind: nameKind(node), kind: ts.SyntaxKind[node.kind], ancestry: ancestry(node), modifiers: modifiers(node),
        decorators: decorators(node), optional_token: !!node.questionToken, definite_assignment_token: !!node.exclamationToken,
        type_source: nodeText(node.type), initializer_source: nodeText(node.initializer),
        literal_type_value: node.type && ts.isLiteralTypeNode(node.type) && ts.isStringLiteral(node.type.literal) ? node.type.literal.text : null,
        source: span(node), leading_comments: comments(node), runtime_requiredness: 'OPEN_SOURCE_QUESTION_TOKEN_IS_NOT_RUNTIME_VALIDATION' });
    }
    if (ts.isUnionTypeNode(node) || ts.isTupleTypeNode(node) || ts.isIntersectionTypeNode(node) || ts.isConditionalTypeNode(node) || ts.isMappedTypeNode(node) || ts.isTypeReferenceNode(node)) {
      syntax.push({ id: 'ts-type:' + file + ':' + Buffer.byteLength(text.slice(0, node.getStart(sf))), kind: ts.SyntaxKind[node.kind],
        ancestry: ancestry(node), parts: node.types?.map(nodeText) || [], type_name: nodeText(node.typeName),
        type_arguments: node.typeArguments?.map(nodeText) || [], source: span(node), semantic_expansion: 'OPEN_NOT_TYPECHECKED' });
    }
    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      calls.push({ id: 'ts-call:' + file + ':' + Buffer.byteLength(text.slice(0, node.getStart(sf))), kind: ts.SyntaxKind[node.kind],
        callee_source: nodeText(node.expression), argument_sources: node.arguments?.map(nodeText) || [],
        type_arguments: node.typeArguments?.map(nodeText) || [], enclosing_function_ids: stack,
        source: span(node), resolution: 'SOURCE_CALLEE_CANDIDATE_NOT_RUNTIME_INVOCATION' });
    }
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) references.push({ value: node.text, source: span(node), enclosing_function_ids: stack });
    ts.forEachChild(node, child => record(child, nextStack));
  }
  record(sf);
  return { path: file, sha256: sha(raw), bytes: raw.length, syntax_diagnostics: [], declarations, functions, fields, exports, imports, type_syntax: syntax, literal_references: references, calls,
    limits: ['Syntax parser only; no TypeScript Program, checker, emit, codegen, target import or code execution.',
      'Modifier/default/type/alias/decorator expressions are source; no runtime values, inherited MRO, type expansion, or public reachability inferred.'] };
}

function linkExports(modules, expectedNames) {
  const byPath = new Map(modules.map(m => [m.path, m]));
  function target(file, specifier) {
    if (!specifier.startsWith('.')) return null;
    const base = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier));
    const stem = base.replace(/\.(?:js|mjs|cjs)$/, '');
    return [base, stem + '.ts', stem + '.mts', stem + '.cts', base + '/index.ts'].filter(p => byPath.has(p));
  }
  function resolve(file, symbol, seen = []) {
    const key = file + '::' + symbol;
    if (seen.includes(key)) return { status: 'OPEN_EXPORT_CYCLE', trace: [...seen, key], definition_ids: [] };
    const m = byPath.get(file);
    if (!m) return { status: 'OPEN_MODULE_NOT_IN_CENSUS', trace: [...seen, key], definition_ids: [] };
    const direct = m.declarations.filter(d => d.top_level && d.name === symbol);
    if (direct.length) return { status: 'SOURCE_DEFINITION_CANDIDATE_NOT_TYPECHECKED', trace: [...seen, key], definition_ids: direct.map(d => d.id) };
    const exported = m.exports.filter(e => e.exported === symbol);
    for (const exp of exported) {
      if (exp.module) {
        const paths = target(file, exp.module);
        if (paths?.length === 1) return resolve(paths[0], exp.imported, [...seen, key]);
        return { status: 'OPEN_EXTERNAL_OR_AMBIGUOUS_EXPORT', trace: [...seen, key], definition_ids: [] };
      }
    }
    for (const imp of m.imports) for (const b of imp.bindings) {
      if (b.local !== symbol) continue;
      const paths = target(file, imp.module);
      if (paths?.length === 1) return resolve(paths[0], b.imported, [...seen, key]);
    }
    return { status: 'OPEN_UNRESOLVED_EXPORT_OR_DYNAMIC_BINDING', trace: [...seen, key], definition_ids: [] };
  }
  const index = byPath.get(PREFIX + 'index.ts');
  requireThat(!!index, 'SDK root index missing');
  const root = index.exports.map(exp => ({ name: exp.exported, type_only: exp.type_only, source: exp.source,
    module_specifier: exp.module, binding: exp.module ? (() => {
      const targets = target(index.path, exp.module);
      return targets?.length === 1 ? resolve(targets[0], exp.imported) : { status: 'OPEN_EXPORT_TARGET', trace: [], definition_ids: [] };
    })() : resolve(index.path, exp.imported),
    owner: 'DX100-D01', qualification: 'NOT_RUN', receipt: null }));
  requireThat(root.length === 34 && new Set(root.map(r => r.name)).size === 34 && root.map(r => r.name).sort().join('\0') === [...expectedNames].sort().join('\0'), '34 historical SDK root exports changed');
  const importEdges = modules.flatMap(m => m.imports.map(imp => ({ from: m.path, module: imp.module, source: imp.source,
    target_candidates: target(m.path, imp.module), bindings: imp.bindings,
    resolution: imp.module.startsWith('.') ? 'SOURCE_MODULE_CANDIDATE_NOT_LOADED' : 'EXTERNAL_NODE_OR_TOOL_BOUNDARY_OPEN' })));
  return { root, import_edges: importEdges };
}

function build() {
  const catalogPath = path.join(ROOT, contract.catalog.path);
  requireThat(sha(fs.readFileSync(catalogPath)) === contract.catalog.sha256, 'Catalog changed');
  requireThat(execFileSync('git', ['-C', UP, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() === PIN, 'Wrong pin');
  requireThat(!execFileSync('git', ['-C', UP, 'status', '--porcelain']).length, 'Dirty target');
  const tree = new Map();
  for (const row of execFileSync('git', ['-C', UP, 'ls-tree', '-r', '-z', PIN, '--', 'sdk/typescript']).toString().split('\0').filter(Boolean)) {
    const [head, file] = row.split('\t'), [mode, kind, blob] = head.split(' ');
    tree.set(file, { mode, kind, git_blob: blob });
  }
  const files = [...tree.keys()].filter(p => p.startsWith(PREFIX) && p.endsWith('.ts')).sort();
  requireThat(files.length === 10, 'Tracked TS source census changed');
  const sources = [], texts = new Map();
  for (const file of [...files, 'sdk/typescript/package.json']) {
    const raw = fs.readFileSync(path.join(UP, file));
    const oid = crypto.createHash('sha1').update(Buffer.from('blob ' + raw.length + '\0')).update(raw).digest('hex');
    requireThat(oid === tree.get(file).git_blob && ['100644', '100755'].includes(tree.get(file).mode), 'Source Git identity changed');
    sources.push({ path: file, sha256: sha(raw), bytes: raw.length, ...tree.get(file) });texts.set(file, raw.toString('utf8'));
  }
  const baselinePath = path.join(E, 'g01/component-surfaces/non-rust/inventory.json');
  const protectedRows = read(path.join(E, contract.previous_program_checkpoint.path)).files;
  requireThat(sha(fs.readFileSync(baselinePath)) === protectedRows.find(r => r.path === path.relative(ROOT, baselinePath)).sha256, 'Accepted language census changed');
  const baseline = read(baselinePath);
  const modules = files.map(file => sourceModule(file, texts.get(file)));
  const linked = linkExports(modules, baseline.typescript.map(r => r.name));
  const findFunction = (file, name) => {
    const found = modules.find(m => m.path === PREFIX + file).functions.filter(f => f.name === name);
    requireThat(found.length > 0, 'Named SDK rule source absent: ' + file + ':' + name);
    return found.map(f => f.id);
  };
  const sourceRules = [
    { id: 'TS-JSONL-DIALECT', functions: findFunction('thread.ts', 'runStreamedInternal'), requirements: ['CDX100-09-02', 'CDX100-09-03', 'CDX100-09-05'], rule: 'Headless CLI JSONL uses dotted event names; do not merge with Python app-server slash-method RPC. JSON parsing/casting is not runtime event schema validation.' },
    { id: 'TS-TURN-AGGREGATION', functions: findFunction('thread.ts', 'run'), requirements: ['CDX100-09-02', 'CDX100-09-03'], rule: 'run consumes item.completed/turn.completed/turn.failed; final response, items, usage, failure and absent terminal cases retain source branches.' },
    { id: 'TS-INPUT-NORMALIZATION', functions: findFunction('thread.ts', 'normalizeInput'), requirements: ['CDX100-09-04'], rule: 'String versus text/local_image list; text delimiter and image paths are source rules, not generic app-server Input equivalence.' },
    { id: 'TS-EXEC-LAUNCH', functions: findFunction('exec.ts', 'run'), requirements: ['CDX100-09-02', 'CDX100-09-05', 'CDX100-09-07', 'CDX100-09-08'], rule: 'exec --experimental-json argv, config precedence, resume, image flags, env/credential references, spawn signal, stdio/error/exit/finally are preserved. Source process dependency is reference behavior; native CVG candidate must not forward execution to installed Codex.' },
    { id: 'TS-STRUCTURED-OUTPUT', functions: findFunction('outputSchemaFile.ts', 'createOutputSchemaFile'), requirements: ['CDX100-09-04', 'CDX100-09-05'], rule: 'Temporary schema file creation/cleanup are source-bound, no files created by this audit. Schema serialization is not model output validation.' },
  ].map(r => ({ ...r, status: 'SOURCE_RULE_RUNTIME_ORACLE_OPEN', qualification: 'NOT_RUN' }));
  return { schema_version: 'cvg.codex100.typescript-sdk-contracts.v1', task: 'DX100-G01:TYPESCRIPT-PUBLIC-SDK-CONTRACTS',
    pin: PIN, parent_contract_sha256: CONTRACT, catalog_sha256: contract.catalog.sha256,
    analysis_tool: { name: 'TypeScript createSourceFile', version: ts.version, node: process.versions.node,
      files: contract.analysis_tools.typescript_files, upstream_declared_typescript: '^5.9.2',
      role: 'LOCAL_SYNTAX_ANALYSIS_ONLY_NOT_UPSTREAM_COMPILER_OR_RUNTIME', target_imports: 0, typecheck: false, emit: false },
    sources, modules, root_exports: linked.root, import_edges: linked.import_edges, source_rules: sourceRules,
    dialect: { transport: 'HEADLESS_CLI_EXPERIMENTAL_JSONL', event_names: 'dotted', python_equivalence: 'OPEN_DISTINCT_APP_SERVER_RPC_DIALECT', native_execution_forwarding: 'NOT_ACCEPTED_AS_NATIVE_IMPLEMENTATION' },
    baseline_root_exports_preserved: baseline.typescript.map(r => ({ name: r.name, baseline_sha256: objectHash(r), type_only: r.type_only })),
    mandatory_gaps: baseline.open_contracts,
    counts: { source_files: sources.length, TS_modules: modules.length, root_exports: linked.root.length,
      root_export_definitions_bound: linked.root.filter(r => r.binding.definition_ids.length > 0).length,
      declarations: modules.reduce((n,m) => n+m.declarations.length,0), functions_and_signatures: modules.reduce((n,m) => n+m.functions.length,0),
      fields: modules.reduce((n,m) => n+m.fields.length,0), type_syntax_nodes: modules.reduce((n,m) => n+m.type_syntax.length,0),
      source_calls: modules.reduce((n,m) => n+m.calls.length,0), imports: linked.import_edges.length, source_rules: sourceRules.length },
    limits: ['All declarations/bodies/aliases/defaults/modifiers/decorators/type expressions are syntax candidates. No typechecker, inheritance evaluation, runtime grammar, effect, stdio or semantic outcome proof.',
      'All ten tracked src TS modules retained. Public module exports beyond root are declarations with source context; private members are support, not omitted functional obligations.',
      'Existing six SDK gaps retain IDs. Source expansion does not authenticate packages/build/platform/Pydantic/Node or equate Python to TypeScript.',
      'Provider, shell/filesystem/stdin/AbortSignal/process lifecycle and generated schema behaviors need controlled G02 oracles; no target operation occurred.'],
    functional_receipts: 0, full_g01_closure: false };
}

function semanticSignature(module) {
  return { functions: module.functions.map(f => [f.name,f.kind,f.modifiers,f.async,f.parameters.map(p => [p.name,p.type_source,p.initializer_source,p.optional_token,p.rest_token]),f.return_type_source]),
    fields: module.fields.map(f => [f.name,f.name_kind,f.optional_token,f.type_source,f.initializer_source,f.literal_type_value]),
    exports: module.exports.map(e => [e.exported,e.imported,e.module,e.type_only]),
    calls: module.calls.map(c => [c.callee_source,c.argument_sources]),
    types: module.type_syntax.map(t => [t.kind,t.parts,t.type_name,t.type_arguments]) };
}

function main() {
  const fresh = build();requireThat(canonical(fresh) === canonical(build()), 'Nondeterministic TS evidence');
  const negatives = [];
  for (const [id, mutate] of [
    ['omit_root_export', v => v.root_exports.pop()], ['omit_class_method', v => v.modules.find(m => m.path.endsWith('/thread.ts')).functions.pop()],
    ['drop_source_limit', v => v.limits.pop()], ['fake_qualification', v => {v.functional_receipts=1;v.full_g01_closure=true;}],
    ['claim_compiler_proof', v => {v.analysis_tool.typecheck=true;}], ['merge_SDK_dialects', v => {v.dialect.python_equivalence='QUALIFIED_BY_TYPESCRIPT';}],
  ]) { const bad=structuredClone(fresh);mutate(bad);requireThat(canonical(bad)!==canonical(fresh),'Ineffective negative');negatives.push({id,result:'REJECTED_BY_EXACT_REGENERATION'}); }
  const fixtures = [
    ['default', 'export function f(x: string = "a") {}', 'export function f(x: string = "b") {}'],
    ['optional', 'export type T = { x?: string }', 'export type T = { x: string }'],
    ['async', 'export class C { async run() { return 1 } }', 'export class C { run() { return 1 } }'],
    ['alias', 'export { X as Y } from "./m";', 'export { X as Z } from "./m";'],
    ['return_type', 'export function f(): string { return "x" }', 'export function f(): number { return 1 }'],
    ['union', 'export type T = "a" | "b";', 'export type T = "a" | "c";'],
    ['cancel_call', 'async function f(s: AbortSignal) { spawn("x", { signal:s }) }', 'async function f(s: AbortSignal) { spawn("x", {}) }'],
    ['computed_member', 'export class C { [key]() { return 1; } }', 'export class C { fixed() { return 1; } }'],
  ];
  for (const [id,a,b] of fixtures) {
    const before=sourceModule('fixture.ts',a), after=sourceModule('fixture.ts',b);
    requireThat(canonical(semanticSignature(before))!==canonical(semanticSignature(after)),'Semantic syntax change invisible: '+id);
    negatives.push({id,result:'IN_MEMORY_SOURCE_AST_CHANGE_DETECTED_NOT_ONLY_HASH'});
  }
  const realChanges = [
    ['real_event_dialect', 'events.ts', '"turn.completed"', '"turn.completed.changed"'],
    ['real_exec_argv', 'exec.ts', '"--experimental-json"', '"--experimental-json-changed"'],
  ];
  for (const [id,file,from,to] of realChanges) {
    const text=fs.readFileSync(path.join(UP,PREFIX+file),'utf8');
    requireThat(text.includes(from), 'Real source fixture anchor missing: '+id);
    const before=sourceModule(PREFIX+file,text), after=sourceModule(PREFIX+file,text.replace(from,to));
    requireThat(canonical(semanticSignature(before))!==canonical(semanticSignature(after)), 'Real source semantic change invisible: '+id);
    negatives.push({id,result:'REAL_CORPUS_IN_MEMORY_SEMANTIC_AST_CHANGE_DETECTED'});
  }
  requireThat(fresh.modules.find(m=>m.path.endsWith('/thread.ts')).functions.some(f=>f.name==='constructor' && f.documented_internal),'Thread internal constructor annotation omitted');
  const computed=sourceModule('fixture.ts','export class C { [key]() {} #secret = 1; } export default function () { return 1; }');
  requireThat(computed.functions.some(f => f.name_kind==='COMPUTED_NAME_OPEN') && computed.functions.some(f=>f.name.startsWith('<anonymous@')) && computed.fields.some(f=>f.name_kind==='ECMASCRIPT_PRIVATE'),'Unknown/private/default syntax dropped');
  let rejected=false;try{sourceModule('invalid.ts','export class C { broken( {');}catch{rejected=true;}
  requireThat(rejected,'Malformed syntax silently accepted');
  const report={result:'PASS',kind:'T1_TYPESCRIPT_SYNTAX_SOURCE_ONLY',counts:fresh.counts,negative_controls:negatives,
    explicit_syntax_controls:['computed names retained OPEN','private identifiers retained support','anonymous default function retained','malformed parse rejected','real Thread constructor @internal retained separately from language visibility'],functional_receipts:0,full_g01_closure:false};
  for (const [name,value] of [['inventory.json',fresh],['verification.json',report]]) {
    const p=path.join(OUT,name), bytes=encoded(value);
    if(process.argv.includes('--check'))requireThat(fs.readFileSync(p).equals(bytes),'Regeneration differs: '+name);
    else fs.writeFileSync(p,bytes);
  }
  console.log(JSON.stringify(report));
}
main();
