import xml.etree.ElementTree as ET, json, hashlib, os, sys
ev='/home/ricardo/Área de trabalho/cvg-operational-harness/docs/04_audit/evidence/CLAUDE100-EXEC-20261017/journal0225-build/'
cand='/mnt/ia/cvg-claude100-journal0225-20261018'
out=[]
for r in ['native-1792348081715','native-1792348092560','native-1792348098883','native-1792348115538','native-1792348118290','native-1792348187435','native-1792338747733','native-1792338826626']:
    root=ET.parse(ev+r+'-junit.xml').getroot()
    tcs=list(root.iter('testcase'))
    fails=[{'name':t.attrib['name'],'message':(t.find('failure').attrib.get('message') or '')[:200]} for t in tcs if t.find('failure') is not None or t.find('error') is not None]
    skips=sum(1 for t in tcs if t.find('skipped') is not None)
    b=json.load(open(ev+r+'-binding.json'))
    drift=[]
    for i in b['inputs']:
        p=os.path.join(cand,i['path'])
        h=hashlib.sha256(open(p,'rb').read()).hexdigest() if os.path.exists(p) else 'MISSING'
        if h!=i['sha256']: drift.append({'path':i['path'],'bound':i['sha256'],'now':h})
    out.append({'runId':r,'profile':b.get('profile'),'junitSha256':hashlib.sha256(open(ev+r+'-junit.xml','rb').read()).hexdigest(),'bindingSha256':hashlib.sha256(open(ev+r+'-binding.json','rb').read()).hexdigest(),'tests':len(tcs),'failures':fails,'skipped':skips,'inputs':len(b['inputs']),'driftAgainstFrozenCandidate':drift})
json.dump(out,sys.stdout,indent=1,ensure_ascii=False)
