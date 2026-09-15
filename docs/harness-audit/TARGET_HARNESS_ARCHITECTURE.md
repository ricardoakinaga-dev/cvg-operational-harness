# Arquitetura alvo do CVG Operational Harness

## Boundary derivada da evidência

```text
cvg-operational-harness/
├── packages/
│   ├── contracts
│   ├── runtime
│   ├── orchestrator
│   ├── context-state
│   ├── model-gateway
│   ├── capability-registry
│   ├── skill-runtime
│   ├── policy-core
│   ├── approval-core
│   ├── observability-audit
│   └── knowledge-contracts
├── adapters/
│   ├── postgres
│   ├── model-providers
│   ├── native-tools
│   ├── plugin-tools
│   └── channels
├── evals/
├── tests/consumer-contracts
└── examples/two-products
```

Core: neutral contracts, one governed turn, stop/pause/checkpoint, policy evaluation, approval, immutable proposals, capability dispatch and audit requirements. Extensions: orchestrators, skills, knowledge, memory and control-plane. Adapters: DB/providers/tools/channels/MCP futuro. Produto: profile, capability catalog, grants, prompts, workflows/skills, domain, UI e hosts.

Products criam um immutable `RuntimeSnapshot` e registram Skills/Tools. Model profiles selecionam provider por gateway. Estado durável pertence a ports. Policy decide antes de effect; approval pausa e retoma por checkpoint. Orchestrator continua apenas se evidence/goal/limits permitem e para por enum tipado.

Regra de import: `PRODUCT -> HARNESS CONTRACTS`; adapters implementam ports; nunca `HARNESS -> SECRETARY`. O optional control-plane só entra depois que dois produtos consumirem o runtime como library.

## Respostas de boundary e execução

|   # | Pergunta                            | Decisão alvo baseada na evidência                                                                                                                                         |
| --: | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|   1 | O que pertence ao Core?             | Contracts neutros, single-turn runtime, decision/outcome algebra, limits/stop reasons, policy mechanism, approval binding, capability dispatch e audit requirements.      |
|   2 | O que é extensão?                   | Orchestrator, context/memory/knowledge implementations, Skills, control plane e eval packs; entram por interfaces versionadas.                                            |
|   3 | O que é adapter?                    | PostgreSQL, model providers, canais e Tools Native específicas; traduzem ports sem transferir ownership ao Core.                                                          |
|   4 | O que é plugin?                     | Capability empacotada/versionada, carregada sob manifest e mesma governance de uma Tool Native; plugin não é policy nem Skill.                                            |
|   5 | O que pertence ao produto?          | Profile, capability catalog/grants, prompts, workflows/Skills, domínio, corpus institucional, UI, API/worker host e product adapters.                                     |
|   6 | Como produtos usam o Harness?       | O host compõe um `RuntimeSnapshot`, registra extensions/adapters e chama apenas exports públicos; Secretary e consumer sintético devem passar a mesma contract suite.     |
|   7 | Como Skills são carregadas?         | Futuro `SkillLoader` valida manifest/version/hash, requirements de capabilities/policy e liga evals; hoje é `ABSENT`, portanto não entra no v0.1 sem SPEC.                |
|   8 | Como Tools são registradas?         | Um `CapabilityManifest` canônico registra schemas, risk, authority, effect/idempotency, timeout/retry e audit; Native/Plugin/MCP são adapters.                            |
|   9 | Como modelos são selecionados?      | Model profile + data classification + budget entram no Model Gateway, que seleciona provider/fallback e fixa request/prompt provenance.                                   |
|  10 | Como estado é mantido?              | Stores duráveis implementam ports separados para checkpoint, approval, effect journal, outbox e conversation state; memory não é sinônimo desses estados.                 |
|  11 | Como policies governam execução?    | Toda capability proposta passa por evaluator default-deny com tenant/actor/profile/action/resource; o produto injeta catálogo e grants.                                   |
|  12 | Como approvals interrompem/retomam? | `REQUIRE_APPROVAL` sela proposal e checkpoint; decisão autorizada retoma por token/version/CAS/fence, sem recompor payload mutável nem self-approval.                     |
|  13 | Como o loop continua?               | Orchestrator híbrido recebe observation/evidence/checkpoint e só propõe próximo passo se goal ainda não foi satisfeito e budgets/policy permitem.                         |
|  14 | Como o loop para?                   | Stop enum obrigatório cobre success, clarification, approval wait, handoff, insufficient evidence, denial, budget/deadline/cancel, loop detected e unrecoverable failure. |

Confiança: **MEDIUM / PROPOSED**. A separação deriva das primitives confirmadas em `agent-runtime`, `policy-engine`, `approval-engine`, `model-gateway`, `observability` e `persistence`; orchestrator, Skill Runtime, memory e knowledge genéricos ainda não existem e não devem ser apresentados como implementados.
