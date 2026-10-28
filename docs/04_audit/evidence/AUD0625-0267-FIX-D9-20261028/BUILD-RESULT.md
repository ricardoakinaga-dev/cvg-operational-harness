# AUD0625-0267-FIX-D9-20261028 — correções da revisão da sessão 07 ao BUILD da SPEC 0267

Revisão: `claude/aud0625-review-07 @ 26a4cd55`, `AUD0625-REVIEW-0267-FOLLOWUP-07-20261028/REVIEW.md` (BUILD `d6d92958`: APPROVE_WITH_FINDINGS). Esta rodada só acrescenta commits novos sobre `d6d92958`. **A SPEC 0267 não foi tocada.** Node v22.23.2; só `vitest` focado com `--maxWorkers=2`.

## O que mudou

- **R2 (P3, código):** `TokenMeter.recordModelResult` passa a respeitar `usageStatus`. Um resultado `unreported` conta em `unreportedRequests` e **não soma** o limite superior como medição (`token-meter.ts`).
- **R1 (P2, teste):** o teste "marks the gateway result as unreported…" era vazio (a reserva de 0,5 já dava 0,5). Foi trocado por três casos com `pricing > 0` que afirmam o custo exato do limite superior (bytes da entrada renderizada como tokens de entrada, `maxTokens` como saída), o piso da reserva quando ela é maior que o limite, e que o orçamento é cobrado uma só vez.
- **R3, R3b, R4, R5, R6 (P3, testes)**, em `aud0625-0267-review-fix.test.ts`:
  - mensagem dinâmica adulterada depois da renderização é recusada pelo adaptador;
  - cada camada do adaptador sozinha, com bindings forjados e consistentes: instrução diferente e segundo `system`;
  - evento `completed` com `usage_unreported`, medidor, evento `failed` com custo e tokens (uso não reportado e uso reportado) e uso parcial;
  - duas mensagens `system` idênticas são recusadas (`prompt_content_mismatch`), o que a SPEC pede ("no máximo uma");
  - ponta a ponta: o adaptador real serializa um único `system` igual ao texto aprovado e as mensagens dinâmicas em ordem.

## Mutações (as 22 da revisão, mesmo script)

[mutations-all-22.json](mutations-all-22.json): **21 morrem.** Antes da correção, 12 sobreviviam (M6, M7, M8, M9, M11, M12, M14, M15, M16, M17, M18, M19). Hoje só **M18** sobrevive ("settle cobra a reserva de novo"): é código defensivo inalcançável, porque só `schema_invalid` falha depois da contabilização e não é retentável, então nunca há uma segunda tentativa contabilizada na mesma reserva. Fica registrado, sem teste possível por fora; se preferirem, o `reservationSettled` pode sair do gateway num commit à parte.

## Gates

[gates.txt](gates.txt): typecheck exit 0; eslint do pacote e do teste do servidor de falhas exit 0; `vitest` de `packages/model-gateway` e `tests/model-fault-server.test.ts` com 12 arquivos e **225 testes** passando (eram 212); prettier sem diferenças.

## R6, o servidor de falhas

O servidor da SPEC0232 fixa um corpo de uma única mensagem `user`, então o corpo real com o `system` aprovado não passa por ele (follow-up F06b: estender o oráculo). A ponta a ponta foi promovida a teste permanente com o **adaptador OpenAI-compatível real** sobre um `fetch` que captura o corpo serializado; os 6 casos MF continuam pelo caminho do gateway com o adaptador de teste.

## R7 a R9, só registro

- **R7:** a reresolução do prompt (`#assertPromptStillApproved`) roda antes do `try` de cada tentativa; numa revogação entre tentativas lança `prompt_revoked`/`prompt_hash_mismatch` sem emitir `model.call.failed` daquela tentativa. Efeito só de observabilidade.
- **R8:** o limite superior do uso não reportado supõe que o provider respeita `max_tokens`; um provider que ignora o limite gera saída maior que a contabilizada, e um `usage` 0/0 reportado é confiado (a SPEC trata o zero reportado como legítimo).
- **R9:** o BUILD da 0267 alterou a linha de estado e a §8 da SPEC (sha256 `d0d8b19c…` → `76b76479…`), diferente da prática das 0268/0272 (SPEC intacta, estado na evidência). Registrado; o recibo cita o hash anterior.
