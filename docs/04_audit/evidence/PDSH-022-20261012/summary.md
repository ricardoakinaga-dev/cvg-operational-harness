# PDSH-022 — evolução de formato de sessão (registry adjacente) — 12/10/2026

- Escopo: SPEC [0203](../../../02_spec/0203_pdsh022_session_format_evolution.md); critério S09 da [0202](../../../02_spec/0202_pdsh020_session_event_format.md) (§6/§8). DONE_LOCAL com gates completos; não é certificação, revisão independente ou release.
- Recon: geração v1 congelada (`packages/contracts/src/session-event-schemas.v1.json`), validação em `packages/harness/src/session/events.ts`, store append-only com triggers anti-mutação (0028). Nenhum schema v2 real foi criado: a v2/v3 dos testes é fixture sintética.

## Decisão de projeto

- Registry neutro `createSessionFormatRegistry` (boot fail-closed: adjacência `to === from + 1`, definições únicas com `validate`/`fingerprint`, passo com `transform`, referência a versão definida) + `sessionFormatDefinitionV1` pronto sobre o catálogo real.
- `migrate(event, target)` valida a origem (clone), congela profundamente cada intermediate, aplica o passo adjacente, monta o candidato com `formatVersion`/`fingerprint` do destino e valida pela definição do destino; devolve visão derivada. Origem nunca é mutada (transform que tenta mutar o input congelado → `invalid_step_output`).
- Falhas estáveis: `format_registry_invalid`, `unknown_format_version`, `missing_format_step`, `downgrade_not_supported`, `invalid_step_output`. Sem downgrade, sem pulo de geração, sem backfill; geração vN conservada no store (triggers da 0028 permanecem a barreira de banco).
- Runbook de release (SPEC §4): congelar geração, adicionar definição+passo adjacente, guardas, deploy sem backfill, rollback só de código, nunca DROP/renomear geração.

## Procedimentos observados

| Procedimento | Resultado | Evidência |
| --- | --- | --- |
| Foco S09 (registry/migração/origem congelada/negativos) | PASS: 1 arquivo/8 testes | [focused.log](focused.log) |
| Suíte completa, Node 22.23.2, PG 16.15 próprio | PASS: 381 arquivos/3234 testes, 1 skip | [unit.log](unit.log) |
| `test:postgres` (gate padrão) | PASS: 37 arquivos/302 testes, zero skips | [postgres.log](postgres.log) |
| `test:postgres` + guarda PG de sessão (021) | PASS: 38 arquivos/311 testes, zero skips | [postgres-session.log](postgres-session.log) |
| E2E Chromium (portas próprias 3599/4599) | PASS: 12/12 | [e2e.log](e2e.log) |
| Fronteira ADR-010 | PASS, zero violações/diagnósticos/exceções ociosas | [boundary.log](boundary.log) |
| Typecheck/lint/catálogos/formato/diff | PASS | [static.log](static.log) |

## Self-review separada (não é aceite independente)

- Casos cobertos: feliz v1→v2 (mensagem + passthrough de `turn/start`), mesma geração, determinismo entre execuções/instâncias, cadeia v1→v2→v3 equivalente à composta, origem congelada byte-idêntica, boot inválido (não adjacente, duplicado, versão indefinida, definição duplicada, vazio, transform não-função), versão desconhecida (origem/destino), downgrade, passo ausente, transform que muta o input, output fora do schema do destino e fingerprint errado.
- Limite honesto: a v2/v3 são fixtures; o adaptador v1 é a ponte real. Determinismo é provado por re-execução (não por análise estática) e o freeze do intermediate é a garantia de pureza observável.
- Falha intermediária preservada: o primeiro typecheck falhou com TS2352 no teste (cast desnecessário `{...} as SessionEvent` para evento v2); corrigido removendo o cast; typecheck final verde em `static.log`. Nenhuma asserção foi removida.

## Estado operacional e limites

- Contêiner próprio `opencode-pdsh022-pg-20261012` (127.0.0.1:32770, tmpfs 4 GiB) removido; portas 3599/4599/32770 sem listener. Nenhum recurso alheio tocado.
- PUBLIC_API/PINNED atualizados (exports do registry); nenhum schema v2 publicado; nenhum backfill; nenhuma remoção/retenção.
- Sem provider/dado real/commit/push/deploy/release; produção NO_GO. Próxima ação: PDSH-023 (SDK JSON-RPC com exemplo de consumidor) conforme plano 0375.
