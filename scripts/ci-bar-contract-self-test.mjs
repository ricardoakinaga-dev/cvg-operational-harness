#!/usr/bin/env node
import { runCiBarContractSelfTest } from './ci-bar-contract.mjs'

const result = runCiBarContractSelfTest()
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
process.exitCode = result.verdict === 'PASS' ? 0 : 1
