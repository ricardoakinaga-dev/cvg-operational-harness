"""Own synthetic PostgreSQL for this task, loopback 56240, labelled; readiness by a real query."""
import json, socket, subprocess, sys, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

for port in (PG_PORT, API_PORT, WEB_PORT):
    with socket.socket() as s:
        s.bind(('127.0.0.1', port))
existing = subprocess.run(['docker', 'ps', '-a', '--filter', 'name=^' + PG_NAME + '$', '--format', '{{.ID}}'], capture_output=True, text=True)
assert existing.returncode == 0 and existing.stdout.strip() == '', existing.stdout
db = 'cvg_build0240_r1'
argv = ['docker', 'run', '--detach', '--name', PG_NAME, '--label', PG_LABEL, '--memory', '1g', '--cpus', '1', '--pids-limit', '128',
        '--tmpfs', '/var/lib/postgresql/data:rw,noexec,nosuid,size=768m', '-e', 'POSTGRES_USER=postgres', '-e', 'POSTGRES_PASSWORD=postgres',
        '-e', 'POSTGRES_DB=' + db, '-p', '127.0.0.1:%d:5432' % PG_PORT, 'postgres:16']
p = subprocess.run(argv, capture_output=True, text=True)
assert p.returncode == 0, p.stderr
cid = p.stdout.strip()
readiness = []
server = None
for attempt in range(60):
    time.sleep(1)
    q = subprocess.run(['docker', 'exec', '-e', 'PGPASSWORD=postgres', cid, 'psql', '-h', '127.0.0.1', '-U', 'postgres', '-d', db, '-tAc', 'select current_database(), version()'], capture_output=True, text=True)
    readiness.append({'attempt': attempt, 'exitCode': q.returncode, 'stdout': q.stdout[-300:], 'stderr': q.stderr[-300:]})
    if q.returncode == 0:
        # official image restarts once after init; require two consecutive successes 2s apart
        time.sleep(2)
        q2 = subprocess.run(['docker', 'exec', '-e', 'PGPASSWORD=postgres', cid, 'psql', '-h', '127.0.0.1', '-U', 'postgres', '-d', db, '-tAc', 'select 1'], capture_output=True, text=True)
        readiness.append({'attempt': attempt, 'confirm': True, 'exitCode': q2.returncode, 'stdout': q2.stdout, 'stderr': q2.stderr[-300:]})
        if q2.returncode == 0:
            server = q.stdout.strip()
            break
info = json.loads(subprocess.check_output(['docker', 'inspect', cid], text=True))[0]
out = {'task': TASK, 'status': 'READY' if server else 'NOT_READY', 'createdAt': now(), 'containerId': info['Id'], 'name': PG_NAME,
       'label': PG_LABEL, 'labelsObserved': info['Config']['Labels'], 'command': argv, 'port': PG_PORT, 'database': db,
       'imageId': info['Image'], 'readiness': readiness, 'server': server,
       'testDatabaseUrl': 'postgres://postgres:postgres@127.0.0.1:%d/%s' % (PG_PORT, db), 'synthetic': True}
save('postgres-resource.json', out)
print(json.dumps({k: v for k, v in out.items() if k not in ('readiness', 'command')}))
assert server
