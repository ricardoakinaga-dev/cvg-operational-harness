"""Size control: keep the full reports of the v5 baseline (tag copy) and of variant A (normal and strict) and replace the reports of the diagnostic copies
and of the superseded v5 rounds by digests (gz and payload SHA-256, diagnostics and tuple multiset hashes), so every
equality claim stays checkable against the kept reports. usage: prune_reports.py"""
import gzip, json, sys
from collections import Counter
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

KEEP = {'v5tags', 'v5tsxAboth'}
ms = lambda items: shab(json.dumps(sorted(json.dumps(x, sort_keys=True) for x in items)).encode())
rows = []
for f in sorted(EV.glob('real-*-report.json.gz')):
    label, mode = f.name[len('real-'):-len('-report.json.gz')].rsplit('-', 1)
    r = json.loads(gzip.decompress(f.read_bytes()))
    s = r['semanticBoundary']
    rec = {'file': f.name, 'label': label, 'mode': mode, 'gzSha256': sha(f), 'payloadSha256': shab(gzip.decompress(f.read_bytes())), 'bytes': f.stat().st_size,
           'diagnostics': len(r['diagnostics']), 'diagnosticsMultisetSha256': ms(r['diagnostics']),
           'tuples': len(s['unknowns']), 'tuplesMultisetSha256': ms([{'file': u.get('file') or '', 'reason': u['reason'], 'detail': u.get('detail') or ''} for u in s['unknowns']]),
           'violations': len(s['violations']) + len(r['violations']), 'proofs': len(s['proofs']), 'status': s['status'], 'validation': s['validation'], 'kept': label in KEEP}
    rows.append(rec)
for rec in rows:
    if not rec['kept']:
        (EV / rec['file']).unlink()
save('pruned-reports.json', {'task': TASK, 'observedAt': now(), 'kept': sorted(r['file'] for r in rows if r['kept']),
     'rule': 'mantidos os relatórios completos da base v5 (cópia de etiquetas) e da variante A (normal e strict); os de A normal avulsa, B, C e da variante de workspace viram digests conferíveis por hash de multiconjunto',
     'reports': rows})
print(len(rows), 'reports;', sum(not r['kept'] for r in rows), 'pruned')
for r in rows: print(r['label'], r['mode'], r['diagnostics'], r['tuplesMultisetSha256'][:12], r['kept'])
