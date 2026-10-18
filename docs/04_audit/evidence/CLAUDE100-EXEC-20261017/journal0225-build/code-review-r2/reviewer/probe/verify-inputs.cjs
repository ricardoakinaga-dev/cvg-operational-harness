const fs=require('fs'),crypto=require('crypto'),path=require('path'),cp=require('child_process');
const root='/home/ricardo/Área de trabalho/cvg-operational-harness/docs/04_audit/evidence/CLAUDE100-EXEC-20261017/journal0225-build/code-review-r2';
const cand='/mnt/ia/cvg-claude100-journal0225-20261018';
const c=JSON.parse(fs.readFileSync(path.join(root,'contract.json'),'utf8'));
const h=b=>crypto.createHash('sha256').update(b).digest('hex');
const out={at:new Date().toISOString(),phase:process.argv[2],contractSha256:h(fs.readFileSync(path.join(root,'contract.json'))),head:cp.execFileSync('git',['-C',cand,'rev-parse','HEAD']).toString().trim(),items:[]};
let ok=true;
for(const s of c.contract.sourceInputs){
  const snap=fs.readFileSync(path.join(root,s.snapshot));
  const cw=fs.readFileSync(path.join(cand,s.path));
  let committed=null; try{committed=h(cp.execFileSync('git',['-C',cand,'show',c.contract.sourceCheckpoint+':'+s.path],{maxBuffer:1e8}));}catch(e){committed='ERR'}
  const r={path:s.path,expected:s.sha256,snapshot:h(snap),candidateWorktree:h(cw),candidateCommit:committed,bytesOk:snap.length===s.bytes&&cw.length===s.bytes};
  r.match=r.snapshot===s.sha256&&r.candidateWorktree===s.sha256&&r.candidateCommit===s.sha256&&r.bytesOk; if(!r.match) ok=false; out.items.push(r);
}
const spec=fs.readFileSync(path.join(root,'approved-adjusted-spec.source.txt'));
out.specSnapshotSha256=h(spec); out.specMatch=out.specSnapshotSha256===c.contract.approvedSpec.sha256;
out.allMatch=ok; out.count=out.items.length;
const status=cp.execFileSync('git',['-C',cand,'status','--porcelain','--untracked-files=no']).toString();
out.candidateTrackedDirty=status.trim().split('\n').filter(Boolean);
console.log(JSON.stringify(out,null,1));
