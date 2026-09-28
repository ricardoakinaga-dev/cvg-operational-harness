import { writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const candidateRoot = process.env.CVG_CANDIDATE_ROOT
const outputDir = process.env.CVG_ROUTE_OUTPUT_DIR
if (!candidateRoot || !outputDir) throw new Error('candidate root and output dir are required')
if (process.env.NODE_ENV !== 'development') throw new Error('NODE_ENV=development is required for this local OIDC probe')
const sourceSha = execFileSync('git', ['-C', candidateRoot, 'rev-parse', 'HEAD'], {encoding:'utf8'}).trim()
if (sourceSha !== '7ef74e7f4fd2b1141e416b85c7337f119e1333ab') throw new Error('candidate SHA mismatch')
const status = execFileSync('git',['-C',candidateRoot,'status','--porcelain'],{encoding:'utf8'}).trim()
if (status) throw new Error('candidate worktree is dirty')
const { buildServer } = await import(pathToFileURL(resolve(candidateRoot,'apps/api/src/server.ts')).href)
const { createInMemoryOperatorSessionStore } = await import(pathToFileURL(resolve(candidateRoot,'apps/api/src/operator-session.ts')).href)

const client = {
  redirectUri: 'http://127.0.0.1:3000/v1/auth/oidc/callback',
  async start() { return { authorizationUrl: 'http://127.0.0.1:8087/auth?state=synthetic', setCookie: 'cvg_oidc_pending=synthetic; Path=/; HttpOnly; SameSite=Lax' } },
  async complete() { throw new Error('synthetic callback disabled for route probe') },
  clearPendingCookie() { return 'cvg_oidc_pending=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax' }
}
const rawStore = createInMemoryOperatorSessionStore()
let revocations = 0
const store = { ...rawStore, async revoke(id: string) { revocations++; await rawStore.revoke(id) } }
const app = buildServer({
  identityMode: 'trusted',
  operatorSessionStore: store,
  httpSecurity: { allowedOrigins: ['http://127.0.0.1:4173'] },
  localOidc: { client, successRedirectUrl: 'http://127.0.0.1:4173/' },
  rateLimiter: { check: () => ({ allowed: true, retryAfterSeconds: 0 }) }
})
await app.ready()
const tree = app.printRoutes({ commonPrefix: false })
writeFileSync(resolve(outputDir,'route-tree.txt'), tree)
const stack: string[] = []
const routes: { method: string, path: string }[] = []
for (const line of tree.split('\n')) {
  if (!line.trim()) continue
  const m = line.match(/^((?:│   |    )*)(?:├── |└── )(.+) \(([^)]+)\)$/)
  if (!m) throw new Error(`unparsed route tree line: ${line}`)
  const depth = m[1]!.length / 4
  const segment = m[2]!
  const path = depth === 0 ? segment : stack[depth - 1]! + segment
  stack[depth] = path
  stack.length = depth + 1
  for (const method of m[3]!.split(', ')) routes.push({ method, path })
}
const missingRoutes=routes.filter(route => !app.hasRoute({method:route.method as 'GET',url:route.path}))
if (missingRoutes.length) throw new Error(`route parser mismatch: ${JSON.stringify(missingRoutes)}`)
const results=[]
for (const route of routes) {
  const url=route.path.replace(/:([A-Za-z][A-Za-z0-9]*)/g, (_all, p) => p === 'channel' ? 'web' : '00000000-0000-4000-8000-000000000000')
  const options: {method:string,url:string,payload?:object,headers?:Record<string,string>} = { method:route.method, url }
  if (process.env.PROBE_ORIGIN === '1' || process.env.PROBE_SPOOF === '1') options.headers={origin:'http://127.0.0.1:4173'}
  if (process.env.PROBE_SPOOF === '1') options.headers={...options.headers,'x-operator-id':'admin.synthetic','x-operator-role':'Admin','x-tenant-id':'tenant_00000000-0000-4000-8000-000000000701','x-cvg-operator-token':'synthetic-forged-token',authorization:'Bearer synthetic-forged-token'}
  if (['POST','PUT','PATCH'].includes(route.method)) options.payload={}
  const response = await app.inject(options)
  let bodyCode: string | null = null
  try { const body=response.json() as {error?:{code?:string}}; bodyCode=body.error?.code??null } catch {}
  results.push({ ...route, url, status:response.statusCode, errorCode:bodyCode })
}
const session = await store.create({ identity: { operatorId:'auditor.synthetic', tenantId:'tenant_00000000-0000-4000-8000-000000000701', role:'Admin' }, expiresAt: Date.now()+60_000 })
const positiveControls = []
for (const url of ['/v1/session','/v1/tasks','/v1/admin/agents']) {
  const response = await app.inject({method:'GET',url,headers:{cookie:`cvg_operator_session=${encodeURIComponent(session.sessionId)}`}})
  positiveControls.push({method:'GET',path:url,status:response.statusCode})
}
const output={ sourceSha, nodeVersion:process.version, profile:'NODE_ENV=development; trusted local OIDC with in-memory session store; synthetic no-session requests', routeCount:routes.length, registryChecked:true, revocations, positiveControls, results }
writeFileSync(resolve(outputDir,`probe${process.env.PROBE_SPOOF === '1' ? '-spoof' : process.env.PROBE_ORIGIN === '1' ? '-origin' : ''}.json`),JSON.stringify(output,null,2)+'\n')
await app.close()
process.stdout.write(JSON.stringify({routeCount:routes.length,statuses:results.reduce((x:Record<string,number>,r)=>{x[r.status]=(x[r.status]??0)+1;return x},{})})+'\n')
