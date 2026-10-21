# SPEC0249 — Integridade do worker e da persistência: RLS do journal, fencing do outbox, teto na recuperação, cadeia de auditoria, renovação de lease e oracle de alerta

**PROPOSTA T3, revisão r2. BUILD condicionado ao APPROVE do crítico independente, sem obrigatórios** ([decisão do usuário de 20/10/2026](../04_audit/evidence/AUD0621-REMEDIATION-20261020/user-decisions-20261020.json): "BUILD após APPROVE do crítico"; migração de esquema ou premissa nova param e voltam ao usuário). Tasks: `AUD0621-PERSISTENCE-SPEC-0249-20261020` (esta SPEC) e `AUD0621-PERSISTENCE-BUILD-0249-20261020` (implementação). Frente `AUD0621-PERSISTENCE-0249`, filha de `AUD0621-REMEDIATION-20261020`. Autoridade: [constituição D-12/T3](../07_agents/AGENTS.md), [coordenação](../08_runtime/agent_coordination.md) e [ADR-010](../architecture/adrs/ADR-010-harness-product-isolation.md). Origem: achados F05, F06, F17, F19, F20 e F26 do [relatório 0621](../04_audit/0621_critical_production_audit_2026-10-20.md), com as sondas [data-probes.json](../04_audit/evidence/AUD-CRITICAL-20261020/data-probes.json), [first-data-probes.json](../04_audit/evidence/AUD-CRITICAL-20261020/first-data-probes.json), a [revisão de dados](../04_audit/evidence/AUD-CRITICAL-20261020/review-data.md) e [production-stack.json](../04_audit/evidence/AUD-CRITICAL-20261020/production-stack.json).

A [crítica r1](../04_audit/evidence/AUD0621-PERSISTENCE-0249-20261020/spec-review-r1/review.md) deu REVISE com um obrigatório (R1-01, prova de M6 na AC12) e onze P3. A r2 aplica o obrigatório e os onze P3 ([correções](../04_audit/evidence/AUD0621-PERSISTENCE-0249-20261020/spec-review-r1/corrections.json)), sem mudar o desenho nem a decisão de não migrar.

Base: main `6c9fc6517f272e884a4adc5d7b8c71d1e1a552e9`. As âncoras `arquivo:linha` são dessa base. Candidata: worktree detached `/mnt/dados/cvg-work/cvg-aud0621-persistence0249-20261020`. Evidência: [pasta da frente](../04_audit/evidence/AUD0621-PERSISTENCE-0249-20261020/task.json).

**Não há migração.** O token de fencing do F06 é a coluna identity que já existe em `outbox_attempts` (migração 0010). A §2 explica por que isso equivale a uma coluna de geração. O número `0030` não é reservado nem usado.

## 1. CURRENT — achados e evidência

### 1.1 F05 — preflight sem o journal; sweep sem predicado de tenant

- `apps/worker/src/postgres-role-preflight.ts:14–30`: `WORKER_CRITICAL_TABLES` não lista `effect_journal` nem `runtime_approvals`. O preflight verifica role, dono, RLS, FORCE, política e grants só dessa lista.
- `apps/worker/src/kernel-composition.ts:267–289`: `assertPostgresKernelPrerequisites` só faz `SELECT 1 … LIMIT 0` nas duas tabelas. Não confere RLS, FORCE nem política.
- `packages/persistence/src/effect-journal-postgres.ts:264–296`: `releaseExpired` faz dois `UPDATE effect_journal … WHERE state = …` sem predicado de tenant. Depende só do RLS.
- Sonda `worker-rls-preflight`: role mínimo sem SUPERUSER/BYPASSRLS, RLS desligado só em `effect_journal`. Os dois preflights aceitaram. O sweep sob o tenant A levou a reserva do tenant B a `ABANDONED`.

### 1.2 F06 — tentativa antiga encerra o claim novo

- `packages/persistence/src/postgres-outbox.ts:183–251`: o claim incrementa `attempts`, grava `lease_owner`/`lease_until` e insere uma linha em `outbox_attempts`. Não devolve nada que identifique a tentativa.
- `ack` (253–501) e `fail` (503–590) aceitam qualquer chamada com `lease_owner = workerId` e lease vivo. Os `UPDATE` finais filtram só `status = 'processing' AND lease_owner = $worker` (473–474, 548–549). As linhas de tentativa são fechadas por `worker_id = $3 AND outcome IS NULL` (482–486, 559–571).
- No ramo de takeover do `ack`, a supressão roda numa transação nova com a linha lida na transação anterior, sem novo lock nem nova checagem (336–346).
- O compose de produção usa `CVG_WORKER_ID` com default fixo `worker-harness-1` (`deploy/harness/compose.production.yaml:158`), e o default de `openPostgresControlledConnection` é `worker-controlled-postgres` (`apps/worker/src/postgres-controlled.ts:135`).
- Sonda `outbox-attempt-fence`: claim 1 expirou; claim 2 usou o mesmo workerId; o `fail` terminal da tentativa 1 foi aceito e levou a tentativa 2 a `dead_letter`.

### 1.3 F17 — recuperação de crash contorna o teto

- Outbox, `postgres-outbox.ts:196–240`: o claim pega `processing` com lease vencido e incrementa `attempts` sem olhar `OUTBOX_MAX_ATTEMPTS`. O teto só existe em `fail` (532–536), que um worker morto não chama. O dublê em memória (`packages/persistence/src/outbox.ts:319–371`) tem o mesmo desenho.
- Execution spine, `packages/persistence/src/operational-execution-postgres.ts:1124–1181`: `recoverExpired` devolve toda execução `CLAIMED`/`RUNNING` vencida a `QUEUED`, sem olhar `attempt`. O ramo de exaustão do claim (486–539) só cobre `FAILED_RETRYABLE`.
- Sonda `outbox-unbounded-crash-retry`: com máximo 5, o claim 7 ainda saiu `processing`.

### 1.4 F19 — persistência parcial da cadeia perde registros

- `kernel-composition.ts:345–406`: o turno captura `firstRecord = ledger.size()`, roda e persiste `records().slice(firstRecord)` filtrado pela correlação.
- `persistKernelAudit` (462–495) insere um registro por vez, cada um com sua própria conexão e sem transação.
- Se o insert 2 falha depois do insert 1, o resto fica só em memória. O turno seguinte começa depois deles e não os reenvia. Se o turno lança antes de persistir, nada dele é persistido. Nos dois casos a cadeia persistida fica com lacuna permanente, e `verifyPersistedKernelAudit` (`kernel-audit-chain.ts:76–154`) exige sequência contígua.
- Evidência estática ([revisão de dados](../04_audit/evidence/AUD-CRITICAL-20261020/review-data.md), I1-02); fault não executado na auditoria.

### 1.5 F20 — heartbeat do PG não renova

- `apps/worker/src/continuous-worker.ts:270–321`: só renova se o adapter tem `heartbeatClaim`. Sem ele, lê o evento e compara status e dono. Não estende `lease_until` nem confere expiração, e a métrica sai `outcome: 'renewed'`.
- `packages/persistence/src/tenant-scoped-postgres.ts:218–244`: o adapter de produção não tem `heartbeatClaim`.
- Efeito: um handler acima de `leaseMs` perde o lease enquanto as métricas dizem "renovado". Outro worker retoma o evento. Evidência estática (I1-04).

### 1.6 F26 — oracle de alerta aceita histórico

- `scripts/production-stack-smoke.ts:720–755`: depois de remover o worker, relê todo o log do receptor e aceita qualquer `code = worker_down`. Não exige `state = firing`, instante posterior à parada nem entrega nova.
- O raw do smoke (`production-stack.json`, check `alert.worker_down_delivered_signed`) traz firing/resolved anteriores à parada. O resultado 22/22 não demonstra a detecção da parada final.

## 2. Decisão de esquema — sem migração

O F06 pede um token de geração por claim, obrigatório em ack, fail e renew. Uma coluna nova de geração em `outbox_events` exigiria a migração `0030`. Esta SPEC usa um token que já existe:

- `outbox_attempts.id` é `bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY` (`packages/persistence/migrations/0010_outbox_durability.sql:85–94`).
- O claim insere essa linha na mesma transação em que muda o evento (`postgres-outbox.ts:243–248`). Cada claim recebe um id novo, único na tabela inteira.
- O id cresce sempre. `requeueDeadLetter` zera `attempts` (619–631), mas não mexe na sequência identity. Por isso o id não repete depois de requeue, o que não vale para `attempts` (problema ABA). O id já é lido sob RLS pelo role de runtime, que tem SELECT/INSERT/UPDATE nessa tabela (`scripts/migrate-job.mjs:72–76`).
- Nenhum código de runtime insere `id` explícito. A identity é a única fonte.

**Equivalência.** Uma coluna de geração por linha garantiria "token novo a cada claim, nunca reutilizado para o mesmo evento". O id da tentativa garante isso e mais: é único entre todos os eventos e continua único depois de requeue. A comparação usa a linha de tentativa com lock do evento (`SELECT … FOR UPDATE`) e exige `id = token`, `worker_id = workerId`, `attempt = outbox_events.attempts`, `outcome IS NULL` e nenhuma tentativa mais nova do mesmo evento. Não há janela sem lock entre a checagem e a escrita. O resultado é o mesmo de um CAS sobre uma coluna de geração.

As demais correções também não precisam de esquema: F05 usa catálogo (`pg_class`/`pg_policies`) e um predicado SQL; F17, F19 e F20 usam colunas existentes; F26 é script.

## 3. PROPOSED — contrato

### 3.1 D1 (F05) — inventário do worker e defesa no sweep

1. `WORKER_CRITICAL_TABLES` ganha `effect_journal` e `runtime_approvals`. O preflight passa a verificar nelas o mesmo que já verifica nas outras: role sem SUPERUSER/BYPASSRLS/CREATEDB/CREATEROLE/REPLICATION, sem herança, dono diferente do role, RLS e FORCE ligados, exatamente uma política `<tabela>_tenant_isolation` PERMISSIVE para `{public}` e `ALL`, e grants SELECT/INSERT/UPDATE sem DELETE/TRUNCATE/TRIGGER/REFERENCES.
2. A expressão esperada de cada tabela sai do inventário canônico `TENANT_SCHEMA_INVENTORY` (`packages/persistence/src/tenant-schema.ts`), não do conjunto local `TENANT_ONLY_POLICY_TABLES`. Tabela crítica fora do inventário faz o preflight falhar fechado. As duas tabelas novas são `tenant-only` no inventário.
3. `assertPostgresKernelPrerequisites` passa a conferir também, nas duas tabelas, RLS, FORCE e a política exata, por um helper exportado de `postgres-role-preflight.ts`. Não confere role nem grants: os testes do kernel usam pool de superusuário e essa parte cabe ao preflight do worker, que roda antes no `main.ts`. O código de erro continua `kernel_runtime_prerequisites_missing`.
4. `PostgresEffectJournal.releaseExpired` ganha `AND tenant_id = NULLIF(current_setting('cvg.tenant_id', true), '')` nos dois `UPDATE`. Sem contexto de tenant, nenhuma linha muda. A assinatura do port não muda.
5. Produção já concede essas duas tabelas ao role de runtime: `migrate-job.mjs` concede todo `TENANT_SCHEMA_TABLES`.

### 3.2 D2 (F06) — token de claim obrigatório no PostgreSQL

1. `OutboxEventRecord` (`packages/persistence/src/schema.ts`) ganha `claimToken?: string`. Só o claim e a renovação o preenchem. `findOutboxById`, `ack` e `fail` não o devolvem.
2. `OutboxAckInput` e `OutboxFailInput` (`packages/persistence/src/outbox.ts`) ganham `claimToken?: string`. O tipo fica opcional porque o dublê em memória aceita chamadas sem token (item 7). O adapter PostgreSQL o exige em tempo de execução.
3. No PG, `claimNext` faz `INSERT INTO outbox_attempts … RETURNING id::text` e devolve `claimToken` com esse texto decimal.
4. `ack`, `fail` e a renovação (§3.3) no PG:
   - token ausente ou fora de `^[1-9][0-9]{0,17}$` (até 18 dígitos, abaixo de 2^63−1, para o cast `::bigint` nunca falhar) → `DomainError('validation_failed', 'Outbox claim token is required')`, sem escrita;
   - depois do `SELECT … FOR UPDATE` do evento, um helper único confere `status = 'processing'`, `lease_owner = workerId`, `lease_until > agora` e a linha de tentativa `id = token` com `worker_id = workerId`, `attempt = attempts do evento`, `outcome IS NULL` e nenhuma linha mais nova do mesmo evento. As duas consultas levam `tenant_id = $1` explícito, sem depender só do RLS;
   - falha de dono ou expiração mantém `conflict` com 'Outbox lease is not owned by worker'; token que não é a tentativa atual dá `conflict` com 'Outbox claim is not the current attempt'.
5. Os `UPDATE` finais de `ack` e `fail` ganham `AND attempts = $tentativa`. As linhas de tentativa passam a ser fechadas por `id = token`, não por `worker_id`.
6. O `ack` aplica o helper nas suas duas transações. O ramo idempotente `processed` só devolve sucesso se a linha do token tiver `outcome = 'processed'`; senão dá `conflict`. O ramo de takeover que hoje abre transação nova (336–346) passa a reler o evento com `FOR UPDATE` e rodar o helper antes de chamar `suppressOutboxForTakeover`. `postgres.ts` não muda: a supressão roda sob o lock depois da checagem, e a única tentativa aberta é a do token.
7. Dublê em memória (`OutboxRepository`): o claim gera `claimToken` com `createDomainId('claim')` e o guarda no evento enquanto ele está `processing`; por isso `findById` também o mostra nesse intervalo. `ack`, `fail`, requeue e a exaustão o removem. `ack` (inclusive o `commitAck`, que rechama `requireOwnedEvent`), `fail` e `heartbeatClaim` recusam com `conflict` um token informado que não seja o atual. Sem token, o comportamento antigo continua, porque o dublê não é adapter de produção e dezenas de testes o chamam sem token. Fica registrado como diferença deliberada.
8. Chamadores: `completeClaimedOutboxEvent` (`apps/worker/src/jobs/process-outbox-event.ts`) passa o `claimToken` do evento em todo `ack`/`fail`, por spread condicional (`exactOptionalPropertyTypes`). O worker contínuo faz o mesmo na liberação de shutdown (`continuous-worker.ts:615`, `736`). `scripts/rem21-010-postgres-proof.ts:386` passa o token do claim; sem isso a prova do `test:postgres:proof` quebra.
9. Fica de fora: trocar o `CVG_WORKER_ID` fixo do compose. Com o fencing, workerId repetido deixa de ser falha de segurança e continua útil para observabilidade.

### 3.3 D3 (F20) — renovação real com CAS

1. Função nova `renewClaim(ctx, input)` em `postgres-outbox.ts`, com `ctx: Pick<PostgresOutboxContext, 'client' | 'repositoryNow'>` (o contexto completo só existe num getter privado de `postgres.ts`) e `input = { tenantId, eventId, workerId, claimToken, leaseMs }` e `leaseMs` validado no mesmo intervalo do claim (1.000–3.600.000).
2. Uma transação: lock do evento, helper da §3.2 item 4 e `UPDATE outbox_events SET lease_until = GREATEST(lease_until, agora + leaseMs) WHERE … status = 'processing' AND lease_owner = $w AND attempts = $a AND lease_until > agora`. A renovação nunca encurta o lease. Devolve o registro com `claimToken`.
3. Lease vencido, dono diferente, token velho ou evento fora de `processing` devolvem `null`, sem escrita: a renovação recusa quando expirada. Token ausente ou malformado lança `validation_failed`. Erro de banco propaga.
4. `TenantScopedPostgresRuntimeRepository.heartbeatClaim(input)` chama `renewClaim` dentro de `withTenantContext`, com o relógio do repositório (`new Date()`, o mesmo de `run`).
5. `DurableOutboxAdapter` ganha `heartbeatClaim?(input)`. O dublê em memória o implementa com a mesma semântica.
6. No worker contínuo, `renewLease` passa `claimToken`. Só conta renovação se o retorno não for `null`, estiver `processing`, tiver o mesmo dono e, quando o evento tiver token, o mesmo token. Senão marca `lease_lost`.
7. O caminho de fallback (adapter sem `heartbeatClaim`) continua como verificação de dono, porque o relógio é do adapter. A métrica desse caminho passa a `outcome: 'verified'`. `outcome: 'renewed'` fica só para renovação real.
8. Fica de fora: abortar o handler ao perder o lease. O ack final é cercado pelo token e os handlers controlados são idempotentes (at-least-once).

### 3.4 D4 (F17) — teto também na recuperação

1. Outbox PG, `claimNext`: quando o candidato está `processing` com lease vencido, ou `failed`, e `attempts >= OUTBOX_MAX_ATTEMPTS`, a mesma transação faz o seguinte e passa ao próximo candidato:
   - fecha a tentativa aberta como `lease_expired` (UPDATE já existente);
   - leva o evento a `dead_letter`, com `last_error = 'outbox_error:lease_expired_exhausted'`, lease limpo e `dead_lettered_at = agora`, por CAS sobre o status lido;
   - registra `appendDurableOutboxAudit` com `action: 'dead_letter'` e `actorId` do worker que recuperou.

   O laço é limitado: no máximo 25 eventos exaustos por chamada. Ao bater o limite, devolve `null`, e o próximo poll continua. `pending` não entra, porque requeue zera `attempts`.

2. Dublê em memória: mesma regra, com `maxAttempts` do repositório.
3. Execution spine PG, `recoverExpired`: execução vencida com `attempt >= maxAttempts` vai a `FAILED_TERMINAL`, no mesmo formato de exaustão que o claim já usa:
   - `failure = retryExhaustedFailure(maxAttempts)`, `completed_at = agora` e lease limpo;
   - fila em `dead_letter`, com `last_error` igual à mensagem e `processed_at = agora`;
   - evento `FAILED_TERMINAL` com motivo `retry_exhausted`.

   As demais continuam indo a `QUEUED`. A lista devolvida continua sendo só a das execuções devolvidas a `QUEUED`: o registro terminal fica fora, porque o harness (que esta frente não edita) emite `execution.recovered` para cada item (`execution-spine.ts:1293–1295`). A terminalização fica durável no evento `FAILED_TERMINAL` e na fila. Como no ramo de exaustão do claim e na recuperação para `QUEUED`, `operational_effect_journal` (inclusive `EFFECT_STARTED`) e os steps abertos da 0019 não mudam: seguem as regras próprias de expiração e reconciliação. O predicado é o mesmo da transição `FAILED_RETRYABLE` (`attempt >= maxAttempts`). Assim, um lease vencido conta como falha técnica da tentativa. As restrições da migração 0018 aceitam esse estado.

4. A transição `CLAIMED → FAILED_TERMINAL` não existe no grafo de `transition()` (`packages/harness/src/execution-spine.ts:264–283`). Aqui ela é feita pela recuperação do sistema em SQL, como o ramo de exaustão do claim já faz. O grafo público não muda.

### 3.5 D5 (F19) — cadeia persistida por cursor e lote transacional

1. Em `kernel-composition.ts`, um rastro exportado `createKernelAuditTrail(store, options)` substitui `persistKernelAudit`. Para cada ledger em memória ele mantém o cursor `persisted`, a quantidade de turnos ativos e a marca `uncertain`.
2. O turno pega o cursor atual. A rotação em `KERNEL_AUDIT_LEDGER_ROTATE_AT` acontece aqui. Ao terminar, com sucesso ou erro, o turno chama `flush()`.
3. `flush()` é serializado por processo, numa cadeia de promessas. Para cada ledger com registros acima do cursor, em ordem de criação:
   - se `uncertain`, lê o maior `sequence` persistido do `ledgerId` (nenhuma linha vale 0). Menor que o cursor, ou maior que o ledger, lança erro e falha fechado. Senão o cursor recebe esse valor;
   - grava de `persisted` até o fim em lotes de até 200 registros. Cada lote roda numa transação (`withTenantTransaction`) com `PostgresRuntimeRepository(client, { tenantIsolation: true }).appendAudit` por registro, no mesmo formato de linha de hoje;
   - o cursor só avança depois do COMMIT do lote. Erro no lote marca `uncertain` e propaga.
4. O ledger rotacionado só sai da lista quando está todo persistido e sem turno ativo.
5. Erro do turno tem precedência sobre erro do flush. Se o turno deu certo e o flush falhou, o turno lança como hoje: nenhum turno é relatado sem auditoria durável, e o outbox repete. O turno seguinte reenvia exatamente o sufixo que falta.
6. Registros de turno que lançou agora também são persistidos. Hoje ficam perdidos e abrem lacuna.
7. O formato da linha (`policy_decision`, `kernelAudit {ledgerId, sequence, …}`, hashes `sha256-…`) e o verificador não mudam.

### 3.6 D6 (F26) — oracle correlacionado à parada

1. Em `scripts/production-stack-smoke.ts`, funções puras exportadas:
   - `parseAlertReceiverLog(text)`: linhas JSON do receptor, com `signature`, `timestamp`, `body` e `receivedAt`;
   - `alertBaseline(alerts, tenantId)`: `offset` e o último estado `worker_down` do tenant;
   - `findWorkerDownAfterStop(alerts, { offset, stoppedAt, tenantId, secret })`: devolve `{ ok: true, alert }` ou `{ ok: false, reason }`.
2. `findWorkerDownAfterStop` exige:
   - toda entrega depois de `offset` assinada (HMAC de `${timestamp}.${body}`);
   - pelo menos uma com `code = 'worker_down'`, `state = 'firing'` e `tenantId` igual;
   - `observedAt`, o cabeçalho `timestamp` e `receivedAt` todos ≥ `stoppedAt`.

   Histórico antes de `offset` nunca conta.

3. O receptor do smoke passa a registrar `receivedAt` (ISO).
4. Antes de remover o worker, o smoke espera até 30 s que o último `worker_down` não esteja `firing`. Sem isso, o monitor não emitiria um firing novo e a prova seria impossível. Só então captura `offset` e `stoppedAt` e remove o worker. O worker bate a cada 10 s (default de `operationsIntervalMs`) e o limiar do smoke era 3 s, o que faz `worker_down` oscilar (o raw de 20/10 mostra isso). O smoke passa `CVG_STOP_ALERT_WORKER_STALE_MS` de `3000` para `15000` (1,5 batida) e espera o firing novo por até 60 s.
5. O check passa a se chamar `alert.worker_down_after_stop_signed`. O detail traz `offset`, `stoppedAt`, o alerta escolhido ou o motivo da falha. Nenhum consumidor lê o nome antigo.
6. `main()` só roda quando o arquivo é o entrypoint, com o mesmo guard por regex de `production-target-smoke.ts`. O teste importa as funções sem subir a pilha.
7. A pilha de produção (Docker, imagem, rede) **não roda nesta frente**. A prova é o teste unitário do parser e da correlação. O negativo conhecido usa o histórico real do raw de 20/10 sem entrega nova.

### 3.7 Testes existentes alterados (justificativa por achado)

| Arquivo                                                               | Mudança                                                                                                              | Justificativa                                                                      |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `packages/persistence/src/__tests__/outbox-durability.test.ts`        | as chamadas `ack`/`fail` existentes passam o `claimToken` do claim correspondente; nenhuma asserção muda             | F06: ack/fail sem token é justamente o comportamento defeituoso                    |
| `packages/persistence/src/__tests__/postgres-migration-smoke.test.ts` | o cliente falso responde à consulta da linha de tentativa e o `ack` passa token; a asserção das duas transações fica | F06: o ack sem token passa a ser recusado                                          |
| `apps/worker/src/__tests__/postgres-role-preflight.test.ts`           | o mock de políticas inclui `effect_journal` e `runtime_approvals` na lista tenant-only                               | F05: o inventário crítico mudou; o teste duplica o tipo de política de cada tabela |

Nenhuma outra asserção existente muda. Testes novos ficam nos arquivos já listados em `test:postgres`, sem mudar `package.json`, salvo os unitários novos, que a inclusão padrão do Vitest já pega.

## 4. Fora do escopo e resíduos

- O store em memória da execution spine (`packages/harness/src/execution-spine.ts:1076`) continua sem teto na recuperação. O pacote pertence à frente `AUD0621-RUNTIME-0248`; o resíduo fica registrado para o lead.
- `PostgresRuntimeRepository` (`postgres.ts`, de outra frente) não ganha `heartbeatClaim`. O worker de produção usa o adapter tenant-scoped, que ganha.
- Prazo máximo total de um lease renovado: não existe hoje e não é criado aqui. Os prazos do kernel continuam valendo.
- A execução real do smoke de produção e a homologação real ficam com o lead e com o ambiente 0374.

## 5. Riscos

- **Contrato T3 do outbox.** Chamador PG sem token passa a falhar fechado. Mitigação: todos os chamadores do repositório foram enumerados na §3.2 item 8 e na §3.7, por busca de `ack(`/`fail(` em `apps`, `packages`, `products`, `scripts`, `tests` e `legacy`.
- **Lock da renovação.** `renewClaim` trava a linha do evento por um instante e pode esperar o `ack` final. Mesmo pool e mesma contagem de conexões do fallback atual.
- **Recuperação da cadeia com `uncertain`.** A consulta do maior `sequence` varre as linhas `kernel-runtime` do tenant. Só roda depois de falha de flush.
- **Laço de exaustão.** No máximo 25 eventos por claim, dentro de uma transação curta.
- **Flush bloqueado (F19).** Um registro que falhe de forma determinística trava o flush de todos os turnos seguintes do processo e retém os ledgers em memória. Hoje o filtro por correlação isolava a falha no próprio turno, mas deixava lacuna. A troca é deliberada: falha fechado, os turnos lançam e o outbox repete, com o problema visível em vez de uma cadeia quebrada em silêncio.
- **Smoke não executado (F26).** A mudança de limiar e de espera do smoke não roda nesta frente. O oracle é provado por teste unitário; a execução da pilha fica com o lead.

## 6. Aceites — first red na base e verde depois

Testes com role mínimo (LOGIN, NOSUPERUSER, NOBYPASSRLS, sem CREATEDB/CREATEROLE, só SELECT/INSERT/UPDATE nas tabelas do inventário), como na sonda do auditor, salvo onde o arquivo já usa superusuário e o aceite não depende de RLS.

| Id   | Achado | Prova                                                                                                                                                                                                                                                                                                                   | Na base |
| ---- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| AC01 | F05    | RLS desligado só em `effect_journal`: `assertPostgresWorkerPreflight` recusa; `assertPostgresKernelPrerequisites` recusa; o sweep sob A com RLS desligado não muda a reserva de B                                                                                                                                       | falha   |
| AC02 | F05    | com o esquema íntegro e grants do inventário, os dois preflights aceitam                                                                                                                                                                                                                                                | passa   |
| AC03 | F06    | sonda do auditor: claim 1, expira, claim 2 com o mesmo workerId; `fail` terminal com o token 1 dá `conflict` e o evento segue `processing` na tentativa 2; o `ack` com o token 1 também é recusado; `fail`/`ack` com o token 2 funcionam                                                                                | falha   |
| AC04 | F06    | `ack`/`fail` sem token dão `validation_failed`, sem escrita                                                                                                                                                                                                                                                             | falha   |
| AC05 | F06    | ABA: dead-letter, requeue e novo claim com o mesmo workerId e a mesma `attempts`; o token anterior é recusado                                                                                                                                                                                                           | falha   |
| AC06 | F06    | worker: processo A com o mesmo workerId e sem renovação perde o lease; B reclama e processa; o ack de A é recusado; um só efeito, gravado por B                                                                                                                                                                         | falha   |
| AC07 | F20    | `renewClaim` estende `lease_until`; recusa (`null`) com lease vencido, token velho e outro dono; recusa sem escrita                                                                                                                                                                                                     | falha   |
| AC08 | F20    | worker contínuo PG com `leaseMs = 2000`, heartbeat de 250 ms e handler bloqueado por ~5 s: outro worker não consegue claim durante o bloqueio e `lease_until` avança; o primeiro processa. Takeover controlado com o heartbeat parado: é o cenário da AC06, que vale também para o F20                                  | falha   |
| AC09 | F17    | outbox PG: 5 claims vencidos seguidos; o 6º claim devolve `null` e o evento fica `dead_letter` com `attempts = 5`, tentativas fechadas e audit `dead_letter`                                                                                                                                                            | falha   |
| AC10 | F17    | execution spine PG com `maxAttempts = 2`: claim, vence, recupera, duas vezes; a segunda recuperação leva a `FAILED_TERMINAL` `retry_exhausted`, fila `dead_letter`; o claim seguinte devolve `null`                                                                                                                     | falha   |
| AC11 | F17    | dublê em memória: mesma regra da AC09                                                                                                                                                                                                                                                                                   | falha   |
| AC12 | F19    | kernel PG: trigger faz falhar o insert da sequência 2 no turno 1; o turno 1 lança e, antes de tirar o trigger, há zero linhas `kernelAudit` do `ledgerId` (rollback do lote); sem o trigger, o turno 2 passa; `verifyPersistedKernelAudit` dá `valid`, contíguo, com todos os registros dos dois turnos e sem duplicata | falha   |
| AC13 | F19    | unitário do rastro: lote que falha não avança o cursor; `uncertain` reconcilia pelo maior `sequence` persistido sem duplicar; rotação não descarta ledger pendente ou com turno ativo                                                                                                                                   | falha   |
| AC14 | F26    | histórico real do raw (firing/resolved antigos) sem entrega nova → `ok: false`; firing novo correlacionado → `ok: true`; firing anterior a `stoppedAt`, `resolved` novo, outro tenant ou assinatura errada → `ok: false`                                                                                                | falha   |
| AC15 | todos  | `npx prettier --check` nos tocados, `npm run -s lint`, `npm run -s typecheck`, suítes dos pacotes `persistence` e `worker`, e os arquivos PG tocados com `TEST_DATABASE_URL` próprio                                                                                                                                    | —       |

Controles negativos, cada um morto por pelo menos um aceite:

- M1: tirar o predicado de tenant do sweep (AC01).
- M2: aceitar token velho no helper (AC03/AC05).
- M3: `renewClaim` sem estender o lease (AC07/AC08).
- M4: tirar a exaustão do claim (AC09).
- M5: tirar a exaustão da recuperação (AC10).
- M6: inserir sem transação (AC12, pela contagem zero depois do turno 1).
- M7: o oracle aceita histórico (AC14).
- M8: tirar `effect_journal` do inventário (AC01).

## 7. Escrita, recursos e gates

- Escrita no BUILD: `apps/worker/**`; em `packages/persistence/src/`, os arquivos `postgres-outbox.ts`, `outbox.ts`, `schema.ts`, `tenant-scoped-postgres.ts`, `effect-journal-postgres.ts` e `operational-execution-postgres.ts`; `scripts/production-stack-smoke.ts`; `scripts/rem21-010-postgres-proof.ts` (só o token, §3.2 item 8); e os testes da §3.7 e da §6.
- Não mexe em `packages/persistence/src/postgres.ts`, `packages/harness/**`, `apps/api/**`, `apps/web/**`, `products/**`, migrações, `package.json` nem lockfile.
- Recursos: PG `cvg-aud0621-persistence0249-pg` na porta 56267, conferida livre antes e removida no fim. API 3453 e web 4453 reservadas, sem uso previsto.
- Fora: `certify`, `test:e2e`, `sbom`, `licenses:check`, smoke de produção, rede externa, push, PR e deploy.
- Commit único na candidata detached, com `promotion.json`, `ledger-delta.md` e manifesto na evidência. O lead integra e certifica.

## 8. Autoridade e avisos para a decisão

- A trilha é T3 (contrato público do outbox, segurança e policy de RLS). O usuário decidiu em 20/10/2026 que esta SPEC segue para BUILD local depois do APPROVE do crítico independente, e revê no PR.
- Não há migração. Se o crítico ou o BUILD concluírem que o token da §2 não é equivalente, a frente para antes de qualquer migração e leva a pergunta ao usuário.
- Nenhum release, deploy, dado real, provider ou canal real é concedido. A barra 0368 e as decisões D1–D4 do produto não são afetadas.
