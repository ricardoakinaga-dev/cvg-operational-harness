import os,json,hashlib,pathlib,sys,time
B=pathlib.Path('/tmp/cvg-pare100-exec-20261014-6az3hlay')
P=B/'critic-boundary-216-build-r1-packet'; S=B/'critic-boundary-216-build-r1-scratch'; R=B/'critic-boundary-216-build-r1-result'
sentinel=B/'critic-boundary-216-build-r1-packet.sentinel.json'
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
seal=json.loads(sentinel.read_bytes()); records={}
for rel,expected in seal['files'].items():
    row={}
    for label,root in [('packet',P),('scratch',S)]:
        p=root/rel
        assert p.is_file() and not p.is_symlink() and str(p.resolve())==str(p),str(p)
        row[label]=sha(p); assert row[label]==expected,(label,rel)
    assert os.stat(P/rel).st_ino!=os.stat(S/rel).st_ino,rel
    records[rel]=row
assert len(records)==51
assert {str(p.relative_to(P)) for p in P.rglob('*') if p.is_file()}==set(records)
result={'phase':sys.argv[1],'originalCount':len(records),'sentinelSHA256':sha(sentinel),'files':records}
if sys.argv[1]=='before':
    def dep_snapshot():
        table={}; links={}; count=0; total=0
        for root,dirs,files in os.walk(S/'node_modules',followlinks=False):
            for name in dirs+files:
                p=pathlib.Path(root)/name; rel=str(p.relative_to(S))
                if p.is_symlink():
                    assert str(p.resolve()).startswith(str(S)+'/'),str(p)
                    links[rel]=os.readlink(p)
                elif p.is_file():
                    st=p.stat(); assert st.st_nlink==1,(str(p),st.st_nlink)
                    table[rel]=sha(p); count+=1;total+=st.st_size
        return {'files':table,'links':links,'fileCount':count,'bytes':total}
    first=dep_snapshot(); second=dep_snapshot(); assert first==second,'copy still changing'
    assert first['fileCount']>1000
    result['dependencyCopy']={'stableTwoFullReads':True,'fileCount':first['fileCount'],'bytes':first['bytes'],'manifestSHA256':hashlib.sha256(json.dumps(first,sort_keys=True).encode()).hexdigest(),'allLinksStayInScratch':True,'regularFilesHaveLinkCount1':True}
    (R/'dependency-copy-manifest.json').write_text(json.dumps(first,indent=2)+'\n')
else:
    before=json.loads((R/'integrity-before.json').read_text()); assert before['files']==result['files']; assert before['sentinelSHA256']==result['sentinelSHA256']
    result['unchangedFromBefore']=True
(R/('integrity-'+sys.argv[1]+'.json')).write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k!='files'},indent=2))
