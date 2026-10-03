from pathlib import Path
import sys,subprocess,json,datetime,os,hashlib
name=sys.argv[1];command=sys.argv[2:];base=Path('/tmp/cvg-harness-iso-exec-20261003');out=Path('/home/ricardo/Área de trabalho/cvg-operational-harness/docs/04_audit/evidence/HARNESS-ISO-EXEC-20261003');candidate=Path(os.environ.get('CVG_AUDIT_CWD',str(base/'snapshot'))).resolve()
assert candidate.is_relative_to(base.resolve()) and candidate!=base
assert not (out/f'{name}.json').exists() and not (out/f'{name}.log').exists(), 'preserve previous capture'
for arg in command:
 if arg.endswith(('.test.ts','.test.js','.test.tsx')): assert (candidate/arg).is_file(), f'missing requested test: {arg}'
def inputs():
 files=[]
 for current,dirs,names in os.walk(candidate):
  dirs[:]=sorted(d for d in dirs if d not in ['node_modules','.git','.gauntlet','dist','coverage','test-results','playwright-report','certification','build'])
  for n in sorted(names):
   p=Path(current)/n;r=p.relative_to(candidate).as_posix()
   if r=='playwright-results.xml': continue
   if p.is_symlink() or n=='.env' or n.startswith('.env.') and n!='.env.example': continue
   if r.startswith('docs/04_audit/evidence/HARNESS-ISO-EXEC-20261003/') and not r.endswith('/source-moves.json'): continue
   if r.startswith('docs/08_runtime/') or r in ['docs/99_runtime_state.md','docs/20_master_execution_log.md','docs/30_backlog_master.md']: continue
   files.append({'path':r,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'size':p.stat().st_size})
 return {'algorithm':'sha256','scope':'code/manifests/test files and historical documentary fixtures; excluded mutable generated outputs, shared runtime ledgers, secrets and this capture directory except source-moves test input','count':len(files),'sha256':hashlib.sha256(json.dumps(files,separators=(',',':'),sort_keys=True).encode()).hexdigest(),'files':files}
env=dict(os.environ);env['PATH']='/home/ricardo/.nvm/versions/node/v22.23.2/bin:'+env.get('PATH','')
if name.startswith(('postgres','full-tests')):env.update({'TEST_DATABASE_URL':'postgres://hiso:hiso-synthetic-only@127.0.0.1:55594/hiso','PHASE4A_PG_REQUIRED':'1','PHASE4A_DISPOSABLE_PG':'1'})
if name.startswith('e2e'):env.update({'CI':'1','CVG_API_PORT':'3254','CVG_WEB_PORT':'4254'})
before=inputs();(out/f'{name}-inputs-before.json').write_text(json.dumps(before,indent=2)+'\n');start=datetime.datetime.now(datetime.timezone.utc).isoformat()
with (out/f'{name}.log').open('w') as log:
 log.write('CAPTURE_COMMAND: '+json.dumps(command)+'\n');log.flush();p=subprocess.run(command,cwd=candidate,env=env,stdout=log,stderr=subprocess.STDOUT)
after=inputs();(out/f'{name}-inputs-after.json').write_text(json.dumps(after,indent=2)+'\n')
record={'name':name,'command':command,'cwd':str(candidate),'startedAtUtc':start,'finishedAtUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'exitCode':p.returncode,'log':f'{name}.log','node':'22.23.2','scope':'Owned isolated synthetic candidate only','inputFingerprintBefore':before['sha256'],'inputFingerprintAfter':after['sha256'],'inputSentinel':'MATCH' if before['sha256']==after['sha256'] else 'DRIFT','runnerVersion':2}
(out/f'{name}.json').write_text(json.dumps(record,indent=2)+'\n');print(json.dumps(record));lines=(out/f'{name}.log').read_text().splitlines();print('\n'.join(lines[-32:] if p.returncode else lines[-9:]));sys.exit(p.returncode if p.returncode else 0 if before['sha256']==after['sha256'] else 2)
