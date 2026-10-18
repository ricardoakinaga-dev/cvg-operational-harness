// @vitest-environment node
import { it, expect } from 'vitest'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { lstat, readFile, rename, writeFile, unlink } from 'node:fs/promises'
import { createHostMarker, HOST_MARKER_PARENT } from './inputs.mjs'
import { wrapperArguments } from './protocol.mjs'
import { ownedRunParent } from '../../support/owned-run-parent.mjs'

// The suite owns its marker domain; the controller keeps the fixed protocol one.
const markers = path.join(ownedRunParent('c100-ref-port-markers'), 'markers')

it('keeps the default marker domain inside the protocol wrapper domain', () => {
  const marker = path.join(HOST_MARKER_PARENT, 'c'.repeat(32))
  expect(wrapperArguments(['synthetic_run', marker]).hostMarkerPath).toBe(
    marker
  )
})
it('owns a synthetic unmounted marker and confirms its removal idempotently', async () => {
  const marker = await createHostMarker(
    randomBytes(16).toString('hex'),
    markers
  )
  expect(path.dirname(marker.path)).toBe(markers)
  expect((await lstat(markers)).mode & 0o777).toBe(0o700)
  try {
    expect((await lstat(marker.path)).mode & 0o777).toBe(0o600)
    expect(await readFile(marker.path, 'utf8')).toBe(
      'CVG_UNMOUNTED_SYNTHETIC_MARKER'
    )
  } finally {
    await marker.close()
  }
  await marker.close()
  expect(marker.removed).toBe(true)
  await expect(lstat(marker.path)).rejects.toHaveProperty('code', 'ENOENT')
})
it('refuses to unlink a substituted marker inode and retains the cleanup cause', async () => {
  const marker = await createHostMarker(
    randomBytes(16).toString('hex'),
    markers
  )
  const original = `${marker.path}-original`
  await rename(marker.path, original)
  await writeFile(marker.path, 'synthetic replacement', {
    flag: 'wx',
    mode: 0o600
  })
  try {
    await expect(marker.close()).rejects.toHaveProperty('code', 'CLEANUP')
    expect(await readFile(marker.path, 'utf8')).toBe('synthetic replacement')
    expect(marker.removed).toBe(false)
  } finally {
    await unlink(marker.path)
    await unlink(original)
  }
})
it('cannot choose a marker path or command through the nonce', async () => {
  await expect(
    createHostMarker('../../foreign', markers)
  ).rejects.toHaveProperty('code', 'INPUT_INVALID')
  await expect(
    createHostMarker('a'.repeat(32), 'relative/markers')
  ).rejects.toHaveProperty('code', 'INPUT_INVALID')
})
