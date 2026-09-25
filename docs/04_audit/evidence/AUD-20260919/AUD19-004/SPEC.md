# SPEC — AUD19-004 — Idempotência de outbox vinculada ao conteúdo

- programa: `AUD-20260919-REMEDIATION`; onda: `W1`; gate: `G1` ✅ + `AUD19-002` ✅.
- aprovação técnica: prompt humano de 2026-09-19; escopo local/sintético,
  reversível, fail-closed. Sem migration (comparação em camada de aplicação
  sobre a chave única existente); sem serviço externo; sem dado real.

## Diagnóstico (F-06)

`PostgresRuntimeRepository.enqueue` (`postgres.ts:953-1009`) e
`OutboxRepository.enqueue` (`outbox.ts:190-...`) devolvem o vencedor por
`(tenant_id, idempotency_key)` sem comparar tipo/versão/payload: a mesma
chave com conteúdo divergente é aceita silenciosamente.

## Decisão de desenho

Vínculo canônico (sem schema change — chave única existente é suficiente;
comparação é autoridade, reversível por remoção de código):

- `computeOutboxContentHash({tenantId, type, envelopeVersion, payload}) =
sha256(canonicalizeJson(...))` em `packages/persistence/src/outbox-content-hash.ts`
  (usa `canonicalizeJson` de `@cvg/shared`; sem nova dependência).
- Memory: `enqueue` com chave existente → hash igual devolve clone;
  divergente → `DomainError('conflict', ...)` fail-closed. Caminho legado
  (`enqueueLegacy`, sem chave) inalterado.
- PG: hash da entrada comparado em TODOS os retornos de vencedor (SELECT
  inicial e re-leitura pós-`ON CONFLICT DO NOTHING`); divergente →
  `DomainError('conflict')`. Hash do vencedor recomputado do payload
  ARMAZENADO BRUTO (pré-sanitize de leitura, i.e. a forma asserida) —
  placeholders de redação nunca entram no vínculo. Concorrência divergente:
  perdedor do conflito relê o vencedor e rejeita — nunca aceita silencioso.
- Redelivery (webhook duplicado): `enqueue` estrito + convergência por lookup
  — novo `findByIdempotencyKey` (memory + PG; opcional em
  `DurableOutboxAdapter`) usado pelo fallback durable-inbound ao receber
  `conflict`. Redação de privacidade preservada: payloads idênticos
  pós-redação convergem (sem falso-conflito).
- Payload comparado é o pós-validação/redação de cada store (forma
  determinística que cada lado persiste/lê).

## Critérios de aceite (congelados)

1. RED→GREEN: replay divergente hoje devolve o vencedor (prova RED); depois
   rejeita com `conflict` sem mutar o vencedor.
2. Replay idêntico (reordenação de chaves inclusive) devolve o mesmo registro.
3. Concorrência divergente no PG: um vence, outro recebe `conflict`.
4. Restart (nova instância sobre o mesmo banco): divergente rejeita,
   idêntico converge.
5. `typecheck`, `lint`, `format:check`, `git diff --check` PASS.

## Arquivos (congelados)

- novos: `packages/persistence/src/outbox-content-hash.ts`,
  `packages/persistence/src/__tests__/outbox-content-binding.test.ts`,
  `packages/persistence/src/__tests__/outbox-content-binding-postgres.test.ts`;
- editados: `packages/persistence/src/outbox.ts`,
  `packages/persistence/src/postgres.ts`, `package.json` (`test:postgres`).

## Evidência

- `docs/04_audit/evidence/AUD-20260919/AUD19-004/`
