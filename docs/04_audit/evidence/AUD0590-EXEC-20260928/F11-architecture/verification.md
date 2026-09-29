# Verificação do sidecar F11/F12 — 29/09/2026

- Claim: `AUD0590-F11-ARCH-001`; tarefa `A59-11`, trilha T1.
- Baseline documental: `54257e36684907217cd52b74385d5c690a6daf33`. `source-manifest.json` contém SHA-256 de 24 fontes commitadas nesse SHA. `git rev-parse HEAD` já avançou durante a redação por trabalho concorrente; o guia mantém a baseline congelada e não atribui alterações locais ao commit.
- `npx prettier --check` nos dois arquivos do sidecar: PASS.
- `node scripts/check-doc-links.mjs docs/architecture/CURRENT_IMPLEMENTATION_2026-09-29.md`: `DOC_LINKS_OK`, zero links quebrados.
- `git diff --check` nos caminhos próprios: PASS.
- Divergência examinada: `operator-session-hook.ts` modificado no checkout tem isenção de probes de saúde; o arquivo no SHA congelado não a contém. O guia declara explicitamente essa diferença. Não houve edição de código, ledgers, índice operacional, textos históricos ou paths PR-L04.
- Escopo da conclusão: guia documental publicado localmente; F11 depende ainda da composição PR-L04 e atualização de navegação/índice sob claim próprio; F12 depende de isolamento do legado. Produção `NO_GO`.
