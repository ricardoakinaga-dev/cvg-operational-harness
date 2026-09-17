import { runKnowledgeAssistantDemo } from '../examples/phase4a/knowledge-assistant.ts'
import { runServiceDeskDemo } from '../examples/phase4a/service-desk.ts'

export async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('phase4a demo is forbidden in production')
  }

  const serviceDesk = await runServiceDeskDemo()
  const knowledgeAssistant = await runKnowledgeAssistantDemo()
  console.log(
    JSON.stringify(
      {
        event: 'phase4a.demo.completed',
        controlledScope: 'synthetic-local-only',
        externalEffects: false,
        production: 'NO_GO',
        serviceDesk,
        knowledgeAssistant
      },
      null,
      2
    )
  )
}

main().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      event: 'phase4a.demo.failed',
      error: error instanceof Error ? error.message : 'unknown failure',
      controlledScope: 'synthetic-local-only',
      externalEffects: false,
      production: 'NO_GO'
    })
  )
  process.exitCode = 1
})
