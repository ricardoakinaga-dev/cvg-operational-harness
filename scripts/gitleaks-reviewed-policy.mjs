import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
)
const begin = '# BEGIN REVIEWED EXACT FINDINGS'
const end = '# END REVIEWED EXACT FINDINGS'
const detectors = new Set(['generic-api-key', 'sourcegraph-access-token'])
const metacharacters = new Set('\\^$.*+?()[]{}|')
const sha256 = (value) => createHash('sha256').update(value).digest('hex')
const fail = (code) => {
  // Never include a parsed value, source line, or native exception in errors.
  throw new Error(`Invalid reviewed Gitleaks policy: ${code}`)
}
const exactKeys = (value, keys) =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).length === keys.length &&
  keys.every((key) => Object.hasOwn(value, key))
const escapeRegex = (value) =>
  [...value]
    .map((char) => (metacharacters.has(char) ? `\\${char}` : char))
    .join('')
const literalRegex = (literal) => {
  const escaped = escapeRegex(literal)
  return `^${/^[a-fA-F0-9]{40}$/.test(literal) ? `${escaped.slice(0, 20)}(?:)${escaped.slice(20)}` : escaped}$`
}

function decodeLiteral(regex) {
  if (
    typeof regex !== 'string' ||
    !regex.startsWith('^') ||
    !regex.endsWith('$')
  ) {
    fail('literal anchors')
  }
  const body = regex.slice(1, -1).replace('(?:)', '')
  let literal = ''
  for (let i = 0; i < body.length; i++) {
    const char = body[i]
    if (char === '\\') {
      const next = body[++i]
      if (!metacharacters.has(next)) fail('literal escape')
      literal += next
    } else {
      if (metacharacters.has(char)) fail('literal syntax')
      literal += char
    }
  }
  if (
    !literal ||
    /[\x00-\x1f\x7f]/.test(literal) ||
    regex !== literalRegex(literal)
  ) {
    fail('noncanonical literal')
  }
  return literal
}

function readInside(root, relative, limit) {
  if (
    typeof relative !== 'string' ||
    !relative ||
    /[\\\x00-\x1f\x7f]/.test(relative) ||
    relative
      .split('/')
      .some((part) => !part || part === '.' || part === '..') ||
    path.isAbsolute(relative) ||
    /^[A-Za-z]:/.test(relative)
  ) {
    fail('relative path')
  }
  let current = root
  for (const part of relative.split('/')) {
    current = path.join(current, part)
    if (fs.lstatSync(current).isSymbolicLink()) fail('symlink')
  }
  const stat = fs.statSync(current)
  if (!stat.isFile() || stat.size > limit) fail('file bounds')
  return fs.readFileSync(current)
}

function parseRegion(config) {
  const lines = config.split(/\r?\n/)
  if (
    lines.filter((line) => line.trim() === begin).length !== 1 ||
    lines.filter((line) => line.trim() === end).length !== 1
  )
    fail('region markers')
  const first = lines.findIndex((line) => line.trim() === begin)
  const last = lines.findIndex((line) => line.trim() === end)
  if (last <= first) fail('region order')
  const blocks = []
  let detector = 'generic-api-key'
  let block
  let needsId = false
  const finish = () => {
    if (!block) return
    if (
      !exactKeys(block, [
        'description',
        'condition',
        'paths',
        'regexTarget',
        'regexes'
      ])
    ) {
      fail('allowlist keys')
    }
    blocks.push({ detector, ...block })
    block = undefined
  }
  for (const raw of lines.slice(first + 1, last)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    if (needsId) {
      if (line !== 'id = "sourcegraph-access-token"') fail('rule switch')
      needsId = false
      detector = 'sourcegraph-access-token'
      continue
    }
    if (line === '[[rules]]') {
      finish()
      if (detector !== 'generic-api-key') fail('repeated rule switch')
      needsId = true
      continue
    }
    if (line === '[[rules.allowlists]]') {
      finish()
      block = Object.create(null)
      continue
    }
    const assignment = /^([A-Za-z]+)\s*=\s*(.+)$/.exec(line)
    if (!block || !assignment || Object.hasOwn(block, assignment[1]))
      fail('region syntax')
    if (
      !['description', 'condition', 'paths', 'regexTarget', 'regexes'].includes(
        assignment[1]
      )
    ) {
      fail('unknown key')
    }
    const value = JSON.parse(assignment[2])
    if (
      typeof value !== 'string' &&
      !(Array.isArray(value) && value.every((item) => typeof item === 'string'))
    ) {
      fail('JSON string or array required')
    }
    block[assignment[1]] = value
  }
  if (needsId) fail('missing rule id')
  finish()
  if (!blocks.length || !blocks.some((item) => item.detector === detector))
    fail('empty region or rule')
  return blocks
}

/** Load only digest-bound, exact native exceptions. Returned literals must never be logged. */
export function loadReviewedExceptions(root = projectRoot) {
  try {
    root = fs.realpathSync(root)
    const manifest = JSON.parse(
      readInside(root, '.gitleaks-reviewed.json', 4 * 1024 * 1024)
    )
    if (
      !exactKeys(manifest, ['schemaVersion', 'gitleaksVersion', 'entries']) ||
      manifest.schemaVersion !== 1 ||
      manifest.gitleaksVersion !== '8.28.0' ||
      !Array.isArray(manifest.entries) ||
      !manifest.entries.length ||
      manifest.entries.length > 256
    ) {
      fail('manifest schema')
    }
    const config = readInside(root, '.gitleaks.toml', 4 * 1024 * 1024).toString(
      'utf8'
    )
    const blocks = parseRegion(config)
    const expected = new Map()
    for (const entry of manifest.entries) {
      if (
        !exactKeys(entry, [
          'detector',
          'path',
          'digest',
          'sourceDigest',
          'template',
          'reason',
          'lines'
        ]) ||
        !detectors.has(entry.detector) ||
        !/^[a-f0-9]{64}$/.test(entry.digest) ||
        !/^[a-f0-9]{64}$/.test(entry.sourceDigest) ||
        typeof entry.path !== 'string' ||
        typeof entry.template !== 'string' ||
        entry.template.length > 4096 ||
        entry.template.split('{literal}').length !== 2 ||
        typeof entry.reason !== 'string' ||
        !entry.reason.trim() ||
        !Array.isArray(entry.lines) ||
        !entry.lines.length ||
        !entry.lines.every(
          (line, index) =>
            Number.isSafeInteger(line) &&
            line > 0 &&
            (index === 0 || line > entry.lines[index - 1])
        )
      )
        fail('entry schema')
      const key = JSON.stringify([entry.detector, entry.path, entry.digest])
      if (expected.has(key)) fail('duplicate manifest entry')
      expected.set(key, entry)
    }
    const entries = []
    const seen = new Set()
    for (const block of blocks) {
      if (
        block.condition !== 'AND' ||
        block.regexTarget !== 'secret' ||
        !Array.isArray(block.paths) ||
        block.paths.length !== 1 ||
        !Array.isArray(block.regexes) ||
        block.regexes.length !== 1
      )
        fail('exact AND required')
      const literal = decodeLiteral(block.regexes[0])
      const digest = sha256(literal)
      if (block.description !== `Reviewed literal ${digest}`)
        fail('description digest')
      // Match canonical path syntax against the manifest, never execute a supplied regex.
      const entry = manifest.entries.find(
        (item) =>
          item.detector === block.detector &&
          item.digest === digest &&
          block.paths[0] === `^${escapeRegex(item.path)}$`
      )
      if (!entry) fail('unmanifested block or loose path')
      const key = JSON.stringify([entry.detector, entry.path, digest])
      if (seen.has(key)) fail('duplicate allowlist')
      seen.add(key)
      const source = readInside(root, entry.path, 64 * 1024 * 1024)
      if (sha256(source) !== entry.sourceDigest) fail('source digest')
      const sourceLines = source.toString('utf8').split(/\r?\n/)
      if (
        !entry.lines.every((line) => sourceLines[line - 1]?.includes(literal))
      )
        fail('source binding')
      entries.push({ ...entry, lines: [...entry.lines], literal })
    }
    if (seen.size !== expected.size) fail('missing allowlist')
    return entries
  } catch (error) {
    if (
      error instanceof Error &&
      /^Invalid reviewed Gitleaks policy: [a-zA-Z ]+$/.test(error.message)
    ) {
      throw error
    }
    fail('unreadable or malformed input')
  }
}
