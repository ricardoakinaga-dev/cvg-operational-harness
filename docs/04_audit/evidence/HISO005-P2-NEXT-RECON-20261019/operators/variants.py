"""DIAGNOSTIC ONLY: run the private engine copy on the dumped input with experimental caps.

usage: variants.py <label> [<label> ...]   (labels from VARIANTS). Waits while load average > 12.
"""
import json, os, subprocess, sys, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

BIG = 10 ** 9
VARIANTS = {
  'official': ({}, 4096, 900),
  'ctx2x': ({'maxContexts': 128}, 8192, 1800),
  'ctx4x': ({'maxContexts': 256}, 8192, 1800),
  'ctx8x': ({'maxContexts': 512}, 12288, 1800),
  'all8x': ({'maxContexts': 512, 'maxStates': 800000, 'maxCallDepth': 512, 'maxUnionValues': 1024, 'timeoutMs': 1200000}, 16384, 1500),
  'nocut': ({'maxContexts': BIG, 'maxStates': BIG, 'maxCallDepth': BIG, 'maxUnionValues': BIG, 'timeoutMs': 1800000}, 24576, 2100),
}
for label in sys.argv[1:]:
    limits, heap, timeout = VARIANTS[label]
    while os.getloadavg()[0] > 12:
        time.sleep(30)
    out = RUNTIME / ('diag-' + label + '.json')
    env = dict(minimal_env(RUNTIME / 'dump'), CVG_DIAG_LIMITS=json.dumps(limits), CVG_DIAG_PROGRESS=str(RUNTIME / ('progress-' + label + '.json')))
    argv = [NODE, '--max-old-space-size=%d' % heap, str(RUNTIME / 'tools-diag/diag-run.mjs'), str(RUNTIME / 'tools-diag/scripts/boundary-semantic-engine.mjs'),
            str(RUNTIME / 'engine-input.json'), str(out)]
    started = now(); load0 = os.getloadavg()
    try:
        p = subprocess.run(argv, cwd=RUNTIME / 'dump', env=env, capture_output=True, text=True, timeout=timeout)
        rc, so, se = p.returncode, p.stdout, p.stderr
    except subprocess.TimeoutExpired as e:
        rc, so, se = 'EXTERNAL_TIMEOUT', '', ''
    res = json.loads(out.read_text()) if out.exists() else None
    prog = json.loads((RUNTIME / ('progress-' + label + '.json')).read_text()) if (RUNTIME / ('progress-' + label + '.json')).exists() else None
    rec = {'task': TASK, 'label': label, 'diagnosticOnly': True, 'notAcceptanceNotOfficial': True, 'limits': limits, 'heapMB': heap,
           'startedAt': started, 'finishedAt': now(), 'loadAvgAtStart': [round(x, 2) for x in load0], 'exitCode': rc, 'stdout': so[-3000:], 'stderr': se[-3000:],
           'result': res, 'lastProgress': prog[-5:] if prog else None, 'inputSha256': sha(RUNTIME / 'engine-input.json')[:16]}
    save('diag-' + label + '.json', rec)
    print(label, rc, so[-600:].strip())
