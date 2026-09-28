# SPEC-PR301-WEBHOOK-INBOX-SCHEMA-001 — delta T3 do inbox durável

- Task: subtask `PR-301-WEBHOOK-REPLAY-SCHEMA` de `PR-301-WEBHOOK-REPLAY` no [0356](../03_build/0356_production_backlog_2026-09-26.md).
- Depende da [SPEC 0160](0160_webhook_replay_window_and_processing_fence.md), aprovada para BUILD T3 sintético.
- Trilha: **T3**. Estado `BUILD_T3_APPROVED_USER / SYNTHETIC_ONLY / IMPLEMENTATION_IN_PROGRESS`; aprovação explícita recebida em 28/09/2026, somente migration/testes sintéticos.
- Escopo após aprovação: migration aditiva `0027_webhook_event_inbox.sql`, runner/catalog/preflight, API/store e testes em worktree isolado com PostgreSQL 16 e tenants/payloads sintéticos. Não executar upgrade de banco compartilhado, segredo real, canal/provider, push, deploy ou produção.

## Motivo e limite

A seção B da SPEC 0160 requer gravar, antes do inbound, vínculo imutável e payload verificável cifrado; exige também geração monotônica que sobreviva a release e takeover e referências write-once no commit. A tabela atual `webhook_replay_events` não comporta esses campos e é compartilhada pelo replay de token de operador. Não a reutilizar nem alterar sua semântica nesta fatia. Criar um inbox tenant-scoped separado para eventos HMAC.

## Contrato do schema

Criar `webhook_event_inbox` com:

- `event_key` como PK derivada de namespace de credencial estável, canal e `eventId`; guardar esses três componentes para auditoria e impor unicidade composta.
- `tenant_id`, `external_message_id`, `body_sha256` (64 hex minúsculos), `signed_at`, `signature_expires_at` e payload criptografado AES-256-GCM: `payload_ciphertext`, nonce de 12 bytes, tag de 16 bytes e `payload_key_id` não secreto. Nunca persistir corpo em claro, assinatura HMAC ou segredo.
- `state` (`pending`/`committed`), `lease_generation` bigint monotônica, `lease_token` opaco anulável, `lease_expires_at`, e referências `message_id`/`outbox_id` nulas até commit final. PK e campos de binding são imutáveis; referências só passam uma vez de NULL a valor.
- `tenant_isolation_quarantined`, timestamps UTC e constraints para digest, estados, nonce/tag, geração, lease e transição de referências. `pending` pode estar sem lease após release, mas retém binding e ciphertext; takeover incrementa geração sem apagar/reciclar a linha.
- `pending` nunca é removido por TTL. Limpeza só considera `committed`, depois da retenção configurada/aprovada e com registro de auditoria. Índices parciais cobrem takeover de pendentes e limpeza de finalizados.

## Isolamento e privilégio

- Registrar `webhook_event_inbox` no inventário canônico `TENANT_SCHEMA_INVENTORY`, no preflight produtivo e no catálogo de migrations. Habilitar e forçar RLS; política e grants seguem o contexto transacional `cvg.tenant_id` e a quarentena, como as demais tabelas tenant-scoped.
- A reserva ocorre somente após HMAC e resolver de tenant vinculado à credencial; a store usa pool tenant-scoped e define contexto antes de ler/inserir. O evento e seu ciphertext nunca são consultados globalmente pelo handler.
- Migration owner é distinto do runtime role. Runtime recebe só DML necessário via grants verificados; não recebe DDL, `BYPASSRLS`, ownership nem acesso ao segredo da chave de cifra. O preflight valida OID/colunas/tipos/not-null/constraints/índices, RLS+FORCE/policy, owner e grants efetivos, falhando fechado em drift.
- Chave AES vem da configuração secreta gerenciada na composição produtiva e é injetada no cipher; testes usam chave sintética. Rotação conserva `payload_key_id` para decifrar pendentes até reconciliação/retention. Sem chave configurada ou decryption key ausente, ingress fecha e evento vai para alerta/handoff, nunca é descartado nem reprocessado em claro.

## Commit e transição

1. `reserve`: transação tenant-scoped insere o binding/ciphertext quando novo; conflito confere tenant, namespace/canal/eventId, external ID e digest; divergência falha fechado. Reserva/takeover grava lease token e incrementa geração sob lock. Um binding existente sem lease pode ser retomado com a intenção cifrada persistida.
2. `commitInbound`: uma conexão e uma transação verificam `event_key`, tenant, `lease_generation`, token e lease vigente; nela gravam mensagem, outbox, auditoria durável e referências finais, mudando `state` a `committed`. O worker só enxerga outbox após COMMIT. Token antigo não pode gravar nem liberar o novo lease.
3. `lookup`: só com tenant scope e relógio saudável; evento committed idêntico retorna receipt; payload divergente falha fechado. Evento pending e assinatura expirada não é aceito por HTTP; um reconciliador interno, com autorização separada, pode retomar o ciphertext já validado.
4. Alteração após deployment exige migração aditiva/forward-only. Rollback de aplicação é seguro porque nenhum handler antigo é promovido como GO e ingress permanece fechado até preflight; não remover tabela/ciphertext pendente automaticamente.

## Verificação exigida

- Migration real em PostgreSQL 16 limpo, preflight passa no schema correto e recusa: tabela/policy ausente, constraint homônima mas semanticamente errada, RLS sem FORCE, grant indevido, owner/BYPASSRLS, coluna/codec incompatível.
- Testar isolamento de dois tenants, cannot-read/cannot-write cruzado, quarantine, grants mínimos e transições imutáveis. Provar que `pending` sobrevive ao cleanup; `committed` só expira após retenção; geração cresce após takeover e impede ABA.
- Provar cifra AES-GCM: plaintext não aparece em SQL/logs/artefatos; decrypt com chave correta, falha com tag/chave errada; chave ausente fecha serving; rotação de key id ainda recupera pending.
- Dois processos PostgreSQL no BUILD da SPEC 0160 devem exercitar binding/reserva/commit atômico. Esta SPEC **não** declara resolvido qualquer P1 do AUD-0587, não autoriza canal real e não altera outras migrations/evidências.

## Gates e aceite

- Crítica independente do delta e aprovação humana T3 antes de código de migration/runner/preflight.
- Node 22: typecheck, lint, testes focados, `npm test`, PostgreSQL 16 com migrations reais e sem skips; E2E/coverage como exige a SPEC 0160. Registrar digest dos arquivos, logs SQL/HTTP redigidos e limpeza do banco descartável.
- Atualizar [0190](0190_spec_validation.md), [0356](../03_build/0356_production_backlog_2026-09-26.md) e ledgers após decisão e execução. Esta SPEC não concede GO; 0354 aplica-se integralmente.

## Revisão

- Crítica técnica independente: indisponível nesta rodada (`agent thread limit reached`); revisei o delta contra o inventário/preflight/schema atual. A aprovação humana cobre BUILD sintético, não produção.
- Aprovação humana T3: usuário aprovou BUILD sintético da SPEC 0161 em 28/09/2026.
