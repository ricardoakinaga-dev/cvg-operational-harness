# Executa um comando finito na candidata com ambiente privado e grava recibo.
# Uso: python3 -I run.py <nome-recibo> [--timeout N] [--env K=V ...] -- argv...
import json,datetime,subprocess,sys,os,hashlib
E="/home/ricardo/Área de trabalho/cvg-operational-harness/docs/04_audit/evidence/CLAUDE100-EXEC-20261017/journal0225-build/restart-r2-20261018"
C="/mnt/ia/cvg-claude100-journal0225-20261018"
T="/mnt/ia/cvg-claude100-journal0225-runtime-20261018"
now=lambda:datetime.datetime.now(datetime.timezone.utc).isoformat()
a=sys.argv[1:];name=a.pop(0);timeout=600;extra={};redact=set()
while a[0]!="--":
  k=a.pop(0)
  if k=="--timeout": timeout=int(a.pop(0))
  elif k=="--env":
    kv=a.pop(0);kk,vv=kv.split("=",1);extra[kk]=vv
  elif k=="--env-file":
    # arquivo JSON privado (fora da evidência) com variáveis sensíveis; valores redigidos no recibo
    p=a.pop(0);dd=json.load(open(p));extra.update(dd);redact|=set(dd)
  else: raise SystemExit("arg "+k)
a.pop(0)
env=json.load(open(T+"/environment.json"));env.update(extra)
out=E+"/"+name+"-command.json"
assert not os.path.exists(out),out
rec=dict(start=now(),argv=a,cwd=C,environment={k:("<redacted>" if k in redact else v) for k,v in env.items()},timeout=timeout)
try:
  r=subprocess.run(a,cwd=C,env=env,text=True,capture_output=True,timeout=timeout)
  rec.update(exitCode=r.returncode,stdout=r.stdout,stderr=r.stderr)
except subprocess.TimeoutExpired as e:
  rec.update(exitCode=None,timedOut=True,stdout=(e.stdout or b"").decode() if isinstance(e.stdout,bytes) else (e.stdout or ""),stderr=(e.stderr or b"").decode() if isinstance(e.stderr,bytes) else (e.stderr or ""))
rec["end"]=now()
for k in ("stdout","stderr"):
  s=rec.get(k) or ""
  for kk in redact:
    v=str(env[kk])
    if v: s=s.replace(v,"<redacted>")
  if len(s)>400000: rec[k+"Truncated"]=len(s); s=s[:200000]+"\n...[truncado]...\n"+s[-200000:]
  rec[k]=s
open(out,"w").write(json.dumps(rec,indent=2,ensure_ascii=False)+"\n")
print(json.dumps(dict(name=name,exitCode=rec.get("exitCode"),stdoutTail=rec["stdout"][-1500:],stderrTail=rec["stderr"][-1500:]),ensure_ascii=False))
sys.exit(0 if rec.get("exitCode")==0 else 1)
