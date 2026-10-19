import fs from 'node:fs';
const q=JSON.parse(fs.readFileSync(0,'utf8'));
const {auditProductBoundary}=await import(q.checker);
const original=fs.readFileSync, events=[];
fs.readFileSync=function(filename,...args){
  const text=String(filename);
  if(text===q.alias || text===q.sentinel){
    const target=fs.realpathSync(text);
    if(target!==q.sentinel) throw Error('synthetic alias observer mismatch');
    events.push({requested:text,realpath:target,stack:new Error('synthetic read witness').stack});
  }
  return Reflect.apply(original,this,[filename,...args]);
};
try{
  const report=auditProductBoundary(q.root,q.options);
  process.stdout.write(JSON.stringify({events,report}));
}finally{fs.readFileSync=original;}
