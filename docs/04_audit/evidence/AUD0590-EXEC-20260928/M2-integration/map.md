# M2 — mapa de integração F04/F10

**Leitura:** root em `388c4da` (29/09/2026), branch isolado `85c2c7d`. O
commit isolado não é ancestral do root (`git merge-base --is-ancestor` saiu
1). Reconhecimento de fonte somente leitura; sem teste, PostgreSQL, E2E,
instalação ou mudança de produto. O root continua com trabalho concorrente.

| Fronteira | Observado no root | Delta que permanece |
| --- | --- | --- |
| Boot F10 | `buildServerFromEnv` exige PostgreSQL/RLS e confere roles, migration, schema e replay antes de servir (`apps/api/src/server.ts:5102`, `:5266`, `:5347`). | Produção ainda exige `DATABASE_MIGRATION_URL`, conecta com essa credencial e permite auto-migration (`server.ts:5300`, `:5319`). O commit `85c2c7d` recusa ambos, deriva o owner de catálogos legíveis pela role runtime e acrescenta `assertMigrationOwnerFromCatalog`, ausente do root. |
| Sessão F04 | `apps/api/src/main.ts:10` chama `buildServerFromEnv`; a factory aceita store injetado (`server.ts:493`). | O entrypoint não injeta store durável e a composição PostgreSQL não o cria (`main.ts:18`, `server.ts:5387`). O teste produtivo atual injeta store **em memória** (`postgres-persistence-mode.test.ts:1778`), portanto não prova o processo publicado. |
| Testes/configuração | A matriz F02 de constraints vivas e negativos de boot já está no root (`tenant-preflight.ts:640`, `postgres-persistence-mode.test.ts:2331`, `:2411`). | Fixtures atuais ainda passam URL de migration e auto-migration (`postgres-persistence-mode.test.ts:1719`); `.env.example:9` e `tests/rem21-018-config.test.ts:24` ainda exigem a URL. O commit isolado muda estes contratos. |

**Sequência sob claim novo, após PR-L04 liberar `server.ts`:** reconciliar o
delta F10 com o preflight e as fixtures F02 atuais, preservando os negativos
de constraint; integrar a composição de sessão durável/OIDC no entrypoint F04;
provar o processo publicado com PostgreSQL, duas instâncias, navegador,
logout/revogação e falhas; só então congelar SHA/digest para M3. Copiar o
arquivo antigo `tenant-preflight.ts` por inteiro perderia as verificações F02.

SPEC 0144/D-09 e SPECs 0150/0152 têm aprovação humana para BUILD T3
sintético; `85c2c7d` recebeu I23 `ACCEPT_LOCAL`. Essas decisões não qualificam
o root. F10 ainda exige boot integrado sem DDL, negativa real de DDL pela role
runtime e prova de upgrade/falha/rollback em staging sintético. F04 ainda
exige o entrypoint publicado e os negativos de sessão. PR-L04 mantém claim
`ATIVO` em `server.ts`; produção e release permanecem `NO_GO`.

Fontes de decisão: [backlog A59-04/F04 e A59-06/F10](../../../../03_build/0361_aud0590_remediation_backlog.md),
[coordenação](../../../../08_runtime/agent_coordination.md),
[SPEC validation](../../../../02_spec/0190_spec_validation.md). Evidência
histórica do branch: `git show --stat 85c2c7d` e
`docs/04_audit/evidence/PR301-PROD-STARTUP-20260927/proof.json`.
