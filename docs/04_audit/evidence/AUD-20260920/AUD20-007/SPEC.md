# AUD20-007 - SPEC de causalidade imutavel de approvals

## Gate e escopo

- programa: `AUD-20260920-REAUDIT`;
- task: `AUD20-007`;
- finding: `A20-F08`;
- autorizacao: `G20-1`, somente local, sintetica e descartavel;
- dependencias: discovery, PRD e SPEC globais aprovados; AUD20-006 verificada;
- fora de escopo: providers, canais, IdP, dados reais, piloto, producao e
  qualquer efeito externo.

## Discovery

### Problema observado

O decision route grava a decisao duravel em `runtime_approvals`, retoma a
execucao e somente depois acrescenta o evento `approval_decision`. Se o append
falha, o worker homologado tenta reconciliar apenas execucoes em
`WAITING_APPROVAL`. A reconciliacao atual recebe `actorId`, `correlationId` e
`policyVersion` fabricados pelo proprio worker e o evento usa `actorType:
System`. O `Idempotency-Key` da decisao HTTP tambem fica somente no payload
transitorio da rota.

### Evidencia current

- `ApprovalRecord.approverId` e `decisionReason` ja persistem o ator humano e a
  justificativa quando a engine decide;
- `ApprovalRecord.correlationId`, `policyVersion`, `payloadHash` e
  `operationKey` ja persistem a identidade da solicitacao aprovada;
- `PostgresApprovalAuthority` faz a mutacao de decisao e o compare-and-set na
  mesma transacao;
- `PostgresOperationalExecutionStore.resolveApproval` e idempotente depois que
  a execucao foi retomada;
- `PostgresRuntimeRepository.appendAudit` ja garante uma unica decisao por
  `(tenant_id, approvalId, decision)` usando a migration 0021;
- o worker pode observar tanto a aprovacao quanto o audit sob o mesmo tenant
  RLS.

### Desconhecido controlado

Dados anteriores a esta migration podem nao ter o envelope novo de decisao.
Nao sera inventado um valor para esses registros: a recuperacao falhara
fechado e emitira o diagnostico operacional correspondente.

## Invariantes

1. A decisao e seu envelope causal sao gravados atomicamente na mesma mutacao
   compare-and-set de `runtime_approvals`.
2. Depois de `APPROVED` ou `REJECTED`, ator, tipo do ator, razao, correlation
   da decisao e command key nao mudam em retry; repeticao divergente falha
   fechado.
3. `policy_version` e `payload_hash` da aprovacao permanecem a autoridade
   duravel da decisao; o worker nunca os substitui por valores locais.
4. O worker nunca usa sua propria identidade, correlation, policy ou command
   key como narrativa de approval.
5. Uma decisao produz no maximo um evento `approval_decision` por tenant,
   approval e veredito; a representacao persistida do veredito no audit e
   canonica em minusculas (`approved`/`rejected`).
6. Um crash antes ou depois de `resolveApproval`, mas antes do audit, e
   recuperavel pelo worker; a segunda tentativa e no-op e conserva o evento
   original.
7. Falta de qualquer campo causal obrigatorio impede a reconciliacao antes de
   qualquer mutacao ou append.

## Design selecionado

### Envelope persistido

Usar `runtime_approvals` como fonte unica, sem criar uma tabela de decisao
paralela. Os campos existentes continuam sendo reutilizados:

| Semantica            | Campo duravel             | Origem                             |
| -------------------- | ------------------------- | ---------------------------------- |
| actor id             | `approver_id`             | identidade confiavel da rota       |
| actor type           | `decision_actor_type`     | `Approver` ou `Supervisor`         |
| reason               | `decision_reason`         | nota da decisao, `null` se ausente |
| request correlation  | `correlation_id`          | pedido original                    |
| decision correlation | `decision_correlation_id` | correlation da chamada de decisao  |
| policy               | `policy_version`          | policy da aprovacao                |
| payload hash         | `payload_hash`            | hash canonico da aprovacao         |
| command key          | `decision_command_key`    | `Idempotency-Key` da decisao       |
| operation identity   | `operation_key`           | command da operacao aprovada       |

A migration `0024_approval_decision_causality.sql` adicionara somente os tres
campos novos como nullable para permitir migracao aditiva. O decision route
sempre os preenchera; registros sem envelope completo permanecerao legados e
serao rejeitados pelo caminho de recovery.

### Decision route

`POST /v1/executions/:executionId/approvals/:approvalId/decision` deve:

1. passar `correlationId`, `commandKey` e o role confiavel para
   `approve/reject`;
2. guardar o `ApprovalRecord` retornado, em vez de continuar usando o snapshot
   PENDING lido antes da mutacao;
3. em retry de uma decisao ja concluida, reutilizar exclusivamente o envelope
   persistido;
4. chamar `resolveApproval` com `approverId` e `decisionReason` persistidos;
5. escrever o audit com actor, correlation, policy, hash, reason e command key
   persistidos, mantendo `decision` em minusculas.

### Recovery do worker

`reconcileStuckApprovalDecisions` consultara approvals decididos ligados a uma
execucao tenant-scoped e usara `NOT EXISTS` contra `audit_events` para localizar
somente decisao ainda sem audit. A consulta nao dependera do estado
`WAITING_APPROVAL`: cobrira o estado antes e depois da retomada, inclusive
`QUEUED`, estados ativos e o terminal de rejeicao.

Para cada linha, o worker carregara o approval completo, validara o envelope,
resolvera a execucao de modo idempotente e anexara o evento com os valores
persistidos. A deduplicacao de 0021 continua sendo a autoridade de concorrencia
entre dois workers.

## Alternativas rejeitadas

- **Tabela de decision journal separada:** rejeitada; duplica a autoridade
  duravel, exige join/reconciliacao adicional e nao resolve o crash sem uma
  transacao distribuida.
- **Usar o contexto do worker:** rejeitada; reatribui causalidade e permite que
  recovery altere a narrativa original.
- **Usar `operation_key` como `Idempotency-Key`:** rejeitada; sao identidades
  distintas no contrato atual e a substituicao perderia a chave da chamada
  humana.
- **Append no worker sem `NOT EXISTS`:** rejeitada; manteria varredura por
  estado e nao cobriria crash depois da retomada.

## Verificacao e criterio de pronto

- teste unitario da reconciliacao prova que todos os campos sao copiados do
  approval e que metadata incompleta falha fechado sem `resolveExecution` nem
  `appendAudit`;
- teste PostgreSQL prova migration 0024, persistencia do envelope e leitura
  apos restart da autoridade;
- teste integrado cria approval, injeta falha no primeiro append de audit depois
  da decisao/retomada, executa recovery pelo worker e prova exatamente um evento
  com actor humano, reason, correlation, policy, payload hash e command key
  originais;
- segundo sweep e duas reconciliacoes concorrentes continuam produzindo um
  unico evento;
- testes negativos cobrem actor, correlation e command key ausentes, decisão
  divergente e tenant diferente;
- executar `npm run test:postgres`, typecheck, lint, format, coverage critica,
  mutation guard e certificacao integrada no mesmo candidate.

## Fora de escopo

- alterar a regra de aprovação, self-approval ou reserva de efeitos;
- reconciliar, apagar ou reatribuir dados legados sem envelope;
- liberar G20-2, integracoes externas, piloto ou producao;
- modificar o decision contract de outros tipos de audit.
