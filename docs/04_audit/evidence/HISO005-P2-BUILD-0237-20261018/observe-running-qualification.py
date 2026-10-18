from pathlib import Path
import datetime,json,os,shutil
b=Path(__file__).resolve().parent
receipt=json.loads((b/'certify-r2-receipt.json').read_text())
record={'observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'receiptStatus':receipt['status'],'availableRootGiB':round(shutil.disk_usage(b).free/1024**3,3),'availableCandidateGiB':round(shutil.disk_usage('/mnt/ia').free/1024**3,3)}
if receipt['status']=='RUNNING':
 pid=receipt['pid'];raw=Path(f'/proc/{pid}/stat').read_text();rest=raw[raw.rindex(')')+2:].split();assert rest[19]==receipt['processStartTicks']
 processes={}
 for path in Path('/proc').iterdir():
  if not path.name.isdigit():continue
  try:
   raw=(path/'stat').read_text();end=raw.rindex(')');rest=raw[end+2:].split();processes[int(path.name)]={'pid':int(path.name),'ppid':int(rest[1]),'name':raw[raw.index('(')+1:end],'state':rest[0],'cpuTicks':int(rest[11])+int(rest[12]),'rssBytes':int(rest[21])*os.sysconf('SC_PAGE_SIZE')}
  except(OSError,ValueError,IndexError):continue
 owned={pid}
 while True:
  extra={p for p,v in processes.items()if v['ppid']in owned}-owned
  if not extra:break
  owned|=extra
 selected=[v for p,v in processes.items()if p in owned]
 record.update(identityVerified=True,ownedProcessCount=len(selected),aggregateRssMiB=round(sum(x['rssBytes']for x in selected)/1024**2,1),largestCPUProcesses=sorted(selected,key=lambda x:-x['cpuTicks'])[:4])
else:record['exitCode']=receipt['exitCode']
p=b/'qualification-health-observations.json';rows=json.loads(p.read_text())if p.exists()else[];rows.append(record);p.write_text(json.dumps(rows,indent=2)+'\n');print(json.dumps(record))
