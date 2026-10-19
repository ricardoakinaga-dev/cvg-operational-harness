import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { RiskLevel, SkillDefinition } from '@cvg/harness-contracts'

export interface SkillManifestLoadError {
  readonly skillPath: string
  readonly message: string
}

export type SkillManifestLoadResult =
  | { readonly ok: true; readonly skills: readonly SkillDefinition[] }
  | { readonly ok: false; readonly errors: readonly SkillManifestLoadError[] }

const ID_PATTERN = /^[a-z0-9-]+$/
const RISK_LEVELS: readonly RiskLevel[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']
const FIELDS = [
  'id',
  'version',
  'description',
  'requiredTools',
  'requiredKnowledge',
  'riskLevel'
] as const

function isStringArray(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) &&
    value.every(
      (entry): entry is string => typeof entry === 'string' && entry.length > 0
    )
  )
}

function validateManifest(
  skillPath: string,
  dirName: string,
  raw: unknown
): SkillDefinition | SkillManifestLoadError {
  const fail = (message: string): SkillManifestLoadError => ({
    skillPath,
    message
  })
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return fail('manifesto não é um objeto JSON')
  }
  const record = raw as Record<string, unknown>
  for (const key of Object.keys(record)) {
    if (!(FIELDS as readonly string[]).includes(key)) {
      return fail(`campo desconhecido: ${key}`)
    }
  }
  for (const field of FIELDS) {
    if (!(field in record)) {
      return fail(`campo ausente: ${field}`)
    }
  }
  const {
    id,
    version,
    description,
    requiredTools,
    requiredKnowledge,
    riskLevel
  } = record
  if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
    return fail('id deve ser string [a-z0-9-]+ não vazia')
  }
  if (id !== dirName) {
    return fail(`id "${id}" difere do nome do diretório "${dirName}"`)
  }
  if (typeof version !== 'string' || version.length === 0) {
    return fail('version deve ser string não vazia')
  }
  if (typeof description !== 'string' || description.length === 0) {
    return fail('description deve ser string não vazia')
  }
  if (!isStringArray(requiredTools)) {
    return fail('requiredTools deve ser array de strings não vazias')
  }
  if (!isStringArray(requiredKnowledge)) {
    return fail('requiredKnowledge deve ser array de strings não vazias')
  }
  if (
    typeof riskLevel !== 'string' ||
    !(RISK_LEVELS as readonly string[]).includes(riskLevel)
  ) {
    return fail('riskLevel deve ser LOW|MEDIUM|HIGH|CRITICAL')
  }
  return {
    id,
    version,
    description,
    requiredTools,
    requiredKnowledge,
    riskLevel: riskLevel as RiskLevel
  }
}

export function loadSkillsFromDirectory(
  skillsDir: string
): SkillManifestLoadResult {
  let entries: string[]
  try {
    if (!statSync(skillsDir).isDirectory()) {
      return {
        ok: false,
        errors: [{ skillPath: skillsDir, message: 'não é um diretório' }]
      }
    }
    entries = readdirSync(skillsDir).sort()
  } catch {
    return {
      ok: false,
      errors: [{ skillPath: skillsDir, message: 'diretório inacessível' }]
    }
  }
  const skills: SkillDefinition[] = []
  const errors: SkillManifestLoadError[] = []
  for (const entry of entries) {
    const skillPath = join(skillsDir, entry)
    let isDir = false
    try {
      isDir = statSync(skillPath).isDirectory()
    } catch {
      errors.push({ skillPath, message: 'entrada inacessível' })
      continue
    }
    if (!isDir) {
      continue
    }
    const manifestPath = join(skillPath, 'skill.json')
    let raw: unknown
    try {
      raw = JSON.parse(readFileSync(manifestPath, 'utf8'))
    } catch (error) {
      errors.push({
        skillPath: manifestPath,
        message: `skill.json ilegível: ${
          error instanceof Error ? error.message : String(error)
        }`
      })
      continue
    }
    const validated = validateManifest(manifestPath, entry, raw)
    if ('message' in validated) {
      errors.push(validated)
    } else {
      skills.push(validated)
    }
  }
  if (errors.length > 0) {
    return { ok: false, errors }
  }
  return { ok: true, skills }
}
