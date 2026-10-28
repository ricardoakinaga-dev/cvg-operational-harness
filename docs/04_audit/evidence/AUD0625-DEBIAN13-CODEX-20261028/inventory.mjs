import fs from 'node:fs'
import path from 'node:path'
import tls from 'node:tls'
import crypto from 'node:crypto'
import { createRequire } from 'node:module'
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
const fingerprints = pem => (pem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) || []).map(p => sha(new crypto.X509Certificate(p).raw)).sort()
const roots = tls.rootCertificates.flatMap(fingerprints).sort()
const ca = '/etc/ssl/certs/ca-certificates.crt'
const systemCa = fs.existsSync(ca) ? { path:ca, sha256:sha(fs.readFileSync(ca)), mode:fs.statSync(ca).mode & 0o777, fingerprints:fingerprints(fs.readFileSync(ca,'utf8')) } : null
const dpkg=[]
const statusRoot='/var/lib/dpkg/status.d'
const statuses = fs.existsSync(statusRoot) ? fs.readdirSync(statusRoot).filter(n=>!n.endsWith('.md5sums')).map(n=>path.join(statusRoot,n)) : fs.existsSync('/var/lib/dpkg/status') ? ['/var/lib/dpkg/status'] : []
for (const file of statuses) for (const block of fs.readFileSync(file,'utf8').split(/\n\n+/)) {
  const field = key => block.match(new RegExp('^'+key+': (.+)$','m'))?.[1]
  if(field('Package')) dpkg.push({name:field('Package'),version:field('Version'),architecture:field('Architecture')})
}
dpkg.sort((a,b)=>a.name.localeCompare(b.name))
const packages=[],seen=new Set()
function walkModules(dir){
  if(!fs.existsSync(dir))return
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    if(entry.name.startsWith('.'))continue
    const p=path.join(dir,entry.name)
    if(entry.name.startsWith('@')){walkModules(p);continue}
    let real;try{real=fs.realpathSync(p)}catch{continue}
    if(seen.has(real))continue;seen.add(real)
    const manifest=path.join(real,'package.json');if(!fs.existsSync(manifest))continue
    const data=JSON.parse(fs.readFileSync(manifest,'utf8'));packages.push({name:data.name,version:data.version,private:data.private===true,path:real,workspace:real.startsWith('/app/packages/')||real.startsWith('/app/apps/')||real.startsWith('/app/legacy/')})
    walkModules(path.join(real,'node_modules'))
  }
}
walkModules('/app/node_modules')
const nativeImports={}
if(fs.existsSync('/app/package.json')){
  const require=createRequire('/app/package.json')
  for(const name of ['node:crypto','node:tls','node:zlib','pg','fastify','zod']){require(name);nativeImports[name]=true}
}
const node=fs.realpathSync('/proc/self/exe')
console.log(JSON.stringify({kind:'c26-runtime-inventory',uid:process.getuid(),gid:process.getgid(),node:{path:node,sha256:sha(fs.readFileSync(node)),version:process.version,openssl:process.versions.openssl,fips:crypto.getFips(),bundledRootCount:roots.length,bundledRootsSha256:sha(roots.join('\n')),bundledRoots:roots},tlsOverrides:Object.fromEntries(['NODE_OPTIONS','NODE_EXTRA_CA_CERTS','NODE_USE_SYSTEM_CA','NODE_TLS_REJECT_UNAUTHORIZED','SSL_CERT_FILE','SSL_CERT_DIR'].map(k=>[k,process.env[k]===undefined?'ABSENT':'PRESENT'])),systemCa,dpkg,packages,nativeImports,hardening:{codeOwners:Object.fromEntries(['/app/apps/api/dist/main.js','/app/apps/worker/dist/main.js','/app/package.json','/usr/local/bin/node'].filter(p=>fs.existsSync(p)).map(p=>[p,{uid:fs.statSync(p).uid,gid:fs.statSync(p).gid,mode:fs.statSync(p).mode&0o777}])),appOwner:fs.existsSync('/app')?fs.statSync('/app').uid:null,forbidden:Object.fromEntries(['/bin/sh','/bin/bash','/usr/bin/apt','/usr/bin/dpkg','/usr/local/bin/npm','/app/apps/api/src','/app/node_modules/typescript','/app/node_modules/vitest','/app/node_modules/tsx'].map(p=>[p,fs.existsSync(p)]))}}))
