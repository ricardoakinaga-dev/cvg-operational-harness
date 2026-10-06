import { createServer } from 'node:http'
import { writeFileSync } from 'node:fs'
import { OpenAICompatibleProvider } from './snapshot/packages/model-gateway/src/providers/openai-compatible.ts'
import { ModelOrganizer } from './snapshot/apps/worker/src/shift-assistant/organizer.ts'
const payload = JSON.stringify({ choices: [{message:{content:'{}'}}], padding:'x'.repeat(1024 * 1024) })
let serverFinished = false
let bytesWritten = 0
const server = createServer((req, res) => {
 req.resume()
 res.writeHead(200, {'content-type':'application/json'})
 for(let offset=0; offset<payload.length;offset+=16384){const part=payload.slice(offset,offset+16384);res.write(part);bytesWritten+=Buffer.byteLength(part)}
 res.end();res.on('finish',()=>{serverFinished=true})
})
await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve))
const address=server.address();if(!address || typeof address==='string')throw new Error('missing port')
const provider = new OpenAICompatibleProvider({id:'audit-receive-limit',baseUrl:`http://127.0.0.1:${address.port}/v1`,model:'synthetic',location:'local',allowHttp:true,allowPrivateNetworks:true,requiresApiKey:false,maxResponseBytes:1024})
let rejection:string|null=null
try {await new ModelOrganizer(provider,'synthetic').organize('Anotação fictícia',new Date('2026-10-02T17:00:00Z'))} catch(error){rejection=error instanceof Error?error.message:String(error)}
await new Promise<void>(resolve=>server.close(()=>resolve()))
const result={id:'P12',invariant:'Response limit is enforced while receiving, before buffering the entire response',outcome:bytesWritten>1024 && serverFinished && rejection?'VIOLATED':'NOT_REPRODUCED',maxResponseBytes:1024,bytesWritten,serverFinished,rejection,limitation:'1 MiB loopback response; confirms late rejection, not an OOM test'}
writeFileSync('/tmp/cvg-aud0594-20261002/evidence/receive-limit.json',JSON.stringify(result,null,2)+'\n')
console.log(JSON.stringify(result,null,2))
