from pathlib import Path
import json,hashlib,re,difflib,gzip
R=Path(__file__).resolve().parent;C=Path('/mnt/dados/cvg-work/aud0625-par-q01-catalog-20261031/candidate');ROOT=Path('/home/ricardo/Área de trabalho/cvg-operational-harness');ER='docs/04_audit/evidence/AUD0625-Q01-CURRENT-DOCS-272-20261031';E=C/ER;H=lambda b:hashlib.sha256(b).hexdigest();J=lambda p:json.loads(p.read_text());task=J(R/'task.json');ops=J(R/'edits.json');rows=[]
for rel in task['targets']:
 before=(R/'before'/rel).read_text();after=(C/rel).read_text();inverse=after
 for op in reversed(ops):
  if op['path']==rel:assert inverse.count(op['new'])==1,(rel,op['new'][:80]);inverse=inverse.replace(op['new'],op['old'])
 assert inverse==before,rel
 # No table row or card heading altered by this synchronization.
 assert [s for s in before.splitlines() if s.startswith('|')]==[s for s in after.splitlines() if s.startswith('|')],rel
 assert re.findall(r'^### PAR-[^\n]+',before,re.M)==re.findall(r'^### PAR-[^\n]+',after,re.M)
 rows.append({'path':rel,'before_sha256':H(before.encode()),'after_sha256':H(after.encode()),'inverse_own_patch_exact':True,'all_tables_verbatim':True,'card_headers_verbatim':True})
 p=R/'diffs'/Path(rel).name;p.parent.mkdir(exist_ok=True);p.write_text(''.join(difflib.unified_diff(before.splitlines(True),after.splitlines(True),fromfile='before/'+rel,tofile='after/'+rel)))
r379=(C/task['targets'][0]).read_text();r380=(C/task['targets'][1]).read_text();r381=(C/task['targets'][2]).read_text()
rule='5. Uma revisão independente por cartão e no máximo dois retrabalhos (proposta D3). Se a revisão rejeitar duas vezes, o cartão volta para replanejamento, sem novo ciclo de crítica.'
assert rule in r380 and r380.splitlines()[30]==rule
assert 'com as 266 capacidades revisadas no PAR-Q01' not in r379 and 'a partir das 266 capacidades' not in r379
assert '- Entrega: Revisar as 266 capacidades' not in r380 and 'L5/L0 reconciliam as266 capacidades' not in r380
assert 'obter 266/266 DeepSeek' not in r381 and '37 C100,266 capacidades' not in r381
assert 'escopo-par-cap-vigente' in r380
pins=[]
for n,expected in [('30','111781c253f5862aec3037ee8f817f9d4dcdfafebea50369cd66cc8d25ffd0fc'),('32','a0a0c068e08b850811844221fba48245e265dff2230fb17e018e89eabe6b1c81')]:
 rel='docs/04_audit/evidence/USER-DECISIONS-20261028/human-decisions-'+n+'.json';raw=(ROOT/rel).read_bytes();assert H(raw)==expected;pins.append({'path':rel,'sha256':H(raw)})
mrel='docs/04_audit/evidence/AUD0625-PAR-Q01-CATALOG-20261031/denominator-272/measure.json';raw=(ROOT/mrel).read_bytes();measure=json.loads(raw);assert measure['denominator']==272 and measure['catalog']['raw_sha256']=='df114f5eb8aa99c638bb1472279adda3151902f6824ed905fa4ba5307e693a84';assert not measure['canonical_catalog_published'] and measure['functional_pass_current']==0
catalog=ROOT/Path(mrel).parent/'catalog-272.json.gz';assert H(gzip.decompress(catalog.read_bytes()))==measure['catalog']['raw_sha256'];pins.append({'path':mrel,'sha256':H(raw)})
# Root source comparison is allowed before or after the owned delta, never another image.
rootimages=[]
for row in rows:
 got=H((ROOT/row['path']).read_bytes());assert got in [row['before_sha256'],row['after_sha256']],row['path'];rootimages.append({'path':row['path'],'sha256':got,'image':'OWN_AFTER' if got==row['after_sha256'] else 'SAVED_BEFORE'})
result={'status':'PASS_DOCUMENTARY_INVARIANTS','task':task['id'],'replacements':len(ops),'targets':rows,'authority_inputs':pins,'root_images':rootimages,'historical_counts_tables_unchanged':True,'statuses_dependencies_and_review_rule_unchanged':True,'new_semantic_review':False,'new_functional_credit':0,'new_scope':False}
(E/'verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'status':result['status'],'targets':len(rows),'inverse_own_edits_exact':True,'tables_preserved':True,'scope':272}))
