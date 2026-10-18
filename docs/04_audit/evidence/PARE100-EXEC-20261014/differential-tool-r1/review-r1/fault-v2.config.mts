import base from './candidate/vitest.config.mts'
export default {...base,cacheDir:new URL('./fault-v2-vite-cache',import.meta.url).pathname,test:{...base.test,setupFiles:[new URL('./fault-v2.setup.mjs',import.meta.url).pathname]}}
