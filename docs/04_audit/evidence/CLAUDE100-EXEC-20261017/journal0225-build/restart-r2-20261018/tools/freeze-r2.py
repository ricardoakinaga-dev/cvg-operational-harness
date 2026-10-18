# Congela a fonte da candidata para a revisão R2: snapshots dos paths alterados + contrato com hash de integridade.
# Uso: python3 -I freeze-r2.py <contract-extra.json>
import json,hashlib,subprocess,datetime,sys,shutil
from pathlib import Path
R=Path("/home/ricardo/Área de trabalho/cvg-operational-harness")
B=R/"docs/04_audit/evidence/CLAUDE100-EXEC-20261017/journal0225-build"
D=B/"code-review-r2"
C=Path("/mnt/ia/cvg-claude100-journal0225-20261018")
BASE="2f0cc11f7bdda82456f069ac7cc8914cb5335c57"
assert not (D/"contract.json").exists()
head=subprocess.check_output(["git","-C",str(C),"rev-parse","HEAD"],text=True).strip()
assert subprocess.check_output(["git","-C",str(C),"status","--porcelain","--untracked-files=no"],text=True).strip()==""
paths=subprocess.check_output(["git","-C",str(C),"diff","--name-only",BASE,head],text=True).split()
src=[]
for p in paths:
  raw=(C/p).read_bytes();dst=D/"source"/p;dst.parent.mkdir(parents=True,exist_ok=True);dst.write_bytes(raw)
  src.append(dict(path=p,sha256=hashlib.sha256(raw).hexdigest(),bytes=len(raw),snapshot="source/"+p))
spec=R/"docs/04_audit/evidence/CLAUDE100-EXEC-20261017/foundation0225-recomposition/adjusted-spec-proposal.md"
specRaw=spec.read_bytes();assert hashlib.sha256(specRaw).hexdigest()=="f26ccead3ad43d55d480ba08533e55bc9792a299608667570850668b0d12b315"
(D/"approved-adjusted-spec.source.txt").write_bytes(specRaw)
extra=json.loads(Path(sys.argv[1]).read_text())
contract=dict(task="C100-FND-JOURNAL-0225-BUILD-001:CODE-REVIEW-R2",at=datetime.datetime.now(datetime.timezone.utc).isoformat(),
 candidate=str(C),sourceCheckpoint=head,base=BASE,sourceInputs=src,
 approvedSpec=dict(path=str(spec),sha256="f26ccead3ad43d55d480ba08533e55bc9792a299608667570850668b0d12b315",snapshot="approved-adjusted-spec.source.txt"),**extra)
raw=json.dumps(contract,indent=1,ensure_ascii=False,sort_keys=True).encode()
(D/"contract.json").write_text(json.dumps(dict(contract=contract,contract_integrity_sha256=hashlib.sha256(raw).hexdigest()),indent=1,ensure_ascii=False)+"\n")
print(head,len(src),hashlib.sha256(raw).hexdigest())
