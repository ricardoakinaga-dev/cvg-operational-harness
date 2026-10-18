// Replay one preserved observation; never executes evaluated target modules.
import fs from 'node:fs'; import {createHash} from 'node:crypto'; import {spawnSync} from 'node:child_process';
const base='/tmp/cvg-hiso005-integration-20261018/review0236-r1';
const source='/home/ricardo/cvg-candidates/hiso005-integrated-20261018/scripts/';
const hashes={'boundary-semantic-engine.mjs':'025ebf8fd2030c297f85c3ba4bfe40688d01c00d2e14ad8af22504868b97dd03','check-product-boundary.mjs':'f62a8695b78c1507a9e0e2ae6b378c71d1b2fda4c237fe2ea1b7cfc063294902','boundary-semantic-compiled.mjs':'48179094c42d3b2aa7f7c4c7b34f22c13f90b4b1e709d4bcc702b9b55cd96726'};
for(const [name,expected]of Object.entries(hashes))if(createHash('sha256').update(fs.readFileSync(source+name)).digest('hex')!==expected)throw Error('Freeze changed: '+name+'; replay against pinned22ca, then R2 separately');
const id=process.argv[2];if(!/^p\d\d-[a-z-]+$/.test(id??''))throw Error('Supply a preserved probe directory id');
const dir=base+'/'+id;
if(fs.existsSync(dir+'/request.json')){
 const {evaluated,options}=JSON.parse(fs.readFileSync(dir+'/request.json'));const {auditProductBoundary}=await import(source+'check-product-boundary.mjs');process.stdout.write(JSON.stringify(auditProductBoundary(evaluated,{...options,graph:true}),null,2));
}else if(id==='p20-compiled-cli'){
 const {argv}=JSON.parse(fs.readFileSync(dir+'/input.json'));const result=spawnSync(argv[0],argv.slice(1),{encoding:'utf8',env:{PATH:'/home/ricardo/.nvm/versions/node/v22.23.2/bin:/usr/bin:/bin',LANG:'C',LC_ALL:'C',TZ:'UTC'}});process.stdout.write(JSON.stringify({exitCode:result.status,stdout:result.stdout,stderr:result.stderr},null,2));
}else{
 const input=JSON.parse(fs.readFileSync(dir+'/input.json'));const engine=await import(source+'boundary-semantic-engine.mjs');const output=id==='p19-forged-dag'?engine.validateSemanticBoundary(input,JSON.parse(fs.readFileSync(dir+'/forged-output.json'))):engine.runSemanticBoundary(input);process.stdout.write(JSON.stringify(output,null,2));
}
