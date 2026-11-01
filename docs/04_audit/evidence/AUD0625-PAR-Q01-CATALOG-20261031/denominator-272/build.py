from pathlib import Path
import json,gzip,hashlib,copy,subprocess,io,datetime,collections
R=Path(__file__).resolve().parent; C=R.parent/'candidate'; ROOT=Path('/home/ricardo/Área de trabalho/cvg-operational-harness');REF=Path('/home/ricardo/deepseek-harness-consolidated')
B='docs/04_audit/evidence/AUD0625-PAR-Q01-CATALOG-20261031'; ER=B+'/denominator-272';E=C/ER
REV='768fb1f3d3dcf9a16659ee354e927d05475f22dd'; BASE='6dc8c95694b31a01b7fc216d598e67a6d157e632'
H=lambda b:hashlib.sha256(b).hexdigest()
def dump(p,x):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n')
def dec(b):return json.loads(b)
inputpins=[]
def frozen(rel,revision=BASE):
 b=subprocess.check_output(['git','show',revision+':'+rel],cwd=C); assert (ROOT/rel).read_bytes()==b and (C/rel).read_bytes()==b,rel
 inputpins.append({'path':rel,'git_commit':revision,'sha256':H(b),'bytes':len(b)})
 p=R/'inputs'/rel;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(b);return b
oldraw=gzip.decompress(frozen(B+'/f01-bindings-batch01-repair/capabilities-r3-draft.json.gz'));assert H(oldraw)=='325c2c114533e8a3716d288c2eed4337cfe558660fd42a18f6a9077e6eb25574';old=dec(oldraw)
optionsraw=frozen(B+'/f01-bindings-batch01-repair/scope-options.json');assert H(optionsraw)=='dc1e5c8a442407cde7d065d48f07d43213f9cff10ca13d200dd2d0ae3cf912f6';options=dec(optionsraw)
authority={}
for n,sha in [('32','a0a0c068e08b850811844221fba48245e265dff2230fb17e018e89eabe6b1c81'),('31','f6a81c7cf8f4cc73fbafce36350fc5cb85ecd11c404d4d980d92b4bdf42888b2')]:
 rel='docs/04_audit/evidence/USER-DECISIONS-20261028/human-decisions-'+n+'.json';raw=(ROOT/rel).read_bytes();assert H(raw)==sha
 authority[n]=dec(raw);inputpins.append({'path':rel,'git_commit':None,'sha256':sha,'bytes':len(raw),'provenance':'authorized shared receipt, not claimed present in BUILD/ownHEAD'});dump(R/('receipt'+n+'.json'),authority[n])
assert authority['32']['previous_receipt']['sha256']==inputpins[-1]['sha256'];assert authority['32']['decisions'][0]['bound_to']['sha256']==H(optionsraw)
assert authority['32']['decisions'][0]['answer']=='Acrescentar, 272 (Recomendado)'
repair=dec(gzip.decompress(frozen(B+'/f01-bindings-batch01-repair/proposed-bindings.json.gz')))
util=dec(gzip.decompress(frozen(B+'/f01-bindings-batch01-util/proposed-bindings.json.gz')))
unresolved26=dec(frozen(B+'/f01-bindings-batch01-repair/unresolved.json'))
priorreview=dec(frozen(B+'/semantic/review-disposition.json'))
priorb01=dec(frozen(B+'/f01-bindings-batch01-review/reconciliation.json'))
reviewed=dec(gzip.decompress(frozen(B+'/f01-bindings-batch01-review/reviewed-bindings.json.gz')))
replan=dec(frozen(B+'/f01-bindings-batch01-repair/replan.json'))
utilpending=dec(frozen(B+'/f01-bindings-batch01-util/unresolved.json'))
for rel in [B+'/f01-bindings-batch01-tools-source/summary.json',B+'/f01-bindings-batch01-tools-docs/summary.json']:
 if (C/rel).exists():frozen(rel)
backlog=ROOT/'docs/03_build/0380_backlog_paridade_100_deepseek.md';assert H(backlog.read_bytes())=='86293580351bba81509a3227a843b3a57387d073eac0f11d6c31a52f7453e525'
inputpins.append({'path':str(backlog.relative_to(ROOT)),'git_commit':None,'sha256':H(backlog.read_bytes()),'bytes':backlog.stat().st_size});dump(R/'backlog-lines.json',{'rule_line31':backlog.read_text().splitlines()[30],'Q01':backlog.read_text().splitlines()[136:146]})
assert 'Uma revisão independente por cartão' in backlog.read_text().splitlines()[30]
newopts=options['options'][1]['proposed_capabilities'];assert [x['id'] for x in newopts]==['G1/SPILL-03','G1/SESSION-07']
ids26={i for x in newopts for i in x['leaf_ids']};assert len(ids26)==26 and ids26=={x['leaf_id'] for x in unresolved26}
repairids=[i for g in repair for i in g['leaf_ids']];utilids=[i for g in util for i in g['leaf_ids']];assert len(repairids)==len(set(repairids))==92 and len(utilids)==len(set(utilids))==263;assert not(set(repairids)&set(utilids)) and not(ids26&(set(repairids)|set(utilids)))
# Authenticate every carried proposal's existing evidence, without judging its semantics.
evidences=[ev for g in repair+util for ev in g['evidence']]+[ev for x in newopts for ev in x['evidence']]
web=next(x for x in old['capabilities'] if x['id']=='G2/WEB-02');evidences+=web['factual_protocol_reconciliation']['observations']
paths=sorted({x['path'] for x in evidences});proc=subprocess.run(['git','cat-file','--batch'],input=('\n'.join(REV+':'+p for p in paths)+'\n').encode(),cwd=REF,stdout=subprocess.PIPE,stderr=subprocess.PIPE,check=True,timeout=60)
s=io.BytesIO(proc.stdout);sources={};sourcepins=[]
for path in paths:
 header=s.readline().decode().strip().split();assert len(header)==3 and header[1]=='blob',(path,header);oid,kind,size=header;b=s.read(int(size));assert s.read(1)==b'\n';sources[path]=b
 pin={'path':path,'git_oid':oid,'sha256':H(b),'bytes':len(b),'lines':len(b.decode().splitlines()),'reference_commit':REV};sourcepins.append(pin)
 p=R/'sources'/path;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(b)
assert s.read()==b''
by_path={x['path']:x for x in sourcepins};rangechecks=[]
for ev in evidences:
 pin=by_path[ev['path']];assert pin['git_oid']==ev['git_oid'] and pin['sha256']==ev['sha256'],ev
 lines=sources[ev['path']].decode().splitlines();a=ev['line_start'];z=ev['line_end'];assert 1<=a<=z<=len(lines),(ev['path'],a,z,len(lines));rh=H(('\n'.join(lines[a-1:z])+'\n').encode())
 if ev.get('range_sha256'):assert rh==ev['range_sha256'],ev
 rangechecks.append({'path':ev['path'],'line_start':a,'line_end':z,'range_sha256':rh,'declared_range_hash':ev.get('range_sha256'),'source_hash_exact':True})
# Preserve extraction status and immutable metadata for both the355 and the26.
meta={}
for g in repair+util:
 for x in g.get('leaf_metadata',g.get('selected_contracts',[])):
  if x['id'] in meta:assert meta[x['id']]==x
  meta[x['id']]=x
raw118=Path(R.parent/'f01-bindings-batch01-repair/inputs/leaves.json').read_bytes();leaves118=dec(raw118)
for x in leaves118:
 if x['id'] in ids26:meta[x['id']]=x
assert set(meta)==ids26|set(repairids)|set(utilids)
matrix=ROOT/'docs/04_audit/evidence/PARE100-EXEC-20261014/matrix/r23/leaf-requirements.jsonl';assert H(matrix.read_bytes())==old['static_traceability']['matrix']['sha256']
seen={};counts=collections.Counter();total=0
with matrix.open() as f:
 for line in f:
  x=json.loads(line);total+=1;counts[x['extraction_status']]+=1
  if x['id'] in meta:
   y=meta[x['id']]
   for key in ['id','contract_sha256','source','source_sha256','owner_task','scope','extraction_status','parity_status']:assert x[key]==y[key],(x['id'],key)
   seen[x['id']]=x
assert total==44132 and counts=={'STATIC':30586,'UNKNOWN':13546} and len(seen)==381
cat=copy.deepcopy(old);cat.update(measure_revision='r3-denominator-272',draft_revision='r4-human32-scope272-proxy-disposition',status='DRAFT_SCOPE272_AUTHORIZED_Q01_OPEN',denominator=272)
cat['denominator_authority_history']=[copy.deepcopy(old['denominator_authority'])]
cat['denominator_authority']={'fact':83727,'receipt':'docs/04_audit/evidence/USER-DECISIONS-20261028/human-decisions-32.json','sha256':H((ROOT/'docs/04_audit/evidence/USER-DECISIONS-20261028/human-decisions-32.json').read_bytes()),'decision':'PARE100-D1-AMEND-DENOMINATOR-272','scope_options_sha256':H(optionsraw),'human_answer':authority['32']['decisions'][0]['answer']}
assert cat['denominator_authority']['sha256']=='a0a0c068e08b850811844221fba48245e265dff2230fb17e018e89eabe6b1c81'
cat['previous_measure']={'measure_revision':old['measure_revision'],'draft_revision':old['draft_revision'],'raw_sha256':H(oldraw),'path':B+'/f01-bindings-batch01-repair/capabilities-r3-draft.json.gz','artifact_unchanged':True}
oldcaps={x['id']:x for x in old['capabilities']};newcaps=[]
for x,templateid,card in zip(newopts,['G1/SPILL-01','G1/SESSION-06'],['PAR-C03','PAR-S03']):
 template=oldcaps[templateid];ac=copy.deepcopy(x['proposed_future_acceptance']);ac['status']='NOT_RUN';ac['comparison_protocol']=old['acceptance_protocol']['id'];ac['scope_gate']='Human D1 scope-only granted by receipt32; specific card SPEC/T3 and effect gates remain required before BUILD/execution.'
 ac['gates']=x['proposed_future_acceptance']['gates'];ac['gate_history_note']='The quoted gate wording was written before receipt32; its D1 prerequisite is now satisfied, no other prerequisite is waived.'
 cards=copy.deepcopy(template['cards'])
 for c in cards:
  c['basis']='HUMAN32_SCOPE_OPTIONS_CARD_CANDIDATE';c['rationale']='Association proposed in scope-options bound by receipt32; historical card origin does not list the new ID. No BUILD scope/owner or existing SPEC coverage inferred.';c['scope_disposition']='ASSOCIATION_ONLY_NEEDS_CARD_SPEC_RECONCILIATION'
 cap={'id':x['id'],'legacy_id':x['id'].split('/')[1],'group':'G1','family_heading':template['family_heading'],'description_verbatim':x['description'],'source_document':'docs/04_audit/evidence/USER-DECISIONS-20261028/human-decisions-32.json','source_document_sha256':cat['denominator_authority']['sha256'],'source_line':None,'reference_commit':REV,'source_basis':'HUMAN32_BOUND_SCOPE_OPTIONS','source_hints':sorted({ev['path'] for ev in x['evidence']}),'reference_bindings':[{'resolution':'EXACT_SOURCE_BLOB','path':p,'git_oid':by_path[p]['git_oid']} for p in sorted({ev['path'] for ev in x['evidence']})],'cards':cards,'target_classification':template['target_classification'],'classification_status':'PROPOSED_TARGET_NOT_ACCEPTED','classification_rationale':'Comparison target proposed from the two real boundaries, subject to governed card specification and independent review; human32 grants catalog scope only.','hospital_relevance':copy.deepcopy(template['hospital_relevance']),'reference_evidence':copy.deepcopy(x['evidence']),'acceptance':ac,'catalog_owner':'Codex AUD0625','implementation_owner':copy.deepcopy(template['implementation_owner']),'spec_binding':{'status':'NEW_CAPABILITY_CARD_SPEC_RECONCILIATION_REQUIRED_BEFORE_BUILD','card_ids':[card],'declared_spec_numbers':[],'rule':'Historical neighboring SPEC references are not authorization/coverage for this new capability.'},'equivalence_acceptance_rule':template['equivalence_acceptance_rule'],'functional_validation':{'reference':'NOT_RUN','cvg':'NOT_RUN','equivalence':'NOT_ACCEPTED','pass_current':False,'receipt':None},'source_review':{'status':'STATIC_SOURCE_AUTHENTICATED_NOT_INDEPENDENT_SEMANTIC_ACCEPTANCE','functional_observation':'NOT_RUN','limits':['No runtime was executed; exact26 leaf mapping is proposed, not accepted.']},'scope_authority':copy.deepcopy(cat['denominator_authority']),'static_traceability':{'supplement':ER+'/scope-leaf-proposals.json','leaf_ids':x['leaf_ids'],'associated_leaf_count':len(x['leaf_ids']),'semantic_binding':'PROPOSED_NOT_REVIEWED','functional_credit':0}}
 newcaps.append(cap)
cat['capabilities'].extend(newcaps);cat['group_counts']['G1']=52
# Historical lanes/index are preserved as provenance, not advertised as an updated272 partition.
cat['lanes']={'status':'HISTORICAL_AUTHOR_LANES_270_NOT_CURRENT_PARTITION','historical_catalog_path':B+'/semantic/catalog-draft.json','historical_lanes':copy.deepcopy(old['lanes']),'current_capability_index':ER+'/capability-index.json'}
cat['static_traceability']['historical_index_qualification']='Original270 candidate index is unchanged, not semantic acceptance and not the new26-leaf supplement.'
cat['static_traceability']['scope_supplement']={'path':ER+'/scope-leaf-proposals.json','records':26,'semantic_binding':'PROPOSED_NOT_REVIEWED','new_accepted_relations':0}
web2=next(x for x in cat['capabilities'] if x['id']=='G2/WEB-02');recon=web2['factual_protocol_reconciliation']
web2['acceptance_history'].append({'origin':'r3 draft before DF83727 proxy disposition','base_sha256':H(oldraw),'acceptance':copy.deepcopy(web2['acceptance'])})
web2['reference_exception']={'id':'PAR-Q01-WEB02-PROXY','authority_fact':83727,'receipt_sha256':cat['denominator_authority']['sha256'],'status':'DOCUMENTED_REFERENCE_EXCEPTION_NOT_FUNCTIONALLY_MEASURED','direct_reference':'Public IP validation and address pinning before request.','proxied_reference':'DNS delegated to selected proxy dispatcher; local IP resolution/pinning skipped; refusal of nonpublic IP literals remains in source.','cvg_required_target':'UNIVERSAL_FAIL_CLOSED','cvg_proxy_requirement':'VALIDATE_AND_PIN_OR_DISABLE','cvg_control_waiver':False,'comparison_rule':'Measure real reference behavior including proxy exception separately from governed CVG stricter target; never label proxy path as locally pinned.'}
for target in recon['stronger_target_dispositions']:
 if target['status']=='OPEN_REFERENCE_SCOPE_DISPOSITION_PROXY_EXCEPTION':target.update(status='DISPOSED_REFERENCE_EXCEPTION_CVG_UNIVERSAL_RETAINED',authority_fact=83727,receipt_sha256=cat['denominator_authority']['sha256'],requirement='Document proxy DNS delegation in reference; CVG must validate/pin proxy egress or disable it; no waiver and no functional result.')
recon['status']='PROXY_SCOPE_DISPOSED_OTHER_STRONGER_TARGETS_OPEN';recon['scope_or_target_approval']='PROXY_REFERENCE_EXCEPTION_ONLY_NOT_CVG_WAIVER';recon['functional_result']='NOT_RUN'
web2['acceptance']['positive']+=' Após DF83727, comparar o proxy como EXCEÇÃO DA REFERÊNCIA documentada. Na CVG, provar validação/fixação também via proxy ou recusa com caminho desligado.'
web2['acceptance']['negative']+=' A disposição de proxy não resolve o caso separado de truncamento de stream: ele permanece OPEN_FAIL_CLOSED_VS_STREAM_TRUNCATION_DISPOSITION.'
# Repair misleading inherited pointer using authenticated historical disposition, never reopen its scoped closure.
cat['q01_completion']['repairs_pending_independent_readback']=[]
cat['q01_completion']['repairs_closed_scoped_historical']=[x['id'] for x in priorreview['review_r2']['dispositions']]
cat['q01_completion']['source_of_closed_scoped_status']=B+'/semantic/review-disposition.json'
cat['q01_completion']['complete']=False;cat['q01_completion']['canonical_catalog_published']=False
cat['replanning'].update(status='HUMAN32_SCOPE_APPLIED_PENDING_SEMANTIC_REVIEW_PROCESS_DISPOSITION',scope_denominator=272,scope_fact=83727,new_card_review_started=False,new_accepted_relations=0,stronger_target_dispositions_remain_open=True)
cat['review_handoff']={'path':ER+'/review-handoff.json','requested_leaves':355,'review_completed':False,'new_card_review_started':False}
# Freeze requested review input without changing original proposal content or meaning.
proposal_groups=[]
for label,groups in [('repair',repair),('util',util)]:
 for g in groups:proposal_groups.append({'origin':label,'original_group':g,'semantic_review_status':'PENDING_INDEPENDENT_REVIEW','functional_credit':0})
dump(R/'review-input355.json',proposal_groups)
scopegroups=[{'id':'SCOPE272-'+x['id'].replace('/','-'),'capability_ids':[x['id']],'leaf_ids':x['leaf_ids'],'status':'PROPOSED_NOT_SEMANTICALLY_REVIEWED','scope_authorized':True,'leaf_metadata':[meta[i] for i in x['leaf_ids']],'reference_evidence':x['evidence'],'functional_credit':0} for x in newopts]
dump(E/'scope-leaf-proposals.json',scopegroups)
raw=json.dumps(cat,ensure_ascii=False,indent=2).encode()+b'\n';(R/'catalog-272.json').write_bytes(raw);(E/'catalog-272.json.gz').write_bytes(gzip.compress(raw,mtime=0))
(E/'review-input355.json.gz').write_bytes(gzip.compress((R/'review-input355.json').read_bytes(),mtime=0))
dump(E/'new-capabilities.json',newcaps);dump(E/'capability-index.json',{'measure_revision':cat['measure_revision'],'denominator':272,'numerator_pass_current':0,'catalog_raw_sha256':H(raw),'capabilities':[{'id':x['id'],'description_verbatim':x['description_verbatim']} for x in cat['capabilities']]})
measure={'schema_version':1,'id':'PAR-CAP-v1-measure-r3','task':'AUD0625-PAR-Q01-DENOMINATOR-272-20261031','begin_fact':85930,'authority':cat['denominator_authority'],'previous_denominator':270,'denominator':272,'group_counts':cat['group_counts'],'previous_catalog_raw_sha256':H(oldraw),'catalog':{'path':'catalog-272.json.gz','compressed_sha256':H((E/'catalog-272.json.gz').read_bytes()),'raw_sha256':H(raw),'raw_bytes':len(raw)},'added_ids':[x['id'] for x in newopts],'removed_ids':[],'original270_ids_and_descriptions_verbatim':True,'functional_pass_current':0,'parity':'NOT_MEASURED','canonical_catalog_published':False,'production':'NO_GO','does_not_grant':authority['32']['does_not_grant']}
dump(E/'measure.json',measure);dump(E/'proxy-disposition.json',{'reference_exception':web2['reference_exception'],'pending_other_targets':[{'id':'G1/QUERY-02','status':'OPEN_STRONGER_CVG_IO_TARGET_DISPOSITION'},{'id':'G1/SESSION-05','status':'OPEN_STRONGER_CVG_EVENT_DEDUP_TARGET_DISPOSITION'},{'id':'G2/WEB-02','status':'OPEN_FAIL_CLOSED_VS_STREAM_TRUNCATION_DISPOSITION'}]})
handoff={'task':'Q01-F01-REVIEW355-PROCESS-DISPOSITION','requested_by_fact':83727,'requested_groups':len(proposal_groups),'requested_leaf_count':355,'repair_groups':len(repair),'repair_leaves':92,'util_groups':len(util),'util_leaves':263,'input':{'path':'review-input355.json.gz','raw_sha256':H((R/'review-input355.json').read_bytes()),'compressed_sha256':H((E/'review-input355.json.gz').read_bytes())},'additional_scope26':{'path':'scope-leaf-proposals.json','semantic_status':'PROPOSED_PENDING_REVIEW_NOT_IN355_REQUEST','scope_authorized':True},'not_in_this_review_input':{'reviewed_prior_relations':2893,'tools_proposals':881,'util_unresolved':74,'tools_unresolved':94,'session_other_pending':1511,'orchestration_other_pending':811,'outside_B01':37487},'new_semantic_acceptance':0,'review_started':False,'reviewer_assigned':None,'review_context':'AUTHOR_PREPARATION_ONLY','governing_rule':{'path':'docs/03_build/0380_backlog_paridade_100_deepseek.md','line':31,'sha256':H(backlog.read_bytes()),'literal':backlog.read_text().splitlines()[30]},'history':[{'phase':'Initial catalog R1','verdict':priorreview['review_r1']['verdict']},{'phase':'REWORK1 R2 F02/F03/F04','verdict':priorreview['review_r2']['verdict'],'scope':priorreview['review_r2']['scope']},{'phase':'F01 B01 static semantic conference','verdict':'CHANGES_REQUESTED_STATIC_BINDINGS_AND_PROTOCOL','return_fact':77867,'commit':'b7a642b9aa1de2dac7d9d195300f5fca3f873b11'},{'phase':'B01 split/protocol corrective replan','return_fact':78654,'commit':'ed757af924d1e34ac9153c62c9ab8f23652afaa2','new_review_started':False},{'phase':'DF next355 gate','fact':83727,'literal':'indo à revisão semântica independente que o cartão exige','counter_reset_granted':False}],'next_action':'Claude DF identify exact permissible remaining scoped gate under preserved history/0380:31 for355 (and separately26), and name nonauthor reviewer/paths. If no remaining cycle, return replan; no reset inferred.','blocking_semantic_acceptance_not_authoring':True,'build_authorized':False}
dump(E/'review-handoff.json',handoff)
dump(E/'source-pins.json',sourcepins);dump(E/'authenticated-ranges.json',rangechecks);dump(E/'input-pins.json',inputpins);dump(E/'receipt32.json',authority['32']);dump(E/'receipt31.json',authority['31']);dump(E/'task.json',dec((R/'task.json').read_bytes()));dump(E/'empty-artifact-status.json',{'schemaVersion':1,'files':[]})
# Verify separately later. Preserve exact counters without accepting381/355/26 relations.
dump(R/'build-summary.json',{'capabilities':272,'original_preserved':270,'scope26_extraction_status':dict(collections.Counter(meta[i]['extraction_status'] for i in ids26)),'requested355_extraction_status':dict(collections.Counter(meta[i]['extraction_status'] for i in set(repairids)|set(utilids))),'sources_authenticated':len(sourcepins),'evidence_ranges_authenticated':len(rangechecks),'groups355':len(proposal_groups),'new_semantic_acceptance':0,'matrix_records':total,'matrix_counts':dict(counts),'prior_reviewed':2893,'global_unaccepted':41239,'proposed_total_now':1262,'global_partition':[2893,355,881,26,74,94,1511,811,37487]})
assert sum([2893,355,881,26,74,94,1511,811,37487])==44132
print((R/'build-summary.json').read_text())
