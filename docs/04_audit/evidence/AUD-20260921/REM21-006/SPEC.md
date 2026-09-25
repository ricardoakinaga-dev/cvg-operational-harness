# REM21-006 — SPEC

## Contrato de readiness

`apps/worker/src/readiness.ts` fornece uma máquina de estado sem dependência
de rede:

- estado inicial: `not_ready`;
- `markReady(reason)` só transita de `not_ready` para `ready`;
- `markNotReady(reason)` remove a permissão de consumo;
- `markStopped(reason)` é terminal; depois dele `markReady` retorna `false` e
  não emite evento;
- cada transição carrega `from`, `to`, `reason` e timestamp injetável;
- o callback de transição é executado antes de confirmar a nova transição; se
  o sink de telemetria falhar, readiness não fica falsamente verde.

O evento JSON canônico é `worker.readiness`, com `status` (`ready`,
`not_ready` ou `stopped`), `workerId` e `reason`. Não há endpoint público nem
dependência de exporter externo.

## Sequência por runtime

### Homolog

1. validar configuração local e criar pool/runtime;
2. executar `assertOperationalHarnessPostgresPreflight`;
3. executar `checkHomologHealth` obrigatoriamente;
4. emitir `worker.readiness=ready` e `worker.homolog_ready`;
5. somente então chamar `processNext`;
6. observar health por `CVG_HOMOLOG_HEALTH_INTERVAL_MS`, separado do sweep;
7. health falha: emitir `not_ready`, pausar claims; recovery reemite `ready`;
8. shutdown: `not_ready`, `requestStop`, `stop`, `close`, `stopped`.

### Operacional controlado

O mesmo evento `worker.readiness=ready` precede o primeiro `processNext` após
o preflight. Em PostgreSQL, o preflight estrutural é obrigatório; em memória,
`assertOperationalHarnessProfilePreflight` documenta e verifica a composição
sintética não durável, que continua proibida em produção. O evento
`worker.operational_harness_ready` identifica prontidão e o resumo de término
é `worker.operational_harness_completed`.

### Eventos legados de execução controlada

`worker.controlled_ready` é um marcador de prontidão com `processed=0` e é
emitido antes de `drain`; `worker.controlled_completed` carrega a contagem
final. O smoke sintético mantém `worker.controlled_smoke_passed` como evento
de conclusão compatível. O estado canônico continua sendo `worker.readiness`.

### PostgreSQL continuous

Preflight e prerequisites são concluídos antes de emitir readiness; readiness
é emitida antes de `ContinuousWorker.start()`. Shutdown marca `not_ready` antes
do drain. O perfil continua recusado em produção.

## Boundaries e falhas

- o preflight continua usando a lista de tabelas/migrations já verificada e
  limpa o contexto de tenant antes de devolver a conexão;
- o health check usa timeouts por probe e não lê payloads sensíveis;
- nenhum caminho adiciona envio de mensagem, consulta, provider, canal ou
  registro real;
- exporter externo/alertas são dependência de `REM21-011`, portanto a task
  registra somente a capacidade de emitir o sink JSON local e falha fechada se
  esse sink não aceitar o evento de readiness.

## Testes obrigatórios

- unitários para a máquina de estado e configuração fail-closed;
- health inicial com DB/fila sintéticos falhando;
- teste de processo PostgreSQL descartável para ordem ready→claim e SIGTERM;
- regressão do recovery/fencing existente;
- typecheck, lint, Prettier, links, diff e hashes com Node `v22.23.2`.
