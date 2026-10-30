import { spawn } from 'node:child_process'
import { readdirSync, readlinkSync } from 'node:fs'
const members = (ns) => { const out=[]; for (const e of readdirSync('/proc')) { if(!/^\d+$/.test(e)) continue; try { if (readlinkSync(`/proc/${e}/ns/pid`)===ns) out.push(+e) } catch {} } return out }
const c = spawn('/usr/bin/bwrap', ['--ro-bind','/','/','--unshare-pid','--die-with-parent','--json-status-fd','3','--','/bin/sh','-c','(setsid sleep 60 &); sleep 60 & sleep 61'], { stdio: ['ignore','pipe','pipe','pipe'], detached: true })
let status=''
c.stdio[3].on('data', d => status += d)
await new Promise(r => setTimeout(r, 600))
console.log('status', status.trim())
const first = status.trim().split('\n')[0]; const info = JSON.parse(first)
const ns = `pid:[${info['pid-namespace']}]`
console.log('ns', ns, 'host ns', readlinkSync('/proc/self/ns/pid'), 'members', members(ns))
process.kill(-c.pid, 'SIGKILL')
await new Promise(r => c.on('close', r))
let t=Date.now(); while (members(ns).length && Date.now()-t<3000) await new Promise(r=>setImmediate(r))
console.log('after kill members', members(ns), 'ms', Date.now()-t)
console.log('status full', status.trim())
