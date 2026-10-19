import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {fixture,catalog,run,results,clone,work} from './helpers-final.mjs';
for (const [name,token] of [['lossy-catalog-metadata-exact','0.1000000000000000000001'],['decimal-cost-through-qualifier','1'+'0'.repeat(40000)+'1e-40002']]) {
 await run(name,['QK08'],async()=>{
  const s=await fixture();const c=clone(catalog);delete c.execution;
  const prefix=JSON.stringify(c);const raw=prefix.slice(0,-1)+',"execution":{"synthetic_decimal":'+token+'}}';
  // Check the fixture has no duplicate key manufactured by this review.
  const parsed=JSON.parse(raw);assert.equal(parsed.execution.synthetic_decimal,Number(token));assert.equal(raw.match(/"execution":/g).length,1);
  await s.bindCatalog(raw);await s.flush();const start=performance.now();const r=await s.run('INVALID_INPUT');
  assert.equal(r.checks[0].message,'JSON number loses exact decimal value on serialization');
  return {...r,bytes:Buffer.byteLength(raw),milliseconds:performance.now()-start};
 });
}
await fs.writeFile(work+'/final-controls.results.json',JSON.stringify({node:process.version,total:results.length,passed:results.filter(r=>r.status==='PASS').length,failed:results.filter(r=>r.status==='FAIL').length,results},null,2)+'\n');
console.log(JSON.stringify(results));process.exitCode=results.some(r=>r.status==='FAIL')?1:0;
