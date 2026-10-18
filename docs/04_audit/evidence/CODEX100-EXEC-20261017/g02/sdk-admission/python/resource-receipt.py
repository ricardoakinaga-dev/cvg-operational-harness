"""Read-only receipt of every own transient unit of this task (budget.json + case-ledger.json). Never stops or kills.

For each unit: systemctl --user show (MainPID, LoadState, ActiveState, SubState, ControlGroup) and absence of its
cgroup directory; plus a /proc scan for processes whose cmdline references a sandbox profile path.
Usage: python3 -I resource-receipt.py <output-json>
"""
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.dont_write_bytecode = True
UNIT = Path(__file__).resolve().parent.parent
uid = os.getuid()
env = {'PATH': '/usr/bin:/bin', 'HOME': str(Path.home()), 'LANG': 'C.UTF-8', 'XDG_RUNTIME_DIR': '/run/user/%d' % uid,
       'DBUS_SESSION_BUS_ADDRESS': 'unix:path=/run/user/%d/bus' % uid}
units = [(h['unit'], h['case'], h['result']) for h in json.loads((UNIT / 'budget.json').read_text())['history']]
units += [(s['unit'], c, s.get('result')) for c, s in json.loads((UNIT / 'case-ledger.json').read_text())['slots'].items() if s.get('unit')]
rows = []
for unit, case, result in units:
    c = subprocess.run(['/usr/bin/systemctl', '--user', 'show', unit, '-p', 'MainPID', '-p', 'LoadState', '-p', 'ActiveState', '-p', 'SubState',
                        '-p', 'ControlGroup'], capture_output=True, text=True, env=env, timeout=10)
    show = dict(line.split('=', 1) for line in c.stdout.splitlines() if '=' in line)
    cg = Path('/sys/fs/cgroup/user.slice/user-%d.slice/user@%d.service/app.slice/%s' % (uid, uid, unit))
    rows.append({'unit': unit, 'case': case, 'result': result, 'show': show, 'rc': c.returncode, 'cgroup_dir_exists': cg.exists(),
                 'released': show.get('MainPID') == '0' and show.get('LoadState') == 'not-found' and show.get('ActiveState') == 'inactive' and not cg.exists()})
listed = subprocess.run(['/usr/bin/systemctl', '--user', 'list-units', '--all', '--no-legend', 'cvg-codex100-sdkadm-*', 'cvg-codex100-sdkcase-*'],
                        capture_output=True, text=True, env=env, timeout=10).stdout.strip()
procs = []
for pid in os.listdir('/proc'):
    if pid.isdigit():
        try:
            cmd = Path('/proc/%s/cmdline' % pid).read_bytes().replace(b'\0', b' ').decode('utf-8', 'replace')
        except OSError:
            continue
        if '/profile/' in cmd and ('python-driver' in cmd or 'adapter-' in cmd or 'fixture-' in cmd or 'ts-driver' in cmd or 'transpile' in cmd):
            procs.append({'pid': int(pid), 'cmdline': cmd[:200]})
out = {'kind': 'FINAL_OWN_RESOURCE_RECEIPT_READONLY', 'units': rows, 'units_total': len(rows), 'all_released': all(r['released'] for r in rows),
       'list_units_own_prefixes': listed, 'role_processes_alive': procs, 'observed_at': datetime.now(timezone.utc).isoformat()}
Path(sys.argv[1]).write_text(json.dumps(out, ensure_ascii=False, indent=1) + '\n')
print(json.dumps({'units': len(rows), 'all_released': out['all_released'], 'listed': listed, 'procs': procs}))
sys.exit(0 if out['all_released'] and not listed and not procs else 1)
