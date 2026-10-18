from pathlib import Path
import base64,datetime,hashlib,json,re,subprocess

base=Path('/tmp/cvg-hiso005-integration-20261018/reference-r1')
ev=Path(__file__).resolve().parent
source=Path('/tmp/cvg-hiso005-integration-20261018/reference-source')
candidate=Path('/home/ricardo/cvg-candidates/hiso005-integrated-20261018')
expected='8de30020501563454e1d8094df9f4e951862f54720d1bbc8fc3bb786b775b4af'
raw=(base/'reference.json').read_bytes();r=json.loads(raw)
sha=lambda b:hashlib.sha256(b).hexdigest()
canonical=(json.dumps(r,sort_keys=True,separators=(',',':'),ensure_ascii=False)+'\n').encode()
assert raw==canonical and sha(raw)==expected
assert r['commit']=='9b494a4d70c3899e25cb249a78316055c306fc99'
assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=source,text=True).strip()==r['commit']
assert subprocess.check_output(['git','status','--porcelain'],cwd=source,text=True)==''
assert r['lockSha256']==sha((source/'package-lock.json').read_bytes())==sha((candidate/'package-lock.json').read_bytes())
node='/home/ricardo/.nvm/versions/node/v22.23.2/bin/node'
code="import {fingerprintToolchain,fingerprintResolution} from './scripts/boundary-installed-identity.mjs'; console.log(JSON.stringify({toolchain:fingerprintToolchain({nodePath:"+json.dumps(node)+",npmRoot:'/home/ricardo/.nvm/versions/node/v22.23.2/lib/node_modules/npm'}),resolution:fingerprintResolution("+json.dumps(str(source))+ ")}));"
actual=json.loads(subprocess.check_output([node,'--input-type=module','--eval',code],cwd=candidate,text=True))
assert actual['toolchain']==r['toolchain']
for filename,digest in r['recipe']['auxiliaryPins'].items():assert sha(Path(filename).read_bytes())==digest
payloads=[]
for payload in r['recipe']['cachePayloads']:
 digest=base64.b64decode(payload['integrity'].split('-',1)[1],validate=True)
 assert len(digest)==64
 key=digest.hex();p=base/'cache/_cacache/content-v2/sha512'/key[:2]/key[2:4]/key[4:]
 b=p.read_bytes();assert len(b)==payload['size'] and hashlib.sha512(b).digest()==digest
 payloads.append({'integrity':payload['integrity'],'bytes':len(b),'verified':True})
assert len(payloads)==298
env=r['recipe']['environment'];assert env['NPM_CONFIG_UPDATE_NOTIFIER']=='false' and 'NODE_OPTIONS'not in env and 'HOME'not in env
for key in ['NPM_CONFIG_USERCONFIG','NPM_CONFIG_GLOBALCONFIG']:assert Path(env[key]).read_bytes()==b''
trace=(base/'logs/npm.trace').read_bytes(); text=trace.decode()
assert sha(trace)==r['recipe']['observation']['traceSha256']
execs=[line for line in text.splitlines() if 'execve(' in line]
ip=[line for line in text.splitlines() if re.search(r'\bsocket\(AF_INET6?\b|\bconnect\([^\n]*\{sa_family=AF_INET6?\b',line)]
assert len(execs)==1 and node in execs[0] and not ip
assert r['recipe']['completed'] and r['recipe']['ignoreScripts'] and r['recipe']['offline'] and r['recipe']['exitCode']==0
assert r['recipe']['observation']['networkAttempts']==0 and r['recipe']['observation']['executions']==1
assert len(r['packages'])==304 and len(r['unavailable'])==50 and all(x['optional'] for x in r['unavailable'])
keys=[x['key']for x in r['packages']+r['unavailable']];assert len(keys)==len(set(keys))==354
checks={'canonicalBytesAndSeparateDigest':True,'commitAndCurrentLock':True,'cleanSameCommitSource':True,'currentNodeNpmAndAuxiliaryPins':True,'all298PrivateCachePayloadSris':True,'sanitizedEnvironmentAndEmptyConfigs':True,'actualNpmTraceOneNodeExecZeroIp':True,'304Packages50ExplicitOptionalAbsences':True,'sourceBeforeAfterValidation':'attested by execution of unchanged approved0234 recipe; not independently rehashed every source blob in this operator review'}
result={'status':'ACCEPT_REFERENCE_FOR_BYTE_COMPARISON_ONLY','reviewer':'Lead/operator within approved0234 TCB','reviewedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'manifestPath':str(base/'reference.json'),'expectedSha256':expected,'checks':checks,'usage':r['usage'],'cachePayloads':payloads,'semanticApproval':False,'b6Accepted':False}
(ev/'reference-artifact-review.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items()if k!='cachePayloads'},indent=2))
