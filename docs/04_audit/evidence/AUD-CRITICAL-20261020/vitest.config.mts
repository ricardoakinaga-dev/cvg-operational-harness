import base from '../vitest.config.mts'
export default {...base, test:{...base.test,environment:'node',include:['.audit/probes.test.ts'],testTimeout:5000}}
