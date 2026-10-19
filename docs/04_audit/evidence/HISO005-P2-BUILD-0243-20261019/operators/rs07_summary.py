"""RS07 summary on the current commit (only with the exclusion): both recipes built, reader PROVEN after the
evaluated dist exists, limits equal to the constants, sizes of the snapshot and of the scoped/unscoped tar."""
import json, subprocess, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

refs = load('0243', 'references-rs07-current.json')
commit = refs['commit']
ri = json.loads(Path(refs['installedReference']['manifestPath']).read_text())
rc = json.loads(Path(refs['compiledReference']['manifestPath']).read_text())
def tar_size(extra):
    p = subprocess.Popen(['git', 'archive', '--format=tar', commit, *extra], cwd=CANDIDATE, stdout=subprocess.PIPE)
    n = 0
    while True:
        b = p.stdout.read(1 << 20)
        if not b: break
        n += len(b)
    assert p.wait() == 0
    return n
scoped = tar_size(['--', '.', ':(exclude)docs/04_audit/evidence'])
full = tar_size([])
compiled_src = (RUNTIME / 'tools-commit-0243/scripts/boundary-semantic-compiled.mjs').read_text()
GiB4 = 4 * 1024 ** 3
rec = {'task': TASKS['0243'], 'observedAt': now(), 'commit': commit, 'sourceRoot': refs['sourceRoot'],
       'installed': {'built': refs['installedReference'] is not None, 'packages': len(ri['packages']), 'usage': ri['usage'],
                     'sourceExclusions': ri['recipe']['sourceExclusions'], 'limits': ri['limits'],
                     'limitsEqualApproved': ri['limits'] == {'maxCompressedBytes': 2 * 1024 ** 3, 'maxTotalBytes': GiB4, 'maxPackageBytes': 512 * 1024 ** 2,
                                                             'maxEntries': 200000, 'maxDepth': 64, 'maxProcesses': 8, 'npmTimeoutMs': 180000, 'comparisonTimeoutMs': 120000}},
       'compiled': {'built': refs['compiledReference'] is not None, 'recipeVersion': rc['recipeVersion'], 'sourceExclusions': rc['sourceExclusions'],
                    'outputs': len(rc['outputs']), 'inputs': len(rc['inputs']), 'archiveCeilingUnchanged': '> 4 * 1024 * 1024 * 1024' in compiled_src},
       'readerAfterDist': refs.get('readerReruns', [{}])[-1].get('result'), 'readerBeforeDist': refs['reader'],
       'tarBytes': {'scoped': scoped, 'full': full, 'ceiling': GiB4, 'scopedMargin': GiB4 - scoped, 'fullMargin': GiB4 - full},
       'snapshotMargin': GiB4 - ri['usage']['regularBytes']}
rec['status'] = 'PASS' if rec['installed']['built'] and rec['compiled']['built'] and rec['readerAfterDist'].get('status') == 'PROVEN' and rec['installed']['limitsEqualApproved'] and rec['compiled']['archiveCeilingUnchanged'] else 'FAIL'
save('0243', 'rs07-current-commit.json', rec)
print(json.dumps({k: rec[k] for k in ('status', 'tarBytes', 'snapshotMargin', 'readerAfterDist')}, indent=1))
