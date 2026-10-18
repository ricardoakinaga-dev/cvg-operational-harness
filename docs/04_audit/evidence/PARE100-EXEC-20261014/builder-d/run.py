import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
from datetime import datetime, timezone

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[4]
label, *command = sys.argv[1:]
env = dict(os.environ)
env['PATH'] = '/home/ricardo/.nvm/versions/node/v22.23.2/bin:' + env['PATH']
started = datetime.now(timezone.utc).isoformat()
result = subprocess.run(command, cwd=ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
log = HERE / (label + '.log')
log.write_bytes(result.stdout)
record = {'command': command, 'cwd': str(ROOT), 'observed_at': started,
          'finished_at': datetime.now(timezone.utc).isoformat(), 'exit_status': result.returncode,
          'raw_log': log.name, 'sha256': hashlib.sha256(result.stdout).hexdigest(),
          'node_path': '/home/ricardo/.nvm/versions/node/v22.23.2/bin'}
(HERE / (label + '.json')).write_text(json.dumps(record, indent=2) + '\n')
print(result.stdout.decode(errors='replace'))
print(json.dumps(record))
sys.exit(result.returncode)
