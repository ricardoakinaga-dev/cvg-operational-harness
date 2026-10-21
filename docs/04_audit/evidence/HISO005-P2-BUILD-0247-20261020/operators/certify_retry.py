"""Second and last certify attempt (lead rule: NO_GO by load timeouts in files unrelated to the delta → analyse, record,
repeat once with low load): waits until the 1- and 5-minute load are both below 6 (checked every 30 s, at most 120 min;
otherwise starts at the lowest load seen and records it), creates a new own PG and runs run_certify.py r2.
usage: certify_retry.py"""
import json, os, subprocess, sys, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

t0, samples = time.time(), []
while True:
    l1, l5, _ = os.getloadavg()
    samples.append([round(time.time() - t0), round(l1, 2), round(l5, 2)])
    if (l1 < 6 and l5 < 6) or time.time() - t0 > 120 * 60:
        break
    time.sleep(30)
save('certify-r2-wait.json', {'task': TASK, 'observedAt': now(), 'rule': 'load 1 min e 5 min < 6, teto de espera 120 min',
                              'waitedSeconds': round(time.time() - t0), 'reachedLowLoad': samples[-1][1] < 6 and samples[-1][2] < 6,
                              'startLoad': samples[-1][1:], 'minLoadSeen': min(s[1] for s in samples), 'samples': samples[::10] + [samples[-1]]})
p = subprocess.run(['/usr/bin/python3', '-I', '-B', str(OPS / 'pg_create.py'), 'r2'], cwd=str(OPS), capture_output=True, text=True)
assert p.returncode == 0, p.stderr[-1500:]
(EV / 'postgres-resource-r2.json').write_text((EV / 'postgres-resource.json').read_text())
p = subprocess.run(['/usr/bin/python3', '-I', '-B', str(OPS / 'run_certify.py'), 'r2'], cwd=str(OPS), capture_output=True, text=True)
print(p.stdout[-500:], p.stderr[-500:])
sys.exit(p.returncode)
