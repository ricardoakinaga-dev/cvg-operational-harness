# SPEC 0273 — Egress de exames: 5xx depois do envio fica UNCERTAIN (AUD0625 F12b)

Data: 28/10/2026. Estado: **PROPOSED_FOR_HUMAN_T3_REVIEW**. Trilha T3 (muda a semântica de efeito incerto do journal de uma ferramenta de egress de exames). BUILD **não autorizado** até revisão explícita do Ricardo. Produção continua NO_GO.

Task: `AUD0625-F12B-EXAM-EGRESS-D9-20261028`. É delta da [SPEC 0268](0268_channel_uncertain_after_send.md) (invariante 1) e da [SPEC 0201](0201_pdsh016_exam_egress.md) (PDSH-016, egress de exames; §3 "uncertain é o estado para timeout/abort de rede"). Base: `ba965eab` (tem o helper `statusEffectOptions` e a semântica 0268). Follow-up F12b registrado pela 0268.

## 1. Recon (CURRENT, `packages/channel-gateway/src/exam-egress.ts` em `ba965eab`)

| Situação depois que o pedido saiu (`sent = true`, `:325`)                         | Hoje                                                                                                    | Onde       |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------- |
| Resposta HTTP **não-2xx** (400, 429, **500, 502, 503, 504**…), upload ou download | `journal.fail(…, 'provider_rejected')` → estado **FAILED**; resultado `provider rejected <op> (HTTP n)` | `:344–356` |
| `fetch` lança (conexão perdida), deadline ou abort                                | `markUncertain` → **UNCERTAIN**; resultado `effect_uncertain: reconcile before retry`                   | `:397–408` |
| Corpo acima do teto do transporte (`ResponseTooLargeError`)                       | cai no mesmo `catch` → **UNCERTAIN**                                                                    | `:397–408` |
| Download: corpo inválido ou grande demais depois de 2xx                           | `fail(…, 'invalid_payload')` → FAILED (GET, sem efeito remoto)                                          | `:361–366` |
| `complete` não confirma (lease perdida)                                           | `markUncertain` → UNCERTAIN                                                                             | `:389–392` |

O journal trata FAILED como terminal com **replay**: `reserve` devolve `replay` e a ferramenta responde `effect replay: FAILED` sem novo envio (`effect-journal.ts:251–253`). Portanto **hoje não há reenvio automático** e o journal **não libera** a operação (não existe `release` neste caminho depois do envio).

Testes que fixam o comportamento atual: `pdsh-016-exam-egress.test.ts:258–280` (upload 503 → FAILED) e `:450–459` (download 503, replay FAILED sem reenvio).

## 2. Comparação com o invariante 1 da 0268

Invariante 1 (0268): "nenhum reenvio automático de operação cujo pedido já saiu e cujo efeito não é provadamente ausente."

- **Reenvio automático:** respeitado. Nenhum 5xx libera o journal.
- **Estado registrado:** não respeitado para o **upload**. Um 5xx prova que o pedido chegou ao destino, mas não prova que o efeito não ocorreu (502/504 de proxy, 500 depois de processar). A ferramenta grava FAILED ("provider rejected"), o mesmo defeito que a 0268 corrigiu nos canais. Consequência: quem reconcilia lê "não enviado" e cria uma nova `operationKey`, e o exame (dado clínico) pode chegar duas vezes ao destino. Com UNCERTAIN o journal bloqueia a chave e exige reconciliação.
- **Assimetria interna:** o mesmo upload dá UNCERTAIN se a resposta se perde, se o deadline estoura ou se o corpo passa do teto; só o 5xx pequeno vira FAILED.
- **Download (GET):** não tem efeito remoto a reconciliar; FAILED é adequado. Não há defeito.

Conclusão: **há o mesmo defeito, restrito ao upload com 5xx.**

## 3. Mudança proposta

1. Em `exam.upload`, resposta com `status >= 500` depois do envio: `journal.markUncertain(identity, leaseOwner, 'effect_uncertain')` e resultado `FAILED` com `effect_uncertain: reconcile before retry`, igual ao caminho do `catch`. O predicado é o do helper `statusEffectOptions` da 0268 (`adapters/bounded-body.ts`), para os dois lugares não divergirem.
2. Inalterados: 4xx e 429 no upload → FAILED (`provider_rejected`, sem reenvio; para repetir, nova `operationKey`); upload 2xx → CONFIRMED; `exam.download` com qualquer status → como hoje (FAILED para não-2xx); falha de conexão, deadline e corpo acima do teto → UNCERTAIN.
3. O 429 **não** passa a "liberar" como nos canais: a 0201 não tem caminho de nova tentativa por `operationKey` e a decisão é do aprovador, então FAILED é a direção segura (ver Q2).
4. Atualizar o teste `pdsh-016-exam-egress.test.ts:258–280`: ele usa 503 como exemplo de "rejeição" e passa a afirmar UNCERTAIN para o upload 503; o caso de rejeição definitiva passa a usar 400. O teste do download 503 (`:450`) não muda.
5. Runbook de reconciliação: acrescentar que um 5xx no `exam.upload` deixa a operação incerta (como a 0268 fez para canais).

## 4. Critérios de pronto

- C1: upload 500, 502, 503 e 504 → estado UNCERTAIN, 1 tentativa, 2ª chamada com a mesma chave não reenvia (`effect not reserved: uncertain`), resultado contém `effect_uncertain`.
- C2: controles inalterados: upload 400 e 429 → FAILED; 2xx → CONFIRMED com replay sem reenvio; conexão perdida, deadline e corpo acima do teto → UNCERTAIN; download 503 → FAILED.
- C3: os 4 `it.fails` do arquivo de caracterização viram `it` e passam; o teste `:258–280` é ajustado como em §3.4 e a justificativa fica na evidência; nenhum teste é enfraquecido.
- C4: `npm run typecheck`, `npm run lint`, `npx vitest run packages/channel-gateway` em Node 22.

## 5. Testes

Fase atual (feita): `packages/channel-gateway/src/__tests__/aud0625-f12b-exam-egress-uncertain.test.ts`, 14 testes: 4 `it.fails` do comportamento-alvo (upload 500/502/503/504) e 10 controles que passam hoje e depois (caracterização do 503 atual; sem reenvio da mesma chave; 400; 429; fetch que lança; deadline; corpo acima do teto; 2xx com replay; download 503; download com conexão perdida). Os 4 `it.fails` falham hoje por `expected 'FAILED' to be 'UNCERTAIN'` ([saída RED](../04_audit/evidence/AUD0625-F12B-EXAM-EGRESS-D9-20261028/red-output.txt)).

## 6. Riscos

- Mais uploads ficam em UNCERTAIN durante instabilidade do destino e exigem reconciliação humana; é o custo de não duplicar um exame (dado clínico) no destino. Monitorar o código `effect_uncertain` por destino.
- Consumidores que lessem "provider rejected (HTTP 5xx)" no texto do erro passam a ver `effect_uncertain`. Nenhum host de produção usa `exam.upload` hoje (ferramenta de PDSH-016 sob aprovação obrigatória).
- Observação, fora do escopo: com um `fetchImpl` injetado que ignora o `signal`, a ferramenta espera para sempre (diferente dos adaptadores de canal, que usam `raceSignal`). O transporte padrão honra o sinal; não é defeito de produção.

## 7. Decisões pedidas ao Ricardo

- **Q1.** Aplicar o UNCERTAIN só ao `exam.upload` (recomendado: o GET não tem efeito remoto), ou também ao `exam.download`?
- **Q2.** Manter 429 e 4xx como FAILED no upload (recomendado, sem caminho de nova tentativa por chave), ou liberar o 429 como nos canais?
- **Q3.** Ajustar o teste `pdsh-016:258–280` para o novo contrato (recomendado) em vez de manter 503 como rejeição.

## 8. Fora de escopo e não-aprovações

Sem implementação nesta fase; sem push, PR ou merge; sem provider, canal ou dado real. A aprovação desta SPEC pelo Ricardo é condição para o BUILD; esta entrega não é aceite.
