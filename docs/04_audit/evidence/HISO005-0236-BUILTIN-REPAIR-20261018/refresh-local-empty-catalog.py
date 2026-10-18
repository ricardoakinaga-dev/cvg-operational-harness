from pathlib import Path
import datetime,json,re

root=Path(__file__).resolve().parent
records=[]
indexpath=root/'review-r1/raw-result-index.json'
calls={x['id']:x for x in json.loads(indexpath.read_text())['calls']} if indexpath.exists() else {}
for path in sorted(root.rglob('*')):
    if not path.is_file() or path.stat().st_size:
        continue
    name=str(path.relative_to(root))
    record={'path':name,'bytes':0,'status':'capture_missing','command':None,'exitCode':None,'timestamp':None,'environment':None,'reason':'Empty capture preserved. Command-specific metadata is retained in adjacent receipts/raw indexes rather than inferred here; no PASS claim follows from emptiness.'}
    match=re.fullmatch(r'review-r1/raw/(\d+)\.(?:stdout|stderr)\.txt',name)
    if match and match.group(1) in calls:
        call=calls[match.group(1)]
        command=json.loads((root/'review-r1/raw'/(match.group(1)+'.command.json')).read_text())
        args=command['argv']
        argv=args if args and args[0]==command['executable'] else [command['executable'],*args]
        record.update(status='expected_empty',command=argv,exitCode=call['exit'],timestamp=call['finishedAt'],environment=command['environment'],reason='Actual empty stream of a fully recorded controlled call. Exit and structured result remain in raw-result-index.json and raw outputs; this catalog does not infer PASS from empty output.')
    if name=='certification-current-verification.stderr.txt':
        receipt=json.loads((root/'certification-current-verification.json').read_text())
        record.update(status='expected_empty',command=receipt['command'],exitCode=receipt['exitCode'],timestamp=receipt['finishedAt'],environment='Local fixed Node22 current verifier; see receipt',reason='Actual empty stderr from official verifier; its exit and complete stdout are independently recorded. Empty stderr is not itself verification success.')
    records.append(record)
result={'schemaVersion':1,'kind':'scoped-empty-capture-catalog','observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'policy':'Actual zero-byte captures only. Missing copied metadata remains null; original command and result evidence is authoritative.','files':records}
(root/'empty-artifact-status.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'emptyFiles':len(records),'centralTouched':False}))
