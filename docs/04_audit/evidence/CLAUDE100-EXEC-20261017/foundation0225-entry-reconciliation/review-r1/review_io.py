from pathlib import Path
import sys,json,subprocess,hashlib,datetime,os
R=Path(__file__).resolve().parent
ROOT=Path('/home/ricardo/Área de trabalho/cvg-operational-harness')
def sha(b):return hashlib.sha256(b).hexdigest()
def save(name,obj): (R/name).write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n')
def record(argv,stdout,stderr='',code=0):
 p=R/'commands';p.mkdir(exist_ok=True)
 name=f'{len(list(p.glob("*.json")))+1:03d}.json'
 save('commands/'+name,{'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'cwd':str(ROOT),'argv':argv,'exitCode':code,'stdout':stdout,'stderr':stderr})
 return name
mode=sys.argv[1]
if mode=='snapshot':
 paths=json.loads(sys.argv[2]); rows=json.loads((R/'hash-before.json').read_text()) if (R/'hash-before.json').exists() else []
 for path in paths:
  p=Path(path);p=p if p.is_absolute() else ROOT/p
  if any(x['path']==str(p) for x in rows):continue
  b=p.read_bytes(); name=f'sources/{len(rows):03d}-{p.name}.source.txt'
  (R/'sources').mkdir(exist_ok=True);(R/name).write_bytes(b)
  rows.append({'path':str(p),'bytes':len(b),'sha256':sha(b),'snapshot':name})
 save('hash-before.json',rows)
 out=json.dumps(rows[-len(paths):],ensure_ascii=False,indent=2);record(sys.argv,out);print(out)
elif mode=='read':
 p=Path(sys.argv[2]);p=p if p.is_absolute() else ROOT/p
 lines=p.read_text().splitlines();a=int(sys.argv[3]) if len(sys.argv)>3 else 1;b=int(sys.argv[4]) if len(sys.argv)>4 else len(lines)
 out='\n'.join(f'{i}: {lines[i-1]}' for i in range(a,min(b,len(lines))+1))+'\n'
 record(sys.argv,out);print(out,end='')
elif mode=='run':
 argv=sys.argv[2:];env=dict(os.environ,GIT_OPTIONAL_LOCKS='0')
 c=subprocess.run(argv,cwd=ROOT,text=True,capture_output=True,env=env)
 n=record(argv,c.stdout,c.stderr,c.returncode)
 print(json.dumps({'log':n,'exitCode':c.returncode,'stdout':c.stdout,'stderr':c.stderr},ensure_ascii=False))
elif mode=='after':
 rows=json.loads((R/'hash-before.json').read_text());out=[]
 for x in rows:
  b=Path(x['path']).read_bytes();s=(R/x['snapshot']).read_bytes()
  out.append(dict(x,after_sha256=sha(b),snapshot_sha256=sha(s),unchanged=sha(b)==x['sha256']==sha(s)))
 save('hash-beforeafter.json',out);record(sys.argv,json.dumps(out,ensure_ascii=False));print(json.dumps({'files':len(out),'unchanged':sum(x['unchanged'] for x in out)}))
