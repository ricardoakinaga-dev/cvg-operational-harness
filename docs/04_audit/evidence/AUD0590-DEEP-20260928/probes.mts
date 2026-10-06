import { writeFileSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { HmacWebhookVerifier, InMemoryWebhookReplayStore, createWebhookSignature } from '/tmp/cvg-aud0590-20260928/apps/api/src/webhook-security.ts';
import { buildServer } from '/tmp/cvg-aud0590-20260928/apps/api/src/server.ts';
import { createTrustedOperatorIdentityResolver, createTrustedOperatorIdentityToken } from '/tmp/cvg-aud0590-20260928/apps/api/src/operator-identity.ts';
import { OpenTelemetryTelemetry } from '/tmp/cvg-aud0590-20260928/packages/observability/src/otel.ts';
import { assertWebhookReplaySchema } from '/tmp/cvg-aud0590-20260928/apps/api/src/tenant-preflight.ts';
import pg from '/tmp/cvg-aud0590-20260928/node_modules/pg/lib/index.js';
const root='/tmp/cvg-aud0590-20260928';const evidence='/tmp/cvg-aud0590-evidence-20260928';
const result:any={scope:'synthetic-local-only',realData:false,externalEffects:false,checks:{}};
let now=1800000000000;
const key='aud0590-synthetic-webhook-key-abcdefghijklmnop';
const store=new InMemoryWebhookReplayStore(()=>now);
const verifier=new HmacWebhookVerifier({secret:key,replayStore:store,now:()=>now,toleranceSeconds:300});
const signed={eventId:'aud0590-future',timestampSeconds:Math.floor(now/1000)+299,channel:'chatwoot',body:{message:'synthetic'}};
const headers={'x-cvg-webhook-id':signed.eventId,'x-cvg-webhook-timestamp':String(signed.timestampSeconds),'x-cvg-webhook-signature':createWebhookSignature(key,signed)};
const input={channel:signed.channel,body:signed.body,headers};
const first=await verifier.verify(input);const immediateReplay=await verifier.verify(input);now+=301000;const delayedReplay=await verifier.verify(input);
result.checks.futureTimestampReplay={first,immediateReplay,delayedReplay,advanceMs:301000,signatureFutureSeconds:299,expectedDelayedReplay:false};
assert.deepEqual([first,immediateReplay,delayedReplay],[true,false,true]);
const identity={operatorId:'operator.aud0590',role:'Supervisor',tenantId:'tenant_00000000-0000-4000-8000-000000000590'};
const resolver=createTrustedOperatorIdentityResolver({secret:key,now:()=>now});
const token=createTrustedOperatorIdentityToken(identity as never,key,()=>now,120);
const app=buildServer({identityMode:'trusted',operatorIdentityResolver:resolver});
try{
 await app.ready();const r=await app.inject({method:'GET',url:'/v1/session',headers:{'x-cvg-operator-token':token}});
 result.checks.missingSessionStore={status:r.statusCode,error:r.json().error,oidcStartRegistered:app.hasRoute({method:'GET',url:'/v1/auth/oidc/start'}),oidcCallbackRegistered:app.hasRoute({method:'GET',url:'/v1/auth/oidc/callback'})};
 assert.equal(r.statusCode,503);
}finally{await app.close();}
const captured:any[]=[];
const span={spanContext:()=>({traceId:'00000000000000000000000000000590',spanId:'0000000000000590',traceFlags:1}),setAttribute:(k:any,v:any)=>captured.push({operation:'setAttribute',key:k,value:v}),setStatus:()=>{},end:()=>{}};
const tracer={startSpan:(name:any,options:any)=>{captured.push({operation:'startSpan',name,attributes:options.attributes});return span;}};
const telemetry=new OpenTelemetryTelemetry({tracer:tracer as never});
const active=telemetry.startSpan('aud0590-probe',{authorization:'AUD0590_SYNTHETIC_MARKER'});
active.setAttribute('api_key','AUD0590_SYNTHETIC_MARKER');active.end();
result.checks.otelBoundary={externalSdkInput:captured,localFallback:telemetry.spans(),expected:'sensitive keys redacted before every SDK call',defaultApiUsesThisAdapter:false};
assert.equal(captured[0].attributes.authorization,'AUD0590_SYNTHETIC_MARKER');
const db=new pg.Client({connectionString:'postgresql://postgres:cvg_aud0590_synthetic@127.0.0.1:55590/cvg_audit'});
await db.connect();
try{
 await db.query('BEGIN');await db.query('CREATE SCHEMA aud0590_preflight');await db.query('SET LOCAL search_path TO aud0590_preflight');
 await db.query(`CREATE TABLE webhook_replay_events(event_key text PRIMARY KEY CHECK(btrim(event_key) <> ''),status text NOT NULL CHECK(status IN ('reserved','committed')),expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now());CREATE INDEX idx_webhook_replay_events_expires ON webhook_replay_events(expires_at)`);
 await db.query(readFileSync(root+'/packages/persistence/migrations/0025_webhook_replay_fencing.sql','utf8'));
 await assertWebhookReplaySchema(db as never);const baselineAccepted=true;
 await db.query('ALTER TABLE webhook_replay_events DROP CONSTRAINT webhook_replay_events_fencing_check');
 let missingRejected=false;try{await assertWebhookReplaySchema(db as never);}catch{missingRejected=true;}
 await db.query('CREATE TABLE decoy_fencing(value integer CONSTRAINT webhook_replay_events_fencing_check CHECK(value >= 0))');
 let decoyAccepted=true;try{await assertWebhookReplaySchema(db as never);}catch{decoyAccepted=false;}
 await db.query('DROP TABLE decoy_fencing');await db.query('ALTER TABLE webhook_replay_events ADD CONSTRAINT webhook_replay_events_fencing_check CHECK(true)');
 let tautologyAccepted=true;try{await assertWebhookReplaySchema(db as never);}catch{tautologyAccepted=false;}
 result.checks.fencingPreflight={baselineAccepted,missingRejected,decoyAccepted,tautologyAccepted,expectedDecoyAccepted:false,expectedTautologyAccepted:false};
 assert.deepEqual([baselineAccepted,missingRejected,decoyAccepted,tautologyAccepted],[true,true,true,true]);
}finally{await db.query('ROLLBACK');const q=await db.query("SELECT count(*)::int AS count FROM pg_namespace WHERE nspname='aud0590_preflight'");result.syntheticSchemaRemaining=q.rows[0].count;await db.end();}
result.sources=['apps/api/src/webhook-security.ts','apps/api/src/server.ts','apps/api/src/tenant-preflight.ts','packages/observability/src/otel.ts','packages/persistence/migrations/0025_webhook_replay_fencing.sql'].map(path=>({path,sha256:createHash('sha256').update(readFileSync(root+'/'+path)).digest('hex')}));
writeFileSync(evidence+'/probes.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
