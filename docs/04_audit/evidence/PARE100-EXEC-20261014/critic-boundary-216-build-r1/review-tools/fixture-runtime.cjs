// Confine supplied synthetic fixtures inside the mandated scratch without
// allowing parent's real zod/vitest runtime packages to shadow fixture aliases.
// No checker hooks: add only local workspace links to inert stubs already
// created by each supplied fixture. Dangling links remain fail-closed.
const fs=require('node:fs'),path=require('node:path');
const original=fs.mkdtempSync;
fs.mkdtempSync=function(prefix,...args){const root=original.call(this,prefix,...args);if(path.basename(root).startsWith('cvg-')){fs.mkdirSync(path.join(root,'node_modules'),{recursive:true});for(const [name,target]of[['zod','../packages/support'],['vitest','../packages/vitest']])fs.symlinkSync(target,path.join(root,'node_modules',name),'dir');}return root;};
require('node:module').syncBuiltinESMExports();
