# Observações sobre fontes de código e governança

## SKIP-PG-004 — API/PostgreSQL

Fonte atual `apps/api/src/__tests__/postgres-persistence-mode.test.ts`, SHA-256 `144f7cd74870c1e964e63fd2d9f2bf63d49fce442992802fbd0ca57904c8fa55`; preimage catalogado `e7afff21793a36053efbbfe7bdb6c13ebbe5d03ef47fe85445d02438c455b8a0`. [Diff reproduzível](diffs/SKIP-PG-004.catalog-preimage-to-current.patch).

- L50 lê `TEST_DATABASE_URL`. L1349 e L2461 usam `testDatabaseUrl ? it : it.skip`, sem mudança em relação ao guard do preimage. Não há verificação local de PG_REQUIRED nesta fonte; o runner obrigatório deve exigir banco/execução real externamente.
- L1351/1414/1671/1698/1806/1843/2056/2207 são os oito casos PG existentes. L2572 expande `itWithPostgres.each(mutations)` em **24** casos, conforme tabela literal L2473–2570. L2610 e L2639 adicionam dois casos, formando **8 + 24 + 2 = 34**, não 11 registros nem 8 skips.
- O preimage tem 45 testes totais (37 sem banco + 8 PG); a fonte atual tem 71 (37 sem banco + 34 PG). As três famílias `it.each` sem guard PG também foram expandidas pelo AST, mas não entram na contagem de skips. Coleção Vitest confirma 37 passed/34 skipped.
- `afd30967` substituiu `requires the complete durable webhook replay catalog contract` por `rejects incomplete webhook replay catalog results` (L1185): o antigo fake positivo aceitava uma tabela/nomes de constraints e índice sem comprovar semântica. É uma alteração de asserção real além do rebind de hash; o owner deve revisar o delta.
- A nova suíte `SPEC 0158 serving-role webhook replay preflight` (L2460) usa roles e schemas sintéticos em banco descartável. Os 24 defeitos incluem CHECK homônimo/permissivo/NOT VALID, defaults/nullabilidade/tipos, PK deferrable, unlogged/inheritance, índices, trigger/rule, FK externa e policy. Os dois casos finais cobrem índice inválido pós-build concorrente e CHECK ligado a função da aplicação. Todas essas funções de teste ficaram puladas no diagnóstico; nenhum banco/schema/role foi criado por esta lane.

## SKIP-PG-008 — HMAC/webhook

Fonte atual `apps/api/src/__tests__/webhook-security.test.ts`, SHA-256 `ec7c256686520334ebed35cf9807fc4b26daa7f0c60ab97aeac5640646d106ce`; preimage catalogado `4627fc5620b96eb86be7fc4c817209f0b9de5961a58862e494a4499b9967da0e`. [Diff reproduzível](diffs/SKIP-PG-008.catalog-preimage-to-current.patch).

- L16 lê `TEST_DATABASE_URL`; L76 mantém `testDatabaseUrl ? it : it.skip`. Também não há verificação local de PG_REQUIRED.
- O caso novo L349, `persists future-dated replay protection through the signature window`, usa PostgreSQL para proteção de replay futuro. O caso existente, agora L531, testa recuperação de leases antigos/retention de replay committed. Ambos ficam pulados sem banco: **1 → 2**.
- `3859032a` também adicionou três testes sem PG: janela completa de replay futuro (L99), fronteira do último milissegundo válido (L129) e regressão do relógio de decisão (L153). Total **16 → 20**; runtime atual 18 passed/2 skipped. Aprovação dos controles de segurança não é inferida destes hashes ou do diagnóstico.

## SKIP-PG-014 — worker homolog

Fonte atual `apps/worker/src/__tests__/operational-harness-homolog.integration.test.ts`, SHA-256 `a27d2fdafecdc5510d91ae6dfbec7123f8bfe795a1621528852b21533421140e`; preimage catalogado `207335c6a6f3d7e4f016283c31ac8c46d66f4d9bce6edb8d3ac7eb86e53c9617`. [Diff reproduzível](diffs/SKIP-PG-014.catalog-preimage-to-current.patch).

- L22–32 mantêm `pgEnabled = Boolean(TEST_DATABASE_URL)` e `AUD19_PG_REQUIRED === '1'`; obrigatório sem URL lança erro, em vez de skip. Fora do gate obrigatório, `describeWithPostgres = pgEnabled ? describe : describe.skip`.
- A suíte L204 engloba **três** casos em L205/333/361: reclaim pós-SIGKILL, recusa de startup e drain no SIGTERM. A recusa de startup também herda o skip da suíte, mesmo que parte de seu corpo não necessite banco; não reduzir a contagem olhando apenas corpo do teste. O `if (!pgEnabled) return` de L362 não elimina o registro de teste.
- `a67726b7` substituiu `delay(1500)` pela espera de `worker.homolog_health` saudável antes de SIGTERM usando `activeIdle`. Nenhum caso, guard obrigatório ou skip novo; contagem continua **3**. No diagnóstico não se executou nem spawn de worker, nem seus efeitos de PG. SPEC 0143 já descreve esse rebind como pendente de liberação PR-L04.

## scripts/lib/skip-governance.mjs

Fonte SHA-256 `258941e431d46af8fd90700477b0d2a42879f0ed2f0cae3e7fe5899247ec37b7`, anexada em `inputs/root/scripts/lib/skip-governance.mjs` e preservada intacta.

- L13 define relatórios obrigatórios unit/postgres/chaos/e2e. L94–96 verifica SHA da fonte **independentemente de haver skips**; zero skips não adjudica drift.
- L179–205 consome `assertionResults` com skipped/pending/todo e exige pending+todo iguais ao número de linhas. Portanto o número de registros de chamada estática não substitui a contagem expandida por cada caso Vitest.
- L252–266 deduplica por `file + fullName` entre gates; L34–36 deriva ID estável do fullName. Títulos duplicados poderiam reduzir contagem única; os 39 casos desta coleta são únicos por arquivo/fullName.
- L287 rejeita skip `required`; L288–292 exige presença do relatório dedicado. As três entradas continuam `required=false`, dedicadas a postgres. Presença de um relatório, sozinha, não é prova de execução real de cada caso PG; não fabricar relatórios vazios para satisfazer a biblioteca.
- L309–321 calcula contagem única por arquivo, mas só acusa mismatch se `observedCount > 0`. Assim uma rodada toda verde com banco não prova que `expectedSkippedTests=8/1` está correto: esta coleta sem PG mostra 34/2.
- A lane passou somente o relatório diagnóstico unit à biblioteca, normalizando prefixos em memória. O resultado FAIL preserva três source drifts, dois count mismatches e a falta de PG/chaos/E2E. Não é execução do comando completo `skip:governance` nem certificação.

As contagens estáticas do preimage não executam código histórico. A prova runtime é só da fonte atual no snapshot, com ambiente sanitizado e cobertura/cache/update de snapshots desabilitados. Aprovação, fonte atual integrada, execução PostgreSQL obrigatória e regressão final permanecem pendentes dos holders.
