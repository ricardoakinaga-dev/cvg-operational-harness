"""(adapted from HISO005-P2-BUILD-0247 measure.py, without the diagnostic copies) B6 measurement (normal and strict) of
the evaluated root 228e7918 with the checker of one tools copy and the references of one refs label.
usage: measure.py <label> <tools-name> <refs-label>
Writes RUNTIME/reports/real-<label>-{normal,strict}-report.json.gz and real-<label>-summary.json."""
import gzip, json, os, subprocess, sys, threading, time
from collections import Counter
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

label, tools_name, refs_label = sys.argv[1:4]
modes = ['normal', 'strict']
tools = RUNTIME / ('tools-' + tools_name)
refs = load('references-' + refs_label + '.json')
inst, comp = refs['installedReference'], refs['compiledReference']
assert sha(inst['manifestPath']) == inst['expectedSha256'] and sha(comp['manifestPath']) == comp['expectedSha256']
work = RUNTIME / ('measure-' + label)
work.mkdir(exist_ok=True)
runs, payloads = [], []


def peak_rss(pid, stop, box):
    # Sample RSS of every descendant (the semantic worker is a child of the checker).
    while not stop.is_set():
        try:
            out = subprocess.run(['ps', '-o', 'pid=,ppid=,rss=', '-e'], capture_output=True, text=True).stdout
            rows = [tuple(map(int, line.split())) for line in out.splitlines() if line.strip()]
            kids, frontier = {pid}, {pid}
            while frontier:
                frontier = {p for p, pp, _ in rows if pp in frontier} - kids
                kids |= frontier
            for p, pp, rss in rows:
                if p in kids and p != pid:
                    box['worker'] = max(box.get('worker', 0), rss)
                if p == pid:
                    box['checker'] = max(box.get('checker', 0), rss)
        except Exception:
            pass
        time.sleep(0.5)


for mode in modes:
    wait_load()
    env = minimal_env(work)
    argv = [NODE, str(tools / 'scripts/check-product-boundary.mjs'), str(EVAL_ROOT), '--graph=' + str(work / (mode + '-graph.json')),
            '--installed-reference=' + inst['manifestPath'], '--installed-reference-sha256=' + inst['expectedSha256'], '--semantic',
            '--compiled-build-reference=' + comp['manifestPath'], '--compiled-build-reference-sha256=' + comp['expectedSha256']] + (['--strict'] if mode == 'strict' else [])
    load0 = os.getloadavg()[0]
    t = time.time()
    proc = subprocess.Popen(argv, cwd=EVAL_ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    box, stop = {}, threading.Event()
    th = threading.Thread(target=peak_rss, args=(proc.pid, stop, box), daemon=True)
    th.start()
    stdout, stderr = proc.communicate(timeout=3600)
    stop.set(); th.join()
    wall = round(time.time() - t, 1)
    r = json.loads(stdout)
    s = r['semanticBoundary']
    body = dict(r); body.pop('semanticTelemetry', None)
    payloads.append(json.dumps(body, sort_keys=True))
    (RUNTIME / 'reports').mkdir(exist_ok=True)
    (RUNTIME / 'reports' / ('real-' + label + '-' + mode + '-report.json.gz')).write_bytes(gzip.compress(stdout, mtime=0))
    reasons = Counter(u['reason'] for u in s['unknowns'])
    runs.append({'mode': mode, 'argv': argv, 'exitCode': proc.returncode, 'wallSeconds': wall, 'loadAvgAtStart': round(load0, 2),
                 'peakRssKiB': box, 'telemetry': r.get('semanticTelemetry'), 'diagnostics': len(r['diagnostics']),
                 'frontierTuples': len(s['unknowns']),
                 'occurrences': {k: s['occurrences'][k] for k in ('baseline', 'resolved', 'new')}, 'status': s['status'],
                 'kernelVersion': s.get('kernelVersion'), 'limits': s.get('limits'), 'usage': s.get('usage'),
                 'phases': s.get('phases'), 'bodyCoverage': s.get('bodyCoverage'), 'validation': s.get('validation'),
                 'proofs': len(s['proofs']), 'violations': len(s['violations']) + len(r['violations']),
                 'compiledProvenance': (s.get('compiledProvenance') or {}).get('status'),
                 'envelopeTuples': [u for u in s['unknowns'] if u['reason'] in ('UNKNOWN_INSTALLED_REFERENCE', 'UNKNOWN_INPUT_REVALIDATION', 'UNKNOWN_HOST_VALIDATION', 'UNKNOWN_ANALYSIS_LIMIT', 'UNKNOWN_WORKER_ERROR', 'UNKNOWN_INVALID_WORKER_RESULT')],
                 'semanticPayloadBytes': len(json.dumps(s, separators=(',', ':'))), 'unknownReasons': dict(sorted(reasons.items())),
                 'reportSha256': shab(stdout), 'stderrTail': stderr.decode('utf8', 'replace')[-1500:]})
rec = {'task': TASK, 'label': label, 'observedAt': now(), 'evaluatedRoot': str(EVAL_ROOT), 'evaluatedCommit': EVAL_COMMIT,
       'tools': tools_name, 'checkerSha256': sha(tools / 'scripts/check-product-boundary.mjs'), 'engineSha256': sha(tools / ENGINE),
       'references': refs_label, 'installedDigest': inst['expectedSha256'], 'compiledDigest': comp['expectedSha256'],
       'runs': runs, 'normalStrictPayloadEqualExcludingTelemetry': payloads[0] == payloads[1]}
save('real-' + label + '-summary.json', rec)
print(json.dumps({'label': label, 'equal': rec['normalStrictPayloadEqualExcludingTelemetry'],
                  'runs': [{k: x[k] for k in ('mode', 'wallSeconds', 'loadAvgAtStart', 'telemetry', 'diagnostics', 'frontierTuples', 'status', 'phases', 'bodyCoverage', 'validation', 'proofs', 'violations', 'compiledProvenance', 'envelopeTuples', 'peakRssKiB')} for x in runs]}, indent=1)[:4000])
