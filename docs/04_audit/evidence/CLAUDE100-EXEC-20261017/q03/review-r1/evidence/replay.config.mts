import original from './vitest.config.mts';
export default {...original,cacheDir:'../vite-cache-node',test:{...original.test,environment:'node',include:["tests/replay/snapshot-replay.test.ts", "tests/replay/critic.probe.test.ts"],fileParallelism:false,maxWorkers:1,cache:false,reporters:['default','json'],outputFile:{json:'../replay.json'},coverage:{...original.test.coverage,enabled:false}}};
