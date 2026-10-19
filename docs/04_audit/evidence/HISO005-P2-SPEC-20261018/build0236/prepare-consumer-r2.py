from pathlib import Path
import hashlib,io,json,os,re,shutil,subprocess,tarfile
source=Path('/home/ricardo/cvg-candidates/hiso005-integrated-20261018'); variant=Path('/tmp/cvg-hiso005-integration-20261018/without-product-r2');ev=Path('/home/ricardo/Área de trabalho/cvg-operational-harness/docs/04_audit/evidence/HISO005-P2-SPEC-20261018/build0236');variant.mkdir()
commit=subprocess.check_output(['git','rev-parse','HEAD'],cwd=source,text=True).strip();assert commit=='22ca4c52dbfd6f80c474def544d3eb4e14852e2f'
archive=subprocess.check_output(['git','archive','--format=tar',commit],cwd=source)
with tarfile.open(fileobj=io.BytesIO(archive))as tar:
 for m in tar:
  parts=Path(m.name).parts
  if parts[0]=='products' or any(x in ['node_modules','dist','.git'] or x.startswith('.env')for x in parts):continue
  assert not m.name.startswith('/')and '..'not in parts
  tar.extract(m,variant,filter='data')
shutil.copytree(source/'node_modules',variant/'node_modules',symlinks=True)
removed=[];adjusted=[]
for d,dirs,files in os.walk(variant/'node_modules',followlinks=False):
 for n in dirs+files:
  p=Path(d)/n
  if not p.is_symlink():continue
  target=os.readlink(p)
  if target.startswith(str(source)):
   p.unlink();p.symlink_to(target.replace(str(source),str(variant),1));adjusted.append(str(p.relative_to(variant)))
  destination=p.resolve(strict=False)
  if not destination.is_relative_to(variant)or destination.is_relative_to(variant/'products'):
   removed.append({'path':str(p.relative_to(variant)),'target':target});p.unlink()
audit=variant/'audit-consumer';audit.mkdir();exports=[]
md=(variant/'docs/architecture/PUBLIC_API.md').read_text()
for package,body in re.findall(r'<!-- supported-exports:(\S+) -->([\s\S]*?)<!-- /supported-exports -->',md):
 rows=[l.strip()for l in body.splitlines()if l.strip().startswith('|')][2:]
 for row in rows:
  cells=[x.strip()for x in row.split('|')[1:-1]]
  for name in re.findall(r'`([A-Za-z_$][\w$]*)`',cells[0]):exports.append({'package':package,'name':name,'kind':cells[1],'stability':cells[3].replace('`','')})
(audit/'supported-exports.json').write_text(json.dumps(exports,ensure_ascii=False,indent=2)+'\n')
(audit/'public-imports.mts').write_text(''.join('import '+('type 'if e['kind']=='tipo'else'')+'{ '+e['name']+' as E'+str(i)+' } from '+json.dumps(e['package'])+';\n'for i,e in enumerate(exports))+'export const importCount = '+str(len(exports))+';\n')
(audit/'reception-agent.mts').write_bytes((variant/'examples/consumers/reception-agent/index.ts').read_bytes())
(audit/'tsconfig.json').write_text(json.dumps({'extends':'../tsconfig.base.json','compilerOptions':{'paths':{},'rootDir':'.','outDir':'dist','composite':False,'declaration':False,'sourceMap':False,'incremental':False,'noEmitOnError':True},'include':['*.mts']},indent=2)+'\n')
old=Path('/tmp/cvg-b6-0228-20261017/without-product/audit-consumer/smoke.mjs');smoke=old.read_text().replace("task:'B6-REMEDIATION-BUILD-0228',candidateBase:'5a199668eef5db4ca7aa2adc3853169ca0953cbf'","task:'HISO005-P2-BUILD-0236',candidateBase:'26d866c39060669680aca01b34a916d45e1ba362',candidateCommit:"+repr(commit));(audit/'smoke.mjs').write_text(smoke)
(ev/'consumer-preparation.json').write_text(json.dumps({'commit':commit,'variant':str(variant),'archiveSha256':hashlib.sha256(archive).hexdigest(),'productPresent':(variant/'products').exists(),'removedLinks':removed,'adjustedLinks':adjusted,'exportRows':len(exports),'observerReusedFrom':str(old),'observerOriginalSha256':hashlib.sha256(old.read_bytes()).hexdigest(),'observerCurrentSha256':hashlib.sha256((audit/'smoke.mjs').read_bytes()).hexdigest(),'observation':'Fresh source archive and physical dependencies; no prior compiled runtime or prior results reused. Observer reused with task/commit metadata updated; exports regenerated from current public API.'},indent=2)+'\n')
print(json.dumps({'variant':str(variant),'exports':len(exports),'removedLinks':len(removed)}))
