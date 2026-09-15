# AAA-05 — Adendo agent-2: binding de hashes, namespaces, retry de FAILED e plano SQL

- Programa: `AAA-20260912`. Task: `AAA-05`. Autor: agent-2. Data: 2026-09-12.
- Natureza: **ADENDO DE CONTRATO PARA REVISÃO**, não uma alteração do artefato pinado.
- Contrato pinado em revisão: `docs/02_spec/aaa_data_api_contract.md`, sha256 `8db1541f3f0428b64b47d5235c406cc4450b19ecc85eee75290837229dbf17e5` (não editado por este adendo).
- Contraparte atual: `docs/02_spec/aaa_execution_contract.md` rev2, sha256 `9df1a05fdf36293d02e006917f191f0c96e8c1109e4a10d1e9fc49f5d9ef3ff7` (substitui `db75899f…`, referenciado na §3.1 e nos manifestos anteriores).
- Recebimento do coordenador: `docs/04_audit/evidence/AAA-20260912-AGENT2-RECEIPT/manifest.json` (IMPLEMENTED; revisão independente pendente; `0012` reservada para planejamento).
- Este adendo não concede gate, não altera código em revisão e não autoriza BUILD.

## A1. `proposalHash` ≠ `payloadHash`: campos canônicos e vínculo verificável

Os hashes vivem em fronteiras distintas e **não são iguais**. A §3.1 do contrato pinado usa `payloadHash ↔ proposalHash` apenas como par de "igualdade de conteúdo de cada fronteira"; este adendo corrige a leitura.

| Item             | `proposalHash` (runtime, AAA-03 §2)                                                                                                                       | `payloadHash` (canal, AAA-05 §1.1)                                            |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Cobre            | proposta aprovada inteira                                                                                                                                 | mensagem efetivamente enviada (projeção do payload aprovado)                  |
| Campos canônicos | `schemaVersion`, `tenantId`, `operatorId`, `agentId`, `agentVersion`, `agentProfile`, `capability`, `action`, `resource`, `dataClassification`, `payload` | `conversationId`, `channel`, `recipient`, `body`, `correlationId`, `metadata` |
| Canonicalização  | `canonicalizeJson` de `@cvg/shared` (RFC 8785 subset, budgets)                                                                                            | `canonicalizePayload` local (RFC 8785 subset equivalente no domínio)          |
| Quem calcula     | runtime, antes da aprovação                                                                                                                               | gateway, antes da reserva do canal                                            |
| Quem verifica    | runtime/aprovação                                                                                                                                         | journal do canal (contra envio repetido)                                      |

Vínculo verificável (normativo para a composição):

1. `payloadHash = SHA-256(canonicalizeJson(proj(proposal.payload)))`, onde `proj` é a projeção determinística `{conversationId, channel, recipient, body, correlationId, metadata}` definida em AAA-05 §1.1.
2. O runtime deriva `proj(proposal.payload)` sem regeneração por modelo; o canal recalcula `payloadHash` a partir da mensagem outbound recebida. O verificador compara o hash recalculado com o hash persistido na mesma linha do journal.
3. **Igualdade entre `proposalHash` e `payloadHash` não é exigida nem testada**: a identidade que liga as fronteiras é `idempotencyKey = operationKey` (AAA-03 R-ID-1). A igualdade de conteúdo que importa no canal é `payloadHash` contra `payloadHash`.
4. Reuso de `operationKey` com `payloadHash` divergente é rejeitado (`idempotency_key_reuse`) mesmo quando o `proposalHash` do runtime permanece o mesmo — mudança de projeção/canal/entrega é mudança de entrega e exige nova operação.

Gap real encontrado (planejado, não implementado agora): o candidato AAA-12 usa `canonicalizePayload` local; a fronteira runtime usa `canonicalizeJson` de `@cvg/shared`. Para uma única casa canônica e verificação byte a byte, o plano de A6 inclui alinhar o canal a `canonicalizeJson`. No domínio alcançável (payload validado por Zod, objetos/arrays/strings/números finitos) os resultados são equivalentes; divergem em entradas fora do domínio (ciclos, números não finitos, bigint, `undefined` de topo). A correção é mudança de código no candidato pinado e exige novo digest e nova revisão.

Critérios de teste do vínculo (a especificar na revisão, sem alegar execução):

- mesma projeção → mesmo `payloadHash`; ordem de chaves diferente → mesmo hash;
- mudança de campo projetado → hash diferente → `idempotency_key_reuse` na mesma chave;
- `proposalHash` diferente com mesma projeção (ex.: mudança de `agentVersion`) **não** muda `payloadHash`; a operação é a mesma pela chave; nova operação exige nova `callerIdempotencyKey`.

## A2. Namespaces de notificação (outbox e eventos)

Vale o contrato AAA-03 rev2 R-ID-5; nenhuma deduplicação entre namespaces é prometida (T-20).

| Origem                                  | Chave                                                       | Namespace                                                         | Estado                                   |
| --------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------- |
| Runtime (notificação/ack)               | `operationKey`                                              | `<capability>.executed`                                           | normativo (AAA-03 §8)                    |
| Observabilidade do canal                | —                                                           | `channel.outbound.*` (`sent/replayed/rejected/uncertain/blocked`) | implementado no candidato AAA-12         |
| Notificação outbox originada pelo canal | prefixo reservado `channel:<kind>:<channel>:<operationKey>` | namespace próprio, distinto de `<capability>.executed`            | **proposta reservada, não implementada** |

Regra: o journal do canal **não escreve na outbox**. Quem enfileira notificação é o runtime, com `operationKey`. O prefixo `channel:` da §3.1 do contrato pinado é reserva de namespace; não deve ser tratado como ativo nem confundido com a notificação runtime.

## A3. Retry após falha sem efeito vs replay de `FAILED` (divergência aparente)

Classificação normativa no canal (resolve a §3.1 do contrato pinado):

| Classe de falha                         | Certeza de efeito | Transição no canal            | Retry com a mesma chave                |
| --------------------------------------- | ----------------- | ----------------------------- | -------------------------------------- |
| `retryable=true` (ex.: 5xx/429, outage) | nenhum efeito     | `release` → `PENDING`         | **permitido**; reenvio no máximo 1     |
| `retryable=false` (rejeição explícita)  | nenhum efeito     | `fail` → `FAILED` (terminal)  | **bloqueado**; replay devolve a falha  |
| `effectUnknown=true` (rede/timeout)     | incerto           | `markUncertain` → `UNCERTAIN` | **bloqueado**; reconciliação explícita |

- O exemplo "retry após falha sem efeito" do contrato pinado refere-se **somente** à primeira linha (`release → PENDING`), coberta pelo teste 5 (`failure before the send releases the lease so a retry sends once`).
- `FAILED` é terminal e replay devolve o erro registrado; nova tentativa exige chave nova. Essa linha **não tem teste no candidato atual** — listada em A6.
- `UNCERTAIN` nunca reenvia automaticamente; coberto pelo teste 6 e pelo cenário 7.

## A4. Atualização de referências de dependência (por adendo, sem apagar histórico)

- `AAA-03` passou de rev1 `db75899f…` para rev2 `9df1a05f…`. A §3.1 do contrato pinado e os manifestos AAA-05/12/16 referenciam rev1; este adendo declara rev2 como contraparte vigente.
- Compatibilidade conferida: R-ID-1..R-ID-5, E-1..E-7 e T-17/T-20 de AAA-03 rev2 são compatíveis com o contrato pinado. `E-5` (`idempotencyKey=operationKey`, partição `(tenant, channel, outbound_message, key)`) coincide com AAA-05 §1/§3.1. Nenhuma mudança semântica quebra o candidato AAA-12.
- Se o coordenador emitir AAA-05 v2 incorporando este adendo, ficam obsoletos **somente documentos/hashes de referência**: hash do contrato AAA-05, entradas correspondentes em manifestos/handoffs e no recibo AGENT2-RECEIPT. O candidato de código `33aa2807…` não é afetado (nenhuma mudança de código neste adendo).

## A5. Migration 0012 e adapters SQL — plano (SEM código)

Reserva vigente: `migration-0012-and-journal-sql-design`, owner agent-2, `RESERVED_PLANNING_ONLY`; `outbox.ts`/`postgres.ts`, runtime e exports permanecem agent-1; `packages/persistence/src/index.ts` exige handoff explícito.

Proposta de migration (a validar pelo coordenador antes de criar arquivo):

- `packages/persistence/migrations/0012_effect_journals.sql` — uma migration aditiva com **duas** tabelas, evitando segunda reserva isolada:
  - `channel_effect_journal` — PK `(tenant_id, channel, operation_kind, idempotency_key)`, `payload_hash`, `state` (`PENDING/SENDING/CONFIRMED/FAILED/UNCERTAIN/EXPIRED`), `attempt`, lease (`lease_owner`, `lease_expires_at`), `result jsonb`, `error_code`, `revision`, timestamps; RLS `ENABLE`+`FORCE`, policy `tenant_id = current_setting('cvg.tenant_id', true)`.
  - `effect_journal` — PK `(tenant_id, operation_key)`, `proposal_hash`, `state` (`RESERVED/EFFECT_STARTED/CONFIRMED/EFFECT_FAILED/UNCERTAIN/ABANDONED`), `attempt_id`, `execution_ref`, `result_digest`, lease/TTL; mesma RLS FORCE.
- Se agent-1 preferir separar, a segunda migration fica sem número até nova reserva (não escolher 0013 isoladamente).

Adapters e atribuição de task:

| Porta                      | Arquivo proposto                                              | Owner   | Task de implementação                                        |
| -------------------------- | ------------------------------------------------------------- | ------- | ------------------------------------------------------------ |
| `ChannelEffectJournal` SQL | `packages/persistence/src/channel-effect-journal-postgres.ts` | agent-2 | AAA-12 (nova rodada pós-review; RED + digest novo)           |
| `EffectJournalPort` SQL    | `packages/persistence/src/effect-journal-postgres.ts`         | agent-1 | AAA-10 (integração runtime; agent-2 fornece DDL/RLS/reserva) |
| Exports                    | `packages/persistence/src/index.ts`                           | agent-1 | handoff explícito antes de editar                            |

Precondições de início (nenhuma satisfeita automaticamente): parecer do Agent 3 sobre AAA-05; escopo/task registrados; `G_SPEC` aplicável por task; lock exclusivo de migration/exports; handoff com AAA-10. **AAA-17 não é autorização para este trabalho.**

## A6. Plano de correção da cobertura crítica e casos adversariais ausentes (débito AAA-12)

Números atuais do candidato `33aa2807…`: gateway 83.96/76.62/54.54/84.46; `effect-journal` 78.74/73.33/85.71/80.53; `effect-journal-file` 87.5/89.74/80.64/90.69 (statements/branches/functions/lines). A barra é a de AAA-04; não reduzir limiar.

Testes a adicionar (AAA-12, segunda rodada autorizada):

1. `FAILED` terminal: adapter lança `provider_rejected retryable=false` → `FAILED`; segundo dispatch devolve a falha registrada sem novo envio; estado persistido observado.
2. Paridade in-memory ↔ arquivo para cada transição (`renew`, `release`, `fail`, `resolveUncertain confirmed/not_effected`, `waitForTerminal` para `CONFIRMED`/`FAILED`).
3. Vínculo de hash (A1): determinismo, reordenação, mudança de projeção e divergência `proposalHash`/`payloadHash`.
4. Casos adversariais do aceite: lease vencido com resposta tardia (coberto parcial), takeover com dois donos, `operation_in_progress` por timeout (coberto), colisão de chave entre canais/tenants (coberto), canal desabilitado (coberto).
5. **Processos distintos (não apenas duas instâncias)**: harness que spawna dois processos Node independentes sobre o mesmo diretório; asserção: exatamente um registro de envio no spool compartilhado.
6. **Restart real**: SIGKILL entre reserva e claim (takeover seguro) e entre efeito e ack (UNCERTAIN, sem segundo envio), com estado persistido lido por processo novo.
7. Alinhamento a `canonicalizeJson` de `@cvg/shared` (mudança de código sujeita a novo digest/revisão).

Durabilidade física (fora do escopo do journal em arquivo): queda de energia/perda de disco exige PostgreSQL com `fsync=on`, cenário de crash explícito e medição; propor em AAA-16/AAA-34, sem alegar prova atual. `AAA-15` trata apenas formatação; `AAA-04` não pode baixar a barra.

Precondições: lock, task e gate aplicáveis; preservar RED e emitir novo digest; revisão por outro agente.

## A7. Mapa de obsolescência (se este adendo for incorporado)

| Artefato                                                 | Efeito                                                       |
| -------------------------------------------------------- | ------------------------------------------------------------ |
| `docs/02_spec/aaa_data_api_contract.md` (v1 `8db1541f…`) | permanece pinado para a revisão vigente; v2 teria hash novo  |
| `docs/04_audit/evidence/AAA/AAA-05/manifest.json`        | referência de hash a renovar                                 |
| handoffs AAA-05/AAA-12/AAA-16                            | referências textuais a re-pinar                              |
| `AGENT2-RECEIPT` (entrada AAA-05)                        | registro histórico; nova entrada necessária se v2 for aceita |
| candidatos de código `33aa2807…` / `a122ae51…`           | **inalterados** por este adendo                              |
| logs e manifestos históricos                             | preservados, nunca sobrescritos                              |

## A8. Limites deste adendo

- Nenhum gate concedido; nenhum código, migration, export, `outbox.ts`/`postgres.ts` ou `package.json` alterado.
- Nenhuma conexão a provider/canal/banco operacional; PostgreSQL descartável da fixture segue isolado na porta 55432.
- Nenhuma alegação de teste executado para itens de A6; são plano e critérios de regressão da task dona.
