import type { SkillRequirement } from '@cvg/harness-contracts'
import type { SkillRegistry } from './registry.ts'

export function assertSkillsAvailable(
  requirements: readonly SkillRequirement[],
  registry: SkillRegistry
): void {
  const missing: string[] = []
  for (const requirement of requirements) {
    const registered = registry.get(requirement.id)
    if (!registered) {
      missing.push(
        requirement.version
          ? `${requirement.id}@${requirement.version} ausente`
          : `${requirement.id} ausente`
      )
      continue
    }
    if (
      requirement.version !== undefined &&
      requirement.version !== registered.version
    ) {
      missing.push(
        `${requirement.id}@${requirement.version} pedida, registrada ${registered.version}`
      )
    }
  }
  if (missing.length > 0) {
    throw new Error(`skills indisponíveis: ${missing.join('; ')}`)
  }
}
