import base from './candidate/vitest.config.mts'
export default {...base,cacheDir:new URL('./fault-vite-cache',import.meta.url).pathname,test:{...base.test,setupFiles:[new URL('./fault.setup.mjs',import.meta.url).pathname]}}
