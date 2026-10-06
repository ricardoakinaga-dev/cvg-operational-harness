# PR301 webhook replay fix — revisão independente I2

- Candidate: `/tmp/cvg-pr301-webhook-replay-20260928`.
- Resultado: `REVISE`; três achados P1 de contrato/integridade no caminho completo. A revisão aceitou clock fail-closed, precisão, hash integral dos triggers, RLS/preflight e o teste com dois processos/cleanup após a correção I1.
- Somente leitura; nenhum arquivo alterado e nenhum teste executado pelo revisor. Os cinco hashes de handoff coincidiram no início/fim.
- O revisor leu as SPECs 0160/0161 e recebeu a aprovação humana explicitada neste turno. Produção continua `NO_GO`.

## Achados

1. **P1 — Sem high-water durável.** `previousSample` é process-local e reinicia; um passo pequeno para trás dentro do orçamento de erro pode reabrir uma janela de timestamp antiga em outra instância/restart. O remédio estrutural depende da SPEC 0162/migration 0028, não aprovadas para BUILD. Evidência: `apps/api/src/webhook-event-inbox.ts:183`; SPEC 0160, seção A2.
2. **P1 — Sem reconciliação interna de pending vencido.** A reserva continua cifrada e durável, mas o caminho `reserve` rejeita HTTP após a janela e não há reconciliador que conclua B3. SPEC 0160 B1–B3 e SPEC 0161 §Commit exigem retomada interna sob autorização separada sem revalidar como HTTP. Evidência: `apps/api/src/webhook-event-inbox.ts:445`; nenhum reconciliador integrado no candidato.
3. **P1 — COMMIT final incerto vira erro genérico.** Se PostgreSQL efetivar a transação final e o cliente perder ACK, `withTenantTransaction` propaga falha e o catch da rota libera/retorna erro genérico sem distinguir `UNKNOWN_COMMIT` nem consultar o recibo committed. O teste atual cobre fence loss conhecido antes do commit, não perda de ACK após commit. Evidência: `packages/persistence/src/tenant-scoped-postgres.ts:198`, `apps/api/src/server.ts:1970` e `apps/api/src/__tests__/webhook-event-inbox.test.ts:1008`.

## Autoridade e limite de alteração

O usuário aprovou BUILD sintético de 0160/0161, mas o remédio de high-water requer gate humano separado da SPEC 0162. `apps/api/src/server.ts` tem claim ativo PR-L04 no quadro de coordenação; esta rodada não alterou esse arquivo. B3 e a classificação/resolução de `UNKNOWN_COMMIT` precisam de task/claim próprios e integração sem disputar esse caminho.

## Hashes verificados

| Artifact | SHA-256 |
| --- | --- |
| `apps/api/src/webhook-event-inbox.ts` | `8198fd4f1f0b7d9daccd050578a5b966c91594ea142af2f79186db0306476e04` |
| `apps/api/src/tenant-preflight.ts` | `1997e6fea10f25c9606dc7d6466393326f91c00642a0dababdc4b76ca9c27e02` |
| `apps/api/src/__tests__/webhook-event-inbox.test.ts` | `9a9b9eb470979f42fd0848a7b66339c2cb8ff54e7b6dd31ae2c2cad178d829b8` |
| `apps/api/src/__tests__/tenant-schema-inventory-postgres.test.ts` | `1f62791db7c4a42508a0dbbdec2762d066b4e08804e5c876a8aa5692a480035d` |
| `apps/api/src/__tests__/fixtures/webhook-inbox-process-worker.ts` | `68fc8d8830b3bf2534115eb5ffb1ac9a61d19d344a28082396617a5d9e96a351` |
