"""Catalog empty captures locally; no success is inferred from an empty stream."""
from pathlib import Path
import datetime,json
b=Path(__file__).resolve().parent
files=[]
for p in sorted(b.rglob('*')):
 if not p.is_file()or p.stat().st_size:continue
 n=str(p.relative_to(b));reason='Empty capture preserved. Command-specific metadata is not duplicated or inferred; consult adjacent raw command/exit records. This entry makes no PASS claim.'
 if n.startswith('review-r1/'):
  rows=json.loads((b/'review-r1/empty-artifact-status.json').read_text())
  rec=next((x for x in rows if x['path']==n[len('review-r1/'):]),None)
  if rec:reason=rec.get('reason',reason)
 files.append({'path':n,'bytes':0,'status':'capture_missing','command':None,'exitCode':None,'timestamp':None,'environment':None,'reason':reason})
result={'schemaVersion':1,'kind':'scoped-empty-capture-catalog','observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'policy':'Only actual empty files. Unknown metadata remains null; this catalog grants no success. Central catalogue remains reserved to its concurrent owner.','files':files}
(b/'empty-artifact-status.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'emptyFiles':len(files),'centralTouched':False}))
