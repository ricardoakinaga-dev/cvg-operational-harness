import hashlib,json,subprocess
from pathlib import Path

r=Path('/home/ricardo/Área de trabalho/cvg-operational-harness')
out=Path('/tmp/cvg-claude100-exec-20261017/q01-candidate/tests/claude100/qualification/fixtures/wire-v1')
out.mkdir(exist_ok=True)
def sha(b):return hashlib.sha256(b).hexdigest()
def canon(x):return json.dumps(x,ensure_ascii=False,separators=(',',':'),sort_keys=True).encode()
def emit(name,obj):
 p=out/name;p.parent.mkdir(parents=True,exist_ok=True)
 raw=json.dumps(obj,ensure_ascii=False,indent=2).encode()+b'\n'
 raw=subprocess.check_output(['/home/ricardo/.nvm/versions/node/v22.23.2/bin/node',str(r/'node_modules/prettier/bin/prettier.cjs'),'--parser','json'],input=raw,cwd=r)
 p.write_bytes(raw)
 return {'path':name,'sha256':sha(raw),'bytes':len(raw)}
cat=(r/'docs/03_build/tracking/claude100_catalog_v1.json').read_bytes();(out/'catalog.json').write_bytes(cat);cs=sha(cat)
fixture=b'{"message":"synthetic mechanism example only"}\n';answer=b'{"marker":"example-17"}\n'
def formatted(b):
 return subprocess.check_output(['/home/ricardo/.nvm/versions/node/v22.23.2/bin/node',str(r/'node_modules/prettier/bin/prettier.cjs'),'--parser','json'],input=b,cwd=r)
fixture=formatted(fixture);answer=formatted(answer);fs=sha(fixture)
rule={'version':1,'scenarioId':'example.headless','requirementIds':['CC100-07-01'],'verificationClass':'FUNCTIONAL_PARITY','equivalenceDecisionRef':'example.decision','requiredRoles':['RAW_INPUT','RAW_STDOUT'],'projection':{'kind':'EXACT_JSON','referenceRole':'RAW_STDOUT','cvgRole':'RAW_STDOUT'},'assertions':[{'kind':'EQUAL_COMPLETE'}],'normalizationPolicy':[],'expectedExecution':{'reference':{'outcomeKind':'SUCCESS','exitCode':0},'cvg':{'outcomeKind':'SUCCESS','exitCode':0}}}
rf=emit('rule.json',rule);rs=rf['sha256'];execution={'startedAt':'2026-10-17T00:00:00.000Z','endedAt':'2026-10-17T00:00:01.000Z','exitCode':0,'timeout':False,'outcomeKind':'SUCCESS'}
placeholder=sha(b'SYNTHETIC PLACEHOLDER; NOT AN EXECUTABLE OR A CAPTURE')
identities={'reference':{'kind':'LOCAL_BINARY','version':'synthetic-example-only','artifactSha256':placeholder,'configSha256':placeholder,'driverSha256':placeholder},'cvg':{'kind':'CVG_SOURCE','commit':'0'*40,'sourceSha256':placeholder,'configSha256':placeholder,'schemaSha256':placeholder,'driverSha256':placeholder,'imageSha256':None}}
index={'version':1,'catalogSha256':cs,'entries':[]};sides={}
for side in ('reference','cvg'):
 folder=out/side;folder.mkdir(exist_ok=True);(folder/'input.json').write_bytes(fixture);(folder/'stdout.json').write_bytes(answer)
 arts=[{'path':f'{side}/input.json','sha256':fs,'bytes':len(fixture),'role':'RAW_INPUT'},{'path':f'{side}/stdout.json','sha256':sha(answer),'bytes':len(answer),'role':'RAW_STDOUT'}]
 ident=identities[side];cid=f'example.capture.{side}'
 receipt={'version':1,'captureId':cid,'collectorId':'example.not-a-real-collector','runId':'example.run','scenarioId':'example.headless','side':side,'fixtureSha256':fs,'ruleSha256':rs,'identity':ident,'execution':execution,'artifacts':arts};ef=emit(f'{side}/receipt.json',receipt)
 index['entries'].append({'captureId':cid,'collectorId':receipt['collectorId'],'runId':receipt['runId'],'scenarioId':receipt['scenarioId'],'side':side,'identitySha256':sha(canon(ident)),'artifactSetSha256':sha(canon(arts)),'receiptPath':ef['path'],'receiptSha256':ef['sha256']});sides[side]={'identity':ident,'artifacts':arts,'execution':dict(execution)}
emit('capture-index.json',index)
spec=emit('synthetic-spec.json',{'notice':'EXAMPLE ONLY; NOT AN APPROVED CVG SPEC'})
dec=emit('synthetic-decision.json',{'notice':'EXAMPLE ONLY; NO HUMAN APPROVAL WAS GIVEN'})
emit('authority-index.json',{'version':1,'catalogSha256':cs,'entries':[{'decisionId':'example.decision','scopeId':'example.headless','ruleSha256':rs,'specPath':spec['path'],'specSha256':spec['sha256'],'decisionReceiptPath':dec['path'],'decisionReceiptSha256':dec['sha256'],'decision':'APPROVED','expiresAt':None}]})
manifest={'version':1,'runId':'example.run','scenarioId':'example.headless','requirementIds':['CC100-07-01'],'catalogSha256':cs,'ruleSha256':rs,'fixtureSha256':fs,'createdAt':'2026-10-17T00:00:02.000Z','reference':sides['reference'],'cvg':sides['cvg'],'captureAttestations':['example.capture.reference','example.capture.cvg']};emit('manifest.json',manifest)
for name,field,value in [('altered-exit','exitCode',1),('altered-timeout','timeout',True),('altered-outcome','outcomeKind','INFRA_FAILURE')]:
 m=json.loads(json.dumps(manifest));m['reference']['execution'][field]=value
 # Keep schema valid while changing authenticated metadata.
 if field=='exitCode':m['reference']['execution']['outcomeKind']='PRODUCT_FAILURE'
 if field=='timeout':m['reference']['execution']['outcomeKind']='INFRA_FAILURE';m['reference']['execution']['exitCode']=None
 emit(name+'.json',m)
m=json.loads(json.dumps(manifest));m['fixtureSha256']='f'*64;emit('altered-fixture.json',m)
emit('expectations.json',{'kind':'DOCUMENTARY_STRUCTURAL_EXAMPLES_NOT_EXECUTED','positive':'Complete wire example for isolated mechanism tests only; a real Lead trust inventory excludes it and yields UNTRUSTED_CAPTURE. No real approval or reference execution exists.','negative':{'altered-exit.json':'UNTRUSTED_CAPTURE','altered-timeout.json':'UNTRUSTED_CAPTURE','altered-outcome.json':'UNTRUSTED_CAPTURE','altered-fixture.json':'UNTRUSTED_CAPTURE'},'assertions':'Keep original receipts/indices fixed; manifest semantic changes fail equality to trusted capture receipt. No PASS_CURRENT.'})
print('wire example files',sum(p.is_file() for p in out.rglob('*')))
