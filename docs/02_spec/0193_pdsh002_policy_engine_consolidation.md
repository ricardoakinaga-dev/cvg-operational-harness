# 0193 — SPEC: PDSH-002 — Consolidar `@cvg/policy` e `@cvg/policy-engine` em uma engine

- Task: `PARE-DSH-20261011`, cartão `PDSH-002` (plano [0375](../03_build/0375_plano_pareamento_motor_dsh.md), Onda 1).
- Trilha T3 (policy / identidade / segurança). Autorização de BUILD registrada na coordenação.
- Invariantes: ADR-011 (padrão copiado do `dsh`, código nunca copiado), ADR-005 (`policy governs effects`), fail-closed, produção `NO_GO`, sem dado real, sem lockfile.

## Objetivo

Existem hoje dois pacotes de política com o mesmo nome de classe `PolicyEngine` e contratos diferentes:

| Pacote               | Classe/fn principal                                        | Contrato de decisão                                                                                                        | Consumidores principais                                                                                                                            |
| -------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@cvg/policy`        | `evaluatePolicy` (fn), `ApprovalService`, `POLICY_VERSION` | `{decision: PolicyDecision(shared enum), reason, policyVersion}` síncrono                                                  | `agent-core` (`runAgentTurn`), `request-human-approval`, `resolve-approval`                                                                        |
| `@cvg/policy-engine` | `class PolicyEngine` (zod + grants + documentos)           | `{decision: ALLOW\|DENY\|REQUIRE_APPROVAL, reason, policyId, policyVersion, correlationId, capability, risk, evaluatedAt}` | `agent-runtime` (tipo `PolicyEngine`), `apps/worker` (`kernel-composition.ts`), `agent-evals` (`CapabilityNameSchema`), `legacy/secretary-profile` |

`@cvg/harness-contracts` define a **porta** `PolicyEngine` (`evaluate(PolicyRequest) → PolicyDecision` com `outcome: ALLOW|DENY|REQUIRE_APPROVAL|HANDOFF`). Nenhuma das duas implementações satisfaz a porta diretamente (ver `PUBLIC_API.md:29`, `PUBLIC_API.md:163`).

O cartão pede: **um único `PolicyEngine` exportado**, com a segunda engine virando perfil/referência, ADR-005 intacta, `PUBLIC_API.md` atualizado, sem import quebrado em `apps/**` e `products/**`.

## Decisões de design

1. **Motor único = `packages/policy-engine`.** A engine zod/grants/documentos já é a canônica para o kernel por turno (`agent-runtime`, `apps/worker`) e carrega o catálogo de capabilities. É o alvo que o `dsh` também referencia (capability catalog + grants). Não se apaga; se promove.

2. **`packages/policy` vira camada de compatibilidade fina, não motor.** `evaluatePolicy`, `ApprovalService`, `POLICY_VERSION` e `containsSensitiveClinicalOrFinancialAction` **não** são removidos nem reescritos — o `agent-core` e os comandos de approval dependem deles e o plano proíbe tocar `apps/**` salvo ajuste mínimo de import. A superfície pública de `@cvg/policy` permanece byte-compatível. O que muda é o **eixo de import**: consumidores novos importam de `@cvg/policy-engine`; `@cvg/policy` documenta-se como "camada legada de autonomia/approval", não como engine de autorização do kernel.

3. **Não se funde a semântica.** `evaluatePolicy` avalia `AutonomyLevel` + `RiskLevel` do `@cvg/shared` (enum legado, lowercase: `allowed|blocked|requires_approval|handoff`). A engine avalia `capability` + `grant` + `role ceiling` + documentos (uppercase: `ALLOW|DENY|REQUIRE_APPROVAL`). São camadas de decisão distintas (autonomia de turno vs autorização de capability). Fundi-las num único `evaluate` destruiria consumidores e violaria fail-closed (o fallback de autonomia não é o mesmo que o deny de capability). O "consolidar em uma engine" do cartão = **um único pacote/classe canônica de autorização de capability**, com a camada de autonomia claramente subordinada e rotulada.

4. **`HANDOFF` e `blocked` da camada legada não são migrados para a engine.** A porta do harness prevê `HANDOFF`; a engine zod não o emite (é o `agent-runtime`/host que mapeia). O `evaluatePolicy` continua o único produtor de `handoff`/`allowed` legado. Nenhum consumidor do `agent-runtime` ou `apps/worker` passa a receber outro enum.

5. **`CapabilityNameSchema` continua exportado por `@cvg/policy-engine`** (já é assim; `agent-evals` consome). `@cvg/policy` não ganha `CapabilityNameSchema`.

## Mudanças de superfície

- `packages/policy-engine/src/index.ts`: sem mudança de export (já exporta `profile`, `reference-profile`, `documents`, `engine`). Adiciona-se comentário/`@public` documental.
- `packages/policy/src/index.ts`: sem remoção. Adiciona-se comentário de orientação ("autorização de capability → `@cvg/policy-engine`; esta camada é autonomia/approval do `agent-core`").
- `docs/architecture/PUBLIC_API.md`: atualizar `L29` (par `PolicyEngine` homônimo — agora a engine canônica é a de `policy-engine`; a de `policy` deixa de ser apresentada como segunda engine) e `L153` (mover `@cvg/policy-engine` de "sem superfície de consumo nesta revisão" para superfície suportada de autorização de capability) e `L163` (a implementação da porta `policy` do harness passa a poder ser adaptada a partir de `@cvg/policy-engine`, ainda que o adaptador não seja neutro).
- `docs/architecture/adrs/ADR-005-policy-governs-effects.md`: **intacta** (critério de pronto). Verifica-se que não há texto a corrigir; se houver referência a dois pacotes, apenas confirma-se.
- `vitest.config.mts`: alias `@cvg/policy` e `@cvg/policy-engine` permanecem (os dois pacotes continuam existindo).

## Consumidores e impacto

- `packages/agent-core/src/commands/{run-agent-turn,request-human-approval,resolve-approval}.ts`: **nenhum import trocado** (continuam em `@cvg/policy`). Fora do escopo do cartão PDSH-002; será endereçado por PDSH-003.
- `packages/agent-runtime/**`, `apps/worker/src/kernel-composition.ts`, `packages/agent-evals/src/contracts.ts`, `legacy/packages/secretary-profile/**`: **nenhum import trocado** (já em `@cvg/policy-engine`).
- `tests/architecture/dependency-direction.test.ts`: a lista `forbidden` inclui `@cvg/policy` para os pacotes neutros (`contracts`, `orchestrator`, `harness`). **Nenhuma mudança** — nenhum pacote neutro importa policy hoje, e a regra continua valendo.
- `apps/**` e `products/**`: nenhum import quebrado (nenhum deles importa `@cvg/policy` ou `@cvg/policy-engine` de forma que mude).

## Critérios de pronto (do plano 0375, L172-174)

- [ ] Um único `PolicyEngine` exportado como autorização canônica de capability (`packages/policy-engine`).
- [ ] ADR-005 intacta.
- [ ] `PUBLIC_API.md` atualizado no mesmo commit.
- [ ] Nenhum import quebrado em `apps/**` e `products/**`.

## Verificação

- `npx tsc -p tsconfig.typecheck.json --noEmit` limpo.
- `npx vitest run packages/policy packages/policy-engine packages/agent-runtime packages/agent-core packages/harness tests/conformance tests/architecture` 100% PASS.
- `npx prettier --check` nos arquivos tocados.
- `npm run docs:check-links`.

## Fora de escopo

- Migrar `agent-core` para a engine (`PDSH-003`).
- Adaptador que satisfaça a porta `PolicyEngine` de `@cvg/harness-contracts` a partir da engine zod (fica para o compositor/consumidor; `PUBLIC_API.md:163` já documenta "nenhuma nos pacotes neutros").
- Alterar a semântica de decisão de qualquer um dos dois contratos.
