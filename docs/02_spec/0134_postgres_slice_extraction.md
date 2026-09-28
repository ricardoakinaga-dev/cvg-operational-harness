# 0134 — SPEC: extração de fatias de `postgres.ts`

- ID: `SPEC-STRUCT-002`
- Estado: `SLICE_3_COMPLETED / SLICE_4_BUILD_LOCAL_AUTHORIZED` em T2; produção `NO_GO`.
- Origem: RA25-07 de [0351](../03_build/0351_audit0573_backlog.md), onda D3 de
  [0350](../03_build/0350_audit0573_roadmap.md).
- Alvo: `packages/persistence/src/postgres.ts` (3 354 linhas).
- Fora de escopo: `apps/api/src/server.ts` (5 857) e
  `packages/agent-runtime/src/runtime.ts` (2 603) — cada um com SPEC própria.

## Recon medido (2026-09-25)

Uma única classe exportada, `PostgresRuntimeRepository`, aberta na linha 448,
com 47 métodos. Domínios coesos medidos:

| Domínio                               | Linhas | `this` consumido                                                                                                                                           |
| ------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Outbox durável (métodos + 17 helpers) | 816    | `client`, `repositoryNow`, `isOutboxTakeoverActive`, `markOutboxSessionHandoff`, `suppressOutboxForTakeover`                                               |
| Auditoria e checkpoint                | 526    | `appendAudit`, `client`, `findApprovalDecisionAudit`, `hasAuditTenantColumn`, `listAuditEventsByIds`, `tenantIsolation`, `transitionTakeoverInTransaction` |
| Inbound runtime                       | 361    | `appendOutboundMessage`, `client`, `markInboundRuntimeCompleted`                                                                                           |
| Sessão e task                         | ~546   | a medir na fatia                                                                                                                                           |

## Interpretação do critério de tamanho

O critério de RA25-07 diz “tamanho por arquivo abaixo de ~1.500 linhas nas
fatias tocadas”. `postgres.ts` tem 3 354 linhas e não chega a ~1 500 em uma
única fatia segura: exigiria mover ~1 900 linhas e construir um contexto com
mais de 20 membros de uma vez. A leitura adotada, registrada aqui para revisão,
é: **cada fatia entrega um módulo novo abaixo de ~1 500 linhas e reduz o
arquivo alvo de forma monotônica**, com o alvo de ~1 500 para `postgres.ts`
sendo atingido nas fatias seguintes. A leitura alternativa — o arquivo alvo já
abaixo de ~1 500 em cada fatia — é impossível de satisfazer na primeira fatia
de um arquivo desse tamanho.

## Regras normativas

1. **R1 — comportamento idêntico.** Nenhuma regra, ordem de efeito, condição de
   erro, SQL, mensagem ou código de erro muda. Extração é movimentação.
2. **R2 — contrato público intacto.** `PostgresRuntimeRepository` e os tipos já
   exportados mantêm a superfície. Nenhum export novo entra no `index.ts` do
   pacote; exports internos necessários à extração são permitidos e listados.
3. **R3 — estado explícito.** Métodos extraídos recebem contexto construído
   por getter privado dentro da classe, sem mudar visibilidade de membro
   algum. Callbacks arrow locais ao getter podem vincular `this` para chamar
   métodos existentes; referências de método sem bind e captura global de
   uma instância do repositório são proibidas.
4. **R4 — uma fatia por gate.** Cada fatia é um commit próprio com `typecheck`,
   `lint`, `format:check`, `npm test`, `test:postgres` e cobertura verdes.
5. **R5 — evidência de não-regressão.** Mesma contagem de testes verdes ou
   maior; cobertura sem queda; nenhum drift de baseline não explicado.
6. **R6 — rollback.** Um único `git revert` por fatia.

## Fatia 2 executada — outbox durável

Movidas 816 linhas para `packages/persistence/src/postgres-outbox.ts`
(900 linhas): métodos `enqueue`, `claimNext`, `ack`, `fail`,
`requeueDeadLetter` e 17 helpers (`assertOutbox*`,
`sanitizeAndValidateOutboxValue`, `serializeOutboxJson`, `redactOutboxError`,
`createInboundIdempotencyKey`, `resolveTakeoverCheck`, `outboxDate`,
`mapDurableOutboxRow`, `withOutboxTransaction`, `validateOutbox*`,
`outboxBackoffMs`, `appendDurableOutboxAudit`).

`postgres.ts` caiu de 3 354 para **2 572 linhas**. Passaram a ser exportados,
para uso interno entre os dois módulos: `DurableOutboxRow`,
`outboxSelectColumns`, `OUTBOX_MAX_PAYLOAD_BYTES`, `SAFE_LEGACY_OUTBOX_ERRORS`
e os helpers `assertOutboxText`, `mapDurableOutboxRow`,
`createInboundIdempotencyKey`, `resolveTakeoverCheck`,
`appendDurableOutboxAudit`. Nenhum deles entra no `index.ts`.

Extração mecânica por script com verificação embutida: cada bloco movido é
reconstruído a partir do resultado e comparado byte a byte ao original,
admitindo apenas `this.` → `ctx.` e o recuo de dois espaços.

Verificação: `typecheck`, `lint`, `format:check` exit 0; suíte completa
324 arquivos / 2 295 testes `PASS`; `test:postgres` 35 arquivos / 258 testes
`PASS`; cobertura 92,63 / 87,73 / 94,99 / 93,61, idêntica à anterior.

## Fatias seguintes

- Fatia 3 já foi entregue em `f9f84c9`: o módulo interno
  `postgres-audit.ts` tem 612 linhas. A revisão do checkout `79f28cc`
  encontrou `postgres.ts` com 2.106 linhas, SHA-256
  `00ad0ef4fea39c369ff48695285c8cf2d6ff5161ad977726f12beb340eac0153`.
- Fatia 4 proposta abaixo: extrair inbound e sessão para deixar
  `postgres.ts` **abaixo de 1.500 linhas**, sem alterar a API pública.

## Fatia 4 — decisão e gate antes do código

- **CURRENT:** `PostgresRuntimeRepository` concentra `findByExternalMessage`,
  `createWithSession`, `bindSessionAgentVersion`, `appendOutboundMessage`,
  `markInboundRuntimeCompleted`, `findInboundRuntimeContext` e
  `completeInboundRuntime`. Esses métodos ocupam aproximadamente 760 linhas
  e usam o mesmo `PostgresQueryable` que as transações existentes. As
  helpers locais `assertInboundRuntimeCorrelation` e `mergeOutboxPayload`
  pertencem à mesma fatia. Auditoria/outbox já têm módulos internos; o
  pacote exporta a classe por `postgres.ts`/`index.ts`.
- **Invariante:** parâmetros e texto SQL, ordem de queries/auditoria, chave
  de idempotência, filtro de tenant, `BEGIN`/`COMMIT`/`ROLLBACK`, commits
  antecipados e mesma conexão para outbox+inbound ficam idênticos. Falha
  antes de `BEGIN` continua sem mutação; falha dentro da transação continua
  a fazer rollback. `completeInboundRuntime` chama
  `transitionTakeoverInTransaction`, nunca `transitionTakeover` (que abre
  outra transação). Nenhuma mudança de schema, timeout, retry ou privilégio.
- **Alternativas:** manter a classe monolítica não cumpre o alvo de tamanho;
  criar outro serviço/Pool alteraria a fronteira transacional; extrair só
  helpers deixaria a classe acima do limite. Seleção mínima: módulo interno
  `postgres-inbound.ts` com funções que recebem um `PostgresInboundContext`
  explícito, construído por getter privado da classe. O contexto fornece o
  mesmo `client`, `tenantIsolation` e callbacks para métodos já existentes;
  não cria conexão nem captura `this` em escopo global. A classe mantém as
  assinaturas públicas, delegando. `createWithSessionAndOutbox` e os dois
  métodos de transição de takeover permanecem nela.
- **Limite de dependência:** o novo módulo não entra em `index.ts`; exports
  auxiliares são internos. Não mudar SQL nem normalização de erro para
  acomodar a extração. Contexto/callbacks não podem iniciar uma transação
  concorrente nem trocar o client recebido. `postgres-audit.ts` e
  `postgres-outbox.ts` permanecem funcionais e com seus contratos atuais.
- **Prova estrutural:** comparar blocos de SQL e statements de transação
  antes/depois por diff ou reconstrução byte a byte; qualquer diferença
  semântica exige SPEC própria. `postgres.ts` e o novo módulo abaixo de
  1.500 linhas após Prettier, sem export público novo.
- **Prova comportamental:** Node 22, tipos/lint/formato, focados em
  `outbox-durability`, `postgres-migration-smoke`,
  `session-version-pinning-postgres`, `runtime-trace-correlation` e
  `postgres-persistence-mode`; depois `npm test` com PostgreSQL,
  `test:postgres`, cobertura e E2E no worktree isolado. Os testes devem
  observar rollback inbound+outbox, replay/idempotência, tenant, handoff e
  rejeição de correlation ID malformado antes de `BEGIN`, além de rollback de
  auditoria quando a conclusão falha. Zero skip no ambiente PG.
- **Rollback:** um único revert do commit da fatia; nenhum dado ou migration
  nova. Certificação final e CI remoto só após integrar com PR-L04 e OIDC.

## Autorização e gates

- Task registrada: RA25-07 em `docs/03_build/0351_audit0573_backlog.md`.
- BUILD executado sob a instrução do usuário (“vamos para próxima etapa”,
  2026-09-25) e sob o mesmo padrão aprovado para a fatia 1.
- A instrução vigente do usuário para corrigir e validar o programa autoriza
  este BUILD **local T2**, com task PR-203 registrada em 0356 e claim
  próprio; a transição está registrada em `0190_spec_validation.md`.
  Nenhuma autorização T3/T4, push, dado real ou release decorre desta fatia.
- Crítica independente antes do código: `ACCEPT_LOCAL_DESIGN` após conferir
  os sete métodos, o limite de tamanho e as fronteiras de transação; os
  riscos de bind do contexto, cliente único, correlation ID e rollback de
  auditoria foram incorporados acima. Nenhum teste foi executado pelo
  crítico e o aceite de desenho não substitui os gates do BUILD.
