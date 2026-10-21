import base from '/mnt/dados/cvg-work/cvg-aud0621-integration-20261021/vitest.config.mts'
export default {...base,test:{...base.test,environment:'node',include:['/mnt/dados/cvg-work/aud0621-int-runtime/critic/probes/product/product.test.ts'],testTimeout:60000}}
