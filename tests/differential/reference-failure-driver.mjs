import { runReferenceFixture } from './reference-agent-driver.mjs'

runReferenceFixture('failure').catch((error) => {
  process.stderr.write(`${error.message}\n`)
  process.exitCode = 1
})
