from pathlib import Path
import collections,datetime,gzip,hashlib,json,subprocess,sys
candidate=Path('/mnt/ia/cvg-hiso005-build0237-20261018')
ev=Path(__file__).resolve().parent
node='/home/ricardo/.nvm/versions/node/v22.23.2/bin/node'
state=json.loads((ev/'state.json').read_text())
freeze=json.loads((ev/state['sourceFreeze']).read_text())
review=json.loads((ev/state['acceptedCodeReview']).read_text())
assert review['verdict']=='APPROVE' and not review['requiredFindings']
assert review['sourceCommit']==freeze['commit']==subprocess.check_output(['git','rev-parse','HEAD'],cwd=candidate,text=True).strip()
phase=sys.argv[1];assert phase in ['precert','postcert']
if phase=='postcert':
 cert=json.loads((ev/'certify-r2-receipt.json').read_text())
 assert cert['status']=='FINISHED' and cert['exitCode']==0
 assert json.loads((ev/'certification-current-verification.json').read_text())['status']=='PASS_CURRENT_38_HASHES'
for row in freeze['files']:assert hashlib.sha256((candidate/row['path']).read_bytes()).hexdigest()==row['sha256']
compiled=state['compiledReference'];assert compiled['actualGenerationCommit']==freeze['commit']
installed=['--installed-reference=/tmp/cvg-hiso005-integration-20261018/reference-r2/reference.json','--installed-reference-sha256=89fd40e9c87c327aa96265d8730b08169f9220bb4904c97460fe0e536ec9b0ef']
extra=['--compiled-build-reference='+compiled['manifestPath'],'--compiled-build-reference-sha256='+compiled['expectedSha256']]
env={'PATH':str(Path(node).parent)+':/usr/bin:/bin','LANG':'C','LC_ALL':'C','TZ':'UTC','TMPDIR':'/mnt/ia/cvg-hiso005-build0237-runtime-20261018/lead'}
reports=[];graphs=[];receipts=[]
if '--reuse-captures' in sys.argv:
 receipts=json.loads((ev/('real-'+phase+'-receipts.json')).read_text())
 assert len(receipts)==2
 for mode,receipt in zip(['normal','strict'],receipts):
  raw=gzip.decompress((ev/('real-'+phase+'-'+mode+'-report.json.gz')).read_bytes())
  graphbytes=gzip.decompress((ev/('real-'+phase+'-'+mode+'-graph.json.gz')).read_bytes())
  assert hashlib.sha256(raw).hexdigest()==receipt['reportSha256'] and hashlib.sha256(graphbytes).hexdigest()==receipt['graphSha256']
  assert receipt['exitCode']in [0,1] and receipt['cwd']==str(candidate) and receipt['argv'][0]==node
  assert '--compiled-build-reference-sha256='+compiled['expectedSha256']in receipt['argv']
  reports.append(json.loads(raw));graphs.append(graphbytes)
else:
 for mode in ['normal','strict']:
  graph=Path('/mnt/ia/cvg-hiso005-build0237-runtime-20261018/lead')/('real-'+phase+'-'+mode+'-graph.json')
  argv=[node,'scripts/check-product-boundary.mjs',str(candidate),'--graph='+str(graph),*installed,'--semantic',*extra]+(['--strict']if mode=='strict'else [])
  started=datetime.datetime.now(datetime.timezone.utc).isoformat()
  p=subprocess.run(argv,cwd=candidate,env=env,capture_output=True,timeout=240)
  (ev/('real-'+phase+'-'+mode+'-report.json.gz')).write_bytes(gzip.compress(p.stdout,mtime=0))
  graphbytes=graph.read_bytes()if graph.exists()else b''
  (ev/('real-'+phase+'-'+mode+'-graph.json.gz')).write_bytes(gzip.compress(graphbytes,mtime=0))
  receipt={'argv':argv,'cwd':str(candidate),'startedAt':started,'finishedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'exitCode':p.returncode,'stderr':p.stderr.decode(errors='replace'),'reportSha256':hashlib.sha256(p.stdout).hexdigest(),'graphSha256':hashlib.sha256(graphbytes).hexdigest()}
  receipts.append(receipt)
  (ev/('real-'+phase+'-receipts.json')).write_text(json.dumps(receipts,indent=2)+'\n')
  assert p.returncode in [0,1] and p.stdout,p.stderr.decode(errors='replace')
  report=json.loads(p.stdout);reports.append(report);graphs.append(graphbytes)
semantic=[dict(r)for r in reports]
for r in semantic:r.pop('semanticTelemetry',None)
assert semantic[0]==semantic[1], 'Normal/strict semantic payload mismatch'
assert graphs[0]==graphs[1], 'Normal/strict graph mismatch'
r=reports[0];s=r['semanticBoundary'];origins=s['origins'];frontier=s['frontierOrigins'];occ=s['occurrences']
canon=lambda x:json.dumps(x,ensure_ascii=False,sort_keys=True,separators=(',',':'))
for origin in origins+frontier:
 body={k:v for k,v in origin.items()if k!='id'}
 assert hashlib.sha256(canon(body).encode()).hexdigest()==origin['id']
assert len({x['id']for x in frontier})==len(frontier)==occ['new']
assert set(occ['newOriginIds'])=={x['id']for x in frontier}
old=json.loads(gzip.decompress((ev.parent/'HISO005-0236-BUILTIN-REPAIR-20261018/real-postcert-normal-report.json.gz').read_bytes()))
assert collections.Counter(canon(x)for x in old['semanticBoundary']['origins'])==collections.Counter(canon(x)for x in origins),'Original baseline origin multiset drift'
assert occ['baseline']==537 and occ['baseline']==occ['resolved']+occ['unresolved']
assert r['installedPackageCount']==303 and len(s['installed'])==303
currentGraph=json.loads(graphs[0])
oldGraph=json.loads(gzip.decompress((ev.parent/'HISO005-0236-BUILTIN-REPAIR-20261018/real-postcert-normal-graph.json.gz').read_bytes()))
assert len(currentGraph['installed'])==303 and collections.Counter(canon(x)for x in currentGraph['installed'])==collections.Counter(canon(x)for x in oldGraph['installed'])
assert all(x['contentIdentity']['status']=='MATCH'and not x['verified']for x in currentGraph['installed'])
assert not r['installedLockDrift']
assert len(r['diagnostics'])==occ['unresolved']+occ['new']
physical=unavailable=0
for row in frontier:
 if row['file'] is None:
  assert row['fileSha256'] is None;unavailable+=1
 else:
  path=candidate/row['file'];assert path.is_file()and not path.is_symlink()
  assert hashlib.sha256(path.read_bytes()).hexdigest()==row['fileSha256'];physical+=1
 pointer=row['semanticPointer']['path']
 if pointer.startswith('#/semanticBoundary/unknowns/'):
  item=s['unknowns'][int(pointer.rsplit('/',1)[1])]
  assert (item['file'] or None)==row['semanticPointer']['reportedFile']and item['reason']==row['semanticPointer']['reason']
  if item['file']=='':assert row['file']is None and row['fileSha256']is None
summary={'status':'CURRENT_QUALIFIED_MEASUREMENT'if phase=='postcert'else'PREQUALIFICATION_DIAGNOSTIC','observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sourceCommit':freeze['commit'],'phase':phase,'B6status':r['status'],'kernelVersion':s['kernelVersion'],'diagnostics':len(r['diagnostics']),'baseline':occ['baseline'],'resolved':occ['resolved'],'unresolved':occ['unresolved'],'new':occ['new'],'installed':r['installedPackageCount'],'semanticVerified':sum(x['status']=='PROVEN'for x in s['installed']),'consumableProofs':len(s['proofs']),'compiledProvenance':s['compiledProvenance']['status'],'physicalFrontierHashesVerified':physical,'unavailableNullFrontier':unavailable,'captureMode':'RECONCILED_RETAINED_CAPTURE_BYTES'if '--reuse-captures'in sys.argv else'FRESH_EXECUTION','normalStrictPayloadEqual':True,'normalStrictGraphByteEqual':True,'original537OriginTuplesPreserved':True,'original303InstalledRowsPreserved':True,'installedContentMatch':303,'frontierReasons':dict(sorted(collections.Counter(x['reason']for x in s['unknowns']).items())),'b6Accepted':False,'productionApproved':False}
(ev/('real-'+phase+'-reconciliation.json')).write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps(summary))
