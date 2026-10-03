const api=process.getBuiltinModule('module'); const make=api.createRequire; const load=make(__filename); const again=load; console.log(again('../../../products/shift/src/index.cjs').marker)
