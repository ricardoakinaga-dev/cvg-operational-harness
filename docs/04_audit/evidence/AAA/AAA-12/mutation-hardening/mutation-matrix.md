# AAA-12 mutação dirigida — matriz de resultados

Seleção congelada: `selection-v1.json`, sha256 `c7ee3f57b2a84a4acb54d63bda7b297020701dee083162195b2363fb4553c212` (16 mutantes, 8 famílias, publicada antes da execução).
Baseline: 105 testes PASS v1; após o teste novo, 106 testes PASS v2. Produto inalterado (8/8 hashes).

| ID  | Família | Guard / invariante                                | v1           | v2     | Primeiro teste discriminante (v2)                                                     |
| --- | ------- | ------------------------------------------------- | ------------ | ------ | ------------------------------------------------------------------------------------- |
| M01 | 1       | `#readRecord`: null explícito vira legado         | KILLED       | KILLED | file adapter rejects malformed persisted versions without mutating bytes              |
| M02 | 1       | `resolvePersistedHashVersion`: null vira legacy   | KILLED       | KILLED | decideReserve treats only the absent property as legacy                               |
| M03 | 1       | Guard de input de reserva removido                | KILLED       | KILLED | rejects an unknown requested version without creating a record                        |
| M04 | 2       | Comparação de payload invertida                   | KILLED       | KILLED | replays FAILED and UNCERTAIN records with stable codes and zero sends                 |
| M05 | 2       | Conflito do arquivo devolvido como replay         | KILLED       | KILLED | detects a payload conflict on the file adapter without rewriting bytes                |
| M06 | 3       | Decisão de reserva memory forçada a create        | KILLED       | KILLED | turns an expired SENDING lease into UNCERTAIN and allows safe takeover                |
| M07 | 3       | Criação exclusiva `wx` vira `w`                   | KILLED       | KILLED | replays FAILED and UNCERTAIN records with stable codes and zero sends                 |
| M08 | 4       | Fencing memory: owner de outro completa           | KILLED       | KILLED | runs with the default clock and no event hook                                         |
| M09 | 4       | Fencing arquivo: owner de outro completa          | KILLED       | KILLED | file journal hardening > fails, releases, marks uncertain...                          |
| M10 | 5       | SENDING expirado vira takeover                    | KILLED       | KILLED | turns an expired SENDING lease into UNCERTAIN and allows safe takeover                |
| M11 | 5       | UNCERTAIN vira takeover (retry cego)              | KILLED       | KILLED | replays FAILED and UNCERTAIN records with stable codes and zero sends                 |
| M12 | 6       | Replay terminal desativado (CONFIRMED reenvia)    | KILLED       | KILLED | replays FAILED and UNCERTAIN records with stable codes and zero sends                 |
| M13 | 6       | FAILED excluído do replay (volta a ser retryável) | KILLED       | KILLED | replays FAILED and UNCERTAIN records with stable codes and zero sends                 |
| M14 | 7       | Tenant removido da identidade                     | KILLED       | KILLED | 9. distinct tenants with the same key do not interfere                                |
| M15 | 7       | Canal removido da identidade                      | **SURVIVED** | KILLED | keeps the same key independent across channels (teste acrescentado após sobrevivente) |
| M16 | 8       | Transição de commit ignorada no gateway           | KILLED       | KILLED | replays a record committed by another lease and emits replayed                        |

Resultado final: **16/16 KILLED**, 0 sobreviventes, 0 INVALID, 0 BLOCKED. Sobrevivente v1 preservado em `results-v1.json` e `mutants-v1/`; patches e logs por mutante em `mutants/MXX/`.
