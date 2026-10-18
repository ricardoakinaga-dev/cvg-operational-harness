# Conferência Lead das execuções nativas: contagens TAP, binding x fonte atual, artefatos J07.
# Uso: python3 -I audit-native-runs.py <saida.json> <runId> [<runId> ...]
import json,sys,re,hashlib,datetime,subprocess,os
from pathlib import Path
b=Path("/home/ricardo/Área de trabalho/cvg-operational-harness/docs/04_audit/evidence/CLAUDE100-EXEC-20261017/journal0225-build")
E=b/"restart-r2-20261018"
c=Path("/mnt/ia/cvg-claude100-journal0225-20261018")
out=E/sys.argv[1]
assert not out.exists(),out
head=subprocess.check_output(["git","-C",str(c),"rev-parse","HEAD"],text=True).strip()
dirty=subprocess.check_output(["git","-C",str(c),"status","--porcelain","--untracked-files=no"],text=True).strip()
runs=[]
for rid in sys.argv[2:]:
  cmd=json.loads((b/(rid+"-command.json")).read_text())
  bind=json.loads((b/(rid+"-binding.json")).read_text())
  counts={k:int(v) for k,v in re.findall(r"^# (tests|pass|fail|cancelled|skipped|todo) ([0-9]+)$",cmd["stdout"],re.M)}
  drift=[x["path"] for x in bind["inputs"] if hashlib.sha256((c/x["path"]).read_bytes()).hexdigest()!=x["sha256"]]
  names=re.findall(r"^\s*ok \d+ - (.*)$",cmd["stdout"],re.M)
  j07={}
  for f in sorted(b.glob(rid+"-j07-*.json")):
    d=json.loads(f.read_text());j07[f.name[len(rid)+5:-5]]={k:d.get(k) for k in ("kind","refusedGetAndReserve","refusedGetAndReserveWhileAlive","downstream","snapshotExact","rejected","exit","termination","droppedConstraints","refusal") if k in d}
  runs.append(dict(runId=rid,profile=cmd["profile"],exitCode=cmd["exitCode"],counts=counts,expected=cmd.get("expectedTests"),inputs=len(bind["inputs"]),bindingSha256=cmd["binding_sha256"],inputsDriftNow=drift,resourceId=bind["containerId"],okNames=len(names),j07=j07 or None))
rec=dict(at=datetime.datetime.now(datetime.timezone.utc).isoformat(),candidateHead=head,trackedDirty=bool(dirty),runs=runs,
 totals=dict(tests=sum(r["counts"].get("tests",0) for r in runs),passed=sum(r["counts"].get("pass",0) for r in runs),failed=sum(r["counts"].get("fail",0) for r in runs),skipped=sum(r["counts"].get("skipped",0) for r in runs)),
 note="Conferência Lead; não é revisão independente nem qualificação global",functionalCredit=0)
out.write_text(json.dumps(rec,indent=2,ensure_ascii=False)+"\n")
print(json.dumps(rec["totals"]),head,bool(dirty),[ (r["profile"],r["counts"],r["inputsDriftNow"]) for r in runs])
