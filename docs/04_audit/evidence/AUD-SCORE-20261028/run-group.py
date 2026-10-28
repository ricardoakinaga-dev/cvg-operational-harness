import subprocess,json,sys
from pathlib import Path
r=Path('/mnt/dados/cvg-work/aud-score-20261028');group=sys.argv[1];files=json.loads((r/'test-groups.json').read_text())[group]
cmd=['python3',str(r/'run-check.py'),group,'600','node','node_modules/vitest/vitest.mjs','run',*files,'--no-file-parallelism','--maxWorkers=2','--reporter=json','--reporter=default','--outputFile='+str(r/(group+'-vitest.json'))]
raise SystemExit(subprocess.run(cmd).returncode)
