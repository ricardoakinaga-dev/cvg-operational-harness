# AUD-0605 — evidências independentes

Data06/10/2026 local; SHA congelado216e17c512efe1ec6d244698b2c82f62ba567667, base5b098a7. [Parecer](../../0605_reauditoria_aud0604_2026-10-06.md). Auditoria concluída, originais fechados no escopo exercitado, sem novos findings; publicação autorizada em sequência.

F01/F02 confirmados em PostgreSQL/imagem: perda durante a troca503 sem cookie, processo/live/ready vivos, antiga200, nova autenticação200; migration job antes do serving, API sem DDL e recusa da credencial. Smoke22/22 e ampliado28/28 PASS. Matriz de owner/job e ciclo do pool revisados separadamente, com limites e erros de harness preservados.

Suíte completa com cobertura:360 arquivos/2953 PASS, 0 pending/skips, zero falhas/todos. PostgreSQL37/302 PASS, zero skips. Typecheck/lint/formato/docs/audit0/mutation10 PASS; branches críticos mínimo96.73% ≥95%. Dados brutos e exit0 próprios no manifesto. A configuração da auditoria usa PHASE4A_DISPOSABLE_PG=1 e PHASE4A_PG_REQUIRED=1; o caso SKIP-PG-021 foi executado na suíte, sem exigir inferência de gate separado. A contagem2952+1skip informada pelo builder pertence à configuração daquela execução e não é a contagem desta.

Scanner padrão zero no diff2 e imagem; symlinks/node_modules/gzip fora dessa cobertura. Sem nova decisão semanal ou implantação real. E2E/browser/certify/skip completo/SBOM/licenças/backup novo locais NOT_RUN; CI novo precisa do SHA publicado.

[Recibo estruturado](verification.json), [manifesto dos brutos](archive-manifest.json). Para validar cada `.gz`, comparar SHA-256 com artifactSha256 e, após descompactar, com sourceSha256. Scripts em raw usam apenas fixtures sintéticas descartáveis; o target da imagem é runtime. Erros anteriores de instrumentação e os retestes estão preservados.
