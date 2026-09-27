# 0136 — SPEC: isolar o perfil e o catálogo de capacidades da secretária

- ID: `SPEC-LEGACY-002`
- Estado: `SPEC_APPROVED_BY_USER` em 26/09/2026 ("Aprovo as 3 fatias"); BUILD autorizado fatia a fatia
- Trilha: **T3** da [governança proporcional](../07_agents/AGENTS.md) — muda
  contrato público do `policy-engine`; exige revisão do usuário antes do BUILD.
- Task: PR-L05 de
  [0356](../03_build/0356_production_backlog_2026-09-26.md); destrava PR-L06.
- Base: [inventário do legado](../../legacy/LEGACY_INVENTORY.md) e
  [SPEC-LEGACY-001](0135_legacy_dead_packages_and_boundary.md).

## Recon medido (26/09/2026, `629fb36`)

### O catálogo está embutido no motor de policy

- `packages/policy-engine/src/capabilities.ts`: `CapabilitySchema` é um
  `z.enum` fechado com 21 capacidades do hospital veterinário
  (`schedule.read`, `appointment.create|modify|confirm|reschedule|cancel`,
  `patient.summary.read`, `patient.record.read|write`, `exam.read|release`,
  `finance.read|write`, `hospitalization.manage`, `clinical.diagnose|prescribe`,
  `conversation.read`, `message.draft|send`, `admin.policy.manage`,
  `admin.agent.manage`), com categorias, risco, ações e tipos de recurso.
- `packages/policy-engine/src/grants.ts`: `AgentProfileNameSchema` fechado em
  `secretary`, `hospitalization`, `clinical`, `financial`, `admin`;
  `AGENT_PROFILE_GRANTS` e `OPERATOR_ROLE_CAPABILITIES` fixos. Os papéis de
  operador (`Operator`, `Approver`, `Supervisor`, `Admin`, de `@cvg/shared`) já
  são neutros.
- `packages/policy-engine/src/engine.ts` lê catálogo e grants por funções
  globais (`capabilityRisk`, `capabilityResourceScope`,
  `actionMatchesCapability`, `grantFor`, `roleAllowsCapability`) e valida a
  entrada com os dois enums.

### Consumidores de `@cvg/policy-engine`

| Consumidor                                                       | Uso                                                                    |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `packages/agent-runtime/src/runtime.ts`                          | `capabilityRisk`, `isHighRiskCapability` (produção)                    |
| `packages/agent-runtime/src/{composition,contracts,proposal}.ts` | tipos `Capability`, `AgentProfileName`, `PolicyEngine`                 |
| `apps/worker/src/kernel-composition.ts`                          | enums + perfil padrão `'secretary'` + capacidade sintética de consulta |
| `packages/agent-evals/src/contracts.ts`                          | `CapabilitySchema`                                                     |
| 11 arquivos de teste (`agent-runtime`, `chaos`, `worker`)        | `PolicyEngine`, `Capability`                                           |

### O preset da secretária é o agente padrão do runtime controlado

`packages/platform/src/secretary-preset.ts` exporta
`ensureControlledSecretaryPreset`, `createControlledSecretaryConfig`,
`createValidatedControlledReleaseCandidate` e as constantes do tenant/slug da
secretária. `apps/api/src/server.ts:5519` chama
`ensureControlledSecretaryPreset` no boot. Mais de 20 arquivos de teste (API, worker,
persistence, platform, agent-core, E2E) usam o preset.

### Vocabulário da secretária em testes do harness

| Área                       | Arquivos | Ocorrências |
| -------------------------- | -------- | ----------- |
| `packages/agent-runtime`   | 10       | 137         |
| `packages/approval-engine` | 9        | 29          |
| `apps/worker`              | 2        | 19          |
| `packages/platform`        | 7        | 8           |
| demais                     | 11       | 21          |

## Desenho

O harness passa a oferecer o **mecanismo** (catálogo, perfis e grants como
dados de entrada) e o legado passa a oferecer o **conteúdo** da secretária.

```txt
@cvg/policy-engine (harness)                 @cvg/legacy-secretary-profile (legacy/packages)
  PolicyProfile { catalog, agentProfileGrants,  ──►  SECRETARY_POLICY_PROFILE (21 capacidades,
                  operatorRoleCapabilities }           5 perfis, grants e papéis atuais)
  createCapabilityRegistry(catalog)                    secretary preset (vindo do platform)
  new PolicyEngine({ profile, ... })
                ▲                                              │
                └──── apps/api/src/legacy-composition.ts ◄─────┤ pontos de composição
                      apps/worker/src/legacy-composition.ts ◄──┘ declarados (SPEC-LEGACY-001 R2)
```

## Fatias

### Fatia 1 — mecanismo neutro no `policy-engine` (sem mudança de comportamento)

1. `Capability` e `AgentProfileName` passam a ser strings validadas por
   formato (`^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$` e
   `^[a-z][a-z0-9_-]*$`), não enums.
2. Novo tipo `PolicyProfile` com `catalog`, `agentProfileGrants` e
   `operatorRoleCapabilities`; `createCapabilityRegistry(catalog)` expõe
   `risk`, `isHighRisk`, `resourceScope` e `actionMatches`.
3. `PolicyEngine` exige `profile` no construtor. Capacidade ou perfil fora do
   `PolicyProfile` produz a mesma decisão e o mesmo código de erro que uma
   entrada inválida produz hoje (fail-closed).
4. `agent-runtime` recebe o registry pela composição, em vez de chamar funções
   globais.
5. Nesta fatia o conteúdo atual continua exportado pelo `policy-engine` como
   `SECRETARY_POLICY_PROFILE`, e todo consumidor o passa explicitamente.

Pronto: suíte completa, `test:postgres` e E2E verdes sem alterar nenhuma
asserção de decisão; `test:evals` com as mesmas métricas.

### Fatia 2 — pacote `@cvg/legacy-secretary-profile`

1. Workspaces: `legacy/packages/*` em `package.json`; nova versão revisada de
   `config/workspace-dependency-policy.json` e do padrão aceito em
   `scripts/workspace-dependency-audit.mjs` (liberado pela D-13);
   `tests/workspace-scripts.test.js`, `tsconfig*.json`, `vitest.config.mts`,
   `Dockerfile` e `scripts/build-runtime.mjs` incluem o diretório.
2. Mover para o pacote: `SECRETARY_POLICY_PROFILE` (saindo do
   `policy-engine`) e o preset (saindo do `platform`), com os testes
   `secretary-preset*.test.ts`.
3. Pontos de composição declarados em `LEGACY_COMPOSITION_POINTS`:
   `apps/api/src/legacy-composition.ts` e
   `apps/worker/src/legacy-composition.ts`. `server.ts` e
   `kernel-composition.ts` passam a receber perfil e preset por eles; o perfil
   padrão `'secretary'` do worker sai do código neutro.
4. Testes de `apps/` que usam o preset importam do ponto de composição.

Pronto: `policy-engine` e `platform` sem vocabulário da secretária em
produção; teste de fronteira verde; imagem de runtime construída
(`gate image`) com o pacote legado.

### Fatia 3 — perfil de referência neutro para os testes do harness

1. `@cvg/policy-engine/testing` exporta `REFERENCE_POLICY_PROFILE`, com
   capacidades neutras e os mesmos níveis de risco e aprovação das atuais.
   Mapeamento mecânico usado nos testes:

   | Atual                                                         | Referência neutra           | Risco mantido |
   | ------------------------------------------------------------- | --------------------------- | ------------- |
   | `schedule.read`                                               | `resource.read`             | igual         |
   | `appointment.create`                                          | `record.create`             | igual         |
   | `appointment.modify`                                          | `record.update`             | igual         |
   | `appointment.reschedule`                                      | `record.reschedule`         | igual         |
   | `appointment.confirm`                                         | `record.confirm`            | igual         |
   | `appointment.cancel`                                          | `record.cancel`             | igual         |
   | `patient.summary.read`                                        | `subject.summary.read`      | igual         |
   | `patient.record.read/write`                                   | `subject.record.read/write` | igual         |
   | `exam.*`, `finance.*`, `hospitalization.manage`, `clinical.*` | `restricted.*` equivalentes | igual         |
   | perfil `secretary`                                            | `assistant`                 | mesmos grants |

2. Os testes de `agent-runtime`, `chaos` e do worker passam a usar o perfil
   de referência. Nenhuma asserção muda além do nome da capacidade.
3. `agent-evals` fica com o catálogo da secretária até a PR-L06.

Pronto: `git grep` pelas capacidades da secretária em `packages/` retorna só
`approval-engine` (tratado na revisão de fixtures da FL) e o que a PR-L06 vai
mover.

## Fora de escopo (registrado para a revisão de vocabulário da FL)

- `packages/platform/src/output-policy.ts` (mensagem "médico-veterinário") e
  `critical-safety-preflight.ts` (regras `real-appointment-*`): são guardas
  do harness contra os não-objetivos permanentes; o texto específico vai para
  o perfil numa fatia posterior.
- Resumo de handoff com tutor/pet em `agent-core` e as jornadas: PR-L04.
- Dados já persistidos continuam com os nomes antigos de capacidade; o
  runtime da API segue usando o perfil da secretária até a PR-L07, então
  nenhuma migração de dados é necessária nesta SPEC.

## Regras normativas

1. R1 — cada fatia é um commit próprio com todos os gates verdes em Node 22
   com PostgreSQL: `typecheck`, `lint`, `format:check`, `npm test` sem skip,
   `test:postgres`, `test:e2e`, `test:evals`, `docs:check-links`.
2. R2 — nenhuma decisão de policy muda de valor: o mesmo input com o perfil da
   secretária produz a mesma decisão, o mesmo código e o mesmo risco.
3. R3 — o harness nunca importa o pacote legado (teste de fronteira).
4. R4 — `npm run certify` é reemitido ao fim da fatia 3.

## Execução

### Fatia 1 — concluída em 26/09/2026

- Novo `packages/policy-engine/src/profile.ts` (mecanismo neutro:
  `createPolicyProfile`, schemas fechados por perfil, `PolicyProfileError`) e
  `packages/policy-engine/src/secretary-profile.ts` (conteúdo legado gerado a
  partir dos dados anteriores, sem edição manual).
- `PolicyEngine` e `PolicyRegistry` exigem o perfil; `engine.profile` expõe o
  registro ao `agent-runtime`, que deixou de usar funções globais.
- `capabilities.ts`, `grants.ts`, `documents.ts` e `PolicyEvaluationInputSchema`
  viraram superfície de compatibilidade derivada de `SECRETARY_POLICY_PROFILE`,
  a ser removida na fatia 2.
- 17 pontos de construção passam o perfil explicitamente. Nenhuma asserção de
  decisão foi alterada (R2): 49 arquivos / 491 testes de `policy-engine`,
  `agent-runtime`, `chaos`, `agent-evals` e worker passaram sem mudança de
  expectativa.
- Novo `policy-profile.test.ts` com perfil mínimo neutro: 13 testes; linhas de
  `profile.ts` 100% cobertas.
- `scripts/mutation-manifest.json`: hash de `engine.ts` refixado; a mutação
  `policy-deny-effect` continua aplicável e foi morta (`npm run mutation:guard`
  → `PASS`).
- Gates (Node 22.23.2, PostgreSQL descartável): `typecheck`, `lint`,
  `format:check`, `docs:check-links`, `diff:check` exit 0; `test:coverage` 315
  arquivos / 2 293 testes PASS, cobertura 92,59/87,61/94,89/93,58;
  `coverage:critical` PASS; `test:postgres` 35/258; `test:e2e` 12/12;
  `test:evals` exit 0. O E2E voltou a sobrescrever três PNGs de
  `AUD19-013` (PR-009); restaurados.
- Achado para a fatia 2 e a revisão de vocabulário: o domínio da secretária
  também está em `packages/platform/src/policy-evaluator.ts` (regex
  `confirm_appointment`), `test-lab.ts`, nas flags `realPayments`/
  `realMedicalRecords` do `AgentConfigSchema` e no console web
  (`apps/web/src/features/platform/draft-helpers.ts` fixa o plugin
  `scheduling.controlled`). O inventário PR-L01 foi atualizado.

### Ordem de execução ajustada

A fatia 3 foi executada antes da fatia 2. Tirar o perfil e o preset da
secretária do harness quebraria os testes de `agent-runtime`, `chaos`, worker e
`platform`, que a regra R3 impede de importar o legado; eles precisam do perfil
de referência antes da mudança. O conteúdo aprovado das fatias não mudou.

### Fatia 3 (parte do perfil de referência) — concluída em 26/09/2026

- Novo `packages/policy-engine/src/reference-profile.ts` com
  `REFERENCE_POLICY_PROFILE`, gerado a partir do perfil da secretária pelo
  mapeamento da tabela acima. Uma comparação programática confirmou a mesma
  estrutura: mesmos riscos, número de ações, tipos de recurso, grants
  (nível, `limitedFields`, `requiresMedicalOperator`), tetos por papel e
  fallback.
- Testes de `agent-runtime` (10 arquivos), `chaos` e o kernel sintético do
  worker (`apps/worker/src/kernel-composition.ts` e seu teste PostgreSQL)
  passaram para o perfil de referência por troca mecânica de nomes (163
  capacidades, perfis `assistant`/`specialist`, recursos `record`/
  `record_draft`); nenhuma asserção de decisão mudou. O worker deixou de
  depender do vocabulário da secretária.
- Novo `reference-engine.test.ts` (11 testes) cobre o mecanismo do engine só
  com o perfil de referência.
- Causa corrigida: os testes que sobem o worker real via `tsx` resolviam
  `@cvg/*` pelo `package.json` (`dist/`), carregando código compilado antigo
  de 22/09 que existia localmente; num clone limpo o processo nem subia. O
  `tsconfig.json` raiz agora herda `tsconfig.base.json` (e seus `paths`), e o
  `tsx` passou a carregar o código-fonte. Consequência: os testes de processo
  do certificado `94d7a211` (PR-003) exercitaram o `dist` antigo; a próxima
  certificação é a primeira com código atual nesses testes.
- Gates (Node 22.23.2, PostgreSQL descartável): `typecheck`, `lint`,
  `format:check`, `docs:check-links`, `build`, `build:harness` exit 0;
  `test:coverage` 315 arquivos / 2 293 testes, cobertura 92,58/87,59/94,90/93,57;
  `coverage:critical` PASS; `mutation:guard` PASS; `test:worker:startup` exit 0;
  `test:postgres` 35/258; `test:evals` exit 0; `test:e2e` falhou uma vez em
  `visual-shell.spec.ts` (comparação de screenshot) e passou 12/12 em duas
  repetições seguidas — instabilidade registrada na PR-009.

### Fatia 2 — concluída em 26/09/2026

- Novo workspace `legacy/packages/*` com o pacote `@cvg/legacy-secretary-profile`:
  `SECRETARY_POLICY_PROFILE` (dados idênticos, saídos do `policy-engine`),
  superfície de compatibilidade só para os testes de conteúdo e o preset da
  secretária (`ensureControlledSecretaryPreset`, `createControlledSecretaryConfig`
  com a configuração byte a byte anterior).
- `platform`: novo `controlled-preset.ts` com o mecanismo neutro
  (`ensureControlledAgentPreset`, `createValidatedControlledReleaseCandidate`,
  `createControlledAgentConfig`, `createControlledReferencePreset`,
  `CONTROLLED_DEFAULT_TENANT_ID`); `secretary-preset.ts` removido.
- `policy-engine`: `secretary-profile.ts`, `capabilities.ts`, `grants.ts` e os
  schemas de compatibilidade removidos; o pacote exporta só o mecanismo e o
  perfil de referência. `agent-evals` valida capacidades por formato
  (`CapabilityNameSchema`) até a PR-L06.
- Testes de conteúdo movidos com `git mv` para o pacote legado (5 do
  `policy-engine`, `secretary-preset.test.ts`); o teste de hardening do preset
  voltou ao `platform` como `controlled-preset-hardening.test.ts`, porque
  testa o mecanismo.
- Ponto de composição único: `apps/api/src/legacy-composition.ts`, declarado em
  `LEGACY_COMPOSITION_POINTS`; o boot de desenvolvimento da API continua
  publicando a secretária. Worker, `platform`, API e E2E passaram a usar o
  preset e a configuração neutros.
- Infraestrutura: `package.json` (workspaces), `tsconfig.base.json` (paths),
  `tsconfig.json`, `tsconfig.typecheck.json`, `vitest.config.mts` (testes,
  cobertura e alias), `apps/api` (dependência e referência), `Dockerfile`,
  `scripts/build-runtime.mjs`; política de dependências
  `config/workspace-dependency-policy.json` em `PROD26-L05-1` com o padrão
  `legacy/packages/*` (liberado pela D-13) e o auditor ajustado; contrato
  `0305` autoriza a dependência da API; `tests/vitest-hermetic.test.ts` aceita
  aliases em `legacy/packages/`. Auditor de dependências: os mesmos 11 findings
  aceitos, nenhum novo.
- Mutação `policy-deny-effect`: hash refixado e arquivo de teste atualizado para
  o novo caminho; `mutation:guard` PASS.
- Gates (Node 22.23.2, PostgreSQL descartável): `typecheck`, `lint`,
  `format:check`, `build`, `build:runtime`, `docs:check-links`, `sbom`,
  `licenses:check`, `test:evals`, `test:worker:startup`, `test:e2e` exit 0;
  `test:coverage` 316 arquivos / 2 304 testes PASS, cobertura
  92,61/87,61/94,97/93,60; `coverage:critical` PASS; `test:postgres` 35/258.
  A primeira rodada falhou em 3 testes (hash de mutação, contrato 0305 e
  hermeticidade dos aliases), corrigidos e reexecutados.
- Imagem de runtime: `docker build --target runtime` exit 0; smoke em contêiner
  somente leitura, sem rede e sem capabilities → `{"status":"PASS","live":200,"ready":200,"sourceIncluded":false}`;
  o `dist` do pacote legado está na imagem.

## Resultado da PR-L05

`policy-engine` e `platform` não carregam mais o catálogo, os perfis nem o
preset da secretária; o conteúdo está em `legacy/packages/secretary-profile` e
só a API o compõe, por um ponto declarado. Resta no `platform` o vocabulário de
agenda das guardas controladas (`policy-evaluator.ts`, `test-lab.ts`,
`critical-safety-preflight.ts`, `output-policy.ts`, plugin
`scheduling.controlled`), registrado como `HARNESS_REVIEW` para a PR-L07.
