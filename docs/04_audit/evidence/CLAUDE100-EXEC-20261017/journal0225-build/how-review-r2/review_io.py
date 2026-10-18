from pathlib import Path
import json,sys,subprocess,hashlib,datetime,os
R=Path(__file__).resolve().parent
ROOT=Path('/home/ricardo/Área de trabalho/cvg-operational-harness')
H=lambda b:hashlib.sha256(b).hexdigest()
def save(n,o):(R/n).write_text(json.dumps(o,ensure_ascii=False,indent=2)+'\n')
def log(argv,out,err='',code=0):
 d=R/'commands';d.mkdir(exist_ok=True)
 save('commands/'+f'{len(list(d.glob("*.json")))+1:03d}.json',{'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'cwd':str(ROOT),'argv':argv,'exitCode':code,'stdout':out,'stderr':err})
mode=sys.argv[1]
if mode=='snapshot':
 rows=json.loads((R/'before.json').read_text()) if (R/'before.json').exists() else []
 added=[]
 for path in json.loads(sys.argv[2]):
  p=Path(path);p=p if p.is_absolute() else ROOT/p
  if any(x['path']==str(p) for x in rows):continue
  b=p.read_bytes();name=f'sources/{len(rows):03d}-{p.name}.source.txt'
  (R/'sources').mkdir(exist_ok=True);(R/name).write_bytes(b)
  row={'path':str(p),'bytes':len(b),'sha256':H(b),'snapshot':name};rows.append(row);added.append(row)
 save('before.json',rows);out=json.dumps(added,ensure_ascii=False,indent=2)+'\n';log(sys.argv,out);print(out,end='')
elif mode=='read':
 p=Path(sys.argv[2]);p=p if p.is_absolute() else ROOT/p
 lines=p.read_text().splitlines();a=int(sys.argv[3]) if len(sys.argv)>3 else 1;b=int(sys.argv[4]) if len(sys.argv)>4 else len(lines)
 out='\n'.join(f'{i}: {lines[i-1]}' for i in range(a,min(b,len(lines))+1))+'\n';log(sys.argv,out);print(out,end='')
elif mode=='run':
 argv=sys.argv[2:];c=subprocess.run(argv,cwd=ROOT,text=True,capture_output=True,env=dict(os.environ,GIT_OPTIONAL_LOCKS='0'))
 log(argv,c.stdout,c.stderr,c.returncode);print(json.dumps({'exitCode':c.returncode,'stdout':c.stdout,'stderr':c.stderr},ensure_ascii=False))
