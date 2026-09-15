# aaa_execution_contract — Proposta imutável, execução durável e limites

- Task: `AAA-03`. Programa: `AAA-20260912`. Fonte canônica: [aaa_program_backlog.json](../03_build/tracking/aaa_program_backlog.json) (entrada `AAA-03`).
- Revisão: `2` (2026-09-12) — reconciliação com `aaa_data_api_contract.md` (AAA-05, sha256 `200c2bc3…`) e incorporação das condições `AAA03-R3-F01/F02/F03` do parecer `AAA-03-REVIEW-AGENT-3`. A revisão `1` era `db75899f…`; este texto exige novo parecer antes do congelamento.
- Status do contrato: `PROPOSED_NOT_FROZEN` / `DRAFT_FOR_INDEPENDENT_REVIEW`. Nenhum código de produto pode começar antes do congelamento por revisão independente e dos gates `G_SPEC`/`G_QUALITY`.
- Achados cobertos: `AUD-20260912-F01`, `F02`, `F03`, `F05`, `F15` (e a interface de `F04` consumida por AAA-12).
- Escopo: kernel local controlado `packages/agent-runtime`, `packages/approval-engine`, `packages/policy-engine`, `packages/policy` com ferramentas, modelo, canal e persistência falsos/sintéticos. Sem provider, canal, IdP, rede externa, dado real, deploy ou produção.
- Autoridade: a solicitação atual autoriza correções locais controladas; não aprova `D01`/RF-011, ação real, homologação externa, custo real ou produção. `AAA-04` congela a barra de qualidade antes de BUILD.
- Referências normativas: ADR 0003 (approval binding), ADR 0005 (replay/idempotência distribuída), [0108](0108_contratos_de_eventos_e_assincronismo.md), [0110](0110_consistencia_integridade_e_migracoes.md), [0111](0111_permissoes_governanca_e_auditoria.md), SPEC 0113, PRD 0013.

Este documento define o WHAT verificável das correções. O HOW específico de cada task permanece em `AAA-07`–`AAA-11`; qualquer desvio deste contrato invalida a evidência e exige nova revisão.

## 1. Invariantes normativos

| ID  | Invariante                                                                                                                           | Falha que corrige                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------- |
| F01 | A ferramenta executa exatamente a proposta aprovada. Saída posterior do modelo não substitui a proposta autorizada.                  | Execução de payload diferente       |
| F02 | Falha antes do efeito nunca marca aprovação como `EXECUTED`/confirmada. Recuperação não permite consumo ou efeito duplicado.         | Falso sucesso e retry perdido       |
| F03 | Repetir a operação com a mesma chave não repete o efeito. Crash após efeito e antes do ack gera recuperação/reconciliação explícita. | Efeito duplicado em retry           |
| F05 | Nenhuma etapa além do orçamento começa. Deadline, custo, cancelamento e respostas tardias têm comportamento definido e testável.     | Limite que não interrompe trabalho  |
| F15 | Draft não equivale a confirmação ou alteração real. Ações reais permanecem bloqueadas no escopo controlado.                          | Autoridade silenciosamente ampliada |

Regras gerais:

1. Falhar fechado: contexto, decisão, journal, aprovação ou hash ausente/inválido impedem o efeito; nunca degradam para `ALLOW`.
2. Nenhum efeito externo antes de intenção durável e autorização verificada.
3. `NOT_RUN`, `SKIPPED`, `UNKNOWN` e `BLOCKED` nunca satisfazem critério obrigatório.
4. Nenhuma promessa de exactly-once externo: a garantia é at-least-once no transporte com efeito efetivamente único quando o adapter suportar idempotência; caso contrário, resultado incerto + reconciliação explícita.

## 2. Identificadores e canonicalização

- Canonicalização: `canonicalizeJson` de `@cvg/shared` (RFC 8785 subset, orçamento de profundidade/nós, falha fechado).
- `proposalHash = SHA-256(canonicalizeJson({ schemaVersion: 'aaa-proposal-v1', tenantId, operatorId, agentId, agentVersion, agentProfile, capability, action, resource: { type, id? }, dataClassification, payload }))`.
- `operationKey` identifica a operação com efeito de forma estável entre retries: com `callerIdempotencyKey`, `operationKey = 'op:' + SHA-256(canonicalizeJson({ tenantId, callerIdempotencyKey }))`; sem ele, `operationKey = 'op:' + SHA-256(canonicalizeJson({ tenantId, capability, action, resource, proposalHash }))`.
- O registro do journal guarda o `proposalHash` junto da `operationKey`. Reservar a mesma `operationKey` com `proposalHash` diferente é conflito (`idempotency_key_reuse`) e não produz efeito.
- `reservationId` e `attemptId` são IDs de domínio (`createDomainId`) gerados uma única vez por tentativa; nunca reutilizados.
- `payloadHash` legado (ação + recurso + payload) permanece apenas para compatibilidade de leitura; a igualdade autoritativa passa a ser `proposalHash`.

### 2.1 Identidade canônica cruzada runtime × canal (AAA-03 × AAA-05)

O runtime identifica o efeito governado por `(tenantId, operationKey)`; o canal identifica a entrega por `(tenantId, channel, operationKind, idempotencyKey)`. A composição é normativa:

| Regra  | Conteúdo                                                                                                                                                                                                                                   |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R-ID-1 | Quando o emissor é o runtime governado, `idempotencyKey := operationKey`. O canal não deriva nova chave.                                                                                                                                   |
| R-ID-2 | `operationKind` do canal é `outbound_message`; para efeitos internos sem canal externo, `channel := 'internal'`. `tool_effect` e `journey_mutation` são reservados e não podem ser emitidos sem contrato próprio.                          |
| R-ID-3 | `payloadHash` do canal cobre o payload efetivamente enviado (projeção determinística de `proposal.payload`); `proposalHash` cobre a proposta aprovada. Hashes diferentes não significam operações diferentes; a identidade é a chave.      |
| R-ID-4 | Chave igual + hash de payload divergente = `idempotency_key_reuse` nos dois boundaries, sem efeito. Mesmo conteúdo com chave nova é operação nova e exige nova aprovação quando efetiva.                                                   |
| R-ID-5 | A notificação de outbox originada pelo runtime usa `idempotencyKey = operationKey` e namespace `<capability>.executed`; eventos de canal usam `channel.outbound.*`. Não há promessa de deduplicação entre namespaces distintos.            |
| R-ID-6 | Nenhum dos journals marca sucesso sem resultado persistido: `CONFIRMED` do canal e `CONFIRMED`/`EXECUTED` do runtime exigem registro próprio. O journal do canal é a fronteira de entrega; o do runtime é a fronteira do efeito governado. |

Estados mapeados (AAA-05 §3.1): `PENDING≈RESERVED`, `SENDING≈EFFECT_STARTED`, `CONFIRMED=CONFIRMED`, `FAILED=EFFECT_FAILED`, `UNCERTAIN=UNCERTAIN`, `EXPIRED≈ABANDONED`.

## 3. Proposta imutável (`ExecutionProposal`)

Gerada uma única vez no turno de solicitação, a partir da saída estruturada validada do modelo, e persistida na aprovação:

```ts
interface ExecutionProposal {
  proposalId: string // createDomainId('prop')
  schemaVersion: 'aaa-proposal-v1'
  proposalHash: string // definição da seção 2
  tenantId: string
  operatorId: string
  agentId: string
  agentVersion: string
  agentProfile: AgentProfileName
  capability: Capability
  action: string
  resource: { type: string; id?: string; tenantId?: string }
  dataClassification: DataClassification
  policyVersion: string
  promptVersion?: string
  payload: unknown // payload final congelado; cópia canônica profunda
  createdAt: string
  expiresAt: string
}
```

Regras:

- A proposta só é criada depois de policy `REQUIRE_APPROVAL` e de orçamento válido. Se `structuredOutput` for fornecido, validar a saída contra ele antes de criar a proposta; falha → `structured_output_invalid`, sem aprovação e sem efeito.
- `payload` é clonado canonicamente e congelado; mutações posteriores do objeto de origem não alteram a proposta (teste de imutabilidade obrigatório).
- O turno de execução usa **exclusivamente** `approval.proposal.payload`. O runtime não regenera o payload do efeito por modelo. Se o chamador fornecer `approvalPayload` divergente da proposta armazenada, o turno nega com `payload_mismatch` antes de qualquer ferramenta.
- `tenantId`, `action`, `resource`, `agentId`, `agentVersion`, `policyVersion` e `dataClassification` da proposta são revalidados contra o pedido de execução; divergência → `action_mismatch`/`tenant_mismatch`/`policy_changed`, sem efeito.
- Proposta expirada (`expiresAt`) não executa. Renovação exige nova solicitação e nova aprovação.

## 4. Máquina de estados da aprovação

Estados (`ApprovalStatus` estendido em `@cvg/approval-engine`):

`REQUESTED → PENDING → APPROVED → RESERVED → EXECUTING → EXECUTED` (sucesso confirmado)

Estados terminais/desvios: `REJECTED`, `EXPIRED`, `CANCELLED`, `FAILED`, `UNCERTAIN`.
`EXECUTED` passa a significar **efeito confirmado**, nunca reserva consumida.

Transições permitidas (toda troca é compare-and-set por tenant + approvalId + status esperado):

| De                     | Para        | Guarda                                                                                     | Evento                |
| ---------------------- | ----------- | ------------------------------------------------------------------------------------------ | --------------------- |
| `REQUESTED`            | `PENDING`   | solicitante autenticado; não expirada                                                      | `approval.pending`    |
| `PENDING`              | `APPROVED`  | aprovador não solicitante; não expirada                                                    | `approval.approved`   |
| `PENDING`              | `REJECTED`  | aprovador; não expirada                                                                    | `approval.rejected`   |
| `APPROVED`             | `RESERVED`  | proposta/hash/tenant/ação/recurso conferem; `reservationId` novo ou retomada do mesmo dono | `approval.reserved`   |
| `RESERVED`             | `EXECUTING` | `reservationId` do dono; deadline da reserva válido                                        | `approval.executing`  |
| `RESERVED`/`EXECUTING` | `APPROVED`  | release explícito e journal sem `EFFECT_STARTED`; limpa reserva                            | `approval.released`   |
| `RESERVED`/`EXECUTING` | `UNCERTAIN` | efeito pode ter ocorrido (crash, timeout, journal `EFFECT_STARTED`)                        | `approval.uncertain`  |
| `EXECUTING`/`RESERVED` | `EXECUTED`  | confirmação do efeito com `executionRef`; único caminho para sucesso                       | `approval.executed`   |
| `RESERVED`/`EXECUTING` | `FAILED`    | falha conhecida sem efeito e sem retry possível; terminal                                  | `approval.failed`     |
| `APPROVED`             | `EXPIRED`   | TTL vencido antes da reserva                                                               | `approval.expired`    |
| `UNCERTAIN`            | `EXECUTED`  | reconciliação humana/operacional com prova de efeito; não automático                       | `approval.reconciled` |
| `UNCERTAIN`            | `FAILED`    | reconciliação humana/operacional comprova ausência de efeito                               | `approval.reconciled` |

Regras:

- `singleUse` continua: após `EXECUTED`/`FAILED`/`UNCERTAIN` não há nova reserva.
- `verifyAndConsume` legado permanece somente para consumidores antigos; o runtime governado não o utiliza. Compatibilidade não pode reintroduzir consumo antes do efeito.
- Reserva órfã (processo morreu) expira por TTL; a recuperação só devolve para `APPROVED` com prova de ausência de efeito; na dúvida, `UNCERTAIN`.
- TTL de reserva é parâmetro explícito (`reservationTtlMs`, valor proposto 60s), validado por relógio injetável; `releaseExpired(now, ttlMs)` é chamado no início de cada turno e por varredura periódica do worker (condição `AAA03-R3-F03`), e nunca executa efeito. Reserva `RESERVED`/`EXECUTING` vencida sem `EFFECT_STARTED` volta a `APPROVED`; com `EFFECT_STARTED` vira `UNCERTAIN`. A prova PostgreSQL do TTL/lease pertence a AAA-16.
- Nenhum caminho novo pode usar `verifyAndConsume` (condição `AAA03-R3-F02`/`Q4`): o runtime governado migra para reserve/confirm e a regressão obrigatória prova que `packages/agent-runtime/src/runtime.ts` não usa o caminho legado.
- Todo evento emite `approvalId`, `tenantId`, `correlationId`, `reservationId?` e não inclui payload bruto.

## 5. Jornada do runtime

Ordem canônica de etapas: `policy.evaluate` (controle) → aprovação/reserva → `model.generate` (somente turno de solicitação) → `journal.reserve` → efeito (`tool`) → `journal.confirm` → `approval.confirm` → `outbox.enqueue`.

Orçamento (`maxSteps`/`maxModelCalls`/`maxToolCalls`/`maxDurationMs`/`maxCostUsd`) é checado **antes** de iniciar cada etapa orçada.

### 5.1 Turno de solicitação (sem `approvalId`)

1. Validar envelope e policy. `DENY` encerra; `ALLOW` executa sem aprovação apenas para capabilities sem efeito real; `REQUIRE_APPROVAL` segue.
2. Checar deadline/orçamento.
3. `model.generate`; erro → `denied` com código do gateway; nenhum estado de aprovação.
4. Validar saída estruturada, construir a proposta imutável e exigi-la como payload do pedido.
5. `approvals.request(proposal)`; retornar `approval_required` + `approvalId`. Nenhuma ferramenta e nenhum efeito.

### 5.2 Turno de execução (com `approvalId`)

1. Revalidar policy; se a decisão/`policyVersion` mudou ou deixou de ser `REQUIRE_APPROVAL` → `policy_changed`, sem efeito.
2. `approval.reserve` (CAS) com tenant/ação/recurso/`proposalHash`; falha → nega com o código do `ApprovalError`.
3. `journal.reserve(operationKey)` (intenção durável). Estado existente:
   - `CONFIRMED` → responder replay idempotente com o resultado persistido, sem tocar a ferramenta;
   - `IN_PROGRESS` de outra tentativa → `operation_in_progress`, sem efeito;
   - `UNCERTAIN` → `operation_uncertain`, exigindo reconciliação, sem efeito.
4. `approval.markExecuting`; `journal.markEffectStarted(operationKey, attemptId)`.
5. Checar deadline/cancelamento imediatamente antes da ferramenta; então executar `toolExecutor` com `payload = proposal.payload` e `operationKey`.
   - Erro comprovadamente anterior ao efeito → `journal.failEffect` + `approval.release` (retorna a `APPROVED`) ou `FAILED` conforme retry; nunca `EXECUTED`.
   - Timeout/erro ambíguo → `journal.markUncertain` + `approval.markUncertain`; sem retry automático.
6. Sucesso → `journal.confirmEffect(executionRef)` e `approval.confirm` → `EXECUTED`.
7. `outbox.enqueue` com a mesma `operationKey` como notificação/ack. Falha da outbox após efeito confirmado não desfaz o efeito nem rebaixa a aprovação: retorna `outbox_pending` e a outbox é reexecutada sem repetir a ferramenta.

## 6. Matriz de crash/falha/retry

Efeito contado no máximo uma vez por `operationKey`. `E` = chamada à ferramenta.

| Fronteira de falha                             | Estado da aprovação           | Estado do journal            | Efeito | Ação de recuperação                                           | Invariante  |
| ---------------------------------------------- | ----------------------------- | ---------------------------- | ------ | ------------------------------------------------------------- | ----------- |
| Antes da reserva da aprovação                  | `APPROVED`                    | ausente                      | 0      | retry cria nova reserva                                       | F02         |
| Após reserva, antes de `markEffectStarted`     | `RESERVED`/`EXECUTING`        | `RESERVED`                   | 0      | TTL expira → release para `APPROVED`                          | F02         |
| Após `markEffectStarted`, antes/durante E      | `EXECUTING`/`RESERVED`        | `EFFECT_STARTED`             | 0..1   | recuperação marca `UNCERTAIN`; reconciliação explícita        | F02/F03     |
| E ok, antes de `confirmEffect`                 | `EXECUTING`                   | `EFFECT_STARTED`             | 1      | recuperação confirma apenas com `executionRef` comprovado     | F03         |
| E falhou comprovadamente sem efeito            | `EXECUTING`                   | `EFFECT_FAILED`              | 0      | release/`FAILED`; retry permitido                             | F02/F03     |
| Efeito confirmado, antes de `approval.confirm` | `EXECUTING`                   | `CONFIRMED`                  | 1      | recuperação conclui `approval.confirm` (não repete E)         | F02/F03     |
| Aprovação `EXECUTED`, antes da outbox          | `EXECUTED`                    | `CONFIRMED`                  | 1      | recuperação enfileira outbox com a mesma `operationKey`       | F03         |
| Outbox falhou após efeito                      | `EXECUTED` + `outbox_pending` | `CONFIRMED`                  | 1      | retry da outbox deduplicado; nenhuma nova E                   | F03         |
| Duas tentativas concorrentes                   | uma `RESERVED`/`EXECUTING`    | uma `IN_PROGRESS`            | ≤1     | perdedora nega com `already_reserved`/`operation_in_progress` | F02/F03/F04 |
| Restart após efeito e antes do ack             | `UNCERTAIN`                   | `EFFECT_STARTED`/`CONFIRMED` | 1      | reconciliação explícita; nunca auto-reexecuta                 | F03         |

Testes obrigatórios: injetar falha em cada fronteira acima, reiniciar o harness (novas instâncias de runtime/aprovação/journal sobre o mesmo estado durável) e provar efeito ≤1 e estado honesto. Banco descartável (AAA-16) é obrigatório para a variante PostgreSQL; a variante em memória cobre a lógica.

## 7. Intenção durável e journal de efeito

Porta `EffectJournalPort` (nome final no BUILD de AAA-10), implementável em memória nos testes e em PostgreSQL (`packages/persistence`, owner Agent 2):

```ts
type EffectState =
  | 'RESERVED'
  | 'EFFECT_STARTED'
  | 'CONFIRMED'
  | 'EFFECT_FAILED'
  | 'UNCERTAIN'
  | 'ABANDONED'

interface EffectJournalPort {
  reserve(input: {
    tenantId: string
    operationKey: string
    proposalHash: string
    attemptId: string
    expiresAt: string
  }): Promise<
    | { outcome: 'reserved' }
    | { outcome: 'replay'; record: EffectRecord }
    | { outcome: 'in_progress' }
    | { outcome: 'uncertain'; record: EffectRecord }
  >
  markEffectStarted(ref: {
    tenantId: string
    operationKey: string
    attemptId: string
  }): Promise<EffectRecord>
  confirmEffect(ref: {
    tenantId: string
    operationKey: string
    attemptId: string
    executionRef: string
    resultDigest: string
  }): Promise<EffectRecord>
  failEffect(ref: {
    tenantId: string
    operationKey: string
    attemptId: string
    errorCode: string
  }): Promise<EffectRecord>
  markUncertain(ref: {
    tenantId: string
    operationKey: string
    attemptId: string
    reason: string
  }): Promise<EffectRecord>
  get(tenantId: string, operationKey: string): Promise<EffectRecord | undefined>
  releaseExpired(now: Date, ttlMs: number): Promise<number>
  reconcile(ref: {
    tenantId: string
    operationKey: string
    actorId: string
    outcome: 'effect_confirmed' | 'no_effect'
    evidenceRef: string
  }): Promise<EffectRecord>
}
```

Regras:

- `reserve` é atômico (insert-if-absent com constraint única `(tenant_id, operation_key)`); duas conexões concorrentes não criam duas intenções. Reservar a mesma `operationKey` com `proposalHash` diferente falha com `idempotency_key_reuse` antes de qualquer efeito.
- `resultDigest` guarda o digest canônico do resultado para replay sem reexecução; payloads sensíveis não são duplicados no journal.
- `reconcile` é explícito, auditado, restrito a perfil autorizado e nunca automático.
- Sem `effectJournal` configurado, capability com efeito real falha fechado (`durability_required`) antes da ferramenta.
- A outbox durável existente (`packages/persistence/src/outbox.ts`) continua sendo o mecanismo de entrega; o journal de efeito não substitui leases/retry/dead-letter e vice-versa.
- Arquivos `outbox.ts` e `postgres.ts` pertencem à reserva de AAA-10 e exigem handoff registrado com Agent 2 antes de qualquer escrita.

## 8. Idempotência e outbox

- Chave de efeito é `operationKey`; a outbox usa a mesma chave para deduplicar a notificação.
- Retry do turno com a mesma aprovação/chave nunca reexecuta a ferramenta: journal `CONFIRMED` responde replay com o resultado persistido.
- Reuso de chave com proposta diferente é rejeitado (`idempotency_key_reuse`) e registrado em auditoria.
- A ordem `journal.reserve → E → journal.confirm → approval.confirm → outbox.enqueue` é normativa; nenhuma variação que coloque E antes da intenção durável é aceita.
- `outbox_failed` após `CONFIRMED` não pode produzir `denied` que sugira ausência de efeito: resultado é `executed` com `outbox_pending=true` e o evento é retomado.
- Concorrência do canal (`F04`) é resolvida pela fronteira `channel-gateway`/AAA-12, que deve consumir `operationKey`/idempotência durável; o runtime não promete unicidade de envio sem essa reserva.

### 8.1 Exemplos normativos (retry, colisão e mudança de payload)

| ID  | Cenário                                          | Chave                         | Estado existente             | Resultado exigido                                                               |
| --- | ------------------------------------------------ | ----------------------------- | ---------------------------- | ------------------------------------------------------------------------------- |
| E-1 | retry após falha pré-efeito                      | mesma `operationKey`          | `EFFECT_FAILED`/release      | nova tentativa permitida; efeito ≤1                                             |
| E-2 | retry após crash com efeito possível             | mesma `operationKey`          | `EFFECT_STARTED`/`CONFIRMED` | replay (se confirmado) ou `UNCERTAIN`; nunca novo efeito                        |
| E-3 | mesma chave, payload diferente                   | mesma `operationKey`          | qualquer                     | `idempotency_key_reuse`; nenhum efeito, nos dois boundaries                     |
| E-4 | conteúdo idêntico com chave nova                 | nova `operationKey`           | ausente                      | operação nova; exige nova aprovação quando efetiva                              |
| E-5 | runtime emite mensagem de canal                  | `idempotencyKey=operationKey` | canal `PENDING`              | canal reserva em `(tenant, channel, outbound_message, key)` e envia no máximo 1 |
| E-6 | runtime interno sem canal (`channel='internal'`) | `operationKey`                | ausente                      | sem evento `channel.outbound.*`; apenas notificação `<capability>.executed`     |
| E-7 | notificação outbox reexecutada                   | `operationKey`                | outbox dedupe                | nenhum novo efeito de ferramenta; apenas reentrega da notificação               |

## 9. Limites, deadline, custo, cancelamento e respostas tardias

- Etapas orçadas: `model.generate`, `tool.execute`, `outbox.enqueue`. `policy.evaluate`, verificação de aprovação e journal são controles obrigatórios, não consomem `maxSteps`.
- Semântica por turno (condição `Q1`): contadores de etapas/chamadas e custo reiniciam a cada `runTurn`; `limits` valem somente para o turno que os recebeu e não são herdados por retry ou turno seguinte; cada turno recomputa `startedAt`/`deadlineAt`. O TTL da aprovação/reserva é independente do orçamento do turno.
- Antes de cada etapa orçada: se a contagem de etapas já atingiu `maxSteps`, negar com `steps_budget_exceeded` e não iniciar a etapa. `maxSteps=1` permite no máximo uma etapa orçada (o modelo), nunca ferramenta ou outbox.
- `maxModelCalls`/`maxToolCalls`: verificar antes da chamada N (1-based); `N > limite` → negar sem iniciar a chamada. Zero significa nenhuma chamada.
- `deadlineAt = startedAt + maxDurationMs`; verificar antes de cada etapa e imediatamente após cada `await`; `loop_deadline_exceeded` encerra com estado honesto e spans fechados.
- `costUsd` acumulado é checado após o modelo e antes de ferramenta/outbox; `loop_cost_exceeded` não produz efeito.
- Cancelamento cooperativo: `GovernedTurnInput.cancelSignal?: AbortSignal` é propagado ao gateway e à ferramenta; checkpoints antes de cada etapa e pós-`await` interrompem com `turn_cancelled`. Dependência que ignora o sinal não autoriza efeito subsequente: o runtime descarta o resultado tardio e não segue.
- Resposta tardia após deadline/cancelamento: descartada, sem alimentar proposta, ferramenta ou outbox; span fecha como erro.
- Todo span aberto fecha em sucesso, erro, timeout e cancelamento (teste de ausência de span pendente).
- Relógio injetável permanece obrigatório para testes determinísticos (`clock`).

## 10. Capabilities e separação draft/real (F15)

| Capability               | Risco             | Papel no escopo controlado                              | Grant `secretary`                         |
| ------------------------ | ----------------- | ------------------------------------------------------- | ----------------------------------------- |
| `schedule.read`          | READ_ONLY         | leitura                                                 | allow                                     |
| `appointment.create`     | MEDIUM_RISK_WRITE | criação/draft; confirmação é capability separada        | allow (`appointment`/`appointment_draft`) |
| `appointment.modify`     | MEDIUM_RISK_WRITE | **somente draft** (`resource.type = appointment_draft`) | allow (recurso draft)                     |
| `appointment.confirm`    | HIGH_RISK_WRITE   | confirmação real de consulta                            | **sem grant → DENY**                      |
| `appointment.reschedule` | HIGH_RISK_WRITE   | remarcação real                                         | **sem grant → DENY**                      |
| `appointment.cancel`     | HIGH_RISK_WRITE   | cancelamento real                                       | require_approval (inalterado)             |
| demais capabilities      | inalterado        | inalterado                                              | inalterado                                |

Regras:

- O motor de policy valida compatibilidade capability × `resource.type`: update de draft exige `appointment_draft`; criação aceita `appointment`/`appointment_draft` (a confirmação real é `appointment.confirm`, negada); real exige `appointment`; tipo ausente ou desconhecido → `DENY` (`resource_type_not_allowed`/`resource_type_required`). A checagem ocorre depois do tenant e antes de grants/documentos, para não ser ampliada por policy de tenant.
- `appointment.confirm` e `appointment.reschedule` não possuem grant em nenhum perfil no escopo atual; a reprodução F15 (`appointment.modify` sobre recurso `appointment` real) deve resultar `DENY` sem ferramenta.
- Habilitar confirmação/remarcação real exige contrato novo, `D02` decidida, approval/handoff e composição autorizada (fora desta entrega). Nenhuma capability genérica pode ampliar autoridade por omissão.
- `appointment.cancel` mantém `require_approval` e continua executável apenas contra adapter controlado/falso; conectar adapter real exige AAA-21 e autorização específica. Ponto aberto `Q2` para o revisor.
- Negação de adapter real (condição `Q2`): o executor de ferramenta declara `effectScope: 'controlled_fake' | 'real_authorized'`; o runtime nega `real_authorized` sem registro explícito de autorização (AAA-21 + decisão humana) e nega qualquer handler para capability de efeito real sem declaração. No escopo atual `appointment.cancel`/`confirm`/`reschedule` operam somente com `controlled_fake`; tentativa real retorna `real_effect_not_authorized` sem chamada. Regressão obrigatória em AAA-08/AAA-09.
- Ações clínicas, financeiras, prontuário e consulta real permanecem proibidas e sem grant no escopo atual.

## 11. Portas de interface e ownership

- `packages/approval-engine/` (AAA-07): novos estados, reserva/CAS, confirmação/reconciliação, `ApprovalError` novo (`already_reserved`, `reservation_expired`, `reservation_mismatch`, `uncertain`).
- `packages/agent-runtime/` (AAA-09→AAA-10→AAA-11, dono único sequencial): proposta imutável, binding, journal/reserva, limites/cancelamento. `runtime.ts` não pode ter dois escritores.
- `packages/policy-engine/` e `packages/policy/` (AAA-08): catálogo/matriz draft-real e fail-closed de recurso.
- `packages/persistence/src/outbox.ts` e `postgres.ts` (AAA-10 + Agent 2): reserva exclusiva e handoff; migrações pertencem à sequência de Agent 2.
- `packages/model-gateway/` (AAA-11): `AbortSignal` e deadline; sem provider real.
- `packages/channel-gateway/` (AAA-12, Agent 2): idempotência durável do envio; contrato consumido daqui.
- Evidência por task: `docs/04_audit/evidence/AAA/AAA-XX/`.

## 12. Matriz de testes de aceitação

| ID   | Cenário negativo (falha antes do fix)                                           | Asserção esperada                                                                             | Owner     |
| ---- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | --------- |
| T-01 | Aprovação `{text: APPROVED_PAYLOAD}`; modelo devolve `UNAPPROVED_MODEL_PAYLOAD` | ferramenta recebe exatamente `APPROVED_PAYLOAD`; divergência nega antes da ferramenta         | AAA-09    |
| T-02 | Proposta mutada após aprovação / hash adulterado                                | `payload_mismatch`; ferramenta não chamada                                                    | AAA-09    |
| T-03 | Modelo falha no turno de solicitação                                            | `denied`; nenhuma aprovação consumida; nenhum efeito                                          | AAA-07/09 |
| T-04 | Ferramenta falha antes do efeito                                                | aprovação não fica `EXECUTED`; release/`FAILED`; efeito 0                                     | AAA-07    |
| T-05 | Crash após intenção, antes do efeito                                            | TTL libera para `APPROVED`; efeito 0; sem sucesso inventado                                   | AAA-07/10 |
| T-06 | Crash após efeito, antes do ack                                                 | journal `UNCERTAIN`; nenhum retry automático; reconciliação explícita                         | AAA-10    |
| T-07 | Retry da reprodução F03 (outbox falha duas vezes, mesma chave)                  | ferramenta chamada 1 vez; segundo turno replay; resultado `executed`/`outbox_pending`         | AAA-10    |
| T-08 | Duas conexões concorrentes com a mesma `operationKey`                           | uma intenção; no máximo um efeito; perdedora nega                                             | AAA-10    |
| T-09 | `maxSteps=1`                                                                    | nenhuma ferramenta/outbox; `steps_budget_exceeded`; spans fechados                            | AAA-11    |
| T-10 | Deadline estourado por dependência lenta que ignora `AbortSignal`               | turno encerra honesto; nenhum efeito tardio; span fechado                                     | AAA-11    |
| T-11 | Cancelamento durante o turno                                                    | `turn_cancelled`; nenhum efeito posterior; spans fechados                                     | AAA-11    |
| T-12 | Reprodução F15: `appointment.modify` em recurso real                            | `DENY`; ferramenta não chamada                                                                | AAA-08    |
| T-13 | `appointment.confirm`/`reschedule`                                              | `DENY` sem grant; nenhuma ferramenta                                                          | AAA-08    |
| T-14 | Restart entre `confirmEffect` e `approval.confirm`                              | recuperação conclui confirmação sem repetir efeito                                            | AAA-10    |
| T-15 | Reuso de `idempotencyKey` com proposta diferente                                | `idempotency_key_reuse`; efeito 0                                                             | AAA-10    |
| T-16 | Runtime governado no caminho legado (`verifyAndConsume`)                        | `runtime.ts` não usa o caminho legado; reserve/confirm provados (estática + falha pré-efeito) | AAA-09    |
| T-17 | Retry/crash com a mesma identidade runtime↔canal                                | efeito ≤1; `idempotencyKey=operationKey` preservado em replay                                 | AAA-10/12 |
| T-18 | Reserva vencida sem `EFFECT_STARTED` / com `EFFECT_STARTED`                     | sweep devolve a `APPROVED` / marca `UNCERTAIN`; sweep nunca executa efeito                    | AAA-07/10 |
| T-19 | Adapter real para capability de efeito real                                     | `real_effect_not_authorized`; nenhuma chamada                                                 | AAA-08/09 |
| T-20 | Colisão de namespace de outbox                                                  | `channel.outbound.*` e `<capability>.executed` não deduplicam entre si; chave=operationKey    | AAA-10/12 |

As reproduções da auditoria (`docs/04_audit/evidence/AUD-20260912-001/reproduce.mjs`) devem ser convertidas em regressões negativas em cada task dona; `T-01`, T-03–T-13 dependem do harness com `effectJournal` falso e `clock` controlado.

## 13. Gates e congelamento

1. Este contrato é revisado por crítico fresco de outra frente (não implementador) contra F01–F05/F15 e os 20 testes acima.
2. `AAA-04` congela a barra de qualidade e o protocolo de evidência; `AAA-05` congela dados/APIs; `AAA-16` disponibiliza PostgreSQL descartável sem skips.
3. Hash do contrato congelado é registrado em `docs/04_audit/evidence/AAA/AAA-03/manifest.json`; qualquer alteração posterior invalida evidências e reabre dependentes (`AAA-07`–`AAA-11`). A revisão `2` tem hash novo: o parecer emitido para `db75899f…` cobre a revisão `1` e não se estende automaticamente a este texto.
4. `G_SPEC` por task exige este contrato congelado + revisão humana registrada + autorização de BUILD; a autorização local atual não substitui esse registro.
5. Antes de fechar sprint com código: `npm test`, `typecheck`, `lint`, `coverage`, `test:postgres` sem skips obrigatórios, `git diff --check`; evidência atual por task.

## 14. Decisões abertas para a revisão independente

Todos os itens abaixo foram adjudicados no parecer `AAA-03-REVIEW-AGENT-3`; a revisão `2` incorpora o resultado. A revisão final do novo hash confirma ou reabre.

- `Q1` — `CONFIRM`; semântica por turno explicitada na §9 (revisão 2). Revisor: confirmar T-09.
- `Q2` — `CONFIRM WITH CONDITION`; negação de adapter real definida na §10 (revisão 2) e coberta por T-19.
- `Q3` — `CONFIRM`; nomes `appointment.create`/`modify` mantidos com semântica restrita a draft.
- `Q4` — `CONFIRM WITH CONDITION`; `verifyAndConsume` proibido no runtime governado (§4, revisão 2) e coberto por T-16.
- `Q5` — `CONFIRM WITH CONDITION`; TTL parametrizado e injetável, sweep definido na §4, prova PostgreSQL em AAA-16 e coberto por T-18.

## 15. Riscos e rollback

- Risco de integração prematura: mitigado por dono único de `runtime.ts` e sequência AAA-09→10→11.
- Risco de migração: novas colunas/tabelas do journal são aditivas; rollback desfaz apenas o diff da task e exige plano de roll-forward/restore (Agent 2, AAA-16).
- Risco de evidência desatualizada: hash do contrato e dos artefatos por task; mudança de fonte invalida.
- Risco de falso sucesso: proibido marcar `EXECUTED` fora da transição de confirmação; testes negativos cobrem cada fronteira.

## 16. Reconciliação com AAA-05 e fechamento das condições

| Item                                       | Fonte                            | Onde fecha nesta revisão                    |
| ------------------------------------------ | -------------------------------- | ------------------------------------------- |
| Identidade runtime × canal, kinds e escopo | AAA-05 §1/§3.1; `AAA03-R3-F01`   | §2.1 R-ID-1..R-ID-6; exemplos §8.1 E-1..E-7 |
| Payload/hash e colisão                     | AAA-05 §1.1/§6; `AAA03-R3-F01`   | §2/§2.1 R-ID-3/R-ID-4; §8; T-15/T-17/T-20   |
| Journal, lease e resultado incerto         | AAA-05 §2/§3/§5; `AAA03-R3-F03`  | §4, §6, §7; T-05/T-06/T-14/T-18             |
| Outbox: chave e namespaces                 | AAA-05 §9/§12                    | §8 R-ID-5; T-20                             |
| Per-turn budget                            | `Q1`; barra `Q-A09-01` limitação | §9                                          |
| Adapter real negado até AAA-21             | `Q2`                             | §10; T-19                                   |
| `verifyAndConsume` fora do runtime         | `AAA03-R3-F02`/`Q4`              | §4; T-16                                    |
| TTL/sweep parametrizados                   | `Q5`                             | §4; T-18; prova PostgreSQL em AAA-16        |

- Ownership do adapter durável: `EffectJournalPort` SQL pertence a `packages/persistence` (Agente 2) e permanece bloqueado por D05-1/D05-2 e pela reserva de `outbox.ts`/`postgres.ts` de AAA-10; nenhum arquivo de persistência é tocado sem handoff.
- Este documento não edita `aaa_data_api_contract.md` (owner Agente 2): divergências residuais devem ser apontadas na revisão final do Agente 3 e resolvidas no documento do respectivo autor.
