import fs from 'node:fs';
const q=JSON.parse(fs.readFileSync(0,'utf8'));
const t=await import(q.module);
const value=t[q.method](...q.args);
process.stdout.write(JSON.stringify(value));
