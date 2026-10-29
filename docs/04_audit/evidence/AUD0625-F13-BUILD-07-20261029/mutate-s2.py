import json, subprocess, sys, os
os.chdir('/mnt/dados/cvg-work/aud0625-f13-07')
F='products/shift-assistant/src/source-evidence.ts'
M=[
 ('S1 unsourced check off',F,"if (sameNumber.length === 0) {","if (false) {"),
 ('S2 patient block ignored',F,": sameNumber.filter((item) => owner(item.index) === wanted)",": sameNumber"),
 ('S3 unit always ok',F,"(item) => !(item.unit && value.unit) || item.unit === value.unit","() => true"),
 ('S4 field always ok',F,"(item) => !(item.label && value.label) || item.label === value.label","() => true"),
 ('S5 homonym names anchor',F,"if (!ambiguousName[index]) {","if (true) {"),
 ('S6 unanchored patient accepted',F,"} else if (!anchored.has(output.patient)) {","} else if (false) {"),
 ('S7 homonym task picks first',F,"patient = hits.length === 1 ? hits[0]! : 'unbound'","patient = hits[0] ?? 'unbound'"),
 ('S8 general task matches any block',F,"wanted = organized.pacientes.length === 0 ? 'any' : null","wanted = 'any'"),
 ('S9 single patient binding off',F,"} else if (organized.pacientes.length === 1) {\n      patient = 0\n    }","}"),
 ('S10 word boundary off',F,"if (\n      !(before && /[\\p{L}\\d]/u.test(before)) &&\n      !(after && /[\\p{L}\\d]/u.test(after))\n    ) {","if (true) {"),
 ('S11 compound unit shortened',F,"  'mg/kg',\n  'mg/ml',","  'mg',\n  'mg/ml',"),
 ('S12 label across another number',F,"!/\\d/.test(clause.slice(hit.index + hit[0].length))","true"),
 ('S13 decimal comma kept',F,"num: match[0].replace(',', '.'),","num: match[0],"),
 ('S14 id anchor off',F,"if (id.length >= 2) {","if (false) {"),
 ('S15 unit mismatch reported as field',F,"'VALUE_UNIT_MISMATCH',","'VALUE_FIELD_MISMATCH',"),
 ('S16 no ambiguity for unbound',F,"output.patient === 'unbound'","output.patient === 'never'"),
]
TESTS=['products/shift-assistant/src/__tests__/source-evidence.test.ts','products/shift-assistant/src/__tests__/preview-receipt-reliability.test.ts','products/shift-assistant/src/__tests__/shift-assistant.test.ts','products/shift-assistant/src/__tests__/confirmation-reliability.test.ts']
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
