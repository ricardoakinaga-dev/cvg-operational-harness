const api=process.getBuiltinModule('module'); const make=api.createRequire; const load=make(__filename); console.log(load(process.env.CRITIC_TARGET).marker)
