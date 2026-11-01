from pathlib import Path
import json,gzip,copy,hashlib,subprocess,collections
R=Path(__file__).resolve().parent;C=R.parent/'candidate';ROOT=Path('/home/ricardo/Área de trabalho/cvg-operational-harness');E=C/'docs/04_audit/evidence/AUD0625-PAR-Q01-CATALOG-20261031/denominator-272';B='docs/04_audit/evidence/AUD0625-PAR-Q01-CATALOG-20261031';H=lambda b:hashlib.sha256(b).hexdigest();J=lambda p:json.loads(p.read_text());G=lambda p:json.loads(gzip.decompress(p.read_bytes()))
cat=G(E/'catalog-272.json.gz');old=G(ROOT/B/'f01-bindings-batch01-repair/capabilities-r3-draft.json.gz');opts=J(ROOT/B/'f01-bindings-batch01-repair/scope-options.json')['options'][1]['proposed_capabilities'];scope=J(E/'scope-leaf-proposals.json');groups=G(E/'review-input355.json.gz');measure=J(E/'measure.json');handoff=J(E/'review-handoff.json');meta={x['id']:x for g in scope for x in g['leaf_metadata']}
expectedids=[x['id'] for x in old['capabilities']]+[x['id'] for x in opts]
repair=G(ROOT/B/'f01-bindings-batch01-repair/proposed-bindings.json.gz');util=G(ROOT/B/'f01-bindings-batch01-util/proposed-bindings.json.gz');originalgroups=[('repair',g) for g in repair]+[('util',g) for g in util]
def validate(d,sg,rg):
 caps=d['capabilities'];ids=[x['id'] for x in caps];assert ids==expectedids and len(set(ids))==d['denominator']==272
 assert d['measure_revision']=='r3-denominator-272' and d['numerator_pass_current']==0 and d['parity']=='NOT_MEASURED' and d['production']=='NO_GO'
 assert d['group_counts']==dict(collections.Counter(x['group'] for x in caps))
 for a,b in zip(old['capabilities'],caps[:270]):
  assert a['id']==b['id'] and a['description_verbatim']==b['description_verbatim']
  if a['id']!='G2/WEB-02':assert a==b
  else:
   for key in ['target_classification','classification_status','cards','reference_evidence','spec_binding','functional_validation']:assert a[key]==b[key]
 for x,o in zip(caps[270:],opts):
  assert x['id']==o['id'] and x['description_verbatim']==o['description'] and x['reference_evidence']==o['evidence']
  assert x['static_traceability']['leaf_ids']==o['leaf_ids'] and x['static_traceability']['semantic_binding']=='PROPOSED_NOT_REVIEWED'
  assert x['spec_binding']['declared_spec_numbers']==[] and x['implementation_owner']['executor'] is None
  for k in ['setup','positive','negative','artifacts','gates']:assert x['acceptance'][k]==o['proposed_future_acceptance'][k]
 for x in caps:assert x['functional_validation']['pass_current'] is False and x['functional_validation']['receipt'] is None and x['acceptance']['status']=='NOT_RUN'
 assert len(sg)==2 and sum(len(g['leaf_ids']) for g in sg)==26
 for g,o in zip(sg,opts):
  assert g['capability_ids']==[o['id']] and g['leaf_ids']==o['leaf_ids'] and g['status']=='PROPOSED_NOT_SEMANTICALLY_REVIEWED' and g['functional_credit']==0
  for m in g['leaf_metadata']:assert m==meta[m['id']] and m['id'] in o['leaf_ids']
 w=next(x for x in caps if x['id']=='G2/WEB-02');ex=w['reference_exception'];assert ex['cvg_control_waiver'] is False and ex['cvg_required_target']=='UNIVERSAL_FAIL_CLOSED' and ex['cvg_proxy_requirement']=='VALIDATE_AND_PIN_OR_DISABLE'
 statuses=[x['status'] for x in w['factual_protocol_reconciliation']['stronger_target_dispositions']];assert statuses==['DISPOSED_REFERENCE_EXCEPTION_CVG_UNIVERSAL_RETAINED','OPEN_FAIL_CLOSED_VS_STREAM_TRUNCATION_DISPOSITION']
 assert w['description_verbatim']==next(x for x in old['capabilities'] if x['id']=='G2/WEB-02')['description_verbatim']
 assert len(rg)==220
 for (label,orig),g in zip(originalgroups,rg):assert g['origin']==label and g['original_group']==orig and g['semantic_review_status']=='PENDING_INDEPENDENT_REVIEW' and g['functional_credit']==0
 allids=[i for g in rg for i in g['original_group']['leaf_ids']];assert len(set(allids))==len(allids)==355
 assert not d['q01_completion']['complete'] and not d['q01_completion']['canonical_catalog_published'] and d['replanning']['new_accepted_relations']==0 and not d['replanning']['new_card_review_started']
 return True
assert validate(cat,scope,groups)
negative=[]
def bad(name,mut):
 d,s,g=copy.deepcopy((cat,scope,groups));mut(d,s,g)
 try:validate(d,s,g)
 except (AssertionError,KeyError,IndexError):negative.append({'case':name,'rejected':True});return
 raise AssertionError('BAD_ACCEPTED '+name)
bad('drop_original_ID',lambda d,s,g:d['capabilities'].pop(3))
bad('rewrite_original_verbatim',lambda d,s,g:d['capabilities'][0].update(description_verbatim='changed'))
bad('duplicate_new_ID',lambda d,s,g:d['capabilities'][-1].update(id=d['capabilities'][-2]['id']))
bad('wrong_denominator',lambda d,s,g:d.update(denominator=270))
bad('new_capability_positive_missing',lambda d,s,g:d['capabilities'][-1]['acceptance'].pop('positive'))
bad('scope_leaf_removed',lambda d,s,g:s[0]['leaf_ids'].pop())
def promote_unknown(d,s,g):
 for row in s:
  for m in row['leaf_metadata']:
   if m['extraction_status']=='UNKNOWN':m['extraction_status']='STATIC';return
bad('promote_UNKNOWN',promote_unknown)
bad('fake_functional_PASS',lambda d,s,g:d['capabilities'][-1]['functional_validation'].update(pass_current=True))
bad('CVG_proxy_waiver',lambda d,s,g:next(x for x in d['capabilities'] if x['id']=='G2/WEB-02')['reference_exception'].update(cvg_control_waiver=True))
bad('erase_stream_disposition',lambda d,s,g:next(x for x in d['capabilities'] if x['id']=='G2/WEB-02')['factual_protocol_reconciliation']['stronger_target_dispositions'].pop())
bad('drop_requested355_group',lambda d,s,g:g.pop())
bad('alter_requested_original_proposal',lambda d,s,g:g[0]['original_group'].update(semantic_rationale='invented'))
bad('fake_semantic_review',lambda d,s,g:g[0].update(semantic_review_status='ACCEPTED'))
bad('reset_review_cycle',lambda d,s,g:d['replanning'].update(new_card_review_started=True))
bad('close_Q01_without_full_mapping',lambda d,s,g:d['q01_completion'].update(complete=True))
assert H(gzip.decompress((E/'catalog-272.json.gz').read_bytes()))==measure['catalog']['raw_sha256']
assert H((E/'catalog-272.json.gz').read_bytes())==measure['catalog']['compressed_sha256']
assert H(gzip.decompress((E/'review-input355.json.gz').read_bytes()))==handoff['input']['raw_sha256']
assert sum(J(R/'build-summary.json')['global_partition'])==44132
post=[]
for pin in J(E/'input-pins.json'):
 b=(ROOT/pin['path']).read_bytes();assert H(b)==pin['sha256'];post.append({'path':pin['path'],'sha256':H(b),'unchanged':True})
for pin in J(E/'source-pins.json'):
 b=(R/'sources'/pin['path']).read_bytes();assert H(b)==pin['sha256']
assert subprocess.check_output(['git','diff','--name-only'],cwd=C)==b'' and subprocess.check_output(['git','diff','--cached','--name-only'],cwd=C)==b''
result={'status':'PASS_DOCUMENTARY_INVARIANTS_ONLY_NOT_SEMANTIC_REVIEW','capabilities':272,'preserved_full_objects_except_WEB02':269,'original270_descriptions_exact':True,'current_measure_hashes_exact':True,'review355_content_exact':True,'scope26_metadata_exact':True,'negative_copies':negative,'source_inputs_unchanged':post,'tracked_candidate_diff':'','subagents':0,'functional_tests':0,'new_semantic_acceptance':0,'goal_complete':False}
(E/'verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'status':result['status'],'negative_copies_rejected':len(negative),'inputs_unchanged':len(post),'catalog272':True}))
