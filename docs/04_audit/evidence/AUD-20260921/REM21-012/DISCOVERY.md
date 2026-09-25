# REM21-012 — DISCOVERY — governança obrigatória de skips

## Contexto e gate

- task: `REM21-012` / achado `A21-F14`;
- autorização: `G21-1`, somente local, sintética e descartável;
- dependência concluída: `REM21-008 = VERIFIED_LOCAL / FINAL_CERT_DEFERRED`;
- produção, `G21-5`, `G21-6`, I1 e freeze: fora do escopo e fechados.

## Reprodução do achado

`scripts/lib/skip-governance.mjs` valida owner, razão, gate, hash da origem e
contagem observada, mas não valida `expiresAt`. Uma entrada com data passada
continua sendo aceita. O conjunto `KNOWN_DEDICATED_GATES` contém apenas
`postgres`, embora a barra execute unit, PostgreSQL, chaos e E2E. O
`phase10-certify` agrega somente relatórios unit/PostgreSQL/chaos ao inventário;
E2E não tem relatório de skip ligado ao candidate/run.

Os self-tests existentes rejeitam skip desconhecido, skip marcado `required` e
drift de hash, mas não expiração, data inválida, ausência de cobertura do gate
dedicado, relatório duplicado ou E2E.

## Invariantes descobertos

1. Todo entry do catálogo deve ter ID único, arquivo único, hash, owner, razão,
   `dedicatedGate` conhecido, `expiresAt` ISO-8601 futuro e política explícita.
2. Todo relatório de skip deve declarar um gate conhecido, ser parseável e
   aparecer uma vez na coleção; relatório ausente, duplicado ou desconhecido
   falha fechado.
3. Um skip aceito só pode ser atribuído se o gate dedicado aparece entre os
   relatórios realmente executados; o output preserva `observedGates` e
   `dedicatedGate` para auditoria.
4. Skip desconhecido, expirado, obrigatório, com data inválida, origem stale,
   gate inválido ou cobertura dedicada ausente bloqueia a decisão.
5. Unit, PostgreSQL, chaos e E2E devem ser contabilizados no mesmo inventário;
   zero skip é um resultado válido e não pode ser convertido em `NOT_EXECUTED`.

## Decisão de descoberta

Estender o schema do catálogo com `expiresAt`, validar a janela no momento da
execução e generalizar gates dedicados para `unit`, `postgres`, `chaos` e
`e2e`. O inventário receberá os quatro relatórios, incluindo o JSON do
Playwright produzido no gate E2E, e exigirá presença do gate dedicado para cada
skip aceito. O relatório será vinculado ao `runId`/candidate e será um artefato
explícito da barra.

## Gate

`DISCOVERY_COMPLETE / PRD_SPEC_AUTHORIZED_CONTROLLED_BUILD`.
