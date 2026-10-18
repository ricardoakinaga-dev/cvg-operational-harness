# Lista de paths promovíveis da candidata para o root, com pré-imagens do root (SEM promover).
import json,hashlib,subprocess,datetime,sys
from pathlib import Path
R=Path("/home/ricardo/Área de trabalho/cvg-operational-harness")
C=Path("/mnt/ia/cvg-claude100-journal0225-20261018")
E=R/"docs/04_audit/evidence/CLAUDE100-EXEC-20261017/journal0225-build/restart-r2-20261018"
out=E/sys.argv[1]; assert not out.exists()
BASE="2f0cc11f7bdda82456f069ac7cc8914cb5335c57"
g=lambda *a,cwd=C: subprocess.run(["git",*a],cwd=cwd,capture_output=True)
sha=lambda b: hashlib.sha256(b).hexdigest()
head=g("rev-parse","HEAD").stdout.decode().strip()
rootHead=g("rev-parse","HEAD",cwd=R).stdout.decode().strip()
paths=g("diff","--name-status",BASE,head).stdout.decode().split("\n")
items=[]
for line in filter(None,paths):
  st,p=line.split("\t",1)
  base=g("show",f"{BASE}:{p}"); baseSha=sha(base.stdout) if base.returncode==0 else None
  rh=g("show",f"HEAD:{p}",cwd=R); rootHeadSha=sha(rh.stdout) if rh.returncode==0 else None
  rw=R/p; rootWtSha=sha(rw.read_bytes()) if rw.exists() else None
  cand=sha((C/p).read_bytes())
  rootStatus=g("status","--porcelain","--",p,cwd=R).stdout.decode().strip()
  if rootWtSha is None and baseSha is None: cls="NEW_ABSENT_IN_ROOT_COPY_ELIGIBLE"
  elif rootWtSha==baseSha: cls="ROOT_EQUALS_BASE_COPY_ELIGIBLE"
  elif rootWtSha is None: cls="ROOT_LACKS_BASE_LINE_FILE_REQUIRES_BASE_INTEGRATION"
  else: cls="ROOT_DIVERGES_FROM_BASE_REQUIRES_MERGE_NOT_COPY"
  items.append(dict(path=p,change=st,baseSha256=baseSha,rootHeadSha256=rootHeadSha,rootWorktreeSha256=rootWtSha,rootWorktreeStatus=rootStatus or "clean",candidateSha256=cand,classification=cls))
rec=dict(at=datetime.datetime.now(datetime.timezone.utc).isoformat(),candidateHead=head,base=BASE,rootHead=rootHead,
 baseRelation="base = merge-base ca565391 + 5 commits da linha PARE100 (a72422be..2f0cc11f) não integrados no root",
 promoted=False,items=items,
 counts={k:sum(1 for i in items if i["classification"]==k) for k in sorted(set(i["classification"] for i in items))})
out.write_text(json.dumps(rec,indent=2,ensure_ascii=False)+"\n")
print(json.dumps(rec["counts"]))
