"""Remove own PG by verified ID+label after zero client sessions; confirm no own processes; ports free."""
import json, os, socket, subprocess, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

obs = []
def run_(argv):
    p = subprocess.run(argv, capture_output=True, text=True, timeout=60)
    obs.append({'argv': argv, 'exitCode': p.returncode, 'stdout': p.stdout[-2000:], 'stderr': p.stderr[-2000:]})
    return p

active = []
for path in Path('/proc').iterdir():
    if not path.name.isdigit():
        continue
    try:
        args = (path / 'cmdline').read_bytes().split(b'\0')
        exe = Path(os.fsdecode(args[0])).name
        cwd = os.readlink(path / 'cwd')
    except (OSError, IndexError):
        continue
    if exe in ['node', 'npm', 'chromium', 'chrome', 'esbuild'] and any(cwd == str(x) or cwd.startswith(str(x) + '/') for x in (CANDIDATE, RUNTIME)):
        active.append({'pid': int(path.name), 'exe': exe, 'cwd': cwd})
assert not active, active
pgfile = EV / 'postgres-resource.json'
pg = json.loads(pgfile.read_text()) if pgfile.exists() else None
removed = None
if pg:
    ident = pg['containerId']
    info = run_(['docker', 'inspect', ident])
    if info.returncode == 0:
        c = json.loads(info.stdout)[0]
        assert c['Id'] == ident and c['Config']['Labels'].get('cvg.task') == TASK and c['Name'] == '/' + PG_NAME
        sql = "select count(*) from pg_stat_activity where datname like 'cvg_build0240%' and pid<>pg_backend_pid() and backend_type='client backend'"
        if c['State']['Running']:
            p = run_(['docker', 'exec', '-e', 'PGPASSWORD=postgres', ident, 'psql', '-h', '127.0.0.1', '-U', 'postgres', '-d', pg['database'], '-tAc', sql])
            assert p.returncode == 0 and p.stdout.strip() == '0', p.stdout
        assert run_(['docker', 'rm', '-f', ident]).returncode == 0
        removed = ident
    assert run_(['docker', 'inspect', ident]).returncode != 0
free = []
for port in (PG_PORT, API_PORT, WEB_PORT):
    with socket.socket() as s:
        s.bind(('127.0.0.1', port))
    free.append(port)
result = {'task': TASK, 'status': 'OWN_RUNTIME_CLEANED', 'observedAt': now(), 'containerRemoved': removed, 'identityAndLabelVerified': bool(pg),
          'clientBackendsBeforeRemoval': 0 if removed else None, 'portsFree': free, 'ownProcesses': active, 'commands': obs}
save('cleanup-owned-runtime.json', result)
print(json.dumps({k: v for k, v in result.items() if k != 'commands'}))
