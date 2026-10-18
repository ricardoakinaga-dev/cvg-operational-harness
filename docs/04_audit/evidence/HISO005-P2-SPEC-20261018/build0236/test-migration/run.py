import os,sys,json,time,subprocess,datetime,hashlib
from pathlib import Path
c=Path('/home/ricardo/cvg-candidates/hiso005-integrated-20261018'); e=Path('/home/ricardo/Área de trabalho/cvg-operational-harness/docs/04_audit/evidence/HISO005-P2-SPEC-20261018/build0236/test-migration'); t=Path('/tmp/cvg-hiso005-integration-20261018/test-migration')
label=sys.argv[1]; tmp=t/label; tmp.mkdir(exist_ok=False)
node='/home/ricardo/.nvm/versions/node/v22.23.2/bin/node'
argv=[node,'node_modules/vitest/vitest.mjs','run','tests/pare100-sdk-boundary-qualification.test.js','tests/pare100-compiled-kernel-boundary.test.js','--config',str(t/'focused.config.mjs'),'--reporter=verbose','--reporter=json','--outputFile='+str(e/(label+'.json'))]
env=os.environ.copy();env.update(TMPDIR=str(tmp),CVG_TEST_SCOPE='core',npm_config_cache=str(t/'npm-cache'),XDG_CACHE_HOME=str(t/'cache'),PATH=str(Path(node).parent)+':'+env['PATH'])
inputs=[*c.glob('scripts/boundary-*.mjs'),c/'scripts/check-product-boundary.mjs',c/'scripts/tsconfig-path-grammar.mjs',c/'tests/pare100-sdk-boundary-qualification.test.js',c/'tests/pare100-compiled-kernel-boundary.test.js',c/'node_modules/typescript/lib/typescript.js',c/'vitest.config.mts',t/'focused.config.mjs']
def seals(): return {str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in inputs}
pre=seals()
start=datetime.datetime.now(datetime.timezone.utc).isoformat(); now=time.monotonic()
with (e/(label+'.log')).open('w') as log: p=subprocess.run(argv,cwd=c,env=env,stdout=log,stderr=subprocess.STDOUT)
meta={'argv':argv,'cwd':str(c),'env':{k:env[k] for k in ['TMPDIR','CVG_TEST_SCOPE','npm_config_cache','XDG_CACHE_HOME']},'started':start,'elapsedSeconds':time.monotonic()-now,'exitCode':p.returncode,'nodeSha256':hashlib.sha256(Path(node).read_bytes()).hexdigest(),'inputsBefore':pre,'inputsAfter':seals()}
(e/(label+'-command.json')).write_text(json.dumps(meta,indent=2)+'\n');print(json.dumps(meta))
