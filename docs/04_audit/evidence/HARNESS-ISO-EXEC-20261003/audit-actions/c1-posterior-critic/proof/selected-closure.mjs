import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
const scratch=path.dirname(new URL(import.meta.url).pathname)
const candidate=path.join(scratch,'../candidate')
const ts=createRequire(path.join(candidate,'package.json'))('typescript')
const options={ module:ts.ModuleKind.NodeNext, moduleResolution:ts.ModuleResolutionKind.NodeNext, allowJs:true }
const rows=[]
for(const [id,specifier,rel] of [
  ['negative-physical-npm-require','bridge','packages/core/src/entry.cjs'],
  ['negative-physical-npm-type-closure','bridge','packages/core/src/entry.mts']
]) {
  const root=path.join(scratch,'adversarial',id),file=path.join(root,rel)
  const resolved=ts.resolveModuleName(specifier,file,options,ts.sys,undefined,undefined,id.includes('type')?ts.ModuleKind.ESNext:ts.ModuleKind.CommonJS).resolvedModule
  const typeFile=resolved?.resolvedFileName
  const row={id,typeResolution:resolved,typeSource:typeFile?fs.readFileSync(typeFile,'utf8'):null}
  if(id.includes('type'))row.nestedTypeResolution=ts.resolveModuleName('../../products/shift/src/types.d.mts',typeFile,options,ts.sys,undefined,undefined,ts.ModuleKind.ESNext).resolvedModule
  else row.runtimeResolution=createRequire(file).resolve(specifier)
  rows.push(row)
}
const apiFile=path.join(candidate,'apps/api/src/server.ts')
rows.push({id:'candidate-selected-zod-resolution-only', importer:apiFile, runtimeResolution:createRequire(apiFile).resolve('zod'), typeResolution:ts.resolveModuleName('zod',apiFile,options,ts.sys,undefined,undefined,ts.ModuleKind.ESNext).resolvedModule})
fs.writeFileSync(path.join(scratch,'selected-closure.json'),JSON.stringify({node:process.version, rows},null,2)+'\n')
console.log(JSON.stringify({node:process.version,resolved:rows.map(r=>({id:r.id,runtime:r.runtimeResolution,type:r.typeResolution?.resolvedFileName,nestedType:r.nestedTypeResolution?.resolvedFileName}))}))
