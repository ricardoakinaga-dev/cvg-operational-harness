"""Run the official current verifier only after this frozen certification ends."""
from pathlib import Path
import datetime, hashlib, json, os, re, subprocess, time

ev = Path(__file__).resolve().parent
candidate = Path('/home/ricardo/cvg-candidates/hiso005-integrated-20261018')
receipt = json.loads((ev/'certify-r2-receipt.json').read_text())
assert receipt['status'] == 'FINISHED' and receipt['exitCode'] == 0
head = subprocess.check_output(['git','rev-parse','HEAD'],cwd=candidate,text=True).strip()
assert head == receipt['head']
freeze = json.loads((ev/'source-freeze-recovery-r2.json').read_text())
for row in freeze['files']:
    assert hashlib.sha256((candidate/row['path']).read_bytes()).hexdigest() == row['sha256']
nodebin = Path('/home/ricardo/.nvm/versions/node/v22.23.2/bin')
owned = Path('/tmp/cvg-hiso005-integration-20261018/certify-r2')
env = {k:os.environ[k] for k in ['HOME','USER','LOGNAME','LANG','LC_ALL','TZ','DISPLAY','XAUTHORITY'] if k in os.environ}
env.update(PATH=str(nodebin)+':/usr/local/bin:/usr/bin:/bin', CI='true', CVG_TEST_SCOPE='all',
           TEST_DATABASE_URL='postgres://postgres:postgres@127.0.0.1:56236/cvg_suite_r2',
           PHASE4A_DISPOSABLE_PG='1', PHASE4A_PG_REQUIRED='1', CVG_API_PORT='3386', CVG_WEB_PORT='4386',
           TMPDIR=str(owned/'tmp'), NPM_CONFIG_CACHE=str(owned/'npm-cache'),
           NPM_CONFIG_GLOBALCONFIG=str(owned/'global.npmrc'), NPM_CONFIG_USERCONFIG=str(owned/'user.npmrc'),
           NPM_CONFIG_UPDATE_NOTIFIER='false')
argv = [str(nodebin/'npm'),'run','certification:verify']
start = time.time()
record = {'mode':'current','command':argv,'cwd':str(candidate),'candidateCommit':head,
          'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}
process = subprocess.run(argv,cwd=candidate,env=env,capture_output=True,timeout=300)
(ev/'certification-current-verification.stdout.txt').write_bytes(process.stdout)
(ev/'certification-current-verification.stderr.txt').write_bytes(process.stderr)
output = (process.stdout+process.stderr).decode(errors='replace')
qualified = re.findall(r'current candidate qualified: ([a-f0-9]{64})',output)
hashes = re.findall(r'verified (\d+) artifact hashes',output)
record.update(exitCode=process.returncode,finishedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),
              elapsedSeconds=time.time()-start,qualifiedCandidateIds=qualified,
              verifiedArtifactCounts=[int(x) for x in hashes],
              stdoutSha256=hashlib.sha256(process.stdout).hexdigest(),stderrSha256=hashlib.sha256(process.stderr).hexdigest())
(ev/'certification-current-verification.json').write_text(json.dumps(record,indent=2)+'\n')
print(json.dumps(record))
assert process.returncode == 0 and hashes == ['38'] and len(qualified) == 1, output
assert qualified[0] == json.loads((ev/'state.json').read_text())['certificationCandidateId']
