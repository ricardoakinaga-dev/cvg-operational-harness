const api=require('node:module'); const make=api.createRequire; const load=make(__filename); console.log(load('./neutral.cjs').marker)
