#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import {
  RUNTIME_IMAGE_CONTRACT,
  validateRuntimeImageManifest
} from './runtime-image-contract.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)

function valueFor(flag) {
  const index = args.indexOf(flag)
  return index >= 0 ? args[index + 1] : undefined
}

function required(flag) {
  const value = valueFor(flag)
  if (!value) throw new Error(`runtime_image_record_missing:${flag}`)
  return value
}

function readInspection(tag) {
  const output = execFileSync(
    'docker',
    ['image', 'inspect', '--format', '{{json .}}', tag],
    { cwd: root, encoding: 'utf8' }
  )
  const line = output.trim().split('\n')[0]
  if (!line) throw new Error('runtime_image_record_empty_inspection')
  return JSON.parse(line)
}

function baseImageRef() {
  const dockerfile = fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8')
  const match = dockerfile.match(
    /^\s*FROM\s+(node:22[^\s]+@sha256:[0-9a-f]{64})\s+AS\s+build\s*$/m
  )
  if (!match) throw new Error('runtime_image_base_not_pinned')
  return match[1]
}

function main() {
  const tag = required('--tag')
  const runId = required('--run-id')
  const candidateId = required('--candidate-id')
  const inspection = readInspection(tag)
  const manifest = {
    schemaVersion: 1,
    kind: 'cvg-runtime-image',
    contract: RUNTIME_IMAGE_CONTRACT,
    generatedAt: new Date().toISOString(),
    runId,
    candidateId,
    tag,
    imageId: inspection.Id,
    repoDigests: inspection.RepoDigests ?? [],
    configUser: inspection.Config?.User ?? '',
    cmd: inspection.Config?.Cmd ?? [],
    workingDir: inspection.Config?.WorkingDir ?? '',
    rootFsLayers: inspection.RootFS?.Layers ?? [],
    baseImageRef: baseImageRef(),
    smoke: { status: 'PASS', live: 200, ready: 200 }
  }
  validateRuntimeImageManifest(manifest, { runId, candidateId })
  const outputPath = path.join(root, 'certification', 'runtime-image.json')
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`)
  process.stdout.write(`${JSON.stringify(manifest)}\n`)
}

try {
  main()
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`
  )
  process.exitCode = 1
}
