import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import path from 'node:path'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import { ShiftStore } from '../clone/products/shift-assistant/src/store.ts'
import { ShiftAssistant } from '../clone/products/shift-assistant/src/assistant.ts'
import { WahaClient } from '../clone/products/shift-assistant/src/whatsapp.ts'
import { buildShiftServer } from '../clone/products/shift-assistant/src/server.ts'
const home=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const dir=fs.mkdtempSync(path.join(home,'probes/volumes/pv10-minimal-'))
const raw='Paciente Lua, ID 31415. Evolução: alerta.'
const at='2026-10-03T18:00:00Z', phone='5511900000001', secret='minimal-synthetic-secret-12345'
const bind=(server: any): Promise<string> => new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve('http://127.0.0.1:'+server.address().port)))
const close=(server: any): Promise<void> => new Promise(resolve=>{server.closeAllConnections();server.close(()=>resolve())})
const requests: any[]=[]
const receiver=createServer((req,res)=>{void(async()=>{let body='';for await(const c of req)body+=c;requests.push(JSON.parse(body));res.writeHead(201,{'content-type':'application/json'});res.end('{"id":"synthetic-receipt"}')})()})
const base=await bind(receiver)
const store=new ShiftStore(dir)
const client=new WahaClient({baseUrl:base,session:'p4',apiKey:'synthetic',fetch:(url,init)=>fetch(url,init)})
let organizerCalls=0
const assistant=new ShiftAssistant({store,whatsapp:client,members:[{phone,name:'Ana',manager:false},{phone:'5511900000009',name:'Manager',manager:true}],organizer:{async organize(){organizerCalls++;throw Object.assign(new Error('synthetic permanent rejection'),{code:'invalid_request'})}},transcriber:{async transcribe(){throw Error('text only')}},clock:()=>new Date(at)})
const server=buildShiftServer({store,assistant,whatsapp:client,webhookSecret:secret,clock:()=>new Date(at)})
const url=await bind(server)
let observed: any
try {
 const response=await fetch(url+'/webhooks/waha',{method:'POST',headers:{'content-type':'application/json','x-cvg-webhook-secret':secret},body:JSON.stringify({event:'message',session:'p4',payload:{id:'permanent',from:phone+'@c.us',body:raw}})})
 assert.equal(response.status,200);const ack=await response.json();await assistant.idle()
 const manifest=JSON.parse(fs.readFileSync(path.join(dir,'journal/manifest.json'),'utf8'))
 const transactions=manifest.segments.flatMap((s: any)=>fs.readFileSync(path.join(dir,s.path),'utf8').split('\n').filter(Boolean).map(l=>JSON.parse(l)))
 observed={criterion:'PV10',code:'invalid_request',expectedTerminalState:'review_required',actualTerminalState:store.inboxes()[0]!.state,ack,httpStatus:response.status,organizerCalls,inbox:store.inboxes()[0],note:store.notesV2()[0],derivedTasks:store.tasksV2(),requests,transactions,dir}
} finally {await assistant.stop();await close(server);await close(receiver);store.close()}
const reopened=new ShiftStore(dir)
observed.reopenedTerminalState=reopened.inboxes()[0]!.state
reopened.close()
fs.writeFileSync(path.join(dir,'reproducer-proof.json'),JSON.stringify(observed,null,2))
fs.writeFileSync(path.join(home,'logs/pv10-reproducer.json'),JSON.stringify(observed,null,2))
console.log(JSON.stringify(observed,null,2))
assert.equal(observed.actualTerminalState,'review_required','SPEC 0179 §6 permanent authorization/schema/limit failures require review_required')
