import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { HmacWebhookVerifier, InMemoryWebhookReplayStore, createWebhookSignature } from '../apps/api/src/webhook-security.ts'
import { buildServer } from '../apps/api/src/server.ts'
import { createTrustedOperatorIdentityResolver, createTrustedOperatorIdentityToken } from '../apps/api/src/operator-identity.ts'
let now=1800000000000
const key='aud0591-synthetic-key-abcdefghijklmnopqrstuvwxyz'
const store=new InMemoryWebhookReplayStore(()=>now)
const verifier=new HmacWebhookVerifier({secret:key,replayStore:store,now:()=>now,toleranceSeconds:300})
const signed={eventId:'aud0591-future',timestampSeconds:Math.floor(now/1000)+299,channel:'chatwoot',body:{message:'synthetic'}}
const input={channel:signed.channel,body:signed.body,headers:{'x-cvg-webhook-id':signed.eventId,'x-cvg-webhook-timestamp':String(signed.timestampSeconds),'x-cvg-webhook-signature':createWebhookSignature(key,signed)}}
const first=await verifier.verify(input),immediateReplay=await verifier.verify(input);now+=301000;const delayedReplay=await verifier.verify(input)
assert.deepEqual([first,immediateReplay,delayedReplay],[true,false,false])
now-=2000;const regressed=await verifier.verify({...input,headers:{...input.headers,'x-cvg-webhook-id':'other'}})
const identity={operatorId:'operator.aud0591',role:'Supervisor',tenantId:'tenant_00000000-0000-4000-8000-000000000591'} as const
const resolver=createTrustedOperatorIdentityResolver({secret:key,now:()=>now})
const token=createTrustedOperatorIdentityToken(identity,key,()=>now,120)
const app=buildServer({identityMode:'trusted',operatorIdentityResolver:resolver})
await app.ready()
const missingStore=await app.inject({method:'GET',url:'/v1/session',headers:{'x-cvg-operator-token':token}})
const routes={oidcStart:app.hasRoute({method:'GET',url:'/v1/auth/oidc/start'}),oidcCallback:app.hasRoute({method:'GET',url:'/v1/auth/oidc/callback'})}
await app.close();assert.equal(missingStore.statusCode,503)
const paths=['apps/api/src/webhook-security.ts','apps/api/src/server.ts','apps/api/src/operator-session-hook.ts']
const result={scope:'synthetic-memory-no-external-effects',futureTimestampReplay:{observed:[first,immediateReplay,delayedReplay],criterion:'delayed replay rejected',verdict:'PASS',limitations:'not durable clock or PostgreSQL restart'},regressedRequest:{observed:regressed,limitations:'header id differs from signature; not an independent clock negative'},missingSessionStore:{status:missingStore.statusCode,criterion:'no store fails closed',verdict:'PASS',functionalGap:true,...routes},sources:paths.map(path=>({path,sha256:createHash('sha256').update(readFileSync(path)).digest('hex')}))}
writeFileSync('/tmp/cvg-aud0591-20260930/evidence/boundary-probes.json',JSON.stringify(result,null,2)+'\n')
console.log(JSON.stringify(result))
