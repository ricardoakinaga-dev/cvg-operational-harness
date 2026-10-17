import os,json,pathlib,subprocess,datetime
out=pathlib.Path(__file__).parent
root=out.parent/'worktree'
env=os.environ.copy();env['PATH']='/home/ricardo/.nvm/versions/node/v22.23.2/bin:'+env['PATH'];env['TMPDIR']=str(out/'tmp');env['NODE_OPTIONS']='--require='+str(out/'capture.cjs')
cmd=['npm','test','--','tests/ci-bar-e2e-finalizer.test.js']
start=datetime.datetime.now(datetime.timezone.utc).isoformat()
r=subprocess.run(cmd,cwd=root,env=env,capture_output=True,timeout=90)
(out/'retry1.stdout.log').write_bytes(r.stdout);(out/'retry1.stderr.log').write_bytes(r.stderr)
meta={'argv':cmd,'cwd':str(root),'envOverrides':{k:env[k] for k in ['PATH','TMPDIR','NODE_OPTIONS']},'startedAt':start,'finishedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'exit':r.returncode,'stdoutBytes':len(r.stdout),'stderrBytes':len(r.stderr)}
(out/'retry1.json').write_text(json.dumps(meta,indent=2)+'\n')
print(json.dumps(meta,indent=2))
for p in sorted(out.glob('child-*.stderr.log')): print(str(p)+': '+p.read_text())
for p in sorted(out.glob('git-error-*.json')): print(str(p)+': '+p.read_text())
