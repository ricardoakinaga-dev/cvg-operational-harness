import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { strict as assert } from 'node:assert'
import { reviewedNodeProfile, reviewedNodeRuntimeFiles } from './candidate/tests/helpers/aud0625-node-process-profile.ts'
import { runContained } from './candidate/packages/sandbox/src/run.ts'
import { createShellTool } from './candidate/packages/sandbox/src/shell-tool.ts'
async function main() {
 const base=mkdtempSync(join(process.env.CVG_AUD0625_FIXTURE_ROOT!, 'qualified-'))
 try {
 const workspace=join(base,'workspace');mkdirSync(workspace);const outside=join(base,'outside');writeFileSync(outside,'OWNED-EXTERNAL');writeFileSync(join(workspace,'inside'),'OWNED-INTERNAL')
 const profile=reviewedNodeProfile(workspace)
 const request={processProfile:profile,handle:{mode:'PROCESS' as const, workspaceRoot:workspace,allowNetwork:false,allowSubprocess:true},timeoutMs:2000,argv:[process.execPath,'-e','const fs=require("node:fs");let denied=false;try{fs.readFileSync(process.argv[1])}catch(e){if(!["ENOENT","EACCES","EPERM"].includes(e.code))throw e;denied=true}fs.writeFileSync("result","OWNED-WRITE");process.stdout.write(JSON.stringify({inside:fs.readFileSync("inside","utf8"),denied,keys:Object.keys(process.env).sort()}))',outside]}
 const actual=await runContained(request);assert.equal(actual.exitCode,0,actual.stderr);const observed=JSON.parse(actual.stdout);assert.equal(observed.inside,'OWNED-INTERNAL');assert.equal(observed.denied,true);assert.deepEqual(observed.keys,['HOME','LANG','LC_ALL','PATH','PWD','TMPDIR','TZ']);assert.equal(readFileSync(join(workspace,'result'),'utf8'),'OWNED-WRITE')
 console.log(JSON.stringify({scope:'Linux local Node22 reviewed profile; this owned workspace digest only; not target image/rollout qualification',profileDigest:profile.digest,toolVersion:createShellTool({workspaceRoot:workspace,processProfile:profile}).version,nodeVersion:process.version,bwrapSha256:createHash('sha256').update(readFileSync('/usr/bin/bwrap')).digest('hex'),runtimeFiles:reviewedNodeRuntimeFiles(),observed,exitCode:actual.exitCode,fixturesRemovedOnExit:true},null,2))
 } finally {rmSync(base,{recursive:true,force:true})}
}
main().catch(e=>{console.error(e);process.exitCode=1})
