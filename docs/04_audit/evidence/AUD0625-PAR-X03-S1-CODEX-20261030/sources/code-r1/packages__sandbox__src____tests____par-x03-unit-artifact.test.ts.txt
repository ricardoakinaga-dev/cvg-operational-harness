import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'

it('keeps provisioning an explicit operator diagnostic, without installation or payload entry', () => {
  const unit = readFileSync(
    join(
      process.cwd(),
      'deploy/systemd/user/cvg-process-qualification@.service'
    ),
    'utf8'
  )
  const active = unit
    .split('\n')
    .filter((l) => !l.trim().startsWith('#'))
    .join('\n')
  for (const line of [
    'Type=oneshot',
    'Delegate=cpu memory pids',
    'DelegateSubgroup=supervisor',
    'RuntimeDirectory=cvg-process-qualification/%i',
    'RuntimeDirectoryMode=0700',
    'RuntimeDirectoryPreserve=yes',
    'UMask=0077',
    'Restart=no',
    'RemainAfterExit=no',
    'KillMode=control-group',
    'TimeoutStartSec=15s',
    'TimeoutStopSec=10s'
  ])
    expect(active).toContain(line)
  expect(active).toContain(
    'ExecStart=%h/.local/libexec/cvg/node22 %h/.local/libexec/cvg/qualification-entry.mjs --instance %i'
  )
  expect(active).not.toContain('[Install]')
  expect(active).not.toMatch(
    /ExecStartPre|ExecStartPost|\/bin\/sh|sudo|systemctl|EnvironmentFile/
  )
  const entry = readFileSync(
    join(process.cwd(), 'deploy/systemd/user/qualification-entry.mjs'),
    'utf8'
  )
  expect(entry).toContain('qualified: false')
  expect(entry).not.toMatch(
    /child_process|execSync|spawn\(|writeFile|mkdir|systemctl/
  )
  expect(entry).toContain('args.length !== 2')
  expect(entry).toContain("args[0] !== '--instance'")
})
