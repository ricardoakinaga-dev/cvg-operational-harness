"""Replay the retained fresh public consumer after all broad gates."""
from pathlib import Path
import datetime, hashlib, json, re, subprocess, time

ev = Path(__file__).resolve().parent
candidate = Path('/home/ricardo/cvg-candidates/hiso005-integrated-20261018')
variant = Path('/tmp/cvg-hiso005-integration-20261018/without-product-r4')
receipt = json.loads((ev/'certify-r2-receipt.json').read_text())
verify = json.loads((ev/'certification-current-verification.json').read_text())
assert receipt['status'] == 'FINISHED' and receipt['exitCode'] == verify['exitCode'] == 0
freeze = json.loads((ev/'source-freeze-recovery-r2.json').read_text())
for row in freeze['files']:
    assert hashlib.sha256((candidate/row['path']).read_bytes()).hexdigest() == row['sha256']
assert not (variant/'products').exists()
shared = ev.parents[4]
tables = lambda path: re.findall(r'<!-- supported-exports:(\S+) -->([\s\S]*?)<!-- /supported-exports -->',path.read_text())
current_tables = tables(candidate/'docs/architecture/PUBLIC_API.md')
assert len(current_tables) == 8
assert current_tables == tables(variant/'docs/architecture/PUBLIC_API.md') == tables(shared/'docs/architecture/PUBLIC_API.md')
nodebin = Path('/home/ricardo/.nvm/versions/node/v22.23.2/bin')
output = ev/'compiled-consumer-postcert.json'
assert not output.exists()
argv = [str(nodebin/'node'),'audit-consumer/smoke.mjs',str(output)]
started = time.time()
record = {'command':argv,'cwd':str(variant),'candidateCommit':freeze['commit'],
          'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
          'currentSupportedTablesByteEqualBetweenRootCandidateVariant':True,
          'scope':'Actual post-gate replay of the retained fresh75df compiled variant; not a newly claimed compile event.'}
process = subprocess.run(argv,cwd=variant,env={'PATH':str(nodebin)+':/usr/bin:/bin','LANG':'C','LC_ALL':'C','TZ':'UTC'},
                         capture_output=True,timeout=90)
(ev/'compiled-consumer-postcert.stdout.txt').write_bytes(process.stdout)
record.update(exitCode=process.returncode,elapsedSeconds=time.time()-started,
              stderr=process.stderr.decode(errors='replace'),finishedAt=datetime.datetime.now(datetime.timezone.utc).isoformat())
if process.returncode == 0:
    result = json.loads(output.read_text())
    assert result['candidateCommit'] == freeze['commit'] and result['status'] == 'PASS'
    assert result['documentedImportsCompiled'] == 207 and result['runtimeExportsChecked'] == 76
    assert result['networkAttempts'] == 0 and not result['sourceAliases'] and not result['productSourcesPresent']
    record['resultSha256'] = hashlib.sha256(output.read_bytes()).hexdigest()
(ev/'compiled-consumer-postcert-receipt.json').write_text(json.dumps(record,indent=2)+'\n')
print(json.dumps(record))
assert process.returncode == 0
