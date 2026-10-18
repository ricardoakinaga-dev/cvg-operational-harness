import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { writeFileSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const base = fileURLToPath(new URL('.', import.meta.url));
const [label, command] = process.argv.slice(2);
if (!/^[a-z0-9-]+$/.test(label ?? '') || !command) throw new Error('label/command required');
const startedAt = new Date().toISOString();
const result = spawnSync('/bin/bash', ['-c', command], {
  cwd: process.cwd(), env: { ...process.env, PATH: '/home/ricardo/.nvm/versions/node/v22.23.2/bin:' + process.env.PATH },
  encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: 55000,
});
const hashes = {};
for (const name of ['stdout', 'stderr']) {
  const content = result[name] ?? '';
  writeFileSync(base + label + '.' + name + '.log', content);
  hashes[name] = createHash('sha256').update(content).digest('hex');
  (name === 'stdout' ? process.stdout : process.stderr).write(content);
}
const record = { label, command, startedAt, finishedAt: new Date().toISOString(), exit: result.status, signal: result.signal, error: result.error?.message ?? null, hashes };
writeFileSync(base + label + '.json', JSON.stringify(record, null, 2) + '\n');
appendFileSync(base + 'commands.jsonl', JSON.stringify(record) + '\n');
process.exit(result.status ?? 1);
