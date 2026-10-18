from pathlib import Path
import datetime, json, socket, subprocess, time

ev = Path(__file__).resolve().parent
name = 'cvg-hiso005-resolver-fix-pg'
label = 'HISO005-0236-RESOLVER-CONFORMANCE-20261018'
assert subprocess.run(['docker', 'inspect', name], capture_output=True).returncode != 0
ports = [56237, 3396, 4396]
for port in ports:
    with socket.socket() as connection:
        connection.bind(('127.0.0.1', port))
argv = ['docker', 'run', '--pull=never', '-d', '--name', name, '--label', 'cvg.task='+label,
        '-p', '127.0.0.1:56237:5432', '-e', 'POSTGRES_PASSWORD=postgres', 'postgres:16-alpine']
process = subprocess.run(argv, capture_output=True, text=True)
assert process.returncode == 0, process.stderr
container = process.stdout.strip()
record = {'observedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
          'status': 'CREATED_WAITING_FINAL_TCP_SERVER', 'containerId': container,
          'name': name, 'label': label, 'command': argv, 'database': 'cvg_resolver_fix_r1',
          'portsFreeBeforeCreate': ports}
receipt = ev/'postgres-preparation.json'
receipt.write_text(json.dumps(record, indent=2)+'\n')
consecutive = 0
for _ in range(60):
    query = subprocess.run(['docker', 'exec', container, 'psql', '-h', '127.0.0.1',
                            '-U', 'postgres', '-tAc', 'select 1'], capture_output=True, text=True)
    consecutive = consecutive+1 if query.returncode == 0 and query.stdout.strip() == '1' else 0
    if consecutive >= 2:
        break
    time.sleep(.5)
assert consecutive >= 2, 'Own PG not ready on final TCP server'
query = subprocess.run(['docker', 'exec', container, 'psql', '-h', '127.0.0.1', '-U', 'postgres',
                        '-tAc', 'create database cvg_resolver_fix_r1'], capture_output=True, text=True)
assert query.returncode == 0, query.stderr
info = json.loads(subprocess.check_output(['docker', 'inspect', container]))[0]
assert info['Config']['Labels']['cvg.task'] == label
version = subprocess.check_output(['docker', 'exec', container, 'psql', '-h', '127.0.0.1',
                                   '-U', 'postgres', '-tAc', 'show server_version'], text=True).strip()
record.update(status='READY', imageId=info['Image'], serverVersion=version,
              ports=info['NetworkSettings']['Ports'], finishedAt=datetime.datetime.now(datetime.timezone.utc).isoformat())
receipt.write_text(json.dumps(record, indent=2)+'\n')
print(json.dumps({'containerId': container, 'status': 'READY', 'version': version,
                  'database': record['database']}))
