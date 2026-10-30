import json, subprocess, sys, os
os.chdir('/mnt/dados/cvg-work/aud0625-0262-p2-07')
C='scripts/lib/operator-action-connect.ts'; L='scripts/lib/operator-action.ts'; S='scripts/revoke-operator-sessions.ts'
M=[
 ('P1 scrub keeps PGPASSWORD',C,"key.startsWith('PG')","key.startsWith('PGX')"),
 ('P2 scrub not applied in createPool',C,"  const config = poolConfigFor(connectionText, expected)\n  scrubPgEnvironment(env)","  const config = poolConfigFor(connectionText, expected)"),
 ('P3 query allowed',C,"if (text.includes('?') || text.includes('#')) {","if (text.includes('#')) {"),
 ('P4 fragment allowed',C,"if (text.includes('?') || text.includes('#')) {","if (text.includes('?')) {"),
 ('P5 host not from profile',C,"    host: expected.host,\n    port: expected.port,","    host: url.hostname,\n    port: expected.port,"),
 ('P6 port not from profile',C,"    port: expected.port,\n    database","    port: Number(url.port || 5432),\n    database"),
 ('P7 database not from profile',C,"    database: expected.database,\n    user","    database: decodeURIComponent(url.pathname.slice(1)),\n    user"),
 ('P8 ssl left to the environment',C,"    ssl: false,\n",""),
 ('P9 profile host unchecked',C,"url.hostname !== expected.host ||",""),
 ('P10 profile user unchecked',C,"    decodeURIComponent(url.username) !== expected.user\n","    false\n"),
 ('P11 digest ignores file content',L,"createHash('sha256').update(file.bytes).digest('hex')","'x'"),
 ('P12 digest ignores label',L,"`${file.label}\\0${","`${'-'}\\0${"),
 ('P13 hard link allowed',L,"  if (stat.nlink !== 1) refuse(`${label} has more than one hard link`)\n",""),
 ('P15 artifact omits persistence',L,"  'scripts/lib/operator-action-connect.ts',\n  'packages/persistence/src/case-authority.ts',\n  'packages/persistence/src/case-authority-postgres.ts'\n]","  'scripts/lib/operator-action-connect.ts'\n]"),
 ('P16 artifact omits decision library',L,"  'scripts/lib/operator-action.ts',\n  'scripts/lib/operator-action-connect.ts',","  'scripts/lib/operator-action-connect.ts',"),
]
TESTS=['tests/operator-action.test.ts','tests/operator-action-connect.test.ts','tests/operator-action-cli.test.ts']
only=set(sys.argv[2:]); res=[]
for name,f,old,new in M:
    if only and name.split()[0] not in only: continue
    src=open(f).read()
    if src.count(old)!=1:
        res.append({'mutant':name,'status':'NOT_APPLIED','count':src.count(old)}); print(name,'NOT_APPLIED',src.count(old)); continue
    open(f,'w').write(src.replace(old,new))
    try:
        r=subprocess.run(['npx','vitest','run',*TESTS,'--maxWorkers=2'],capture_output=True,text=True,timeout=600)
        killed=r.returncode!=0
    finally:
        subprocess.run(['git','checkout','--',f],check=True)
    res.append({'mutant':name,'status':'KILLED' if killed else 'SURVIVED'}); print(name,res[-1]['status'],flush=True)
json.dump(res,open(sys.argv[1],'w'),indent=1)
