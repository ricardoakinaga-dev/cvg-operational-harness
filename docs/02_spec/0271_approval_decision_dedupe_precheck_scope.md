# 0271 — SPEC (rascunho, discovery): pré-check da migration 0021 e eventos de atendimento (AUD0625 F15)

Status: `DRAFT_DISCOVERY` — somente leitura estática; SQL **não** executado; nenhuma migration alterada. Trilha T3 se implementada (migration/dados).

## Recon

- `packages/persistence/migrations/0021_approval_decision_audit_dedupe.sql:32-38`: o pré-check conta grupos de `type = 'approval_decision'` por `COALESCE(tenant_id,''), payload->>'approvalId', payload->>'decision'` com `COUNT(*) > 1` e aborta com `23505`.
- `packages/persistence/src/attendance-approval.ts:65-80` (`attendanceDecisionAudit`): eventos de atendimento também têm `type: 'approval_decision'`, mas o payload usa `approvalRequestId`/`status` (sem `approvalId`/`decision`).
- Consequência estática: dois ou mais eventos de atendimento no mesmo tenant formam o grupo `(tenant, NULL, NULL)` e o pré-check falha, embora o índice UNIQUE (`:46-51`) trate NULLs como distintos e nunca rejeitaria esses eventos.

## Proposta (a validar)

1. Restringir o pré-check à população que o índice efetivamente deduplica: acrescentar `AND payload->>'approvalId' IS NOT NULL AND payload->>'decision' IS NOT NULL` (ou as mesmas condições no `WHERE` do índice, mantendo pré-check e índice alinhados).
2. Como 0021 é migration histórica: aplicar como forward-fix conforme o contrato de migrations (nova migration/guard) e não reescrever 0021 onde já aplicada; decidir o tratamento para bancos em que 0021 ainda não rodou.
3. Decidir se eventos de atendimento deveriam ter chave de dedupe própria (`approvalRequestId`/`status`) — fora deste rascunho.

## Critérios de pronto (futuros)

- Campanha PG com histórico misto (decisões do harness + 2 eventos de atendimento por tenant): pré-check passa, índice cria, duplicata real continua sendo recusada.
- Teste do contrato de migrations atualizado; revisão T3 antes de qualquer alteração.

## Limites

Nenhum PG foi executado nesta rodada; o defeito é inferido por leitura e precisa de prova em banco antes de decidir a correção.
