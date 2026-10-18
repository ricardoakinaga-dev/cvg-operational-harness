"""Record only explicitly supplied focused commands and their raw streams."""
import datetime, hashlib, json, pathlib, subprocess, sys, time
root = pathlib.Path(__file__).resolve().parent
name, *argv = sys.argv[1:]
assert name.replace('-', '').isalnum() and argv
start = time.monotonic()
p = subprocess.run(argv, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
for suffix, data in [('stdout',p.stdout),('stderr',p.stderr)]:
    (root/(name+'.'+suffix+'.log')).write_bytes(data)
record = {'argv':argv,'cwd':str(pathlib.Path.cwd()),'exit_code':p.returncode,'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'seconds':time.monotonic()-start,'streams':{}}
for suffix in ['stdout','stderr']:
    f=root/(name+'.'+suffix+'.log'); record['streams'][suffix]={'path':f.name,'bytes':f.stat().st_size,'sha256':hashlib.sha256(f.read_bytes()).hexdigest()}
(root/(name+'.command.json')).write_text(json.dumps(record,indent=2)+'\n')
print(json.dumps(record,indent=2))
print(p.stdout.decode('utf-8','replace')[-2500:])
print(p.stderr.decode('utf-8','replace')[-7000:])
sys.exit(p.returncode)
