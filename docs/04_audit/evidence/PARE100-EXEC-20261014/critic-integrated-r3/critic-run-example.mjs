import assert from 'node:assert/strict'
import { runSdkStdioExample } from './critic-compiled-example/index.mjs'
const r = await runSdkStdioExample()
assert.equal(r.hello.protocolVersion, 1)
assert.equal(r.turn.stopReason,'COMPLETED')
assert.equal(r.turn.toolCalls,0)
assert.equal(r.events.length,6)
assert.ok(r.events.every(e=>e.tenantId==='sdk_stdio_synthetic'))
console.log(JSON.stringify({compiledExample:true,sourceAliases:false,sessionId:r.session.sessionId,stopReason:r.turn.stopReason,eventTypes:r.events.map(e=>e.type),stderr:r.stderr}))
