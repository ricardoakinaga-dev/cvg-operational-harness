import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

// Standalone synthetic observer, independent of Vitest fixture/assertion code.
// Candidate ASTs are parsed, never imported as modules or evaluated as guests.
const helper = path.resolve(process.argv[2] ?? 'scripts/reference-contract-catalog.mjs')
const { extractTypeScriptContracts, collectReferenceCatalog } = await import(pathToFileURL(helper))
const sha = (x) => crypto.createHash('sha256').update(x).digest('hex')
const extract = (text) => {
  const rows = []
  extractTypeScriptContracts(text, (kind, symbol, shape) => rows.push({ kind, symbol, shape }))
  return rows
}
const program = 'throw/WITNESS_R13/'
const name = 'throw 0'
const payload = { [program]: true }
const tsPayload = extract(`export const Payload = { ${JSON.stringify(program)}: true };`)
const tsMirror = extract(`export const Source = ${JSON.stringify(program)} + ''; export type Mirror = ${JSON.stringify(program)}; new Worker(Source, { eval: true });`)
const tsName = extract(`export interface Events { ${JSON.stringify(name)}(): void }`)
const root = fs.mkdtempSync(path.resolve('docs/04_audit/evidence/PARE100-EXEC-20261014/reference/role-r13/.witness-'))
let checks
try {
  const source = 'packages/core/example/src/worker.schema.json'
  const manifest = 'packages/core/example/package.json'
  const files = {
    'package.json': JSON.stringify({ name: '@synthetic/root', version: 'fixture-v1' }),
    [manifest]: JSON.stringify({ name: '@synthetic/example', version: 'fixture-v1' }),
    [source]: JSON.stringify({ name, type: 'object', default: payload })
  }
  for (const [file, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    fs.writeFileSync(path.join(root, file), text)
  }
  const git = (args, input) => execFileSync('git', ['-C', root, ...args], {
    input, encoding: 'utf8', env: { ...process.env,
      GIT_AUTHOR_NAME: 'Synthetic', GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
      GIT_COMMITTER_NAME: 'Synthetic', GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
      GIT_AUTHOR_DATE: '2026-10-14T00:00:00Z', GIT_COMMITTER_DATE: '2026-10-14T00:00:00Z' }
  }).trim()
  git(['init', '-q', '-b', 'main'])
  git(['add', '--', ...Object.keys(files)])
  const commit = git(['commit-tree', git(['write-tree'])], 'synthetic observer fixture\n')
  git(['update-ref', 'refs/heads/main', commit])
  const catalog = collectReferenceCatalog({ root, expectedCommit: commit, expectedVersion: 'fixture-v1', ownerMap: {
    reference_commit: commit, reference_version: 'fixture-v1', inventory_coverage: { packages: 1, families: 1 },
    family_owners: { core: 'P100-012' }, package_owners: [{ reference_package: '@synthetic/example', manifest,
      manifest_sha256: sha(files[manifest]), group: 'core', owner_task: 'P100-012' }], additional_surfaces: []
  } })
  const entry = catalog.entries.find((item) => item.kind === 'json-schema-data')
  const projected = entry.shape.default
  const value = tsMirror.find((row) => row.symbol === 'Source').shape.declarations[0].value
  const mirror = tsMirror.find((row) => row.symbol === 'Mirror').shape.declarations[0].type
  checks = {
    json_payload_object_unknown: projected.status === 'UNKNOWN' && projected.value_sha256 === sha(JSON.stringify(payload)) && projected.byte_length === Buffer.byteLength(JSON.stringify(payload)),
    json_payload_key_absent: !JSON.stringify(entry).includes(program),
    ts_payload_key_unknown: tsPayload[0].shape.declarations[0].value.properties[0].name.status === 'UNKNOWN',
    ts_mirrored_type_unknown: mirror.status === 'UNKNOWN' && mirror.literals.some((x) => x.value_sha256 === sha(program)),
    ts_dynamic_initializer_literal_digest_retained: !!value.literals?.some((x) => x.value_sha256 === sha(program)),
    ts_declaration_exact_name: tsName.find((row) => row.kind === 'event-vocabulary').shape.declarations[0].declared_name === name,
    json_declaration_exact_name: entry.shape.name === name,
    enclosing_requirement_retained: entry.owner_task === 'P100-012' && entry.source === source && entry.source_sha256 === sha(files[source]) && entry.parity_status === 'NOT_VERIFIED'
  }
} finally {
  fs.rmSync(root, { recursive: true, force: true })
}
console.log(JSON.stringify({ helper_sha256: sha(fs.readFileSync(helper)), checks, boundary: 'I0 executable synthetic observer; no independent I1 or real-reference claim' }, null, 2))
process.exitCode = Object.values(checks).every(Boolean) ? 0 : 1
