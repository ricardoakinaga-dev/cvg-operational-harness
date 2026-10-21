"""Stops and removes the own PG of HISO005-P2-BUILD-0247 only: container selected by exact name AND label; nothing else
is touched. Then checks that ports 56263/3449/4449 are free. Writes postgres-release-receipt.json. usage: pg_release.py"""
import json, socket, subprocess, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

ids = subprocess.run(['docker', 'ps', '-a', '--filter', 'name=^' + PG_NAME + '$', '--filter', 'label=' + PG_LABEL, '--format', '{{.ID}} {{.Names}} {{.Status}}'],
                     capture_output=True, text=True).stdout.strip().splitlines()
removed = []
for row in ids:
    cid = row.split()[0]
    info = json.loads(subprocess.check_output(['docker', 'inspect', cid], text=True))[0]
    assert info['Name'] == '/' + PG_NAME and info['Config']['Labels'].get('cvg.task') == TASK
    st = subprocess.run(['docker', 'stop', cid], capture_output=True, text=True)
    rm = subprocess.run(['docker', 'rm', cid], capture_output=True, text=True)
    removed.append({'container': info['Id'], 'name': PG_NAME, 'label': PG_LABEL, 'stopExit': st.returncode, 'rmExit': rm.returncode})
left = subprocess.run(['docker', 'ps', '-a', '--filter', 'label=' + PG_LABEL, '--format', '{{.ID}}'], capture_output=True, text=True).stdout.strip()
left_name = subprocess.run(['docker', 'ps', '-a', '--filter', 'name=^' + PG_NAME + '$', '--format', '{{.ID}}'], capture_output=True, text=True).stdout.strip()
ports = {}
for port in (PG_PORT, API_PORT, WEB_PORT):
    with socket.socket() as s:
        try:
            s.bind(('127.0.0.1', port)); ports[port] = 'free'
        except OSError:
            ports[port] = 'busy'
rec = {'task': TASK, 'observedAt': now(), 'selector': {'name': PG_NAME, 'label': PG_LABEL}, 'removed': removed,
       'earlier': 'o PG da r1 (ebf712c6…) foi parado e removido antes da r2, também por id conferido com nome e label',
       'remainingByLabel': left, 'remainingByName': left_name, 'ports': ports, 'status': 'PASS' if not left and not left_name and all(v == 'free' for v in ports.values()) else 'FAIL'}
save('postgres-release-receipt.json', rec)
print(json.dumps(rec, indent=1))
