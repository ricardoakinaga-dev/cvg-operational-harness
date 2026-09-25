import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

export const REQUIRED_RISK_DOMAINS = Object.freeze([
  'identity',
  'policy',
  'ssrf',
  'replay',
  'approval',
  'rate-limiter',
  'persistence'
])

const ALLOWED_DOMAINS = new Set([...REQUIRED_RISK_DOMAINS, 'coverage'])
const ALLOWED_MODES = new Set(['driver', 'vitest'])

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .filter((key) => value[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

export function manifestDigest(manifest) {
  return createHash('sha256').update(canonicalJson(manifest)).digest('hex')
}

function occurrenceCount(source, selector) {
  let count = 0
  let offset = 0
  while (true) {
    const index = source.indexOf(selector, offset)
    if (index === -1) return count
    count += 1
    offset = index + selector.length
  }
}

function isInsideRoot(root, candidate) {
  const relative = path.relative(root, candidate)
  return (
    relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
  )
}

function add(errors, message) {
  errors.push(message)
}

export function validateMutationManifest(
  manifest,
  { root = process.cwd() } = {}
) {
  const resolvedRoot = path.resolve(root)
  const errors = []
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error('Mutation manifest must be an object')
  }
  if (manifest.schemaVersion !== 1) add(errors, 'schemaVersion must be 1')
  if (manifest.kind !== 'risk-mutation-manifest') {
    add(errors, 'kind must be risk-mutation-manifest')
  }
  if (typeof manifest.contract !== 'string' || manifest.contract.length < 3) {
    add(errors, 'contract is required')
  }
  if (!Array.isArray(manifest.mutations) || manifest.mutations.length === 0) {
    add(errors, 'mutations must be a non-empty array')
  }

  const mutations = Array.isArray(manifest.mutations) ? manifest.mutations : []
  const ids = new Set()
  const domains = new Set()
  for (const [index, mutation] of mutations.entries()) {
    const label = `mutations[${index}]`
    if (!mutation || typeof mutation !== 'object' || Array.isArray(mutation)) {
      add(errors, `${label} must be an object`)
      continue
    }
    if (typeof mutation.id !== 'string' || mutation.id.length < 3) {
      add(errors, `${label}.id is required`)
    } else if (ids.has(mutation.id)) {
      add(errors, `duplicate mutation id: ${mutation.id}`)
    } else {
      ids.add(mutation.id)
    }
    if (!ALLOWED_DOMAINS.has(mutation.domain)) {
      add(errors, `${label}.domain is unknown: ${mutation.domain}`)
    } else {
      domains.add(mutation.domain)
    }
    if (!ALLOWED_MODES.has(mutation.mode)) {
      add(errors, `${label}.mode is unknown`)
    }
    if (typeof mutation.source !== 'string' || mutation.source.length === 0) {
      add(errors, `${label}.source is required`)
      continue
    }
    const sourcePath = path.resolve(resolvedRoot, mutation.source)
    if (!isInsideRoot(resolvedRoot, sourcePath)) {
      add(errors, `${label}.source escapes repository root`)
      continue
    }
    if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) {
      add(errors, `${label}.source does not exist: ${mutation.source}`)
      continue
    }
    const source = fs.readFileSync(sourcePath, 'utf8')
    const actualHash = createHash('sha256').update(source).digest('hex')
    if (!/^[0-9a-f]{64}$/.test(mutation.sourceSha256)) {
      add(errors, `${label}.sourceSha256 is invalid`)
    } else if (mutation.sourceSha256 !== actualHash) {
      add(errors, `${label}.source hash drift: ${mutation.source}`)
    }
    if (typeof mutation.from !== 'string' || mutation.from.length === 0) {
      add(errors, `${label}.from selector is required`)
    }
    if (typeof mutation.to !== 'string' || mutation.to.length === 0) {
      add(errors, `${label}.to replacement is required`)
    }
    if (
      typeof mutation.from === 'string' &&
      typeof mutation.to === 'string' &&
      mutation.from === mutation.to
    ) {
      add(errors, `${label}.from and .to must differ`)
    }
    if (typeof mutation.from === 'string' && mutation.from.length > 0) {
      const occurrences = occurrenceCount(source, mutation.from)
      if (occurrences !== 1) {
        add(errors, `${label}.selector occurrence count is ${occurrences}`)
      }
    }
    if (
      !Number.isInteger(mutation.budgetMs) ||
      mutation.budgetMs < 1_000 ||
      mutation.budgetMs > 3_600_000
    ) {
      add(errors, `${label}.budgetMs must be between 1000 and 3600000`)
    }
    if (mutation.mode === 'driver') {
      if (typeof mutation.driver !== 'string' || mutation.driver.length < 20) {
        add(errors, `${label}.driver is required for driver mode`)
      }
    } else if (mutation.mode === 'vitest') {
      if (
        !Array.isArray(mutation.testFiles) ||
        mutation.testFiles.length === 0
      ) {
        add(errors, `${label}.testFiles are required for vitest mode`)
      } else {
        for (const testFile of mutation.testFiles) {
          const testPath = path.resolve(resolvedRoot, testFile)
          if (!isInsideRoot(resolvedRoot, testPath)) {
            add(errors, `${label}.testFile escapes repository root`)
          } else if (!fs.existsSync(testPath)) {
            add(errors, `${label}.testFile does not exist: ${testFile}`)
          }
        }
      }
    }
    if (typeof mutation.owner !== 'string' || mutation.owner.length < 2) {
      add(errors, `${label}.owner is required`)
    }
  }

  for (const domain of REQUIRED_RISK_DOMAINS) {
    if (!domains.has(domain)) add(errors, `required domain missing: ${domain}`)
  }
  if (errors.length > 0) {
    throw new Error(`Mutation manifest invalid:\n${errors.join('\n')}`)
  }
  return {
    manifestSha256: manifestDigest(manifest),
    mutationCount: mutations.length,
    domains: [...domains].sort()
  }
}
