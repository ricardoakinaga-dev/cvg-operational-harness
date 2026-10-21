import base from '../vitest.config.mts'
export default {...base,test:{...base.test,environment:'node',include:['.audit/data.test.ts'],testTimeout:30000}}
