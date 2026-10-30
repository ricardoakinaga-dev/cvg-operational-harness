# PAR-C01 BUILD — fatia 3 (SPEC 0290): overflow, `reason` aditivo e estimador único

Task `AUD0625-PAR-C01-D9-20261029`, branch `claude/aud0625-par-c01-d9`, sobre `b7d746a33` (P2 da fatia 2). Recibo:
`receipts/human-decisions-22.json`. Local, sintético, sem push. Produção `NO_GO`.

## O que entrou

- **D4 — sinal aditivo**: `ModelGatewayError.reason?: 'context_window'`, preenchido só na recusa de janela da C02. O `code` segue
  `invalid_request`, `retryable` segue `false` e a mensagem não muda; as demais recusas não têm `reason`.
- **D5 — estimador único**: `estimateInputTokens(contents)` em `@cvg/harness-contracts` (`token-estimate.ts`), reexportado por `@cvg/shared`.
  4 bytes UTF-8 por token + 4 de moldura por parte. O gateway (`projectInputTokens`, com o prompt de sistema como uma parte) e o harness
  (`estimateContextTokens`) usam a mesma função; os valores exatos da C02 não mudam (testes da C02 intactos e verdes). Para o harness o valor muda
  (antes 4 caracteres por token): o teste PDSH-025 do estimador foi atualizado com a justificativa (`ceil(12/4)+8=11`; bytes UTF-8 contam).
- **Retry de overflow no pipeline**: novo ponto `model/overflow` (waterfall, `KernelGate`). Em `runModelCall`, um erro da porta com
  `reason === 'context_window'` chama o ponto uma única vez; se algum controle trocou `request.messages`, o turno ganha **um** novo pedido
  (consome um slot do orçamento e é registrado como `model/request`, I6). Segundo overflow, erro sem a razão, nenhum controle que mude o pedido,
  turno cancelado ou sem slot: o resultado é o do erro original / cancelamento / parada de orçamento, nunca um terceiro pedido.
- `createModelCompactionControl` registra o mesmo tratamento em `model/before-call` (gatilho pelo teto) e em `model/overflow` (forçado, sem
  consultar o teto). Sem história a resumir, ou compactação que falha: `INSUFFICIENT_EVIDENCE` sem reenvio. O controle heurístico v1 não participa
  do overflow (declarado).

## Testes e mutantes

- `aud0625-par-c01-slice3-overflow.test.ts` (11): compacta e conclui com 2 pedidos; 2º overflow encerra com 2 pedidos e 1 compactação; razões
  inválidas (`undefined`, outra, caixa errada, erro simples, não-objeto) não repetem; sem controle mantém a falha; nada a compactar recusa;
  compactação que falha recusa; sem slot; cancelamento durante a compactação e por controle que mudou o pedido (`CANCELLED`); primeiro pedido que
  cabe vai uma vez.
- `aud0625-par-c01-context-window-reason.test.ts` (gateway, 3): `reason` na recusa de janela, ausência nas outras, identidade do estimador
  compartilhado, valores com não-ASCII.
- O último `it.fails` da fase 1 (overflow) virou `it`: **12/12 do arquivo RED verdes, nenhum `it.fails` restante**.
- Mutantes `mutations-slice3.json`: 13/13 mortos (S3-5 sobreviveu na 1ª rodada, pois o `race` já devolve `CANCELLED`; morto depois do caso
  `maxModelCalls: 1` + controle que cancela, registrado em `mutation-results-slice3.json`).

## Gates

- `packages` + `apps`: 406 arquivos / 4156 testes passam (33 arquivos pulados são os de Postgres/ambiente, como antes).
- Cobertura por arquivo (`CVG_COVERAGE_PER_FILE=1`): `compaction.ts`, `model-compaction.ts`, `kernel/pipeline.ts`, `kernel/host.ts`,
  `kernel/types.ts` em 100%. (`kernel/controls.ts:443` tem 1 ramo coberto só pela suíte de conformidade, fora desta fatia.)
- typecheck, eslint, prettier, `docs:check-links` verdes.

## Desvios e pontos a decidir

- O pedido de compactação continua sem `model/request` no log (enum fechado), como na fatia 2 (aguarda a decisão do Ricardo sobre os desvios 1–4).
- `COMPACTION` não entra no enum de `purpose` do schema de sessão, pelo mesmo motivo; o retry de overflow registra o pedido reenviado, cujo
  `purpose` é o do turno.
