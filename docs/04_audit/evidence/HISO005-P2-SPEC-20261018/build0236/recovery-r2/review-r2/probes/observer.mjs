import fs from 'node:fs';import path from 'node:path';
const q=JSON.parse(fs.readFileSync(0,'utf8'));
const checker=await import(q.checker);
const original={};for(const k of ['lstatSync','realpathSync','openSync','readSync','readFileSync','fstatSync','closeSync'])original[k]=fs[k];
const events=[],fds=new Map(),opened=[],closed=[];let fired=false,lstats=0,inInjection=false;
const own=x=>String(x)===q.victim;
const capture=()=>!inInjection&&new Error().stack.includes('at captureOrigin ');
const inject=fn=>{inInjection=true;try{return fn()}finally{inInjection=false}};
const stat=s=>({dev:String(s.dev),ino:String(s.ino),size:String(s.size),mtimeNs:String(s.mtimeNs),ctimeNs:String(s.ctimeNs),regular:s.isFile()});
const restorePath=()=>{if(q.backup&&fs.existsSync(q.backup)){try{fs.unlinkSync(q.victim)}catch{}fs.renameSync(q.backup,q.victim)}};
const swap=kind=>{
 if(!q.victim.startsWith(q.root+path.sep))throw Error('own fixture only');
 fs.renameSync(q.victim,q.backup);
 if(kind==='symlink')fs.symlinkSync(q.sentinel,q.victim);
 else fs.writeFileSync(q.victim,q.replacement);
};
fs.lstatSync=function(file,...args){
 if(own(file)&&capture()){
  lstats++;
  if(q.mode==='cache-change'&&lstats===3&&!fired){
   fired=true;inject(()=>fs.appendFileSync(q.victim,'\n'));events.push({event:'cache-mutated-before-current-lstat'});
  }
  const s=Reflect.apply(original.lstatSync,this,[file,...args]);events.push({event:'capture-lstat',stat:stat(s)});return s;
 }
 return Reflect.apply(original.lstatSync,this,[file,...args]);
};
fs.openSync=function(file,flags,...args){
 if(own(file)&&capture()){
  events.push({event:'capture-open',flags});
  if(!fired&&['open-symlink','open-inode'].includes(q.mode)){fired=true;inject(()=>swap(q.mode==='open-symlink'?'symlink':'regular'));}
  let fd;
  try{fd=Reflect.apply(original.openSync,this,[file,flags,...args]);}
  catch(e){events.push({event:'open-refused',code:e.code});inject(restorePath);throw e;}
  const entry={generation:opened.length,fd,reads:0};opened.push(entry);fds.set(fd,entry);
  if(!fired&&q.mode==='path-after-open'){fired=true;inject(()=>swap('symlink'));events.push({event:'path-swapped-after-open'});}
  return fd;
 }
 return Reflect.apply(original.openSync,this,[file,flags,...args]);
};
fs.readFileSync=function(file,...args){
 if(own(file)&&capture())events.push({event:'unexpected-capture-readFileSync'});
 return Reflect.apply(original.readFileSync,this,[file,...args]);
};
fs.readSync=function(fd,buffer,offset,length,...args){
 if(fds.has(fd)&&capture()){
  const entry=fds.get(fd);entry.reads++;
  if(!fired&&q.mode==='read-error'){fired=true;events.push({event:'injected-EIO',fd});throw Object.assign(new Error('synthetic EIO'),{code:'EIO'});}
  const n=Reflect.apply(original.readSync,this,[fd,buffer,offset,length,...args]);events.push({event:'capture-read',fd,bufferLength:buffer.length,requested:length,returned:n});
  if(!fired&&q.mode==='growth'){fired=true;inject(()=>fs.appendFileSync(q.victim,'\n'));events.push({event:'grew-after-read'});}
  if(!fired&&q.mode==='same-size'){fired=true;inject(()=>{const b=Reflect.apply(original.readFileSync,fs,[q.victim]);const at=b.indexOf(Buffer.from('AAAA'));if(at<0)throw Error('marker missing');b[at]=66;fs.writeFileSync(q.victim,b);events.push({event:'same-size-write',bytes:b.length});});}
  return n;
 }
 return Reflect.apply(original.readSync,this,[fd,buffer,offset,length,...args]);
};
fs.fstatSync=function(fd,...args){const s=Reflect.apply(original.fstatSync,this,[fd,...args]);if(fds.has(fd)&&capture())events.push({event:'capture-fstat',fd,stat:stat(s)});return s;};
fs.closeSync=function(fd,...args){if(fds.has(fd)&&capture()){closed.push(fds.get(fd).generation);fds.delete(fd);events.push({event:'capture-close',fd});}return Reflect.apply(original.closeSync,this,[fd,...args]);};
try{
 const report=checker.auditProductBoundary(q.root,q.options);
 const remaining=[...fds.keys()].filter(fd=>{try{original.fstatSync(fd);return true}catch{return false}});
 process.stdout.write(JSON.stringify({report,events,fired,opened,closed,remaining}));
}finally{for(const k of Object.keys(original))fs[k]=original[k];restorePath();}
