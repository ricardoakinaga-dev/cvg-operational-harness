# Adaptação de session-restart-20261018/run-frozen-profile.py para a worktree/runtime/recurso R2.
# Diferenças: caminhos novos, containerId do recurso R2, perfil admission57 (J07), cópia de fontes
# exceto node_modules (hash registrado), saídas nunca sobrescrevem (runId novo por execução).
import json,hashlib,time,datetime,subprocess,os,sys,re
from pathlib import Path
root=Path("/home/ricardo/Área de trabalho/cvg-operational-harness")
b=root/"docs/04_audit/evidence/CLAUDE100-EXEC-20261017/journal0225-build"
t=Path("/mnt/ia/cvg-claude100-journal0225-runtime-20261018")
c=Path("/mnt/ia/cvg-claude100-journal0225-20261018")
live=json.loads((b/"restart-r2-20261018/native-resource-r2-live.json").read_text())
profiles={"capture8":("capture-journal","complete-effect-result-capture.integration.ts",8),"bound17":("bound-journal","complete-effect-result-bound.integration.ts",17),"public66":("public-restart","complete-effect-result-restart.integration.ts",66),"context19":("public-restart","complete-effect-result-context.integration.ts",19),"journal91":("journal","complete-effect-result-postgres.integration.ts",91),"admission":("admission-journal","complete-effect-result-admission.integration.ts",None)}
assert len(sys.argv)==2 and sys.argv[1] in profiles
key=sys.argv[1];profile,test,expected=profiles[key];now=lambda:datetime.datetime.now(datetime.timezone.utc).isoformat()
d=json.loads((b/"context-profile-r6-recovery-binding.json").read_text());assert len(d["inputs"])==34
d["containerId"]=live["id"];d["candidateRoot"]=str(c);d["evidenceRoot"]=str(b)
reader_inputs=['packages/persistence/src/__tests__/fixtures/journal-result-readers/jsonvalue.ts.source.txt', 'packages/persistence/src/__tests__/fixtures/journal-result-readers/direct.ts.source.txt', 'packages/persistence/src/__tests__/fixtures/journal-result-readers/present.ts.source.txt', 'packages/persistence/dist/operational-execution-postgres.j06-jsonvalue.js', 'packages/persistence/dist/operational-execution-postgres.j06-direct.js', 'packages/persistence/dist/operational-execution-postgres.j06-present.js', 'packages/persistence/src/tenant-scoped-postgres.ts', 'packages/persistence/dist/tenant-scoped-postgres.js', 'packages/persistence/src/controlled-published-fencing.ts', 'packages/persistence/dist/controlled-published-fencing.js', 'node_modules/typescript/lib/typescript.js', 'node_modules/typescript/package.json']
admission_inputs=["packages/persistence/src/__tests__/complete-effect-result-admission.integration.ts","apps/worker/src/main.ts","apps/worker/dist/main.js","apps/worker/src/operational-harness-worker.ts","apps/worker/dist/operational-harness-worker.js","apps/worker/src/worker.ts","apps/worker/dist/worker.js","apps/worker/src/startup-error.ts","apps/worker/dist/startup-error.js","apps/worker/src/worker-observability.ts","apps/worker/dist/worker-observability.js"]
if profile=="bound-journal":
 d["inputs"].extend(dict(path=x,sha256="") for x in ["packages/persistence/src/__tests__/complete-effect-result-bound.integration.ts", "packages/persistence/src/controlled-published-fencing.ts", "packages/persistence/dist/controlled-published-fencing.js", "packages/persistence/src/controlled-published-kernel-store.ts", "packages/persistence/dist/controlled-published-kernel-store.js", "packages/persistence/migrations/0029_controlled_published_kernel.sql", "packages/platform/src/controlled-kernel-continuation.ts", "packages/platform/dist/controlled-kernel-continuation.js", "packages/platform/src/controlled-kernel-adapters.ts", "packages/platform/dist/controlled-kernel-adapters.js", "packages/platform/src/controlled-plugins.ts", "packages/platform/dist/controlled-plugins.js", "packages/persistence/src/tenant-scoped-postgres.ts", "packages/persistence/dist/tenant-scoped-postgres.js", "packages/persistence/src/postgres-outbox.ts", "packages/persistence/dist/postgres-outbox.js"])
if profile=="capture-journal":
 d["inputs"].extend(dict(path=x,sha256="") for x in ["packages/persistence/src/__tests__/complete-effect-result-capture.integration.ts","packages/contracts/src/complete-tool-context.ts","packages/contracts/dist/complete-tool-context.js"])
if profile=="journal":
 d["inputs"].extend(dict(path=x,sha256="") for x in reader_inputs)
if profile=="admission-journal":
 d["inputs"].extend(dict(path=x,sha256="") for x in reader_inputs+admission_inputs)
assert len(d["inputs"])==(50 if profile=="bound-journal" else 37 if profile=="capture-journal" else 46 if profile=="journal" else 57 if profile=="admission-journal" else 34)
d["runId"]="native-"+str(int(time.time()*1000));d["profile"]=profile
assert not (b/(d["runId"]+"-command.json")).exists()
for x in d["inputs"]:
 p=c/x["path"];raw=p.read_bytes();x["sha256"]=hashlib.sha256(raw).hexdigest()
 if not x["path"].startswith("node_modules/"):
  dest=b/(d["runId"]+"-sources")/x["path"];dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(raw)
raw=(json.dumps(d,indent=2)+"\n").encode();(b/(d["runId"]+"-binding.json")).write_bytes(raw)
nb=t/"native-binding.json"
fd=os.open(nb,os.O_WRONLY|os.O_CREAT|os.O_TRUNC|os.O_NOFOLLOW,0o600);os.write(fd,raw);os.fchmod(fd,0o600);os.close(fd)
claim=dict(at=now(),task=d["task"],runId=d["runId"],profile=key,expectedTests=expected,resourceId=d["containerId"],inputs=len(d["inputs"]),scope="one fixed synthetic profile; raw result does not qualify full SPEC/program",functionalCredit=0)
(b/(d["runId"]+"-claim.json")).write_text(json.dumps(claim,indent=2)+"\n")
env=json.loads((t/"environment.json").read_text());node="/home/ricardo/.nvm/versions/node/v22.23.2/bin/node";junit=t/"tmp"/(d["runId"]+"-junit.xml")
argv=[node,"--experimental-strip-types","--test","--test-concurrency=1","--test-reporter=tap","--test-reporter-destination=stdout","--test-reporter=junit","--test-reporter-destination="+str(junit),"packages/persistence/src/__tests__/"+test]
record=dict(start=now(),argv=argv,cwd=str(c),environment=env,binding_sha256=hashlib.sha256(raw).hexdigest(),profile=key,expectedTests=expected,scope=claim["scope"])
r=subprocess.run(argv,cwd=c,env=env,text=True,capture_output=True,timeout=600)
record.update(end=now(),exitCode=r.returncode,stdout=r.stdout,stderr=r.stderr)
(b/(d["runId"]+"-command.json")).write_text(json.dumps(record,indent=2)+"\n")
if junit.exists():(b/junit.name).write_bytes(junit.read_bytes())
counts={k:int(v) for k,v in re.findall(r"^# (tests|pass|fail|cancelled|skipped|todo) ([0-9]+)$",r.stdout,re.M)}
fails=re.findall(r"^\s*not ok \d+ - (.*)$",r.stdout,re.M)
print(json.dumps(dict(runId=d["runId"],profile=key,exitCode=r.returncode,rawCounts=counts,notOk=fails[:40],stderr=r.stderr[-1500:])))
raise SystemExit(r.returncode)
