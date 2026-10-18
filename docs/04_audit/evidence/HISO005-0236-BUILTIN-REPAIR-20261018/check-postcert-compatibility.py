"""Compare current default/P1 bytes to the frozen P1 code on identical inputs."""
from pathlib import Path
import datetime, gzip, hashlib, json, subprocess, time

ev = Path(__file__).resolve().parent
candidate = Path('/home/ricardo/cvg-candidates/hiso005-resolver-fix-20261018')
tmp = Path('/tmp/cvg-hiso005-builtin-fix-20261018')
baseline = Path('/tmp/cvg-hiso005-integration-20261018/default-baseline-tools')
receipt = json.loads((ev/'certify-r1-receipt.json').read_text())
verify = json.loads((ev/'certification-current-verification.json').read_text())
assert receipt['status'] == 'FINISHED' and receipt['exitCode'] == verify['exitCode'] == 0
sha = lambda b:hashlib.sha256(b).hexdigest()
freeze = json.loads((ev/'source-freeze.json').read_text())
for row in freeze['files']:
    assert sha((candidate/row['path']).read_bytes()) == row['sha256']
assert len(list(baseline.glob('*.mjs'))) == 6
for path in baseline.glob('*.mjs'):
    expected = subprocess.check_output(['git','show','9b494a4d70c3899e25cb249a78316055c306fc99:scripts/'+path.name],cwd=candidate)
    assert path.is_file() and not path.is_symlink() and path.read_bytes() == expected
for name in ['package.json','lib/typescript.js']:
    assert (baseline/'node_modules/typescript'/name).read_bytes() == (candidate/'node_modules/typescript'/name).read_bytes()
ref = {'manifestPath':'/tmp/cvg-hiso005-integration-20261018/reference-r2/reference.json','expectedSha256':'89fd40e9c87c327aa96265d8730b08169f9220bb4904c97460fe0e536ec9b0ef'}
rows = []
for mode in ['default','identity']:
    runs = []
    flags = [] if mode == 'default' else ['--installed-reference='+ref['manifestPath'],'--installed-reference-sha256='+ref['expectedSha256']]
    for label, checker in [('baseline',baseline/'check-product-boundary.mjs'),('current',candidate/'scripts/check-product-boundary.mjs')]:
        output = tmp/('compatibility-postcert-'+mode+'-'+label+'.json')
        graph = tmp/('compatibility-postcert-'+mode+'-'+label+'-graph.json')
        argv = ['/home/ricardo/.nvm/versions/node/v22.23.2/bin/node',str(checker),str(candidate),'--graph='+str(graph),*flags]
        start = time.time()
        with output.open('wb') as stream:
            process = subprocess.run(argv,cwd=candidate,env={'PATH':'/home/ricardo/.nvm/versions/node/v22.23.2/bin:/usr/bin:/bin','LANG':'C','LC_ALL':'C','TZ':'UTC'},stdout=stream,stderr=subprocess.PIPE,timeout=180)
        assert process.returncode == 1 and not process.stderr,(label,process.returncode,process.stderr)
        report = json.loads(output.read_text())
        assert report['status'] == 'INCOMPLETE'
        runs.append({'label':label,'command':argv,'exitCode':process.returncode,'elapsedSeconds':time.time()-start,
                     'diagnostics':len(report['diagnostics']),'reportSha256':sha(output.read_bytes()),'graphSha256':sha(graph.read_bytes())})
        if label == 'current':
            for name,path in [('report',output),('graph',graph)]:
                with gzip.open(ev/('compatibility-postcert-'+mode+'-'+name+'.json.gz'),'wb') as zipped:
                    zipped.write(path.read_bytes())
    assert runs[0]['reportSha256'] == runs[1]['reportSha256'] and runs[0]['graphSha256'] == runs[1]['graphSha256']
    rows.append({'mode':mode,'reportByteExact':True,'graphByteExact':True,'runs':runs})
result = {'sourceCommit':freeze['commit'],'observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
          'status':'PASS_DEFAULT_AND_IDENTITY_BYTE_EQUIVALENCE','baselineCodeCommit':'9b494a4d70c3899e25cb249a78316055c306fc99',
          'evaluatedPhysicalInputs':str(candidate),'rows':rows,'b6Accepted':False}
(ev/'compatibility-postcert.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result))
