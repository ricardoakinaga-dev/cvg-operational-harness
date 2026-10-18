import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
const root = '/tmp/cvg-pare100-exec-20261014-6az3hlay/worktree';
const out = new URL('.',import.meta.url);
const results = [];
for (const maxBuffer of [undefined, 16*1024*1024]) {
  try {
    const bytes = execFileSync('git',['ls-files','-co','--exclude-standard','-z'],{cwd:root,...(maxBuffer === undefined ? {} : {maxBuffer})});
    results.push({maxBuffer: maxBuffer ?? 'Node default (1048576 bytes)',result:'success',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
  } catch(error) {
    results.push({maxBuffer:maxBuffer ?? 'Node default (1048576 bytes)',result:'threw',code:error.code,message:error.message,status:error.status,signal:error.signal,stdoutBytes:error.stdout?.length});
  }
}
fs.writeFileSync(new URL('git-buffer-probe.json',out),JSON.stringify({node:process.version,execPath:process.execPath,results},null,2)+'\n');
process.stdout.write(JSON.stringify(results,null,2)+'\n');
