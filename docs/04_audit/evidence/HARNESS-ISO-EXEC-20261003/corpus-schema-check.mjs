import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const root=process.argv[2];const {OrganizedSchema}=await import(pathToFileURL(path.join(root,'products/shift-assistant/src/domain.ts')).href);
const directory=path.join(root,'products/shift-assistant/src/__tests__/fixtures/reliability/cases');let validPayloads=0,deliberateMalformed=0;
for(const name of fs.readdirSync(directory).sort()){
 const object=JSON.parse(fs.readFileSync(path.join(directory,name),'utf8'));
 const inspect=(v)=>{if(v&&typeof v==='object'){
 if(Array.isArray(v.modelResponses)){for(const response of v.modelResponses){
 if('payload'in response){const result=OrganizedSchema.safeParse(response.payload);assert(result.success,`${name}:${JSON.stringify(result.error?.issues)}`);validPayloads++;}
 else if('payloadLiteral'in response){assert(response.deliberateBadCandidate);assert.throws(()=>JSON.parse(response.payloadLiteral));deliberateMalformed++;}
 }}
 if(v.organizedV1){assert(OrganizedSchema.safeParse(v.organizedV1).success,`${name}:expected structured schema`);}
 for(const x of Object.values(v))inspect(x);
 }};inspect(object);
}
assert.equal(deliberateMalformed,1);console.log(JSON.stringify({status:'SCHEMA_INTEGRITY_PASS_ONLY',validV1CandidatePayloads:validPayloads,deliberateMalformedJSON:deliberateMalformed,domainSource:fs.readFileSync(path.join(root,'products/shift-assistant/src/domain.ts'),'utf8').length,productExecution:'NOT_RUN',T3Approval:'PENDING'}));
