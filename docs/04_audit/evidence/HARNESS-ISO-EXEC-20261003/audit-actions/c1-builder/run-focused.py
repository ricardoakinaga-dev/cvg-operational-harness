from pathlib import Path
import json, subprocess, datetime, hashlib
root=Path.cwd(); evidence=root/'docs/04_audit/evidence/HARNESS-ISO-EXEC-20261003/audit-actions/c1-builder'
scratch=Path('/home/ricardo/.cache/cvg-harness-audit-actions-20261003/c1-builder')
node='/home/ricardo/.nvm/versions/node/v22.23.2/bin/node'
records=[]
def run(name,args,cwd,expected=0):
 start=datetime.datetime.now(datetime.timezone.utc).isoformat()
 result=subprocess.run(args,cwd=cwd,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
 (evidence/(name+'.stdout.log')).write_text(result.stdout)
 (evidence/(name+'.stderr.log')).write_text(result.stderr)
 records.append(dict(id=name,argv=args,cwd=str(cwd),observedAt=start,exitStatus=result.returncode,expectedExit=expected,matchedExpected=result.returncode==expected,evidenceKind='COMMAND',procedureStatus='EXECUTED'))
 print(name, result.returncode, flush=True)
 return result
candidate=scratch/'candidate'; baseline=scratch/'baseline-expanded'
run('expanded-baseline',[node,'node_modules/vitest/vitest.mjs','run','tests/product-boundary.test.js','--no-file-parallelism','--maxWorkers=1','--reporter=verbose','--reporter=json','--outputFile.json='+str(evidence/'expanded-baseline.json')],baseline,1)
run('focused-final',[node,'node_modules/vitest/vitest.mjs','run','tests/product-boundary.test.js','--no-file-parallelism','--maxWorkers=1','--reporter=verbose','--reporter=json','--outputFile.json='+str(evidence/'focused-final.json')],candidate)
run('lint-focused',[node,'node_modules/eslint/bin/eslint.js','scripts/check-product-boundary.mjs','tests/product-boundary.test.js'],candidate)
run('format-focused',[node,'node_modules/prettier/bin/prettier.cjs','--check','scripts/check-product-boundary.mjs','tests/product-boundary.test.js'],candidate)
for p in ['scripts/check-product-boundary.mjs','tests/product-boundary.test.js']:
 run('syntax-'+Path(p).stem,[node,'--check',p],candidate)
run('archived-final',[node,str(evidence/'replay-archived.mjs'),str(root/'scripts/check-product-boundary.mjs'),str(scratch),str(evidence/'archived-final-frozen.json')],root)
run('root-positive-final',[node,'scripts/check-product-boundary.mjs'],root)
(evidence/'commands.json').write_text(json.dumps(records,indent=2)+'\n')
print(json.dumps({'allExpected':all(r['matchedExpected'] for r in records)},indent=2))
