import { runReferenceFixture } from './reference-agent-driver.mjs'

runReferenceFixture('tool').catch((error) => {
  process.stderr.write(String(error.stack ?? error).slice(0, 16384) + '\n')
  process.exitCode = 1
})
