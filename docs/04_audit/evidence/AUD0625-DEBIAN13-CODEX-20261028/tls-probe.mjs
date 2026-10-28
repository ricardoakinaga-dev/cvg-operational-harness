import https from 'node:https'
import assert from 'node:assert/strict'
let raw='';for await(const chunk of process.stdin)raw+=chunk
const f=JSON.parse(raw)
for(const key of ['NODE_OPTIONS','NODE_EXTRA_CA_CERTS','NODE_USE_SYSTEM_CA','NODE_TLS_REJECT_UNAUTHORIZED','SSL_CERT_DIR']) assert.equal(process.env[key],undefined,key)
assert.equal(process.env.SSL_CERT_FILE,'/etc/ssl/certs/ca-certificates.crt','distroless stock path only')
async function request(server,options){
  const address=server.address()
  return await new Promise(resolve=>{
    const req=https.request({host:'127.0.0.1',port:address.port,servername:'cvg-c26.invalid',rejectUnauthorized:true,...options},res=>{
      const authorized=res.socket.authorized;let body='';res.on('data',c=>body+=c);res.on('end',()=>resolve({status:res.statusCode,authorized,body,accepted:true}))
    });req.on('error',e=>resolve({accepted:false,error:e.code}));req.setTimeout(5000,()=>req.destroy(Object.assign(new Error('probe timeout'),{code:'PROBE_TIMEOUT'})));req.end()
  })
}
function validate(row,expected){
  if(expected==='POSITIVE'){assert.equal(row.accepted,true);assert.equal(row.authorized,true);assert.equal(row.status,200);assert.equal(row.body,'CVG-C26-SYNTHETIC-TLS')}
  else{assert.equal(row.accepted,false);assert.ok(expected.includes(row.error),'Unexpected TLS error '+row.error)}
}
async function server(cert,fn){
  const s=https.createServer({key:f.key,cert},(_req,res)=>res.end('CVG-C26-SYNTHETIC-TLS'));s.on('tlsClientError',()=>{})
  await new Promise((resolve,reject)=>{s.once('error',reject);s.listen(0,'127.0.0.1',resolve)})
  try{return await fn(s)}finally{await new Promise(resolve=>s.close(resolve));assert.equal(s.listening,false)}
}
const rows=[]
await server(f.leaf,async s=>{
  rows.push({name:'positive',...(await request(s,{ca:f.ca})),expected:'POSITIVE'})
  rows.push({name:'default-bundled-without-fixture-CA',...(await request(s,{})),expected:['UNABLE_TO_VERIFY_LEAF_SIGNATURE','SELF_SIGNED_CERT_IN_CHAIN']})
  rows.push({name:'different-CA',...(await request(s,{ca:f.otherCa})),expected:['UNABLE_TO_VERIFY_LEAF_SIGNATURE','SELF_SIGNED_CERT_IN_CHAIN']})
  rows.push({name:'wrong-hostname',...(await request(s,{ca:f.ca,servername:'other.invalid'})),expected:['ERR_TLS_CERT_ALTNAME_INVALID']})
})
await server(f.expired,async s=>rows.push({name:'expired',...(await request(s,{ca:f.ca})),expected:['CERT_HAS_EXPIRED']}))
let mutationsRejected=0
for(const row of rows){validate(row,row.expected);if(row.expected!=='POSITIVE'){assert.throws(()=>validate({accepted:true,authorized:true,status:200,body:'CVG-C26-SYNTHETIC-TLS'},row.expected));mutationsRejected++}}
console.log(JSON.stringify({kind:'c26-tls-probe',status:'PASS',rows,negativeAuthorizedMutantsRejected:mutationsRejected,serversClosed:true}))
