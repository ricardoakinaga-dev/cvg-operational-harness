// Ordinary synthetic stream lifecycle regression. No OS security or external IO.
import { PassThrough, Writable } from 'node:stream'
import { describe, it, expect } from 'vitest'
import { serveStdioSdk, type JsonRpcRequest, type JsonRpcResponse } from '@cvg/sdk'
const tick = () => new Promise<void>((resolve) => setImmediate(resolve))
const capabilities = {sessions:false,events:false,methods:['sdk.hello','turn.send'] as const}
const hello = (id:number) => ({jsonrpc:'2.0',id,method:'sdk.hello',params:{protocolVersion:1}})
const reply = (id:number|string):JsonRpcResponse => ({jsonrpc:'2.0',id,result:{protocolVersion:1,capabilities}})
describe('critic R2 accepted queue after input transport loss', () => {
  for (const exhausted of [false,true]) for (const failure of ['end','error','close'] as const) {
    it(`lifetime exhausted=${exhausted}, input ${failure}: no later dispatch`, async () => {
      const input = new PassThrough(); const writes: string[]=[]; const dispatchIds:(string|number)[]=[]; const errors:unknown[]=[]
      input.on('error',()=>{})
      const output = new Writable({write(chunk,_encoding,callback){writes.push(chunk.toString());callback()}})
      output.on('error',()=>{})
      let resolveFirst!:(r:JsonRpcResponse)=>void
      const serving=serveStdioSdk({input,output,closeTimeoutMs:20,maxLifetimeRequests:exhausted?2:10,onError:(e)=>errors.push(e),server:{capabilities,dispatch:(req:JsonRpcRequest)=>{dispatchIds.push(req.id);return req.id===1?new Promise<JsonRpcResponse>((resolve)=>{resolveFirst=resolve}):Promise.resolve(reply(req.id))}}})
      let closed=false; void serving.closed.then(()=>{closed=true})
      input.write(Buffer.from((exhausted?[1,2,3]:[1,2]).map(id=>JSON.stringify(hello(id))+'\n').join('')))
      if(failure==='end')input.end()
      if(failure==='error')input.destroy(new Error('synthetic input failure'))
      if(failure==='close')input.destroy()
      await tick();await tick()
      const closedBeforeCompletion=closed
      resolveFirst(reply(1));await tick();await tick()
      const observation={exhausted,failure,closedBeforeCompletion,dispatchIds:[...dispatchIds],responseIds:writes.map(w=>JSON.parse(w).id),errors}
      console.log(JSON.stringify(observation))
      await serving.close();input.destroy();output.destroy()
      expect(observation.closedBeforeCompletion,'transport loss must close immediately').toBe(true)
      expect(observation.dispatchIds,'accepted queued request must be discarded after IO failure').toEqual([1])
      expect(observation.responseIds).toEqual([])
    })
  }
})
