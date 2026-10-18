from pathlib import Path
import json,hashlib
b=Path('/tmp/cvg-pare100-exec-20261014-6az3hlay');p=b/'critic-qa-ab-r2-packet';r=b/'critic-qa-ab-r2-result'
sentinel=b/'critic-qa-ab-r2-packet.sentinel.json'
expected=json.loads(sentinel.read_text())['files'];before=json.loads((r/'packet-before.json').read_text())
actual={str(f.relative_to(p)):hashlib.sha256(f.read_bytes()).hexdigest() for f in p.rglob('*') if f.is_file()}
canonical=lambda d:hashlib.sha256(json.dumps(d,sort_keys=True,separators=(',',':')).encode()).hexdigest()
check={'phase':'after','count':len(actual),'sentinel_count':len(expected),'extra':sorted(actual.keys()-expected.keys()),'missing':sorted(expected.keys()-actual.keys()),'changed':[k for k in actual.keys()&expected.keys() if actual[k]!=expected[k]],'symlinks':[str(f.relative_to(p)) for f in p.rglob('*') if f.is_symlink()],'sentinel_sha256':hashlib.sha256(sentinel.read_bytes()).hexdigest(),'before_canonical_map_sha256':canonical(before),'after_canonical_map_sha256':canonical(actual),'before_equals_after':before==actual,'sentinel_unchanged':hashlib.sha256(sentinel.read_bytes()).hexdigest()==json.loads((r/'sentinel-before.json').read_text())['sentinel_sha256']}
(r/'packet-after.json').write_text(json.dumps(actual,indent=2,sort_keys=True)+'\n');(r/'sentinel-after.json').write_text(json.dumps(check,indent=2)+'\n')
print(json.dumps(check,indent=2));assert before==actual==expected;assert check['sentinel_unchanged'];assert not check['symlinks']
