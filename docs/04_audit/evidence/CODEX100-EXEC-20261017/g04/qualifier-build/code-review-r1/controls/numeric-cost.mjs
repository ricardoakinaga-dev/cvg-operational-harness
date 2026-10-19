import {performance} from 'node:perf_hooks';
import {parseStrictJson} from '../qualification-candidate/tests/claude100/qualification/strict-json.mjs';
for (const n of [10000,20000,40000,80000]) {
  const token='1'+ '0'.repeat(n) +'1e-'+(n+2);
  const t=performance.now(); let outcome;
  try {parseStrictJson(token,{numericDomain:'CODEX_EXACT_DECIMAL'});outcome='ACCEPT'}catch(e){outcome=e.message}
  console.log(JSON.stringify({zeros:n,bytes:token.length,number:Number(token),milliseconds:performance.now()-t,outcome}));
}
