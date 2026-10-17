import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  assertSkillsAvailable,
  createSkillRegistry,
  loadSkillsFromDirectory
} from '../skills/index.ts'

const repoSkillsDir = resolve(process.cwd(), 'skills')

const tempRoot = mkdtempSync(join(tmpdir(), 'pdsh-015-'))
afterAll(() => {
  rmSync(tempRoot, { recursive: true, force: true })
})

function writeSkill(
  skillsDir: string,
  dirName: string,
  manifest: unknown
): string {
  const skillDir = join(skillsDir, dirName)
  mkdirSync(skillDir, { recursive: true })
  const manifestPath = join(skillDir, 'skill.json')
  writeFileSync(
    manifestPath,
    typeof manifest === 'string' ? manifest : JSON.stringify(manifest)
  )
  return skillsDir
}

const validManifest = {
  id: 'exam-intake',
  version: '1.0.0',
  description: 'Conduz o intake de um exame.',
  requiredTools: ['fs.read', 'fs.list'],
  requiredKnowledge: [],
  riskLevel: 'LOW'
}

describe('PDSH-015 loadSkillsFromDirectory', () => {
  it('carrega o skill de exemplo do repositório', () => {
    const result = loadSkillsFromDirectory(repoSkillsDir)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const skill = result.skills.find((entry) => entry.id === 'exam-intake')
    expect(skill).toBeDefined()
    expect(skill?.version).toBe('1.0.0')
    expect(skill?.riskLevel).toBe('LOW')
    expect(skill?.requiredTools).toEqual(['fs.read', 'fs.list'])
  })

  it('diretório inexistente → ok: false (fail-closed)', () => {
    const result = loadSkillsFromDirectory(join(tempRoot, 'missing'))
    expect(result.ok).toBe(false)
  })

  it('arquivo no lugar de diretório → ok: false', () => {
    const filePath = join(tempRoot, 'not-a-dir')
    writeFileSync(filePath, 'x')
    const result = loadSkillsFromDirectory(filePath)
    expect(result.ok).toBe(false)
  })

  it('diretório vazio → ok: true com lista vazia', () => {
    const emptyDir = join(tempRoot, 'empty')
    mkdirSync(emptyDir, { recursive: true })
    const result = loadSkillsFromDirectory(emptyDir)
    expect(result).toEqual({ ok: true, skills: [] })
  })

  it('id difere do nome do diretório → erro', () => {
    const skillsDir = join(tempRoot, 'mismatch')
    writeSkill(skillsDir, 'outro-nome', validManifest)
    const result = loadSkillsFromDirectory(skillsDir)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors[0]?.message).toContain('difere do nome do diretório')
  })

  it('campo desconhecido → erro (vocabulário fechado)', () => {
    const skillsDir = join(tempRoot, 'extra-field')
    writeSkill(skillsDir, 'exam-intake', {
      ...validManifest,
      surprise: true
    })
    const result = loadSkillsFromDirectory(skillsDir)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors[0]?.message).toContain('campo desconhecido')
  })

  it('campo ausente → erro', () => {
    const skillsDir = join(tempRoot, 'missing-field')
    const rest = {
      id: validManifest.id,
      description: validManifest.description,
      requiredTools: validManifest.requiredTools,
      requiredKnowledge: validManifest.requiredKnowledge,
      riskLevel: validManifest.riskLevel
    }
    writeSkill(skillsDir, 'exam-intake', rest)
    const result = loadSkillsFromDirectory(skillsDir)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors[0]?.message).toContain('campo ausente: version')
  })

  it('riskLevel inválido → erro', () => {
    const skillsDir = join(tempRoot, 'bad-risk')
    writeSkill(skillsDir, 'exam-intake', {
      ...validManifest,
      riskLevel: 'EXTREME'
    })
    const result = loadSkillsFromDirectory(skillsDir)
    expect(result.ok).toBe(false)
  })

  it('JSON ilegível → erro', () => {
    const skillsDir = join(tempRoot, 'bad-json')
    writeSkill(skillsDir, 'exam-intake', '{ not json')
    const result = loadSkillsFromDirectory(skillsDir)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors[0]?.message).toContain('ilegível')
  })

  it('diretório sem skill.json → erro (skill incompleta)', () => {
    const skillsDir = join(tempRoot, 'incomplete')
    mkdirSync(join(skillsDir, 'ghost'), { recursive: true })
    const result = loadSkillsFromDirectory(skillsDir)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors[0]?.message).toContain('ilegível')
  })

  it('arquivos soltos na raiz de skills/ são ignorados', () => {
    const skillsDir = join(tempRoot, 'with-readme')
    mkdirSync(skillsDir, { recursive: true })
    writeFileSync(join(skillsDir, 'README.md'), '# hi')
    writeSkill(skillsDir, 'exam-intake', validManifest)
    const result = loadSkillsFromDirectory(skillsDir)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.skills).toHaveLength(1)
  })

  it('coleta todos os erros (não aborta no primeiro)', () => {
    const skillsDir = join(tempRoot, 'multi-error')
    writeSkill(skillsDir, 'a-skill', {
      ...validManifest,
      id: 'a-skill',
      surprise: 1
    })
    writeSkill(skillsDir, 'b-skill', {
      ...validManifest,
      id: 'b-skill',
      riskLevel: 'NOPE'
    })
    const result = loadSkillsFromDirectory(skillsDir)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.length).toBe(2)
  })
})

describe('PDSH-015 createSkillRegistry', () => {
  const skill = {
    id: 'exam-intake',
    version: '1.0.0',
    description: 'd',
    requiredTools: [],
    requiredKnowledge: [],
    riskLevel: 'LOW' as const
  }

  it('lookup por id e list()', () => {
    const registry = createSkillRegistry([skill])
    expect(registry.get('exam-intake')?.version).toBe('1.0.0')
    expect(registry.get('missing')).toBeUndefined()
    expect(registry.list()).toHaveLength(1)
  })

  it('id duplicado (mesma versão) → throw', () => {
    expect(() => createSkillRegistry([skill, { ...skill }])).toThrow(
      /duplicado/
    )
  })

  it('id duplicado (versões diferentes) → throw', () => {
    expect(() =>
      createSkillRegistry([skill, { ...skill, version: '2.0.0' }])
    ).toThrow(/duplicado/)
  })

  it('registro vazio é válido', () => {
    expect(createSkillRegistry([]).list()).toEqual([])
  })
})

describe('PDSH-015 assertSkillsAvailable', () => {
  const registry = createSkillRegistry([
    {
      id: 'exam-intake',
      version: '1.0.0',
      description: 'd',
      requiredTools: [],
      requiredKnowledge: [],
      riskLevel: 'LOW'
    }
  ])

  it('requisito atendido sem versão → passa', () => {
    expect(() =>
      assertSkillsAvailable([{ id: 'exam-intake' }], registry)
    ).not.toThrow()
  })

  it('requisito com versão correta → passa', () => {
    expect(() =>
      assertSkillsAvailable([{ id: 'exam-intake', version: '1.0.0' }], registry)
    ).not.toThrow()
  })

  it('skill ausente → throw listando id', () => {
    expect(() => assertSkillsAvailable([{ id: 'ghost' }], registry)).toThrow(
      /ghost ausente/
    )
  })

  it('versão divergente → throw listando pedida vs registrada', () => {
    expect(() =>
      assertSkillsAvailable([{ id: 'exam-intake', version: '9.9.9' }], registry)
    ).toThrow(/9\.9\.9 pedida, registrada 1\.0\.0/)
  })

  it('múltiplas faltantes → todas listadas', () => {
    expect(() =>
      assertSkillsAvailable(
        [{ id: 'ghost' }, { id: 'exam-intake', version: '0.0.1' }],
        registry
      )
    ).toThrow(/ghost ausente.*exam-intake@0\.0\.1 pedida/)
  })

  it('lista vazia → passa', () => {
    expect(() => assertSkillsAvailable([], registry)).not.toThrow()
  })
})
