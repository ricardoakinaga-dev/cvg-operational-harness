// Installed with the reviewed compiled sandbox files at the relative path below.
// This entry reads its own unit identity; it accepts no payload or arbitrary command.
import { readFileSync } from 'node:fs'
import { inspectProcessDelegation } from './sandbox/process-service/cgroup-preflight.js'

try {
  const args = process.argv.slice(2)
  if (
    args.length !== 2 ||
    args[0] !== '--instance' ||
    !/^[a-z0-9-]{1,64}$/.test(args[1])
  )
    throw new Error('invalid_input')
  const instance = args[1]
  const membership = readFileSync('/proc/self/cgroup', 'utf8')
    .split('\n')
    .find((n) => n.startsWith('0::'))
    ?.slice(3)
  if (!membership?.endsWith('/supervisor')) throw new Error('wrong_unit')
  const expectedControlGroup = membership.slice(0, -'/supervisor'.length)
  const result = await inspectProcessDelegation({
    instance,
    expectedControlGroup,
    root: '/sys/fs/cgroup' + expectedControlGroup,
    runtimeDirectory: process.env.RUNTIME_DIRECTORY ?? ''
  })
  console.log(JSON.stringify(result))
  process.exitCode = result.state === 'candidate' ? 0 : 78
} catch {
  console.log(
    JSON.stringify({
      state: 'refused',
      qualified: false,
      reason: 'delegation_invalid',
      checks: []
    })
  )
  process.exitCode = 78
}
