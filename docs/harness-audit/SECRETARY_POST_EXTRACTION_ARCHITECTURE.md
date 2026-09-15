# Secretary após a extração

```text
cvg-agent-secretary/
├── apps/api, apps/web, apps/worker
├── secretary-profile/
├── skills/
│   ├── scheduling-draft
│   ├── owner-patient-journey
│   ├── institutional-answer
│   └── handoff
├── prompts/
├── secretary-policies-and-capability-catalog/
├── workflows/
├── domain-and-persistence/
├── channel/product-adapters/
└── harness-composition/
        └── depends on CVG Operational Harness
```

Permanecem no Secretary: UI/hosts, preset/Test Lab behavior, workflows, local journey tools, patient/owner/appointment schemas, clinical/finance rules, controlled scheduling plugin, knowledge content, deployment e product eval corpus.

O Harness fornece contracts/runtime/model/policy-core/approval/capability/audit ports. Secretary registra profile/skills/catalogs; Harness nunca importa Secretary. Legacy `agent-core`/`policy` saem apenas após golden parity e rollback test.
