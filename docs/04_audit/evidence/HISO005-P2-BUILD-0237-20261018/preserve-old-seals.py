from pathlib import Path
import datetime,hashlib,json

ev=Path(__file__).resolve().parent
base=ev.parent
items=[
 ('HISO005-0236-BUILTIN-REPAIR-20261018','evidence-manifest-final.json','3dc319ae46dc422553dbbefa3d594c9e667ffd968a224f3a5e4df910663194ad',728),
 ('HISO005-P2-RESOLUTION-SPEC-20261018','evidence-manifest-final.json','bb4c8d9b92d9ac7da517f0a438b9d9ca115e7a959aff58b8f30e53766553b941',88),
 ('HISO005-0236-RESOLVER-CONFORMANCE-20261018','evidence-manifest-final.json','c6b0d72fd22d931ccc6189f9d53459e71e2467d6b53041821773a1119deca304',1598),
 ('HISO005-P2-SPEC-20261018/build0236','evidence-manifest-final.json','ec7defd5317f6f88e74d7096d6305576868a5df9be38d67d19264fbcc7715641',1592),
 ('HISO005-0234-BUILD-20261017','evidence-manifest.json','dc124498646859eebc4df2b756227493253a14f15bf09e7edf0a5db2a4110f3d',250),
 ('HISO005-PROOF-PLAN-20261017','evidence-manifest.json','de832a62b033dd91ea5473af199f7e3fcdc93b35069b5876309ffb51a5d047ad',31),
 ('B6-0228-BUILD-20261017','evidence-manifest.json','fbab2a084675484f56ab6a97c93bdd831e97852db1c4bf50079d5315a4e76466',179),
 ('DOCS-ISOLATION-20261017','evidence-manifest.json','b37febe823ed6542082074b91ef906703779ea171cc3e3df261b1d5ff6daaad1',66)
]
rows=[]
for folder,name,digest,count in items:
    root=base/folder
    path=root/name
    assert hashlib.sha256(path.read_bytes()).hexdigest()==digest
    manifest=json.loads(path.read_text())
    assert len(manifest['files'])==count
    for record in manifest['files']:
        path=root/record['path']
        assert path.resolve().is_relative_to(root.resolve()) and not path.is_symlink()
        data=path.read_bytes()
        assert len(data)==record['bytes'] and hashlib.sha256(data).hexdigest()==record['sha256'],str(path)
    rows.append({'bundle':folder,'filesVerified':count,'manifestSha256':digest,'allBytesUnchanged':True})
result={'status':'PASS_PRIOR_SEALED_BYTES_UNCHANGED','observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'filesVerified':sum(x['filesVerified']for x in rows),'bundles':rows,'scope':'Frozen artifacts/commits remain historical. Current candidate is a separate fresh seven-file BUILD0237 under explicit T3 approval; no earlier verdict was reclassified.'}
(ev/'prior-sealed-preserved-final.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'status':result['status'],'filesVerified':result['filesVerified']}))
