# PAR-C02 — resultado do BUILD (SPEC 0285)

Task `AUD0625-PAR-C02-SPEC-DF-20261029`, Claude DF (Opus), 29/10/2026. Esta é a implementação; a revisão independente fica com uma sessão não autora. Produção `NO_GO`.

## Autorização

Recibo [human-decisions-18](../USER-DECISIONS-20261028/human-decisions-18.json), sha256 `f230bce8…`. O Ricardo aprovou D1 e D2+D3 da [SPEC 0285](../../../02_spec/0285_model_gateway_attempt_usage_and_request_pressure.md), sha `53d6ecb0…`, e a SPEC não mudou depois da aprovação. D3b (sem fallback), T-1 e T-2 estão no texto aprovado.

## Mudança

- **`gateway.ts`, D1.**
  - Toda tentativa que falha emite o próprio `model.call.failed`, com o uso já cobrado, antes do `model.retry.scheduled`.
  - O `failed` final duplicado foi removido; o de cada tentativa é o único.
- **T-1.** O cancelamento no backoff fecha a tentativa que não começou: `attempt + 1`, `detail: 'not_started'` e sem tokens.
- **D2.**
  - `projectInputTokens`: `ceil(bytes UTF-8 / 4) + 4 × (mensagens + system)`.
  - É calculado uma vez, antes do orçamento, e vai em cada `model.call.started` como `projectedInputTokens`.
- **D3.**
  - `ModelProfile.contextWindow` é opcional; um valor inválido falha na construção do gateway.
  - Se a projeção mais `request.maxTokens ?? profile.maxTokens` passar da janela, a chamada é recusada com `invalid_request`, não repetível. Isso acontece antes da reserva, sem provider, sem evento e sem custo.
  - Como a recusa não é repetível, não aciona o fallback.
- **`contracts.ts`.** Dois campos opcionais, sem export novo nem código de erro novo.

## Teste antigo ajustado

`aud0621-0248-gateway-cancel-cost.test.ts`, nos dois testes de abort durante o backoff (AC17):
- O que eles provam continua igual: uma só chamada ao provider, nenhuma tentativa nova e o último evento `cancelled`.
- Com a D1 aprovada, a tentativa 1 passa a registrar a falha real (`provider_unavailable`). Pela T-1, o cancelamento fica com a tentativa 2, marcada `not_started`.

## Provas (Node 22, `--maxWorkers=2`)

- `aud0625-par-c02-pressure.test.ts`, 15 testes:
  - os 4 alvos da fase 1 viraram `it` e passam;
  - os 3 controles continuam passando;
  - 8 testes novos de BUILD: terminal único por tentativa e reconstrução do medidor em 4 sequências mistas, falha antes de saída repetida sem tokens, densidade e UTF-8 multibyte, moldura por mensagem, fronteira da janela com `request.maxTokens`, recusa sem orçamento e sem evento, recusa sem fallback, janela inválida na construção.
- `packages/model-gateway`: 16 arquivos, 281/281.
- Consumidores (`tests/model-fault-server.test.ts`, `agent-runtime`, `chaos`): 395 passam e 2 pulam (PG).
- Mutações (`mutate-c02.py`, no scratchpad do DF): 15/15 mortas. As três mais complexas foram conferidas uma a uma e morreram por asserção, não por erro de sintaxe:
  - sem failed na tentativa repetida; failed depois do retry;
  - failed sem tokens; tokens antes de saída;
  - projeção ausente; projeção só na 1ª tentativa;
  - recusa depois da reserva; `>=`; ignorar `request.maxTokens`;
  - recusa repetível, que acionaria o fallback;
  - densidade; moldura;
  - T-1 número; T-1 detail;
  - validação do construtor.
- Gates: typecheck da raiz com saída 0, eslint, prettier, mutation:guard com saída 0, skip:governance PASS e docs:check-links. `gateway.ts` não está no mutation-manifest nem no skip-catalog, então não houve rebind.

## Limites

Os da SPEC §11: a estimativa pode errar para os dois lados, e a pressão de sessão ancorada fica com o PAR-C01.

## Correção da revisão do Codex (GBrain 17895)

A revisão achou um P2 no oráculo de reconstrução e no texto da §4 da SPEC; o gateway estava certo. O oráculo ignorava falhas com uso reportado (por exemplo, `schema_invalid` depois de 7/3) e comparava `detail` por igualdade, em vez de procurar a flag numa lista separada por vírgulas.
- O `reconstruct` do teste foi corrigido.
- Entraram duas regressões: falha com uso reportado; sucesso sem contagem acima do teto, com as duas flags.
- A nota técnica [0285b](../../../02_spec/0285b_attempt_usage_reconstruction_invariant_note.md) corrige a redação da invariante, sem editar a SPEC aprovada.
- Resultado: 17 testes C02.

## Correção do P2 de runtime e do P3 (revisão final do Codex, GBrain 18867 e 19102)

**P2.** Quando o `CostBudgetStore` falhava no acerto (`settle`), o gateway errava de três formas:
- o uso já medido era cobrado de novo como sem contagem;
- o evento terminal perdia os 7/3 medidos;
- com o store sempre falhando, a tentativa ficava sem evento terminal.

A ordem vinha do M01, mas quebrava a invariante da D1. Correção em `gateway.ts`:
- o `accounted` é gravado **antes** da porta falível de acerto, nos dois caminhos;
- a falha de acerto no caminho de erro não interrompe a emissão do terminal;
- uma falha de acerto (`settlementFailed`) bloqueia novas tentativas, para não gastar sem acerto.

Quatro regressões, todas vermelhas no código anterior:
- uso reportado com o store falhando uma vez;
- sucesso sem contagem com o store falhando uma vez;
- store que falha sempre (um terminal por tentativa iniciada);
- corte depois de saída com o acerto falhando (contado uma vez e sem retry).

Mutantes "retry apesar da falha de acerto" e "relança no acerto do caminho de erro": mortos.

**P3.** Regressão nova: a janela do perfil de fallback recusa antes do provider dele (mata o M3 do Codex).

Resultado: 22 testes C02; model-gateway 296/296.

## Correção do P2 restante (re-revisão R2 do Codex, GBrain 19558)

O `settlementFailed` só bloqueava o retry dentro do perfil. O laço externo de `generate` ainda via um erro repetível (por exemplo, `provider_connection_reset`) e caía para o perfil de fallback. Assim, continuava gastando depois de um acerto que falhou, e no caso em que a falha acontecia uma vez só chegava a devolver sucesso.

Correção: com `settlementFailed`, depois do evento terminal da tentativa (que já leva a causa e o uso), a requisição inteira para com `internal_error` não repetível. Fallback e retry ficam bloqueados. Nenhum código de erro novo.

Testes:
- duas regressões, vermelhas no código anterior: o store falha uma vez ou sempre, e o resultado é uma chamada só, nenhum fallback e um terminal;
- um controle positivo: com o store saudável, o corte é repetido e o fallback atende (`fallbackUsed`).

Mutantes "sem parada da requisição" e "parada repetível": mortos. 25 testes C02; model-gateway 299/299.
