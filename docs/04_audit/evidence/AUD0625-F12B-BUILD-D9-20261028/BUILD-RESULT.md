# AUD0625-F12B-BUILD-D9-20261028 — resultado do BUILD da SPEC 0273 (exam-egress, F12b)

Base `ba965eab` (+ fase 1 `cd754e6c`). Node v22.23.2. Sem push/PR. Autoridade: o Ricardo aprovou a SPEC 0273 "como está" (recibo `docs/04_audit/evidence/USER-DECISIONS-20261028/human-decisions-4.json`, sha256 `45106f97…`, ligado ao sha256 `f9dfc655…` da SPEC). **O texto normativo da SPEC 0273 não foi alterado**; este arquivo registra o resultado, como fez a 0268.

## Mudança

`packages/channel-gateway/src/exam-egress.ts`: no upload, resposta com `status >= 500` depois do envio (`statusEffectOptions(status).effectUnknown`, o mesmo predicado da 0268) faz `markUncertain(identity, leaseOwner, 'effect_uncertain')` e devolve `FAILED` com `effect_uncertain: reconcile before retry (HTTP <n>)`. Inalterados (Q1, Q2): `exam.download` com qualquer status, 4xx e 429 no upload (FAILED `provider_rejected`, sem reenvio), 2xx, conexão perdida, deadline e corpo acima do teto (UNCERTAIN).

## Testes

- `aud0625-f12b-exam-egress-uncertain.test.ts`: os 4 `it.fails` (upload 500/502/503/504 → UNCERTAIN, 1 tentativa, 2ª chamada não reenvia) viraram `it` e passam. Foi retirado o teste de caracterização "hoje um 503 é gravado FAILED", que descrevia o defeito e foi invertido pelos 4 casos novos; os 9 controles ficaram.
- **Teste antigo ajustado (Q3), com justificativa:** `pdsh-016-exam-egress.test.ts:258–280` ("marks the journal FAILED when the provider rejects") usava um 503 como exemplo de "rejeição definitiva". Pela SPEC, um 503 no upload é incerto. O teste passou a usar um 400 (`op-upload-400`), que continua afirmando `FAILED` no resultado e no journal; a intenção "rejeição definitiva do destino é FAILED" está mantida e não foi enfraquecida. O caso do 503 no upload agora é afirmado pelos 4 testes novos. O teste do download com 503 (`:450–459`: replay FAILED sem reenvio) não mudou.

## Mutações (41 testes: `aud0625-f12b-exam-egress-uncertain` + `pdsh-016-exam-egress`)

[mutations.txt](mutations.txt): **8 mutações, 8 morrem**.

| Mutação | Falhas |
| --- | --- |
| volta o 5xx do upload para FAILED | 4 |
| limiar `> 500` | 1 |
| limiar `>= 502` | 1 |
| 4xx (inclui 400 e 429) vira incerto | 3 |
| 429 vira incerto | 1 |
| download também vira incerto | 2 |
| só a mensagem, sem gravar no journal | 4 |
| estado UNCERTAIN com a mensagem antiga | 4 |

## Gates (Node 22)

[gates.txt](gates.txt): `npm run typecheck` exit 0; `npm run lint` exit 0; `npx vitest run packages/channel-gateway` (inclui os testes novos); gitleaks sem achados.

## Cruzamento com o follow-up 358d981b

O follow-up (`claude/aud0625-followup-d9`) também edita `packages/channel-gateway`, mas em `adapters/bounded-body.ts` e nos testes dos adaptadores. Este BUILD só edita `exam-egress.ts` e dois arquivos de teste (`aud0625-f12b-*`, `pdsh-016-*`) e apenas **importa** `statusEffectOptions` (já existente em `ba965eab`). Nenhum trecho em comum; o merge deve ser limpo.
