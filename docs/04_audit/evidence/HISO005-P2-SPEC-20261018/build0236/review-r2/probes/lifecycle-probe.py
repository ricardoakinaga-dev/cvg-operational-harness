from pathlib import Path
import json,os,signal,subprocess,time,hashlib
base=Path('/tmp/cvg-hiso005-integration-20261018/review0236-r2'); root=base/'p14-grammar-child-deadline';root.mkdir(exist_ok=True)
(root/'package.json').write_text('{"type":"module"}');(root/'entry.js').write_text('export const result=1;')
request={'root':str(root),'starts':['entry.js'],'origins':[],'installed':[],'limits':{'timeoutMs':900}};(root/'input.json').write_text(json.dumps(request,indent=2))
runner=root/'caller.mjs';runner.write_text("import fs from 'node:fs'; import {runSemanticBoundary} from '/home/ricardo/cvg-candidates/hiso005-integrated-20261018/scripts/boundary-semantic-engine.mjs'; const input=JSON.parse(fs.readFileSync(process.argv[2])); process.stdout.write(JSON.stringify(runSemanticBoundary(input)));")
node='/home/ricardo/.nvm/versions/node/v22.23.2/bin/node';argv=[node,str(runner),str(root/'input.json')];env={'PATH':str(Path(node).parent)+':/usr/bin:/bin','LANG':'C','LC_ALL':'C','TZ':'UTC'}
started=time.monotonic();proc=subprocess.Popen(argv,stdout=subprocess.PIPE,stderr=subprocess.PIPE,env=env); events=[];stopped=None;workers=set()
def children(pid):
 try:return [int(x) for x in Path(f'/proc/{pid}/task/{pid}/children').read_text().split()]
 except (FileNotFoundError,ProcessLookupError):return []
def state(pid):
 try:return Path(f'/proc/{pid}/status').read_text().split('State:')[1].splitlines()[0].strip()
 except FileNotFoundError:return None
try:
 while proc.poll() is None and time.monotonic()-started<6:
  for worker in children(proc.pid):
   workers.add(worker)
   for child in children(worker):
    try:cmd=Path(f'/proc/{child}/cmdline').read_bytes().replace(b'\0',b' ').decode()
    except FileNotFoundError:continue
    if stopped is None and '--check ' in cmd and str(root/'entry.js') in cmd:
     os.kill(child,signal.SIGSTOP);stopped=child;events.append({'event':'SIGSTOP own grammar parser to simulate synchronous parse stall','pid':child,'worker':worker,'argv':cmd,'elapsedMs':round((time.monotonic()-started)*1000,2)})
  time.sleep(.001)
 if proc.poll() is None:proc.kill()
 stdout,stderr=proc.communicate(timeout=2); elapsed=(time.monotonic()-started)*1000
 if stopped:
  # Wait beyond both declared worker deadline and the per-file1s watchdog.
  end=time.monotonic()+1.25
  while time.monotonic()<end:time.sleep(.025)
  orphanState=state(stopped)
  try:status=Path(f'/proc/{stopped}/status').read_text()
  except FileNotFoundError:status=None
 else:orphanState=None;status=None
 result={'argv':argv,'environment':env,'sourceSha256':hashlib.sha256((root/'entry.js').read_bytes()).hexdigest(),'declaredDeadlineMs':900,'events':events,'callerExit':proc.returncode,'callerElapsedMs':elapsed,'stdout':stdout.decode(),'stderr':stderr.decode(),'grammarChildPid':stopped,'grammarChildStateAfterDeadlinePlus1250ms':orphanState,'grammarChildStatus':status,'workerStates':{str(pid):state(pid) for pid in workers}}
 if stdout:(root/'output.json').write_bytes(stdout)
finally:
 if stopped and state(stopped):
  os.kill(stopped,signal.SIGKILL)
  result['cleanup']='SIGKILL issued by reviewer to exact own stopped grammar child; no target execution'
(root/'lifecycle-result.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
