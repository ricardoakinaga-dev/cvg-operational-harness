import base from '/mnt/dados/cvg-work/cvg-aud0621-integration-20261021/vitest.config.mts'
export default {...base,test:{...base.test,environment:'node',include:['/mnt/dados/cvg-work/aud0621-int-runtime/critic/probes/worker-preflight-0029.test.ts','/mnt/dados/cvg-work/aud0621-int-runtime/critic/probes/pg-extra.test.ts'],testTimeout:120000,hookTimeout:240000}}
