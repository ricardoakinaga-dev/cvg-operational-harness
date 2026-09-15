import pg from '/home/ricardo/cvg-agent-secretary-v2/node_modules/pg/lib/index.js';
import {runPostgresMigrations, PostgresJourneyRepository} from '/tmp/cvg-m1-round2-ixwtdmce/candidate/packages/persistence/src/index.ts';
import {assertPostgresWorkerPreflight, WORKER_CRITICAL_TABLES} from '/tmp/cvg-m1-round2-ixwtdmce/candidate/apps/worker/src/postgres-role-preflight.ts';
const {Client,Pool}=pg;
const base='postgres://m1audit@127.0.0.1:55584/'; const tenant='tenant_00000000-0000-4000-8000-000000000821';
async function main(){
 const root=new Client({connectionString:base+'postgres'}); await root.connect(); await root.query('CREATE DATABASE m1critic'); await root.end();
 const admin=new Client({connectionString:base+'m1critic'});await admin.connect();await runPostgresMigrations(admin,{schemaName:'critic'});await admin.query('SET search_path TO critic');
 await admin.query(`INSERT INTO conversations(tenant_id,id,channel,sender_ref,sender_ref_hash,status,correlation_id,created_at,updated_at) VALUES($1,'conv_00000000-0000-4000-8000-000000000821','web','synthetic','fff','active','corr_00000000-0000-4000-8000-000000000821',now(),now())`,[tenant]);
 await admin.query(`INSERT INTO sessions(tenant_id,id,conversation_id,status,takeover_state,created_at,updated_at) VALUES($1,'sess_00000000-0000-4000-8000-000000000821','conv_00000000-0000-4000-8000-000000000821','active','BOT_ACTIVE',now(),now())`,[tenant]);
 const pool=new Pool({connectionString:base+'m1critic',max:2,options:'-c search_path=critic'});
 let arrivals=0;let unlock:any;const barrier=new Promise<void>(r=>unlock=r);
 const wrapped={connect:async()=>{const c=await pool.connect();return {query:async(sql:string,args?:any[])=>{if(sql.trim().startsWith('INSERT INTO tasks')){if(++arrivals===2)unlock();await barrier;}return c.query(sql,args)},release:(e?:Error)=>c.release(e)}}};
 const repo=new PostgresJourneyRepository(wrapped as never);
 const input={tenantId:tenant,sessionId:'sess_00000000-0000-4000-8000-000000000821',title:'synthetic task',description:'synthetic',idempotencyKey:'critic-race',auditContext:{actorType:'Operator',actorId:'operator.synthetic',correlationId:'corr_00000000-0000-4000-8000-000000000821'}};
 const results=await Promise.allSettled([repo.createJourneyTask(input as never),repo.createJourneyTask(input as never)]);
 console.log(JSON.stringify({case:'concurrent-task-same-key',results:results.map(r=>r.status==='fulfilled'?{status:r.status,id:r.value.id}:{status:r.status,code:r.reason.code,message:r.reason.message}),tasks:(await admin.query('SELECT count(*) FROM tasks')).rows,audit:(await admin.query('SELECT count(*) FROM audit_events')).rows}));
 await admin.query('CREATE ROLE m1critic_worker LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION');
 await admin.query('GRANT USAGE ON SCHEMA critic TO m1critic_worker');
 await admin.query(`GRANT SELECT,INSERT,UPDATE ON ${WORKER_CRITICAL_TABLES.map(t=>'critic.'+t).join(',')} TO m1critic_worker`);
 const rolepool=new Pool({connectionString:'postgres://m1critic_worker@127.0.0.1:55584/m1critic',options:'-c search_path=critic'});
 await assertPostgresWorkerPreflight(rolepool,{tenantId:tenant as never});console.log(JSON.stringify({case:'valid-preflight',result:'PASS'}));
 await admin.query('CREATE POLICY critic_allow_all ON critic.outbox_events FOR ALL USING (true) WITH CHECK (true)');
 await assertPostgresWorkerPreflight(rolepool,{tenantId:tenant as never});console.log(JSON.stringify({case:'unsafe-permissive-policy-preflight',accepted:true}));
 await admin.query('REVOKE SELECT,INSERT,UPDATE ON critic.outbox_effects FROM m1critic_worker');
 await assertPostgresWorkerPreflight(rolepool,{tenantId:tenant as never});console.log(JSON.stringify({case:'missing-effects-privilege-preflight',accepted:true}));
 await rolepool.end();await pool.end();await admin.end();
}
main().catch(e=>{console.error(e);process.exitCode=1});
