# PAR-C01 BUILD — fatia 1 (SPEC 0290): correções de segurança da compactação v1

Task `AUD0625-PAR-C01-D9-20261029`, branch `claude/aud0625-par-c01-d9`. Recibo da decisão humana:
`receipts/human-decisions-22.json` (sha256 `1136e2c3efe43b078ac23e9137eea3aa6c6a7e6ffcf069cf726aa97176640018`,
copiado byte a byte, vinculado à SPEC `747c98c6…` e ao `9a345a9da`). Local, sintético, sem push. Produção `NO_GO`.

## O que mudou (`packages/harness/src/compaction.ts`)

| Defeito da v1 | Correção | Regressão |
| ------------- | -------- | --------- |
| (3) texto de `user` promovido a `system` | o resumo é mensagem `user` com a moldura `COMPACTION_SUMMARY_FRAME`; nenhum `system` é criado | `slice1-hardening` (puro e pelo kernel), `model-compaction` |
| (1) instrução `system` governada descartada | mensagens `system` ficam fora do prefixo resumido e passam verbatim, em ordem, fora do digest | `slice1-hardening`, `model-compaction` |
| (4) vista que não cabe vai ao modelo | `fits`/`viewTokens` no resultado; o controle para com `INSUFFICIENT_EVIDENCE` antes do modelo, sem evento | `slice1-hardening` (limite exato, uma mensagem só, kernel) |
| (5) evento gravado em turno cancelado | o controle não chama `onCompacted` se `turn.signal.aborted` | `slice1-hardening`, `model-compaction` |
| (2) fato além do 60º caractere | NÃO nesta fatia: depende da porta de pins (fatia 2) | 4 `it.fails` seguem |

Testes PDSH-025/031 atualizados só onde a v1 provava o defeito (resumo `system`, instrução longa descartada): agora há
histórico anterior injetado por plugin e o teto comporta o resumo. Flipados: 3 `it.fails` (promoção, recusa, cancelamento);
a prova da instrução governada foi reescrita (verbatim ou recusa). Restam 6 `it.fails` (4 fatos, `COMPACTION`, retry de overflow).

## Gates

- harness: 40 arquivos / 572 testes passam, 6 `it.fails` esperados.
- Cobertura por arquivo (`CVG_COVERAGE_PER_FILE=1`, `--coverage.include=compaction.ts`): 100% stmts/branches/funcs/lines.
- Mutantes `mutations-slice1.json`: 8/8 mortos (`mutation-results-slice1.json`).
- typecheck, eslint, prettier, `docs:check-links`: verdes.
