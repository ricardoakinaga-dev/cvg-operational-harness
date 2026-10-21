import base from '../vitest.config.mts'
export default {...base,test:{...base.test,environment:'jsdom',include:['.audit/integration.test.ts'],testTimeout:10000}}
