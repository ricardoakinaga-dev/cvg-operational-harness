import { existsSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const targetFiles = [
  'examples/phase4a/service-desk.ts',
  'examples/phase4a/knowledge-assistant.ts',
  'examples/phase4a/README.md',
  'scripts/phase4a-demo.ts',
  'scripts/phase4a-verify.mjs',
  'packages/conversation/src/contracts.ts',
  'packages/conversation/src/conversation-service.ts',
  'packages/conversation/src/harness-bridge.ts',
  'packages/conversation/src/context-adapter.ts',
  'packages/conversation/src/handoff.ts',
  'packages/persistence/migrations/0020_conversation_intelligence.sql',
  'tests/phase4a/golden-corpus.ts',
  'tests/phase4a/golden-trajectories.ts'
]

function report(event, fields = {}) {
  console.log(
    JSON.stringify({
      event,
      controlledScope: 'synthetic-local-only',
      externalEffects: false,
      production: 'NO_GO',
      ...fields
    })
  )
}

function fail(reason, fields = {}) {
  report('phase4a.verify.failed', { reason, ...fields })
  process.exit(1)
}

for (const file of targetFiles) {
  if (!existsSync(file)) fail(`missing controlled-scope file: ${file}`)
}
report('phase4a.verify.scope', { files: targetFiles })

const serviceDesk = readFileSync(targetFiles[0], 'utf8')
const knowledgeAssistant = readFileSync(targetFiles[1], 'utf8')
const demo = readFileSync(targetFiles[3], 'utf8')
const verify = readFileSync(targetFiles[4], 'utf8')
const conversationService = readFileSync(targetFiles[6], 'utf8')
const bridge = readFileSync(targetFiles[7], 'utf8')
const contextAdapter = readFileSync(targetFiles[8], 'utf8')
const handoff = readFileSync(targetFiles[9], 'utf8')
const migration = readFileSync(targetFiles[10], 'utf8')
const corpus = readFileSync(targetFiles[11], 'utf8')
const trajectories = readFileSync(targetFiles[12], 'utf8')

const structuralChecks = [
  [
    'service desk owns a ConversationHarness port fixture',
    /ConversationHarness/.test(serviceDesk)
  ],
  [
    'harness result is effect-backed',
    /effectConfirmed:\s*true/.test(serviceDesk) && /effect:/.test(serviceDesk)
  ],
  [
    'service desk demonstrates approval-required pause',
    /APPROVAL_REQUIRED/.test(serviceDesk) && /approvalResume/.test(serviceDesk)
  ],
  [
    'knowledge assistant uses an approved-only provider',
    /StaticKnowledgeProvider/.test(knowledgeAssistant) &&
      /approvedOnly:\s*true/.test(knowledgeAssistant)
  ],
  [
    'consumers remain independent',
    !/service-desk\.ts/.test(knowledgeAssistant) &&
      !/knowledge-assistant\.ts/.test(serviceDesk)
  ],
  [
    'demo declares the production boundary',
    /externalEffects:\s*false/.test(demo) && /production:\s*'NO_GO'/.test(demo)
  ],
  [
    'verification reports controlled scope',
    /controlledScope/.test(verify) && /externalEffects/.test(verify)
  ],
  [
    'combined demo composes both independent consumers',
    /examples\/phase4a\/service-desk\.ts/.test(demo) &&
      /examples\/phase4a\/knowledge-assistant\.ts/.test(demo)
  ],
  [
    'no network or external runtime import appears in demos',
    !/(?:fetch\s*\(|axios|node:(?:http|https|net)|\bpg\b)/.test(
      `${serviceDesk}\n${knowledgeAssistant}\n${demo}`
    )
  ],
  [
    'conversation package does not import a second provider or authority',
    !/(?:@cvg\/(?:model-gateway|provider|channel-gateway|policy-engine)|fetch\s*\(|axios)/.test(
      `${conversationService}\n${bridge}\n${contextAdapter}\n${handoff}`
    )
  ],
  [
    'execution boundary validates proposal, operation, effect and evidence bindings',
    /HARNESS_PROPOSAL_HASH_MISMATCH/.test(conversationService) &&
      /HARNESS_OPERATION_KEY_MISMATCH/.test(conversationService) &&
      /HARNESS_EFFECT_EVIDENCE_INVALID/.test(conversationService)
  ],
  [
    'context adapter delegates priority and trimming to the existing ContextEngine',
    /ContextSnapshot/.test(contextAdapter) &&
      /DefaultContextEngine remains the single authority/.test(contextAdapter)
  ],
  [
    'handoff is bounded and idempotent',
    /idempotencyKey/.test(handoff) &&
      /Sensitive handoff fact rejected/.test(handoff)
  ],
  [
    'migration keeps tenant RLS and durable delivery lease columns',
    /FORCE ROW LEVEL SECURITY/.test(migration) &&
      /lease_until/.test(migration) &&
      /SENDING/.test(migration)
  ],
  [
    'golden corpus contains the required 15 scenarios and variants',
    /G15-profile-boundary/.test(corpus) &&
      /canonical/.test(corpus) &&
      /paraphrase/.test(corpus) &&
      /mutation/.test(corpus)
  ],
  [
    'golden corpus has 15 bounded multi-turn trajectories',
    /GOLDEN_TRAJECTORIES/.test(trajectories) &&
      (trajectories.match(/id: 'G\d{2}-/g) ?? []).length === 15
  ]
]

for (const [label, passed] of structuralChecks) {
  if (!passed) fail(`structural assertion failed: ${label}`)
}
report('phase4a.verify.structural_pass', {
  label: 'structural assertions',
  assertions: structuralChecks.length
})

const testResult = spawnSync(
  'npx',
  [
    'vitest',
    'run',
    'packages/conversation/src/__tests__',
    'tests/phase4a',
    'packages/persistence/src/__tests__/conversation-intelligence-migration.test.ts',
    '--reporter=dot'
  ],
  { stdio: 'inherit', env: { ...process.env, CI: '1' } }
)
if (testResult.status !== 0) {
  fail('behavioral Phase 4A test suite failed', {
    exitCode: testResult.status ?? 1
  })
}

report('phase4a.verify.completed', {
  files: targetFiles,
  checks: ['scope', 'structure', 'behavioral-tests'],
  summary:
    'controlled synthetic demo structure and focused behavioral suite verified; no real effects used'
})
