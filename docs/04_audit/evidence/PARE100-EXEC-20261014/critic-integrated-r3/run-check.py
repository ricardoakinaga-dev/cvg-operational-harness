import sys,os,subprocess,json,time,pathlib,hashlib
b=pathlib.Path('/tmp/cvg-pare100-exec-20261014-6az3hlay');r=b/'critic-integrated-r3-result';s=b/'critic-integrated-r3-scratch'
label=sys.argv[1];cmd=sys.argv[2:];env={'PATH':'/home/ricardo/.nvm/versions/node/v22.23.2/bin:/usr/bin:/bin','HOME':str(s/'home'),'TMPDIR':str(s/'tmp'),'LANG':'C.UTF-8','TZ':'UTC','CI':'1','CVG_TEST_SCOPE':'core','npm_config_cache':str(s/'home/.npm')}
t=time.time();log=r/(label+'.log')
with log.open('w') as f:
 f.write('COMMAND '+json.dumps(cmd)+'\nCWD '+str(s)+'\nENV '+json.dumps(env)+'\n');f.flush()
 try:
  p=subprocess.run(cmd,cwd=s,env=env,stdout=f,stderr=subprocess.STDOUT,timeout=240);code=p.returncode
 except subprocess.TimeoutExpired:code=124;f.write('\nTIMEOUT 240s\n')
d={'label':label,'command':cmd,'cwd':str(s),'exit_code':code,'duration_seconds':round(time.time()-t,3),'log_sha256':hashlib.sha256(log.read_bytes()).hexdigest()};(r/(label+'.json')).write_text(json.dumps(d,indent=2)+'\n');print(json.dumps(d));print(log.read_text()[-5500:])
