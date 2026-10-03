import fs from 'node:fs'
import path from 'node:path'
import {pathToFileURL} from 'node:url'
import {spawnSync} from 'node:child_process'
const [auditor,scratch,out]=process.argv.slice(2)
const {auditProductBoundary}=await import(pathToFileURL(auditor).href)
const original=JSON.parse(fs.readFileSync(path.join(scratch,'archive/boundary-probes.json'))).results.concat(JSON.parse(fs.readFileSync(path.join(scratch,'archive/boundary-probes-supplement.json'))).results)
const results=original.map(old=>{
 const root=path.join(scratch,'archive/fixtures',old.id)
 const audit=auditProductBoundary(root)
 const cli=spawnSync(process.execPath,[auditor,root],{encoding:'utf8',timeout:60000})
 const entry=fs.readdirSync(path.join(root,'packages/core/src')).find(f=>/^index\.(cjs|mjs)$/.test(f))
 const runtime=spawnSync(process.execPath,[path.join(root,'packages/core/src',entry)],{cwd:root,encoding:'utf8',timeout:10000})
 return {id:old.id,expectedReject:old.expectedReject,audit,cliExit:cli.status,cliStdout:cli.stdout,cliStderr:cli.stderr,runtimeExit:runtime.status,runtimeStdout:runtime.stdout.trim(),runtimeStderr:runtime.stderr.trim(),matchesExpected:audit.passed===!old.expectedReject&&cli.status===(old.expectedReject?1:0)}
})
const report={node:process.version,auditor,scratch,observedAt:new Date().toISOString(),results,matched:results.filter(r=>r.matchesExpected).length,total:results.length}
fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify({matched:report.matched,total:report.total,falsePasses:results.filter(r=>r.expectedReject&&r.audit.passed).map(r=>r.id)},null,2))
