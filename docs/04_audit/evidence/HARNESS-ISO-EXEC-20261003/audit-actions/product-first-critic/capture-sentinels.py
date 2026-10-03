from pathlib import Path
import hashlib,json,os,subprocess
own=Path(__file__).parent;root=Path('/home/ricardo/Área de trabalho/cvg-operational-harness');can=Path('/home/ricardo/.cache/cvg-harness-audit-actions-20261003/product-candidate');scratch=own/'repo-fresh'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
p=json.loads((root/'docs/04_audit/evidence/HARNESS-ISO-EXEC-20261003/audit-actions/product-first-critic-packet.json').read_text())
pre=json.loads((own/'canonical-pre.json').read_text());canpost={n:sha(can/n) for n in pre};(own/'canonical-post.json').write_text(json.dumps(canpost,indent=2))
base=json.loads((own/'rebuild-receipt.json').read_text())['files'];exclude=['.cvg-audit-candidate.json'];novel=['products/shift-assistant/src/__tests__/critic-adversarial.test.ts']
scratchpre={n:v for n,v in base.items() if n not in exclude};scratchpost={n:sha(scratch/n) for n in scratchpre};(own/'scratch-pre.json').write_text(json.dumps(scratchpre,indent=2));(own/'scratch-post.json').write_text(json.dumps(scratchpost,indent=2))
packet={n:{'expected':v,'canonical':sha(can/n),'scratch':sha(scratch/n)} for n,v in p['artifactSourceHashes'].items()}
assert all(x['canonical']==x['expected']==x['scratch'] for x in packet.values())
links=[]
for dirpath,dirs,files in os.walk(scratch/'node_modules',followlinks=False):
 for n in dirs+files:
  f=Path(dirpath)/n
  if f.is_symlink():
   target=f.resolve(strict=True);assert target.is_relative_to(scratch),str(f)+' -> '+str(target)
   links.append({'path':str(f.relative_to(scratch)),'target':str(target.relative_to(scratch))})
(own/'dependency-symlink-containment.json').write_text(json.dumps(links,indent=2))
generated={}
for b in [scratch/'products/shift-assistant/dist',scratch/'node_modules/.vite',scratch/'node_modules/.vite-temp']:
 if b.exists():
  for f in b.rglob('*'):
   if f.is_file() and not f.is_symlink():generated[str(f.relative_to(scratch))]=sha(f)
(own/'generated-output-hashes.json').write_text(json.dumps(generated,indent=2))
# Inspect path inventories without consuming file content/history.
def selected(r):
 raw=subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z'],cwd=r)
 return {n for n in raw.decode().rstrip('\0').split('\0') if n and (r/n).is_file() and not set(Path(n).parts)&{'node_modules','.git','.gauntlet','dist','coverage','test-results','playwright-report'}}
canonicalExtras=sorted(selected(can)-set(pre));scratchExtras=sorted(selected(scratch)-set(base)-set(novel))
record={'canonical':'MATCH' if canpost==pre and not canonicalExtras else 'DRIFT','scratch':'MATCH' if scratchpost==scratchpre and not scratchExtras else 'DRIFT','canonicalSourceCount':len(pre),'scratchSourceCount':len(scratchpre),'packetSourceCount':len(packet),'packet90Sources':packet,'canonicalChanged':[n for n in pre if pre[n]!=canpost[n]],'canonicalNewSelectedPaths':canonicalExtras,'scratchChanged':[n for n in scratchpre if scratchpre[n]!=scratchpost[n]],'scratchNewUnexcludedPaths':scratchExtras,'scratchAddedProbeFiles':{n:sha(scratch/n) for n in novel},'explicitMetadataExclusion':{n:{'reason':'portable rebuild creates per-copy audit metadata; not runtime/test/config/lock/fixture source','canonical':sha(can/n),'scratch':sha(scratch/n)} for n in exclude},'canonicalFrozenBundle':sha(can/'products/shift-assistant/dist/shift-assistant.mjs'),'scratchCopiedFrozenBundle':sha(scratch/'products/shift-assistant/dist/shift-assistant.mjs'),'expectedFrozenBundle':p['publicBundleSha256'],'criteria':{'expected':p['criteriaFileSha256'],'actual':sha(root/p['criteriaFile'])},'approvedSpecs':{n:{'expected':v,'actual':sha(root/n)} for n,v in p['approvedSpecs'].items()},'scope':'Canonical full selected non-generated 7391-file tree including all 90 packet product/test/fixture paths, core/config/package-lock inputs; immutable frozen bundle separately. Scratch reconstructable pre-image from rebuild receipt, generated per-copy marker excluded; one named novel probe source excluded. Vitest/dependency/build caches are generated output, separately hashed, not source. No C1 judgment.'}
assert record['canonical']=='MATCH' and record['scratch']=='MATCH';assert record['canonicalFrozenBundle']==record['scratchCopiedFrozenBundle']==record['expectedFrozenBundle'];assert record['criteria']['expected']==record['criteria']['actual'];assert all(v['expected']==v['actual'] for v in record['approvedSpecs'].values())
(own/'sentinels.json').write_text(json.dumps(record,indent=2));print(json.dumps({k:record[k] for k in ['canonical','scratch','packetSourceCount','canonicalSourceCount','scratchSourceCount','canonicalFrozenBundle']}));print('dependency symlinks contained:',len(links),'generated artifacts hashed:',len(generated))
