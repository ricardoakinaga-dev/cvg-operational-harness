import assert from 'node:assert/strict'
import {writeFileSync} from 'node:fs'
import {sanitizeAuditEvidencePayload} from '../packages/shared/src/audit-governance.ts'
const marker='AUD0591_OPAQUE_SYNTHETIC_MARKER'
const input={api_key:marker,credential:marker,privatekey:marker,authorization:marker,nested:{api_key:marker}}
const output=sanitizeAuditEvidencePayload(input)
assert.equal(output.payload?.api_key,marker)
assert.equal(output.payload?.credential,marker)
assert.equal(output.payload?.privatekey,marker)
assert(!Object.hasOwn(output.payload??{},'authorization'))
const result={scope:'synthetic-in-process-sanitizer-no-database',inputKeys:Object.keys(input),retainedKeys:['api_key','credential','privatekey','nested.api_key'],authorizationRemoved:true,output,criterion:'secrets identified by key must be redacted before audit sink',verdict:'FAIL_REPRODUCED',limitation:'no actual secret, audit database write or data exposure'}
writeFileSync('/tmp/cvg-aud0591-20260930/evidence/audit-redaction-probes.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result))
