import fs from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const cwd = '/tmp/cvg-pare100-exec-20261014-6az3hlay/worktree';
const base = new URL('.', import.meta.url);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const results = [];
for (const [label,args] of [['tracked',['ls-files','-z']],['listed',['ls-files','-co','--exclude-standard','-z']]]) {
  const reference = phase => {
    const target = new URL(`${label}.${phase}.paths.z`,base);
    const fd = fs.openSync(target,'w');
    let observed;
    try { observed = spawnSync('git',args,{cwd,stdio:['ignore',fd,'pipe']}); }
    finally { fs.closeSync(fd); }
    if (observed.status !== 0 || observed.error) throw observed.error ?? new Error(`git status ${observed.status}`);
    return fs.readFileSync(target);
  };
  const before = reference('reference-before');
  const actual = execFileSync('git',args,{cwd,maxBuffer:16*1024*1024});
  fs.writeFileSync(new URL(`${label}.16mib.paths.z`,base),actual);
  const after = reference('reference-after');
  let defaultResult;
  try { const b=execFileSync('git',args,{cwd});defaultResult={result:'success',bytes:b.length,sha256:sha256(b)}; }
  catch(error) { defaultResult={result:'throws',code:error.code,message:error.message,stdoutBytes:error.stdout?.length}; }
  results.push({argv:['git',...args],maxBuffer:16*1024*1024,exit:0,bytes:actual.length,paths:actual.toString('utf8').split('\0').filter(Boolean).length,sha256:sha256(actual),referenceBeforeSha256:sha256(before),referenceAfterSha256:sha256(after),referencesStable:before.equals(after),byteIdenticalToFileBackedGitBefore:actual.equals(before),byteIdenticalToFileBackedGitAfter:actual.equals(after),endsWithNul:actual.at(-1)===0,defaultResult});
}
const pass=results.every(r=>r.referencesStable && r.byteIdenticalToFileBackedGitBefore && r.byteIdenticalToFileBackedGitAfter && r.endsWithNul);
const report={node:process.version,execPath:process.execPath,cwd,method:'File-backed Git stdout has no in-memory capture limit; references bracket each unchanged Git argv with 16MiB capture',pass,results};
fs.writeFileSync(new URL('inventory-probe.json',base),JSON.stringify(report,null,2)+'\n');
process.stdout.write(JSON.stringify(report,null,2)+'\n');
process.exitCode=pass?0:1;
