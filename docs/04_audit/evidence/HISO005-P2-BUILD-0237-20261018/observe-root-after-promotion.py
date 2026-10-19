from pathlib import Path
import datetime,gzip,hashlib,json,subprocess,time

ev=Path(__file__).resolve().parent
root=Path('/home/ricardo/Área de trabalho/cvg-operational-harness')
owned=Path('/mnt/ia/cvg-hiso005-build0237-runtime-20261018/lead')
state=json.loads((ev/'state.json').read_text())
freeze=json.loads((ev/state['sourceFreeze']).read_text())
promotion=json.loads((ev/'promotion-receipt.json').read_text())
assert promotion['status']=='PROMOTED_SEVEN_OWNED_PATHS' and promotion['sourceCommit']==freeze['commit']
sha=lambda data:hashlib.sha256(data).hexdigest()
for row in freeze['files']:
    assert sha((root/row['path']).read_bytes())==row['sha256']
installed='/tmp/cvg-hiso005-integration-20261018/reference-r2/reference.json'
compiled=state['compiledReference']['manifestPath']
rows=[]
for mode,flags in [('default',[]),('semantic-other-physical-reference',['--semantic','--installed-reference='+installed,'--installed-reference-sha256=89fd40e9c87c327aa96265d8730b08169f9220bb4904c97460fe0e536ec9b0ef','--compiled-build-reference='+compiled,'--compiled-build-reference-sha256='+state['compiledReference']['expectedSha256']])]:
    out=owned/('root-'+mode+'.json')
    graph=owned/('root-'+mode+'-graph.json')
    argv=['/home/ricardo/.nvm/versions/node/v22.23.2/bin/node','scripts/check-product-boundary.mjs',str(root),'--graph='+str(graph),*flags]
    started=time.time()
    with out.open('wb') as stream:
        process=subprocess.run(argv,cwd=root,env={'PATH':'/home/ricardo/.nvm/versions/node/v22.23.2/bin:/usr/bin:/bin','LANG':'C','LC_ALL':'C','TZ':'UTC','TMPDIR':str(owned)},stdout=stream,stderr=subprocess.PIPE,timeout=300)
    report=json.loads(out.read_text())
    sem=report.get('semanticBoundary',{})
    rows.append({'mode':mode,'argv':argv,'exitCode':process.returncode,'status':report['status'],'diagnostics':len(report['diagnostics']),'kernelStatus':sem.get('status'),'compiledProvenance':sem.get('compiledProvenance',{}).get('status'),'elapsedSeconds':time.time()-started,'reportSha256':sha(out.read_bytes()),'graphSha256':sha(graph.read_bytes()),'stderrSha256':sha(process.stderr),'stderr':process.stderr.decode(errors='replace')})
    for label,path in [('report',out),('graph',graph)]:
        with gzip.open(ev/('root-'+mode+'-'+label+'.json.gz'),'wb') as stream:
            stream.write(path.read_bytes())
assert rows[1]['compiledProvenance']=='UNAVAILABLE'
for row in freeze['files']:
    assert sha((root/row['path']).read_bytes())==row['sha256']
result={'status':'OBSERVED_SHARED_ROOT_NOT_CERTIFIED','observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'promotedSourceCommit':freeze['commit'],'runs':rows,'rootCertified':False,'b6Accepted':False,'productionApproved':False}
(ev/'root-post-promotion-observation.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result))
