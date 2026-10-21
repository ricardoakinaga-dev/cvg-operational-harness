"""Replace, in probe-<run>.json, the results of the fixtures of probe-<rerun>.json, keeping the discarded result and the
reason in 'reruns'. usage: merge_rerun.py <run> <rerun> <reason>"""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

run, rerun, reason = sys.argv[1:4]
a, b = load('probe-' + run + '.json'), load('probe-' + rerun + '.json')
assert a['engines'] == b['engines']
for fid, res in b['results'].items():
    a.setdefault('reruns', []).append({'fixture': fid, 'from': 'probe-' + rerun + '.json', 'at': b['observedAt'], 'reason': reason, 'discarded': a['results'][fid]})
    a['results'][fid] = res
save('probe-' + run + '.json', a)
print('merged', list(b['results']))
