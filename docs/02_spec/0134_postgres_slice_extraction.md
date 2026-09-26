# 0134 — SPEC: extração de fatias de `postgres.ts`

- ID: `SPEC-STRUCT-002`
- Estado: `SPEC_DRAFT_FOR_REVIEW / SLICE_2_COMPLETED`
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
3. **R3 — estado explícito.** Métodos extraídos recebem `PostgresOutboxContext`
   construído por getter privado dentro da classe, sem mudar visibilidade de
   membro algum e sem capturar `this` por closure.
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

- Fatia 3: auditoria e checkpoint (526 linhas).
- Fatia 4: inbound runtime (361) e sessão/task (~546) — deve trazer
  `postgres.ts` para ~1 400 linhas, cumprindo o alvo.

## Autorização e gates

- Task registrada: RA25-07 em `docs/03_build/0351_audit0573_backlog.md`.
- BUILD executado sob a instrução do usuário (“vamos para próxima etapa”,
  2026-09-25) e sob o mesmo padrão aprovado para a fatia 1.
- Revisão independente / humana desta SPEC: `NOT_RUN`. Produção `NO_GO`.
