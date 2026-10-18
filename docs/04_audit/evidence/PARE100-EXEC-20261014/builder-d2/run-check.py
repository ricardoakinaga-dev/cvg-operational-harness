import datetime, hashlib, json, os, pathlib, subprocess, sys, time
root = pathlib.Path(__file__).resolve().parents[5]
evidence = pathlib.Path(__file__).resolve().parent
label, *argv = sys.argv[1:]
if (evidence / (label + '.json')).exists():
    raise SystemExit('Refusing evidence overwrite: ' + label)
env = dict(os.environ)
env['PATH'] = '/home/ricardo/.nvm/versions/node/v22.23.2/bin:' + env['PATH']
env['TMPDIR'] = str(evidence / 'tmp')
started = datetime.datetime.now(datetime.timezone.utc).isoformat()
t0 = time.monotonic()
with (evidence / (label + '.raw.log')).open('wb') as log:
    result = subprocess.run(argv, cwd=root, env=env, stdout=log, stderr=subprocess.STDOUT)
record = dict(argv=argv, cwd=str(root), node_bin='/home/ricardo/.nvm/versions/node/v22.23.2/bin', observed_at=started, elapsed_seconds=time.monotonic()-t0, exit_status=result.returncode, tmpdir=env['TMPDIR'], log_sha256=hashlib.sha256((evidence / (label + '.raw.log')).read_bytes()).hexdigest())
(evidence / (label + '.json')).write_text(json.dumps(record, indent=2) + '\n')
print(json.dumps(record))
print((evidence / (label + '.raw.log')).read_text()[-22000:])
sys.exit(result.returncode)
