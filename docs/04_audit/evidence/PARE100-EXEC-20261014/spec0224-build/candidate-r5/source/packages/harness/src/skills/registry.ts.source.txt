import type { SkillDefinition } from '@cvg/harness-contracts'

export interface SkillRegistry {
  get(id: string): SkillDefinition | undefined
  list(): readonly SkillDefinition[]
}

export function createSkillRegistry(
  skills: readonly SkillDefinition[]
): SkillRegistry {
  const byId = new Map<string, SkillDefinition>()
  for (const skill of skills) {
    if (byId.has(skill.id)) {
      throw new Error(
        `skill id duplicado no registro: ${skill.id} (versões ${byId.get(skill.id)?.version} e ${skill.version})`
      )
    }
    byId.set(skill.id, skill)
  }
  return {
    get(id: string): SkillDefinition | undefined {
      return byId.get(id)
    },
    list(): readonly SkillDefinition[] {
      return [...byId.values()]
    }
  }
}
