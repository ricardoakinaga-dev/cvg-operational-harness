from pathlib import Path
import collections,datetime,gzip,hashlib,json
b=Path(__file__).resolve().parent;c=Path('/mnt/ia/cvg-hiso005-build0237-20261018');state=json.loads((b/'state.json').read_text());rec=json.loads((b/'real-postcert-reconciliation.json').read_text());sdk=json.loads((b/'sdk-physical-parity.json').read_text())
assert rec['status']=='CURRENT_QUALIFIED_MEASUREMENT'and rec['sourceCommit']==sdk['sourceCommit']==state['sourceCommit']
assert datetime.datetime.fromisoformat(rec['observedAt'])>datetime.datetime.fromisoformat(sdk['observedAt'])
prior=b.parent/'HISO005-0236-BUILTIN-REPAIR-20261018/real-postcert-normal-report.json.gz';current=b/'real-postcert-normal-report.json.gz';old=json.loads(gzip.decompress(prior.read_bytes()))['semanticBoundary'];new=json.loads(gzip.decompress(current.read_bytes()))['semanticBoundary']
canon=lambda x:json.dumps(x,ensure_ascii=False,sort_keys=True,separators=(',',':'))
assert collections.Counter(map(canon,old['origins']))==collections.Counter(map(canon,new['origins']))and len(old['origins'])==537
assert len(old['frontierOrigins'])==1721 and len(new['frontierOrigins'])==rec['new']
physical=unavailable=0
for row in old['origins']+old['frontierOrigins']+new['frontierOrigins']:
 assert hashlib.sha256(canon({k:v for k,v in row.items()if k!='id'}).encode()).hexdigest()==row['id']
 if row['file']is None:assert row['fileSha256']is None;unavailable+=1;continue
 p=c/row['file'];assert p.is_file()and not p.is_symlink()and hashlib.sha256(p.read_bytes()).hexdigest()==row['fileSha256'],row['file'];physical+=1
location=lambda row:(row['semanticPointer']['reportedFile']or None,row['semanticPointer']['causalOriginId'])
newby=collections.defaultdict(list)
for row in new['frontierOrigins']:newby[location(row)].append(row['id'])
newids={x['id']for x in new['frontierOrigins']};navigation=[]
for row in old['frontierOrigins']:
 navigation.append({'priorOriginId':row['id'],'credit':'NOT_CREDITED_AS_RESOLVED','exactCurrentTupleRetained':row['id']in newids,'sameLogicalLocationCurrentOriginIds':newby[location(row)],'note':'Location correspondence is navigation only, not a bijection or semantic proof.'})
result={'status':'PASS_PROFILE_FRONTIER_MULTISETS_RETAINED_NO_SILENT_RESOLUTION','observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sourceCommit':state['sourceCommit'],'priorReportCompressedSha256':hashlib.sha256(prior.read_bytes()).hexdigest(),'currentReportCompressedSha256':hashlib.sha256(current.read_bytes()).hexdigest(),'priorKernelVersion':old['kernelVersion'],'currentKernelVersion':new['kernelVersion'],'originalBaseline537Tuples':old['origins'],'priorFrontier1721Tuples':old['frontierOrigins'],'currentFrontierTuples':new['frontierOrigins'],'priorFrontierContinuity':navigation,'priorFrontierResolvedCredit':0,'priorFrontierUnprovenRetained':1721,'currentFrontierCount':len(new['frontierOrigins']),'physicalOriginHashChecks':physical,'nullUnavailableRecordsPreserved':unavailable,'exactCurrentPriorTupleCount':len(newids&{x['id']for x in old['frontierOrigins']}),'currentConsumableProofs':len(new['proofs']),'interpretation':'These are two explicitly versioned semantic cause inventories over equal prior physical source/emit bytes. Retain every prior and current canonical occurrence with multiplicity. A replaced resolution cause, changed pointer index or lower diagnostic count earns no semantic resolution credit. Inventories are not summed as unique program sites. B6 remains open.','b6Accepted':False,'productionApproved':False}
p=b/'profile-frontier-multiset-reconciliation.json';p.write_text(json.dumps(result,indent=2)+'\n');saved=json.loads(p.read_text());assert collections.Counter(map(canon,saved['priorFrontier1721Tuples']))==collections.Counter(map(canon,old['frontierOrigins']));assert collections.Counter(map(canon,saved['currentFrontierTuples']))==collections.Counter(map(canon,new['frontierOrigins']));print(json.dumps({k:v for k,v in result.items()if k not in ['originalBaseline537Tuples','priorFrontier1721Tuples','currentFrontierTuples','priorFrontierContinuity']}))
