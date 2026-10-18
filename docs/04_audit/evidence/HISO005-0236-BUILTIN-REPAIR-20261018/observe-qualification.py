from pathlib import Path
import datetime,json,re,shutil
b=Path(__file__).resolve().parent
receipt=json.loads((b/'certify-r1-receipt.json').read_text())
state=json.loads((b/'state.json').read_text())
log=(b/'certify-r1.log').read_text()
rows=re.findall(r'\[certify\]\s+(PASS|FAIL|BLOCKED)\s+(\w+)\s+\(exit',log)
order=['format','typecheck','lint','build','unit','coverage','security','worker_startup','postgres','e2e','evals','chaos','load','restore','sbom','licenses']
complete={name:status for status,name in rows}
current=next((name for name in order if name not in complete),None)
try:
    text=Path(f"/proc/{receipt['pid']}/stat").read_text()
    alive=text[text.rindex(')')+2:].split()[19]==receipt['processStartTicks']
except (FileNotFoundError,ProcessLookupError):
    alive=False
now=datetime.datetime.now(datetime.timezone.utc)
result={'observedAt':now.isoformat(),'phase':state['phase'],'certificationStatus':receipt['status'],'exitCode':receipt.get('exitCode'),'pid':receipt['pid'],'processIdentityLive':alive,'elapsedMinutes':round((now-datetime.datetime.fromisoformat(receipt['startedAt'])).total_seconds()/60,1),'gatesCompleted':complete,'currentGate':current,'freeGiB':round(shutil.disk_usage('/tmp').free/1024**3,2)}
orchestration=b/'qualification-orchestration.json'
if orchestration.exists():result['orchestrationStatus']=json.loads(orchestration.read_text())['status']
with(b/'qualification-progress.jsonl').open('a')as out:out.write(json.dumps(result)+'\n')
print(json.dumps(result))
