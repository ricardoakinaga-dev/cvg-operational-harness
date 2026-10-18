from pathlib import Path
import hashlib,json,os,sys
base=Path('/tmp/cvg-pare100-exec-20261014-6az3hlay'); packet=base/'critic-f0-packet'; sentinel=base/'critic-f0-packet.sentinel.json'
expected=json.loads(sentinel.read_text()); actual={}; links=[]
for root,ds,fs in os.walk(packet,followlinks=False):
 for name in ds+fs:
  f=Path(root)/name
  if f.is_symlink(): links.append(str(f.relative_to(packet)))
 for name in fs:
  f=Path(root)/name
  if not f.is_symlink(): actual[str(f.relative_to(packet))]=hashlib.sha256(f.read_bytes()).hexdigest()
r={'expected_files':len(expected),'actual_files':len(actual),'missing':sorted(expected.keys()-actual.keys()),'extra':sorted(actual.keys()-expected.keys()),'changed':sorted(k for k in expected.keys()&actual.keys() if expected[k]!=actual[k]),'symlinks':links,'sentinel_sha256':hashlib.sha256(sentinel.read_bytes()).hexdigest()}
r['match']=not any(r[k] for k in ['missing','extra','changed','symlinks'])
r['sentinel_unchanged_from_before']=r['sentinel_sha256']==json.loads((base/'critic-reference-result/sentinel-before.json').read_text())['sentinel_sha256']
(base/'critic-reference-result/sentinel-after.json').write_text(json.dumps(r,indent=2)+'\n')
print(json.dumps(r,indent=2));sys.exit(0 if r['match'] and r['sentinel_unchanged_from_before'] else 1)
