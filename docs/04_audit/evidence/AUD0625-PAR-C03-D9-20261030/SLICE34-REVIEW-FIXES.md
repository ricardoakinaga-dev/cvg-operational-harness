# C03 fatias 3 e 4 — reparos da revisão Codex (26716014a)

Autor: Claude D9. Disposições do DF: F01, F02, F03 e N01. Nota: [0293c](../../../02_spec/0293c_review_s34_fixes_note.md).

| Achado | Reparo | Prova |
|---|---|---|
| F01 (I11) | `ObservationRendering.houseRead`, porta `houseReadOf`, exceção por posição em `pruneToolMessages` | `aud0625-par-c03-review-f01-house-read.test.ts` (9 casos, canário do revisor) |
| F02 | grants por coluna + DELETE no `spill-sweeper.sql`; preflight do varredor | PG: `F02`, `N01` (refusa membro sem grants, sem herança, com `content`, INSERT, UPDATE, TRUNCATE, TRIGGER, REFERENCES, papel ausente) |
| F03 (I7) | cancelamento do statement em espera, conferência depois do lock e antes do COMMIT | PG: 4 casos com a espera real confirmada em `pg_locks`, cancelamento sem segunda conexão, aborto no INSERT, controle sem aborto |
| N01 | a 0037 não cria papel nem concede; script e runbook | PG: a migração não contém `CREATE ROLE` nem `GRANT`; papel do script sem CREATEROLE/login/bypass |

Mutantes: F01 8/8 (`mutations-review-f01.json`), PG 10/10 (`mutations-review-pg.json`). O mutante "papel ausente" (P7) foi removido junto com a verificação redundante: a checagem de membro já cobre o papel ausente e um teste de renomear o papel prova a recusa. C2 só morre porque o teste afirma que nenhuma escrita é enviada depois da espera.
Testes: PG 38/38 (eram 29; SKIP-PG-C03-001 religado ao novo sha, 38 esperados), harness c01+c03 215/215, cobertura 100% por arquivo em `model-compaction.ts`, `spill/prune.ts` e `spill/prepare.ts`.
Limite: o anfitrião real ainda precisa ligar `houseReadOf` a partir de `Observation.rendering.houseRead` (pendência de integração da onda 6, como a composição do varredor no worker). O papel `cvg_spill_sweeper` é global ao cluster: o teste o cria pelo script e não o remove.
