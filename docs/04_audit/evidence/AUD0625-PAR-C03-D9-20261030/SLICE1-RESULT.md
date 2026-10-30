# PAR-C03 BUILD — fatia 1 (SPEC 0293 R2): contratos, renderização, depósito em memória, composição fail-closed

Task `AUD0625-PAR-C03-D9-20261030`, branch `claude/aud0625-par-c03-build-d9` (de `claude/aud0625-par-c03-d9` @ `64ad7c190`, com merge da C01 @ `f3d6bd87c`). Recibo
`human-decisions-25` (SPEC 0293 D1–D8 como recomendado), citado por nome. Local, sintético, sem push. Produção `NO_GO`. Postgres (migração 0037) é a fatia 2.

## O que entrou

- **Contratos** (`@cvg/harness-contracts`): `SpillStore`/`SpillPolicy`/`SpillReceipt`/`SpillSlice`/`SpillDurability`, `DEFAULT_SPILL_POLICY`; `ToolDescriptor.requiresCompleteResult?`;
  `Observation.rendering?` (`ObservationRendering`), o lugar onde o runtime guarda **uma vez** o que o modelo vê de um resultado de ferramenta. Todos aditivos e opcionais.
- **`packages/harness/src/spill/`**: `errors` (tipados), `policy` (`resolveSpillPolicy`, fail-closed), `render` (serialização, cortes em ponto de código, marcador por bloco, bloco de prévia),
  `prepare` (`prepareToolOutput`: limiar, depósito, repetição única, cota por turno, cancelamento), `memory-store` (`InMemorySpillStore`, `durability: 'process'`, só teste), `composition`.
- **Laço iterativo** (`iterative-dispatch.ts`, `iterative-runtime.ts`): opção `spill`; no resultado `succeeded` o runtime prepara a renderização, guarda em `Observation.rendering`,
  marca o `summary` de 300 caracteres quando é corte e recusa (`INSUFFICIENT_EVIDENCE`) a ferramenta `requiresCompleteResult` cujo resultado não coube nem foi guardado.
- **Motor de contexto** (`summarizeObservation`): usa `rendering.text` de uma observação `TOOL_RESULT`/`TOOL`; qualquer outra observação ignora o campo (o conteúdo de uma ferramenta não consegue forjá-lo).

## Regras provadas

I1 (nunca corte silencioso: bloco com `bytes`, `sha256`, omitidos, `armazenado`, e o `summary` com marcador), I6 (put idempotente, `expiresAt` preservado), I8 (cortes UTF-8 e par substituto), I12 (marcador por bloco, regerado se
o conteúdo o contém, delimitadores sem ele não fecham o bloco), I13 (forma decidida uma vez), I14 (depósito `process` fora de teste, ausente ou indisponível = `armazenado=não`), repetição única só para erro `retryable` ou `SpillCommitUnknown`
(`commitIncerto` se a repetição também falha), 64 por turno, cancelamento sem `put`, saída até o limiar entra inteira no contexto (antes eram 300 caracteres).

## Provas de fase 1 que viraram verdes

6 dos 9 `it.fails`: prévia com cabeça, cauda, tamanho e localizador; conteúdo gravado uma vez byte a byte; falha de gravação nunca silenciosa; corte avisado mesmo sem depósito; moldura forjada; depósito não durável.
Ficam `it.fails`: `spill.read` (fatia 3), estabilidade do texto podado e poda do prefixo da C01 (fatia 4). Dois ajustes de texto nos testes: `armazenado=não` e `previewHeadBytes` (a SPEC tinha `previewBytes` como forma genérica).

## Gates

- harness: 717 testes + 3 `it.fails` esperados; `packages` + `apps`: 409 arquivos / 4245 testes verdes.
- Cobertura por arquivo (`CVG_COVERAGE_PER_FILE=1`): `spill/*`, `iterative-dispatch.ts`, `iterative-runtime.ts`, `context-engine.ts` em 100%.
- Mutantes `mutations-slice1.json`: 30/30 mortos (`mutation-results-slice1.json`).
- typecheck, eslint, prettier, `docs:check-links`, `skip:governance` verdes.

## Achados e desvios (para a revisão e para a fatia 2)

1. **Idempotência × "só o hash do localizador".** A SPEC pede que o armazenamento guarde só o hash do localizador *e* que o `put` repetido devolva o mesmo localizador. Isso só é compatível se o localizador for **derivável**
   (HMAC de `(tenant, sessão, operationKey, sha256)` com chave de servidor) ou se o armazenamento guardar o localizador em claro. O depósito em memória guarda o localizador em claro (é um fixture). A fatia 2 (Postgres) precisa decidir; recomendo HMAC com chave do cofre/ambiente e comparação do hash.
2. **Classificação.** `ToolDescriptor` não tem classificação; o padrão é `CONFIDENTIAL` e o anfitrião pode informar `classificationOf`. Mantido como D7 (sem promessa de cofre).
3. **Poda do próprio motor de contexto.** Um item de ferramenta de até 8 KiB é cortado pelo orçamento de tokens do motor (`DefaultContextEngine`, 4 000 tokens) como qualquer item de prioridade baixa: o item some inteiro (comportamento anterior, não novo).
   Com resultados maiores por item, essa pressão chega antes; o ajuste de orçamento é do anfitrião. **Cartão de acompanhamento ligado à 0224** (registrado no 0380, PAR-C03), sem mudança agora.
4. **Quota, `purge` e validação de `offset`/`length` do depósito** ficam na fatia 3, como na SPEC §4; o fixture só cobre idempotência, isolamento e validade.
5. `Observation.rendering` é novo no registro persistido do checkpoint; a leitura de checkpoints antigos não muda (campo opcional) e o digest do checkpoint não valida a forma.
