const cp = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { syncBuiltinESMExports } = require('node:module');
const out = __dirname;
let sequence = 0;
const originalSpawnSync = cp.spawnSync;
cp.spawnSync = function(...args) {
  const observed = originalSpawnSync.apply(this, args);
  if (Array.isArray(args[1]) && args[1][0] === 'scripts/ci-bar.mjs' && args[1][1] === 'finalize') {
    const prefix = path.join(out, `child-${process.pid}-${++sequence}`);
    fs.writeFileSync(prefix + '.stdout.log', observed.stdout ?? '');
    fs.writeFileSync(prefix + '.stderr.log', observed.stderr ?? '');
    fs.writeFileSync(prefix + '.json', JSON.stringify({argv:[args[0],...args[1]],cwd:args[2]?.cwd,artifactDir:args[2]?.env?.CI_ARTIFACT_DIR,status:observed.status,signal:observed.signal,error:observed.error?.message,stdoutBytes:Buffer.byteLength(observed.stdout ?? ''),stderrBytes:Buffer.byteLength(observed.stderr ?? '')},null,2)+'\n');
  }
  return observed;
};
const originalExecFileSync = cp.execFileSync;
cp.execFileSync = function(...args) {
  try { return originalExecFileSync.apply(this,args); }
  catch (error) {
    if(args[0] === 'git') fs.writeFileSync(path.join(out, `git-error-${process.pid}-${++sequence}.json`), JSON.stringify({argv:[args[0],...args[1]],cwd:args[2]?.cwd,code:error.code,message:error.message,status:error.status,signal:error.signal,stdoutBytes:error.stdout?.length,stderrBytes:error.stderr?.length},null,2)+'\n');
    throw error;
  }
};
syncBuiltinESMExports();
