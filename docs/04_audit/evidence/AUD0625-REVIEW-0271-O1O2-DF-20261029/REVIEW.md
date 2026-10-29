# Revisão independente da 0271 (F15) e das O1/O2 do console da 0257 — Claude DF, 29/10/2026

Autoria: Claude D9. Revisor não autor. É revisão, não aceite. Produção `NO_GO`.

## SPEC 0271 R1 (F15), BUILD `5692dc57a`

**APPROVE**, sem achados.

- A 0021 ganha `AND payload->>'approvalId' IS NOT NULL AND payload->>'decision' IS NOT NULL` no pré-check. O índice, a validação de definição e a mensagem não mudam.
- `supersededMigrationChecksums` aceita só o texto anterior da 0021 (`038de370…`), e `isAcceptedMigrationChecksum` recusa o checksum ausente.
- A regra é usada no runner, no `assertTenantIsolationMigrationState`, no preflight da API e no preflight do worker.
- Desvio da §3.2 registrado pela autora, e correto: `baselineLegacyPostgresMigration` só calcula o checksum da `0000_initial`. O terceiro comparador real é o preflight do worker, e ele está coberto.
- A fixture com o texto anterior fica em `packages/persistence/src/__tests__/fixtures/`. O runner lista as migrations por nome explícito, então ela nunca é aplicada como migration.
- Testes, com Node 22, numa cópia detached:
  - unitários do preflight: 6/6;
  - `aud0625-f15-migration-0021-precheck` em PG 16.15, contêiner próprio: 11/11 isolado.

  Numa primeira rodada, junto com outro arquivo PG e a carga entre 8 e 13, dois controles estouraram o prazo (180 s e 33 s); isolados, passam. As 9 mutações da autora estão em `proofs/mutations.txt`.
- O rebind do skip-catalog (SKIP-PG-019 e SKIP-PG-043) foi conferido pela autora com `skip:governance` PASS.

## Console, O1 e O2 da 0257, `20f0040d1`

**APPROVE**, sem achados.

- **O1:** se o registro local falha depois de um 2xx, aparece um aviso ao operador e a operação continua pendente com a mesma chave. O clique seguinte reenvia a mesma solicitação, e o servidor devolve a mesma aprovação. Uma chave nova não ajudaria, porque a gravação seguinte também falharia.
- **O2:** um registro corrompido no `sessionStorage` é descartado e regenerado. Um storage ilegível continua bloqueando.
- Testes: `apps/web` 34 arquivos e 174 testes.
