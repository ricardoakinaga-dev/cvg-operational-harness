# REM21-006 — PRD

## Problema

Um consumidor pode começar a disputar trabalho antes de a aplicação ter
provado que o banco, RLS, grants, fila e health estão utilizáveis. O evento
atual de readiness também é tardio e a health fica acoplada ao sucesso de um
sweep, o que pode mascarar indisponibilidade ou declarar um processo pronto no
momento errado.

## Resultado esperado

Um worker local/homologado só pode consumir depois de um preflight estrutural
quando possui superfície PostgreSQL durável, ou depois do preflight explícito
do perfil sintético em memória. A transição é emitida antes do primeiro
`processNext`/`start`. Durante execução, health é observada em cadence própria;
se uma dependência falha, o worker fica `not_ready` e não faz novos claims até
recuperar. Ao receber shutdown, fica `not_ready` antes de drenar e termina em
`stopped`. Produção continua bloqueada.

## Critérios de aceitação

- **AC-01 — startup fail-closed:** arming, tenant, DB, RLS e controlled mode
  inválidos falham antes do worker estar pronto; `NODE_ENV=production` nunca
  inicia o perfil controlado/homologado.
- **AC-02 — preflight antes do consumo:** em runtimes duráveis, grants, tabelas,
  FORCE RLS, migrations e contexto de tenant são verificados antes do primeiro
  claim; o runtime em memória usa somente a composição sintética local
  explicitamente verificada e continua fora do escopo de durabilidade. Falha
  não emite `ready`.
- **AC-03 — readiness ordenada:** o evento de estado `ready` precede o primeiro
  consumo em todos os caminhos corrigidos; um runtime encerrado não emite
  `ready` depois do shutdown.
- **AC-04 — health independente:** a health inicial e os ticks posteriores
  executam fora do bloco de sweep e têm intervalo configurável próprio.
- **AC-05 — degradação segura:** health falha → `not_ready` e pausa de claims;
  health recupera → `ready` novamente; nenhum efeito externo é habilitado.
- **AC-06 — drain:** `SIGTERM`/`SIGINT` marcam `not_ready` antes do stop/close;
  a prova de processo preserva a recuperação/idempotência existente.
- **AC-07 — evidência honesta:** resultados, hashes, Node 22, limitações e
  ausência de I1/freeze são registrados; nenhum status de produção é
  promovido.

## Não objetivos

Produção, integrações reais, exporter externo, alertas/SLOs completos,
RPO/RTO, credenciais, piloto, agenda/ação clínica/financeira e fechamento
final de `A21-F05`/`A21-F09` para release. O fechamento candidate-bound fica
para `REM21-019`.
