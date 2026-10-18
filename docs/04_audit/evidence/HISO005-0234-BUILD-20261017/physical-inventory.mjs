import fs from 'node:fs'
import path from 'node:path'
import { createInstalledIdentityComparator } from '/home/ricardo/cvg-candidates/hiso005-0234-20261017/scripts/boundary-installed-identity.mjs'
const root='/home/ricardo/cvg-candidates/hiso005-0234-20261017'
const base='/tmp/cvg-hiso005-0234-20261017'
const ev='/home/ricardo/Área de trabalho/cvg-operational-harness/docs/04_audit/evidence/HISO005-0234-BUILD-20261017'
const core=new Set(JSON.parse(fs.readFileSync(path.join(base,'identity-normal-r1-graph.json'))).installed.map(p=>p.node.replace(/\/package\.json$/,'')))
const keys=[], links=[], unknown=[]
function walkModules(directory){
 for(const name of fs.readdirSync(directory).sort()){
  const p=path.join(directory,name),stat=fs.lstatSync(p)
  if(name==='.bin'||name==='.package-lock.json')continue
  if(stat.isSymbolicLink()){links.push({path:path.relative(root,p),target:fs.readlinkSync(p)});continue}
  if(name.startsWith('@')&&stat.isDirectory()){walkModules(p);continue}
  if(!stat.isDirectory()){unknown.push({path:path.relative(root,p),type:'non-directory'});continue}
  const manifest=path.join(p,'package.json')
  if(fs.existsSync(manifest)&&fs.lstatSync(manifest).isFile()){
   keys.push(path.relative(root,p))
   if(fs.existsSync(path.join(p,'node_modules')))walkModules(path.join(p,'node_modules'))
  }else unknown.push({path:path.relative(root,p),type:'directory-without-physical-manifest'})
 }
}
walkModules(path.join(root,'node_modules'))
const comparator=createInstalledIdentityComparator(root,{manifestPath:path.join(base,'reference-r3/reference.json'),expectedSha256:'cd897a3831dbe0713eeb2e251f327dfb55d203149f4c739c76c437b27df43cdf'})
const rows=keys.sort().map(key=>({key,inCoreClosure:core.has(key),verified:false,contentIdentity:comparator.compare(path.join(root,key),key)}))
const finalization=comparator.finalize()
const counts=rows.reduce((r,p)=>(r[p.contentIdentity.status]=(r[p.contentIdentity.status]??0)+1,r),{})
const report={commit:'b7032f8245fbfbec5570c585518172de9ab7f075',physicalPackageCount:rows.length,coreClosureCount:rows.filter(p=>p.inCoreClosure).length,counts,workspaceLinks:links,unknown,finalization,rows,limitations:'Byte identity only. Extra physical package outside core closure is separately compared without changing the semantic graph denominator. No whole boundary PASS or B6 acceptance.'}
fs.writeFileSync(path.join(base,'physical-inventory-r1.json'),JSON.stringify(report,null,2)+'\n')
fs.writeFileSync(path.join(ev,'physical-inventory-summary-r1.json'),JSON.stringify({...report,rows:rows.map(p=>({key:p.key,inCoreClosure:p.inCoreClosure,verified:p.verified,status:p.contentIdentity.status,reasons:p.contentIdentity.reasons,diffs:p.contentIdentity.diffs}))},null,2)+'\n')
console.log(JSON.stringify({physicalPackageCount:rows.length,counts,unknown,finalization}))
