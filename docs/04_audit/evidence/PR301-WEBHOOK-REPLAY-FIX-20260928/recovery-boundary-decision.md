# Decisão de arquitetura — reconciliação B3 e COMMIT incerto

**Estado:** `DECISION_READY / IMPLEMENTATION_WAITING_FOR_PATH_CLAIM / NO_GO`  
**Base:** commit local isolado `aad04d9ace6ed5b6d9c9902f4ddcad67b87a4abc`; SPECs 0160/0161 aprovadas somente para BUILD sintético.

## Problema e invariantes

Fechar dois P1 da revisão I2: retomar um evento `pending` depois de expirar sua assinatura HTTP, e responder corretamente quando a conexão falha durante o COMMIT final. O sistema deve produzir no máximo uma mensagem/outbox/auditoria por `event_key`; o `webhook_event_inbox` e esses efeitos locais devem confirmar juntos; toda retomada mantém tenant, binding e lease generation; um resultado confirmado após perda do ACK retorna o mesmo receipt. Nenhum retry externo pode ocorrer sem idempotência/reconciliação comprovada pelo provider.

## Evidência atual (`CURRENT`)

- `server.ts` valida o webhook, reserva o inbox e cria `inboundFinalizer`; `receiveInboundMessage` chama `createWithSessionAndOutbox` e esse finalizer confirma inbox e auditoria na mesma transação PostgreSQL (`server.ts` no candidato isolado, linhas 1659–1745).
- A rota chama `reserve()` no caminho HTTP. Esse método valida `signature_expires_at`/timestamp; não é adequado como mecanismo B3 depois que a assinatura expira.
- O `catch` da rota libera o lease e converte o erro para resposta HTTP. O wrapper `withTenantTransaction` trata falha de `COMMIT` no mesmo `catch` genérico, tenta `ROLLBACK` e propaga o erro sem classificar `UNKNOWN_COMMIT` nem consultar o receipt durável (`tenant-scoped-postgres.ts:190–215`; rota `server.ts:1970–1985`).
- `apps/api/src/server.ts` está reivindicado pela PR-L04 no [quadro de coordenação](../../../08_runtime/agent_coordination.md). Esta decisão não altera esse caminho.

## Contrato proposto para a próxima fatia (`PROPOSED`)

Extrair um único serviço de processamento inbound compartilhado. A rota HTTP fornece uma prova HMAC vigente e uma lease de reserva; um reconciliador interno autenticado obtém uma lease própria para `pending` expirado e usa o ciphertext/binding já validados, sem fingir que recebeu uma assinatura HTTP nova. Ambos chamam o mesmo processamento e finalizador transacional. O reconciliador não deve enumerar tenants por bypass de RLS; o principal, fonte de tenants elegíveis, agenda e autorização operacional ainda precisam ser definidos antes do BUILD.

Na fronteira PostgreSQL, uma falha de transporte durante COMMIT deve destruir a conexão e ser exposta como resultado explicitamente incerto. O chamador não libera lease nem afirma rollback. Faz read-back tenant-scoped no primário; se o inbox estiver `committed`, devolve o receipt persistido; se continuar `pending`, deixa a posse expirar para reconciliação. Divergência ou indisponibilidade resulta em handoff/erro transitório, nunca em reexecução cega.

## Alternativas rejeitadas

- **Worker paralelo que duplica o handler HTTP:** rejeitado; cria regras divergentes e pode separar mensagem/outbox do inbox/auditoria.
- **Scan global de pending sob role privilegiada:** rejeitado sem contrato explícito de identidade, tenant discovery, RLS e auditoria; não se presume que o job possa ignorar a quarentena tenant-scoped.
- **Tratar todo erro de COMMIT como rollback:** rejeitado; perda de ACK não prova ausência de commit.
- **Retry automático do provider:** rejeitado sem contrato D-06, idempotency key aceita ou consulta de reconciliação demonstrada.

## Dependências e prova exigida

Implementação conectada exige que PR-L04 libere `apps/api/src/server.ts` e que um task/claim T3 próprio delimite o módulo compartilhado, leitor/claim de pending, classificação `UNKNOWN_COMMIT`, read-back e integração. Não exige migration se 0027 atender ao contrato; qualquer delta de schema requer SPEC/gate próprio. Antes de aceitar: PostgreSQL 16 descartável, dois processos, crash após reserve; assinatura expirada; concorrência/takeover; crash depois do COMMIT antes do ACK; perda de conexão durante COMMIT com desfecho committed e rollback; inspeção SQL comprovando exatamente uma mensagem, outbox, auditoria e receipt; tenant cruzado negado; ausência de duplicate dispatch externo. Executar E2E na rota integrada e revisão independente hash-bound.

**Não executado nesta decisão:** worker, classificação/read-back no runtime, injeção de perda de ACK, E2E integrado ou teste de provider. Os três P1 de I2 permanecem abertos; high-water depende da SPEC 0162/0028 ainda sem revisão/BUILD autorizado. Produção `NO_GO`.
