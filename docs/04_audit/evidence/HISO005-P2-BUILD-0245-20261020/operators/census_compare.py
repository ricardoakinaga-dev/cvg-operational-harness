"""SPEC0244 MS06 on the real root: the exact worker input of 228e7918 (dumped by a v4 copy that only writes it, run
once in normal mode and checked against the 13.521 diagnostics), then the refusal census of the v4 engine and of
the v5 engine over that same input, each in a clean pinned Node22 caller; the two census outputs must be equal
apart from timing telemetry. usage: census_compare.py <v4-tools> <v4input-tools> <v5-tools>"""
import gzip, json, subprocess, sys
from collections import Counter
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

v4, v4input, v5 = sys.argv[1:4]
wait_load()
refs = load('references-scoped.json')
inst, comp = refs['installedReference'], refs['compiledReference']
work = RUNTIME / 'census'
work.mkdir(exist_ok=True)
dump = work / 'engine-input.json'
env = dict(minimal_env(work), CVG_DIAG_INPUT_DUMP=str(dump))
tools = RUNTIME / ('tools-' + v4input) / 'scripts'
argv = [NODE, str(tools / 'check-product-boundary.mjs'), str(EVAL_ROOT), '--graph=' + str(work / 'graph.json'),
        '--installed-reference=' + inst['manifestPath'], '--installed-reference-sha256=' + inst['expectedSha256'], '--semantic',
        '--compiled-build-reference=' + comp['manifestPath'], '--compiled-build-reference-sha256=' + comp['expectedSha256']]
p = subprocess.run(argv, cwd=EVAL_ROOT, env=env, capture_output=True, timeout=3600)
r = json.loads(p.stdout)
official = json.loads(gzip.decompress((OFFICIAL_V4 / 'real-final-0242-normal-report.json.gz').read_bytes()))
same = Counter(json.dumps(d, sort_keys=True) for d in r['diagnostics']) == Counter(json.dumps(d, sort_keys=True) for d in official['diagnostics'])
code = ('const fs=require("node:fs"); const e=require(process.argv[1]); const input=JSON.parse(fs.readFileSync(process.argv[2],"utf8"));'
        'const o=e.analyzeSemanticBoundary(input,{refusalCensus:true}); delete o.telemetry; o.usage && delete o.usage.elapsedMs;'
        'process.stdout.write(JSON.stringify(o));')
outs = {}
for label in (v4, v5):
    eng = RUNTIME / ('tools-' + label) / 'scripts/boundary-semantic-engine.mjs'
    q = subprocess.run([NODE, '-e', code, str(eng), str(dump)], cwd=work, env=minimal_env(work), capture_output=True, timeout=3600)
    assert q.returncode == 0, q.stderr[-2000:]
    o = json.loads(q.stdout)
    (EV / ('census-' + label + '.json.gz')).write_bytes(gzip.compress(json.dumps(o, sort_keys=True).encode(), mtime=0))
    outs[label] = o
a, b = outs[v4], outs[v5]
diff = sorted(k for k in set(a) | set(b) if json.dumps(a.get(k), sort_keys=True) != json.dumps(b.get(k), sort_keys=True))
rec = {'task': TASK, 'observedAt': now(), 'inputDump': {'sha256': sha(dump), 'bytes': dump.stat().st_size, 'checkerDiagnostics': len(r['diagnostics']),
       'checkerEqualsOfficial13521': same, 'dumpEngine': sha(tools / 'boundary-semantic-engine.mjs'), 'patch': 'operators/input_dump_patch.py'},
       'engines': {v4: sha(RUNTIME / ('tools-' + v4) / 'scripts/boundary-semantic-engine.mjs'), v5: sha(RUNTIME / ('tools-' + v5) / 'scripts/boundary-semantic-engine.mjs')},
       'census': {label: {'status': o['status'], 'unknowns': len(o['unknowns']), 'violations': len(o['violations']), 'kernelVersion': o.get('kernelVersion'),
                          'reasons': dict(Counter(u['reason'] for u in o['unknowns']).most_common())} for label, o in outs.items()},
       'differingKeys': diff, 'onlyKernelVersionDiffers': diff in ([], ['kernelVersion']),
       'unknownsEqual': a['unknowns'] == b['unknowns'], 'violationsEqual': a['violations'] == b['violations'], 'limitsEqual': a.get('limits') == b.get('limits')}
rec['status'] = 'PASS' if same and rec['unknownsEqual'] and rec['violationsEqual'] and rec['limitsEqual'] and rec['onlyKernelVersionDiffers'] else 'FAIL'
save('census-comparison.json', rec)
print(json.dumps({k: v for k, v in rec.items() if k != 'census'}, indent=1), json.dumps(rec['census'])[:1500])
