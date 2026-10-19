from pathlib import Path
import json,os,subprocess,hashlib
O=Path(__file__).parent; P=O.parent; D=P/'certification-r4-worktree'; N=Path('/home/ricardo/.nvm/versions/node/v22.23.2/bin/node'); S=O/'synthetic'; S.mkdir(exist_ok=True)
(S/'node_modules').mkdir(exist_ok=True)
for x in (D/'node_modules').iterdir():
 if not x.name.startswith('.') and not (S/'node_modules'/x.name).exists(): (S/'node_modules'/x.name).symlink_to(x,target_is_directory=x.is_dir())
(S/'scripts').mkdir(exist_ok=True); (S/'tests').mkdir(exist_ok=True)
for name in ['run-core-coverage.mjs','coverage-thresholds.mjs']: (S/'scripts'/name).write_bytes((D/'scripts'/name).read_bytes())
config=(D/'vitest.config.mts').read_text().replace('export default defineConfig({',"export default defineConfig({\n  cacheDir: resolve(workspaceRoot, '.cache'),")
(S/'vitest.config.mts').write_text(config)
(S/'package.json').write_text('{"type":"module"}')
# Cache location is the only config addition; original thresholds/include/exclude preserved.
pkgs=['contracts','harness','orchestrator','agent-runtime']; dims=['statements','branches','functions','lines']; records=[]
for pkg in pkgs+['other']:
 p=S/f'packages/{pkg}/src';p.mkdir(parents=True,exist_ok=True)
 source='export function evaluate(x: boolean) {\n if (x) return 1;\n return 0\n}\nexport function extra() { return 7 }\n'
 if pkg=='other': source+='\n'.join(f'export function f{i}() {{ return {i} }}' for i in range(100))
 (p/'probe.ts').write_text(source)
env={'PATH':str(N.parent)+':/usr/bin:/bin','HOME':str(O/'home'),'TMPDIR':str(O/'tmp'),'LANG':'C.UTF-8','CVG_TEST_SCOPE':'core','CI':'true','NO_COLOR':'1'}
for v in ['home','tmp']: (O/v).mkdir(exist_ok=True)
def run(label,argv):
 r=subprocess.run(argv,cwd=S,env=env,capture_output=True,text=True,timeout=55)
 (O/f'{label}.stdout.log').write_text(r.stdout);(O/f'{label}.stderr.log').write_text(r.stderr)
 z={'label':label,'argv':[str(x) for x in argv],'cwd':str(S),'exit':r.returncode,'stdout_sha256':hashlib.sha256(r.stdout.encode()).hexdigest(),'stderr_sha256':hashlib.sha256(r.stderr.encode()).hexdigest()};records.append(z);print(label,r.returncode,r.stdout[-240:].replace('\n',' '),r.stderr[-260:].replace('\n',' '),flush=True)
 return r
# Exact checked-in focused suite; writes only to synthetic subtree.
(S/'tests/coverage-thresholds.test.js').write_bytes((D/'tests/coverage-thresholds.test.js').read_bytes())
# focused suite already executed: 81/81; preserve original logs
(S/'tests/coverage-thresholds.test.js').unlink()
for case in ['good']+pkgs+['aggregate-bad']:
 lines=["import {test, expect} from 'vitest'"]
 for i,pkg in enumerate(pkgs+['other']): lines.append(f"import * as p{i} from '../packages/{pkg}/src/probe'")
 lines.append("test('synthetic real V8 coverage', () => {")
 for i,pkg in enumerate(pkgs+['other']):
  lines.append(f'expect(p{i}.evaluate(true)).toBe(1)')
  if case!=pkg:
   lines.append(f'expect(p{i}.evaluate(false)).toBe(0); expect(p{i}.extra()).toBe(7)')
  if pkg=='other' and case!='aggregate-bad':
   lines.extend(f'expect(p{i}.f{k}()).toBe({k})' for k in range(100))
 lines.append('})'); (S/'tests/probe.test.ts').write_text('\n'.join(lines))
 r=run('real-default-'+case,[N,S/'scripts/run-core-coverage.mjs','tests/probe.test.ts'])
 if (r.returncode==0)!=(case=='good'): raise SystemExit('Unexpected acceptance '+case)
(O/'probe-results.json').write_text(json.dumps(records,indent=2)+'\n')
