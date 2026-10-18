import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import * as prettier from '../../../../../../../node_modules/prettier/index.mjs';
const out=path.dirname(fileURLToPath(import.meta.url));
const receipt=JSON.parse(await fs.readFile(path.resolve(out,'../../format-correction.json'),'utf8'));
const canonical=(v)=>{
 if(Array.isArray(v))return v.map(canonical);
 if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().filter(k=>!['position','loc','range','raw','raws'].includes(k)).map(k=>[k,k==='value'&&v.type==='text'?v[k].replace(/\s+/gu,' '):canonical(v[k])]));
 return v;
};
const result=[];let i=0;
for(const pair of receipt.pairs.filter(p=>p.original)){
 i++;const a=await fs.readFile(pair.original,'utf8'),b=await fs.readFile(pair.formatted,'utf8');
 const options={...await prettier.resolveConfig(pair.original),filepath:pair.original};
 const formatted=await prettier.format(a,options);
 const row={original:pair.original,formatted:pair.formatted,exact_formatter_output:formatted===b};
 if(pair.original.endsWith('.json'))row.structural_identity=JSON.stringify(JSON.parse(a))===JSON.stringify(JSON.parse(b));
 else{
  const left=canonical((await prettier.__debug.parse(a,options)).ast),right=canonical((await prettier.__debug.parse(b,options)).ast);
  await fs.writeFile(path.join(out,`pair-${i}.original.ast.json`),JSON.stringify(left,null,2)+'\n');
  await fs.writeFile(path.join(out,`pair-${i}.formatted.ast.json`),JSON.stringify(right,null,2)+'\n');
  row.markdown_structure_identity=JSON.stringify(left)===JSON.stringify(right);
  row.normalization='Ignore source positions/raw parser metadata; collapse whitespace in text nodes only. Code/inlineCode/URLs,heading/list structure and values unchanged.';
  row.links_original=[...a.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map(m=>m[1]);
  row.links_formatted=[...b.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map(m=>m[1]);
  row.link_targets_unchanged=JSON.stringify(row.links_original)===JSON.stringify(row.links_formatted);
  row.links_resolve=(await Promise.all(row.links_formatted.map(u=>fs.access(path.resolve(path.dirname(pair.formatted),u)).then(()=>true,()=>false)))).every(Boolean);
 }
 result.push(row);
}
await fs.writeFile(path.join(out,'semantic-inspection.json'),JSON.stringify({method:'Formatter deterministic output plus JSON structural/Markdown AST+diff inspection; no target/test import',pairs:result},null,2)+'\n');
process.stdout.write(JSON.stringify(result,null,2)+'\n');
if(!result.every(x=>x.exact_formatter_output&&(x.structural_identity??x.markdown_structure_identity)&&x.link_targets_unchanged!==false&&x.links_resolve!==false))process.exitCode=1;
