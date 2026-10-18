import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {canonicalJson,fingerprintResolution,fingerprintToolchain,collectPackageInventory,INSTALLED_IDENTITY_LIMITS} from '/home/ricardo/cvg-candidates/hiso005-integrated-20261018/scripts/boundary-installed-identity.mjs';
const parent=process.argv[2], root=path.join(parent,'reference');
const h=x=>createHash('sha256').update(x).digest('hex');
const hasVendor=fs.existsSync(path.join(root,'node_modules/vendor/package.json'));
const packages=hasVendor?[{key:'node_modules/vendor',name:'vendor',version:'1.0.0',...collectPackageInventory(path.join(root,'node_modules/vendor'))}]:[];
const toolchain=fingerprintToolchain();
const receipt={schemaVersion:1,kind:'cvg-installed-content-reference',commit:'f'.repeat(40),root,...fingerprintResolution(root),toolchain,toolchainSha256:h(canonicalJson(toolchain)),recipe:{argv:['ci','--offline','--ignore-scripts','--audit=false','--fund=false','--include=dev','--include=optional','--cache',path.join(parent,'cache')],exitCode:0,offline:true,ignoreScripts:true,completed:true},selection:{platform:process.platform,arch:process.arch,dev:true,optional:true},limits:{...INSTALLED_IDENTITY_LIMITS},usage:{entries:packages.reduce((n,p)=>n+p.usage.entries,0),regularBytes:packages.reduce((n,p)=>n+p.usage.regularBytes,0),maxDepth:packages.length?Math.max(...packages.map(p=>p.usage.maxDepth)):0},packages};
const bytes=canonicalJson(receipt),manifestPath=path.join(parent,'installed-reference.json');fs.writeFileSync(manifestPath,bytes);process.stdout.write(JSON.stringify({manifestPath,expectedSha256:h(bytes)}));
