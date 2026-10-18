// @vitest-environment node
import { it, expect } from 'vitest'
import { mkdtemp, writeFile, rm, rename, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createEvidence } from './evidence.mjs'

async function ownEvidence(fn) {
  const root = await mkdtemp(path.join(tmpdir(), 'native-port-physical-'))
  const evidence = await createEvidence(root, 'run')
  try {
    return await fn(evidence, root)
  } finally {
    await evidence.close()
    await rm(root, { recursive: true, force: true })
  }
}
it('materializes current physical bytes including a genuinely empty native pipe', () =>
  ownEvidence(async (evidence) => {
    const empty = await evidence.add(
      'native-stdout',
      'empty.bin',
      Buffer.alloc(0)
    )
    const data = await evidence.add(
      'stdin',
      'input.txt',
      Buffer.from('synthetic')
    )
    const physical = await evidence.physicalArtifacts()
    expect(physical.get(empty.path)).toEqual(Buffer.alloc(0))
    expect(physical.get(data.path)).toEqual(Buffer.from('synthetic'))
  }))
it('rejects a changed physical artifact despite a still valid in-memory copy', () =>
  ownEvidence(async (evidence, root) => {
    const artifact = await evidence.add(
      'stdin',
      'input.txt',
      Buffer.from('synthetic')
    )
    await writeFile(path.join(root, artifact.path), 'DIFFERENT')
    await expect(evidence.physicalArtifacts()).rejects.toThrow()
    expect(evidence.retained.get(artifact.path).toString()).toBe('synthetic')
  }))
it('does not allow a cached first read to conceal a later physical change', () =>
  ownEvidence(async (evidence, root) => {
    const artifact = await evidence.add(
      'stdin',
      'input.txt',
      Buffer.from('synthetic')
    )
    await evidence.physicalArtifacts()
    await writeFile(path.join(root, artifact.path), 'DIFFERENT')
    await expect(evidence.physicalArtifacts()).rejects.toThrow()
  }))
it('rejects a symlink substituted for staged evidence without following it', () =>
  ownEvidence(async (evidence, root) => {
    const artifact = await evidence.add(
      'stdin',
      'input.txt',
      Buffer.from('synthetic')
    )
    const filename = path.join(root, artifact.path)
    await rename(filename, filename + '-original')
    await symlink(filename + '-original', filename)
    await expect(evidence.physicalArtifacts()).rejects.toThrow()
  }))
it('counts the private bootstrap snapshot in the aggregate byte budget', () =>
  ownEvidence(async (evidence) => {
    evidence.reserveBytes(8 * 1024 * 1024)
    await expect(
      evidence.add('stdin', 'one.txt', Buffer.from('x'))
    ).rejects.toHaveProperty('code', 'CAP')
    expect(() => evidence.reserveBytes(1)).toThrow()
  }))
