import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const base = fileURLToPath(new URL('.', import.meta.url));
const ownSources = [
  'packages/sdk/src/client.ts', 'packages/sdk/src/server.ts', 'packages/sdk/src/index.ts',
  'packages/sdk/src/stdio.ts', 'packages/sdk/src/validators.ts',
  'packages/sdk/src/__tests__/stdio.test.ts', 'packages/sdk/src/__tests__/stdio-validators.test.ts',
  'examples/consumers/sdk-stdio/child.mts', 'examples/consumers/sdk-stdio/index.mts', 'examples/consumers/sdk-stdio/README.md'
];
const describe = (path) => {
  const raw = readFileSync(resolve(path));
  return { path, bytes: raw.length, sha256: createHash('sha256').update(raw).digest('hex') };
};
const spec = describe('docs/02_spec/0211_pare100_sdk_stdio_transport.md');
if (spec.sha256 !== 'ae109b33a8457869d0939bb3f32557b8f8d5e8d5054fa1e141ab5c896b508a7f') throw new Error('Approved SPEC drift');
const records = readdirSync(base).filter((file) => file.endsWith('.json') && !['claim.json', 'capacity-recovery.json', 'source-manifest.json', 'evidence-integrity.json', 'verification.json', 'bootstrap.json'].includes(file));
let checkedLogs = 0;
const emptyLogs = [];
for (const file of records) {
  const record = JSON.parse(readFileSync(base + file, 'utf8'));
  if (!record.hashes || !record.label) continue;
  for (const channel of ['stdout', 'stderr']) {
    const path = base + record.label + '.' + channel + '.log';
    const observation = describe(path);
    if (observation.sha256 !== record.hashes[channel]) throw new Error('Raw log changed: ' + path);
    checkedLogs++;
    if (!observation.bytes) emptyLogs.push({ ...observation, classification: 'ACTUAL_ZERO_BYTE_COMMAND_LOG', exit: record.exit });
  }
}
writeFileSync(base + 'source-manifest.json', JSON.stringify({ scope: 'Builder E only', spec, files: ownSources.map(describe) }, null, 2) + '\n');
writeFileSync(base + 'evidence-integrity.json', JSON.stringify({ checkedLogs, logHashMatches: true, emptyLogs }, null, 2) + '\n');
console.log(JSON.stringify({ ownFiles: ownSources.length, specSha256: spec.sha256, checkedLogs, logHashMatches: true, emptyLogCount: emptyLogs.length }));
