# Adendo PROD-04 — `ApprovalAuthority` durável (arquitetura A2)

- Task: `PROD-04` — "ApprovalStore durável do runtime canônico". Decisão que autoriza: `D01 = C`, registrada em [prod20260913_decision_packet.md](prod20260913_decision_packet.md).
- Insumo congelado: [aaa_composition_contract.md](aaa_composition_contract.md) v2 §6 (SPEC de PROD-04) e §2 N3.
- Status: BUILD documentado neste adendo. A **aceitação** da §6 permanece integralmente em vigor; apenas o **mecanismo** proposto na §6 é substituído por este adendo (arquitetura A2), conforme autorizado pelo prompt da task ("approved variant A2").
- Fixtures sintéticas apenas; nenhum dado clínico/financeiro real, nenhum efeito real, D02–D05 seguem `PENDING`.

## 1. Decisão de arquitetura (A2)

A §6 congelou a rota A: converter `ApprovalEngine` e `ApprovalStore` para assíncronos (`Promise`), preservando a máquina de estados, com uma porta `DurableApprovalStorePort` de persistência pura. O BUILD adota a variante **A2**, autorizada pela task:

- O tipo voltado ao runtime passa a ser **`ApprovalAuthority`** (`packages/approval-engine/src/authority.ts`), com métodos maybe-async (`T | Promise<T>`). `ApprovalEngine` o satisfaz **estruturalmente** (um retorno síncrono é um retorno maybe-async válido): nenhuma assinatura do engine muda, nenhum teste do pacote é reescrito (a suíte do `approval-engine` — 105 testes, incluindo os do engine — permanece intacta e verde) e a única autoridade de decisão continua sendo o engine.
- A implementação durável **`PostgresApprovalAuthority`** (`packages/persistence/src/runtime-approval-store.ts`) embrulha o mesmo `ApprovalEngine` síncrono + `InMemoryApprovalStore` como máquina de estados scratch: carrega os registros afetados do PostgreSQL dentro de **uma** transação tenant-scoped (`withTenantTransaction`), semeia um store scratch com clones profundos, executa o método síncrono correspondente do engine e persiste os registros resultantes com o CAS descrito na §3. `SELECT ... FOR UPDATE` serializa escritores.
- Nenhuma regra de decisão é duplicada em SQL ou no adapter: transições, expiração, binding de payload/proposal, fencing de geração, evidência e reconciliação continuam exclusivamente no `ApprovalEngine`.

**Racional.** (i) preserva o engine síncrono e seus 427 testes — a conversão mecânica de toda a API assíncrona da §6 exigiria reescrever testes e aumentaria a superfície de regressão sem ganho de autoridade; (ii) mantém uma única máquina de estados (a alternativa "segundo motor assíncrono" foi descartada na própria §6); (iii) a concorrência fica onde o PostgreSQL é autoridade — CAS por revisão/estado/reserva/geração — enquanto a decisão fica onde já era testada. A porta `DurableApprovalStorePort` da §6 **não é implementada**: sua função de persistência é absorvida pelas operações do adapter, que sempre passam pelo engine.

## 2. Mapeamento de colunas (`runtime_approvals`, migration `0015`)

PK `(tenant_id, approval_id)`; FKs não são criadas (o runtime não exige e `0012`–`0014` já modelam as autoridades de conversa/sessão).

| Campo de `ApprovalRecord`                                                                                                                                                             | Coluna                                                              | Tipo                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `approvalId` / `tenantId`                                                                                                                                                             | `approval_id` / `tenant_id`                                         | text                                                                    |
| `operatorId`, `agentId`, `agentVersion`                                                                                                                                               | `operator_id`, `agent_id`, `agent_version`                          | text                                                                    |
| `action`                                                                                                                                                                              | `action`                                                            | text                                                                    |
| `resource.type` / `resource.id`                                                                                                                                                       | `resource_type` / `resource_id`                                     | text / text null                                                        |
| `payloadHash`                                                                                                                                                                         | `payload_hash`                                                      | text                                                                    |
| `policyVersion`, `promptVersion`                                                                                                                                                      | `policy_version`, `prompt_version`                                  | text / text null                                                        |
| `correlationId`                                                                                                                                                                       | `correlation_id`                                                    | text                                                                    |
| `status` (11 estados)                                                                                                                                                                 | `status`                                                            | text `CHECK` nos 11 estados do engine                                   |
| `singleUse`                                                                                                                                                                           | `single_use`                                                        | boolean                                                                 |
| `requestedAt`, `expiresAt`, `approvedAt`, `executedAt`, `rejectedAt`, `cancelledAt`, `expiredAt`, `reservedAt`, `executingAt`, `releasedAt`, `failedAt`, `uncertainAt`, `confirmedAt` | colunas homônimas snake_case                                        | timestamptz                                                             |
| `approverId`, `decisionReason`                                                                                                                                                        | `approver_id`, `decision_reason`                                    | text null                                                               |
| `executionCount`, `executionRef`                                                                                                                                                      | `execution_count`, `execution_ref`                                  | integer / text null                                                     |
| `reservationId`, `reservationOwner`, `reservationExpiresAt`                                                                                                                           | `reservation_id`, `reservation_owner`, `reservation_expires_at`     | text/text/timestamptz null                                              |
| `reservationGeneration`                                                                                                                                                               | `reservation_generation`                                            | bigint `DEFAULT 0` (0 = nunca reservado; mapeado de volta para ausente) |
| `usedReservationIds`                                                                                                                                                                  | `used_reservation_ids`                                              | jsonb `DEFAULT '[]'` (`CHECK` array)                                    |
| `confirmationEvidenceRef`                                                                                                                                                             | `confirmation_evidence_ref`                                         | text null                                                               |
| `proposalId`, `proposalHash`, `capability`, `dataClassification`                                                                                                                      | `proposal_id`, `proposal_hash`, `capability`, `data_classification` | text null                                                               |
| `proposalPayload`                                                                                                                                                                     | `proposal_payload`                                                  | jsonb null                                                              |
| `operationKey`                                                                                                                                                                        | `operation_key`                                                     | text null                                                               |
| — (controle do adapter)                                                                                                                                                               | `revision`                                                          | bigint `DEFAULT 1 CHECK (> 0)`                                          |
| —                                                                                                                                                                                     | `created_at`, `updated_at`                                          | timestamptz `DEFAULT now()`                                             |

Índices: `(tenant_id, status, reservation_expires_at)` e `(tenant_id, operation_key)`. `executionRef`/resultado confirmado continuam no journal de efeito (`0013`); `resultDigest` não é duplicado na aprovação. `proposal_payload` é exigido para a revalidação de execução no restart (contract §6). Caso de borda documentado: `proposalPayload` JSON `null` colapsa para ausente no round-trip jsonb (o runtime nunca persiste esse valor).

## 3. Predicado de compare-and-set

Toda mutação usa `SELECT ... FOR UPDATE` para carregar o registro e persiste com:

```sql
UPDATE runtime_approvals
   SET <todos os campos mutáveis>, revision = revision + 1, updated_at = $n
 WHERE tenant_id = $1
   AND approval_id = $2
   AND revision = $<carregada>
   AND status = $<carregado>
   AND COALESCE(reservation_id, '') = $<reserva carregada>
   AND reservation_generation = $<geração carregada>
RETURNING revision
```

O CAS é defesa em profundidade: `FOR UPDATE` já serializa escritores, e o predicado garante que nenhum caminho futuro (retry, conexão concorrente, sweep) aplique uma transição sobre uma revisão/estado/reserva/geração obsoletos. `rowCount = 0` vira `DomainError('conflict')` e reverte a transação. O `UPDATE` é gerado a partir de uma única lista ordenada de colunas (`persistedColumns`), então mapeamento, INSERT e CAS não podem divergir. Quando o engine marca `EXPIRED` dentro de `#assertNotExpired` e lança `expired`, o adapter persiste a transição, **commita** e relança o erro natural do engine (o callback de `withTenantTransaction` retorna o erro em vez de lançá-lo), mantendo o registro durável igual ao estado in-memory.

## 4. Semântica do sweep (`releaseExpired`)

1. Dentro de uma transação do tenant: `SELECT ... FOR UPDATE` dos candidatos `status IN ('RESERVED','EXECUTING') AND reservation_expires_at IS NOT NULL AND reservation_expires_at <= now`, com o mesmo `now` que será entregue ao engine (`input.now ?? clock`).
2. Semeia o store scratch com esses candidatos e executa `ApprovalEngine.releaseExpired` com a **mesma assinatura** de entrada (incluindo `evidenceFor`, agora no mesmo `now`).
3. Persiste cada registro alterado pelo engine com o CAS da §3 e devolve os contadores `{released, uncertain}` do próprio engine.
4. `no_effect` → `APPROVED` com reserva limpa e **geração retida** (`usedReservationIds` preservado); ausência/ambíguo/`effect_possibly_started` → `UNCERTAIN` com motivo. O sweep nunca executa efeito. `expireStale` **não** é usado pelo sweep.

## 5. Limitação de `expireStale`

A assinatura real é `expireStale(now?: Date): number`, e internamente usa `store.listExpiringBefore(nowIso, statuses)` **sem filtro de tenant** — é um sweep global. O runtime durável tem uma conexão por tenant (`cvg.tenant_id` + RLS forçada), então o adapter **rejeita** a operação com `DomainError('invalid_action')` e mensagem explícita, em vez de fingir suportá-la. A produção não chama `expireStale`; o caminho canônico é `releaseExpired({ tenantId, ... })` por tenant (usado pelo `sweepExpiredApprovals` do runtime/worker). A §6 do contrato não exige `expireStale` no aceite.

## 6. Isolamento e RLS

`runtime_approvals` tem `ENABLE/FORCE ROW LEVEL SECURITY`, uma única policy permissiva `USING/WITH CHECK (tenant_id = NULLIF(current_setting('cvg.tenant_id', true), ''))` e `REVOKE ALL FROM PUBLIC`, seguindo `0012`–`0014`. Toda leitura usa `withTenantContext` e toda mutação `withTenantTransaction`, que seta/limpa o contexto por conexão e destrói a conexão se a limpeza falhar. O teste de aceite (g) prova com um papel real `NOSUPERUSER NOBYPASSRLS` que: (i) com o contexto do próprio tenant vê 1 linha; (ii) com o mesmo contexto não vê a linha do outro tenant (filtro explícito por `tenant_id`); (iii) sem contexto não vê nenhuma linha.

## 7. Débito de dependência declarada

`packages/persistence/src/runtime-approval-store.ts` importa `@cvg/approval-engine`, que não está declarado em `packages/persistence/package.json`. Isso **segue o precedente de workspace já existente**: `effect-journal-postgres.ts` importa `@cvg/agent-runtime` e `channel-effect-journal-postgres.ts` importa `@cvg/channel-gateway`, nenhum declarado. A resolução funciona por hoisting/path mappings do workspace. Declarar a dependência (e regenerar o lockfile) está fora do file plan desta task (o lockfile é recurso compartilhado) e fica registrado como débito P2 para a composição (`AAA-21`) ou janela de lockfile exclusiva.

## 8. Mapeamento de aceite

| Critério (§6/aceite da task)                                                                                           | Evidência                                                                                                                       |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| (a) 0015 aditiva sobre 0014, checksum guard, RLS forçada                                                               | `runtime-approval-store-postgres.test.ts` "ships the additive..." + "applies 0015 additively over 0014 with the checksum guard" |
| (b) restart mantém proposta/reserva (hash, geração, expiry)                                                            | "keeps proposal and reservation across an adapter restart" + `GREEN-restart-persistence.log`                                    |
| (c) duas conexões reservam: um vencedor, erro natural, uma geração                                                     | "serializes a two-connection reserve to exactly one winner" + `GREEN-cas-two-connection.log`                                    |
| (d) fencing entre gerações + predicado CAS no SQL                                                                      | "fences generations and ships the SQL compare-and-set predicate" (`RecordingPool`)                                              |
| (e) crash antes do efeito: `no_effect` → APPROVED, reserva limpa, geração retida                                       | "releases an expired RESERVED approval with no_effect evidence"                                                                 |
| (f) crash após efeito: ausente/`effect_possibly_started` → UNCERTAIN; 2º sweep não muda; `effect_confirmed` → EXECUTED | "keeps an EXECUTING approval UNCERTAIN until explicit reconciliation"                                                           |
| (g) RLS com papel não-BYPASSRLS                                                                                        | "isolates rows for a non-BYPASSRLS runtime role"                                                                                |
| (h) `getByOperationKey` com candidatos duplicados; `listPending` correto                                               | "returns operation-key candidates and filters pending approvals"                                                                |
| Probes negativos primeiro (RED) e positivos (GREEN)                                                                    | `probes/probe-cas-red.ts`, `probes/probe-restart-red.ts`, `probes/*-green.ts` e os quatro `.log`                                |

## 9. Limites declarados

- Restart provado na fronteira adapter+pool (drop do adapter, nova instância no mesmo processo). O "reinício de processo" da verificação 3 da §6 permanece alvo de `AAA-21` (processoHTTP→SQL→worker→kernel), não deste BUILD.
- Nenhum dado real, efeito real, canal/provider/IdP ou produção; D02–D05 pendentes; `proposal_payload` só carrega fixtures sintéticas rotuladas (`data_classification = 'synthetic'`).
- `expireStale` rejeitado no adapter durável (§5); `listPending` define pendente como `REQUESTED`+`PENDING`; `operationKey` não é único (candidatos explícitos).
- Débito de dependência declarada (§7).
- O adendo documenta BUILD; não constitui verificação. A revisão cabe a crítico fresco independente.
