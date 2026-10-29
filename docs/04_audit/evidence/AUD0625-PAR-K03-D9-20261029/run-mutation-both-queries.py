import json,subprocess,sys,os
# both queries unqualified at once: patch file, run, restore
W='apps/worker/src/postgres-role-preflight.ts'
orig=open(W,'rb').read(); s=orig.decode()
q="to_regclass(format('%I.%I', current_schema(), 'operational_effect_journal'))"
assert s.count(q)==2
open(W,'w').write(s.replace(q,"to_regclass('operational_effect_journal')"))
try:
    r=subprocess.run(['npx','vitest','run','apps/worker/src/__tests__/postgres-role-preflight.test.ts','--maxWorkers=2'],capture_output=True,text=True)
    res=[{'id':'T3','what':'both journal catalog queries resolve the unqualified name (TEMP shadow)','status':'KILLED' if r.returncode else 'SURVIVED'}]
finally:
    open(W,'wb').write(orig)
json.dump(res,open(sys.argv[1],'w'),indent=1); print(res)
