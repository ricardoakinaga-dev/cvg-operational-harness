# Evidências AUD-0591 — 30/09/2026

[Relatório completo](../../0591_repository_audit_2026-09-30.md) · [handoff](../../../08_runtime/handoffs/aud0591_20260930.md).

## Índice de prova

- `audit-contract.json`: escopo/critério T1 e paths de autoria.
- `baseline.json`, `source-manifest.json`, `source-preservation.json`: fotografia do worktree e SHA-256 das fontes; não são prova de commit limpo.
- `docs-inventory.json`, `docs-summary.json`, `lead-document-reading.json`, `lane-review.json`: abrangência de indexação/leitura e limites.
- `scorecard.json`: 42 critérios, soma2814/média67; 13 gates, soma405/média31,15; NO_GO.
- `check-ledger.json`, `checks.json`, `browser-checks.json`: comandos, exit codes e ambiente; arquivos `.log` correspondentes preservam saídas brutas.
- `coverage-summary.json`, `coverage-config.mts`, `critical-coverage.log`: denominadores, exclusões e pisos; V8 trunca statements92,57 enquanto guard arredonda92,58 sobre as mesmas contagens.
- `browser-*-raw.json`, `browser-summary.json`, `browser-harness.json`: simulação12/12 e trusted15/15, zero skips/flaky/retries; seis anotações axe com violations vazias no trusted. Fixture em memória/loopback, sem IdP real.
- `cognitive-probes.json`, `policy-prompt-probes.json`, `audit-redaction-probes.json`, `boundary-probes.json`, `otel-probe.json`: marcadores fictícios, modelos/providers/SDK falsos, sem efeitos externos. Exit0 da ferramenta de diagnóstico não significa invariante de produto aprovado; ler o campo verdict/critério.
- `aud0591-*.mts`, configurações Playwright, `run_checks.py`, `run_browser.py`: ferramentas auxiliares do snapshot. Importam fontes na árvore do snapshot; copiar isoladamente para esta pasta não as torna executáveis daqui.
- `runtime-builder-isolation.patch`, `runtime-builder-original.sha256`: adaptação exclusiva dos diretórios temporários do builder no snapshot.
- `git-harness-preparation.json`, `harness-correction.json`, logs `*-initial*`: rodada inicial incompleta/inválida e correção do harness. Usar logs finais para resultado.
- `root-certification-verify.*`, `root-format-check.*`, `root-workspace-boundaries.*`: verificações read-only no checkout compartilhado; distinguir das execuções do snapshot.
- `npm-audit.log`, `production-audit.log`, `remote-readonly.json`: fotografia de dependências, Actions, proteção e CodeQL. Não representam exploit demonstrado.
- `postgres-environment.json`, `resource-cleanup.json`: PG16 sintético descartável e liberação de portas próprias.
- `final-document-checks.json`, `review-consistency.json`, `artifact-manifest.json`: validação final de documentação, revisão e hashes do pacote.

## Reprodução e limitações

Snapshot preservado em `/tmp/cvg-aud0591-20260930/repo`. O container original foi removido. Para repetir PG, criar recurso descartável próprio e fornecer TEST_DATABASE_URL sintético; usar Node22.23.2 e flags PG obrigatórias registradas nos runners. Os runners contêm credencial exclusivamente fictícia de banco descartável, não segredo operacional. O Git auxiliar está restrito à cópia; não rodar ferramentas de teste mutantes no root sem claim.

Somente `scripts/build-runtime.mjs` original foi adaptado na cópia para diretórios próprios; helpers adicionais ficaram em scripts/configs de auditoria, fora da implementação medida. A aplicação original do root não foi corrigida. Não houve novo certify/SBOM/licenses, release Docker, chamada a canal/modelo real, alteração de configuração de conta remota ou push.

O inventário de docs inclui todos os arquivos da baseline. Leitura textual estruturada não equivale a inspeção semântica de cada linha de evidência histórica, nem revisão de cada binário. Os especialistas e líder cruzaram os documentos relevantes com o código, sem certificação independente de release.

O manifesto de artefatos exclui ele mesmo, pois não há hash autorreferente estável. Logs brutos não foram formatados nem editados. Quatro streams originalmente vazios foram arquivados como gzip sem perda, para preservar bytes e não alterar o catálogo central compartilhado; `empty-stream-archives.json` associa nomes, tamanho e hash descomprimido. Documentos próprios foram formatados separadamente. Atualizações dos ledgers concorrentes foram entregues via handoff para integração coordenada.
