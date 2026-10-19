import base from './candidate/vitest.config.mts'
export default {...base,cacheDir:new URL('./model-results-vite-cache',import.meta.url).pathname}
