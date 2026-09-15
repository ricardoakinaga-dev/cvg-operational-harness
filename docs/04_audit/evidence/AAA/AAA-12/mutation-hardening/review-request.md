# AAA-12 mutação dirigida — pedido de revisão independente

- Task: `AAA-12`. Autor: agent-2. Status: **IMPLEMENTED_PENDING_INDEPENDENT_REVIEW**.
- Base normativa: `docs/04_audit/evidence/AAA/AAA-12/mutation-assignment/next-task-agent-2.md`; AAA-04 v2 §9.1.
- Seleção congelada antes da execução: `selection-v1.json` sha256 `c7ee3f57b2a84a4acb54d63bda7b297020701dee083162195b2363fb4553c212` (16 mutantes, 8 famílias, matriz guard→invariante→mutação→teste).

## Resultado

- Baseline: 105 testes PASS (v1) e 106 PASS (v2, após teste novo).
- Execução v1: **15 KILLED / 1 SURVIVED** (M15: canal removido da identidade, sem teste de isolamento entre canais).
- Remediação: teste comportamental `keeps the same key independent across channels` no arquivo de cobertura autorizado.
- Execução v2 do conjunto fixado: **16/16 KILLED**, 0 SURVIVED, 0 INVALID, 0 BLOCKED.
- Nenhum produto foi alterado (8/8 hashes antes=depois); 14/14 hashes pinados do C4 permanecem iguais; somente o teste de cobertura autorizado foi estendido.
- Cobertura do canal preservada: 98.39/96.18/96.11/99.61 (mesmos pisos aprovados).

## Artefatos

| Item                       | Path                                                                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Seleção + hash             | `selection-v1.json`, `selection-v1.sha256`                                                                                                 |
| Resultados v1/v2           | `results-v1.json`, `results-v2.json`                                                                                                       |
| Patches e logs por mutante | `mutants/MXX/` (v1 preservado em `mutants-v1/`)                                                                                            |
| Matriz legível             | `mutation-matrix.md`                                                                                                                       |
| Manifesto                  | `manifest-mutation.json`                                                                                                                   |
| Harness                    | `run-mutations.py`                                                                                                                         |
| Controles e gates          | `baseline-control*.log`, `coverage-after-mutation-tests.log`, `typecheck.log`, `lint-channel.log`, `format-check.log`, `full-npm-test.log` |

## Limitações

- Seleção dirigida de 16 mutantes (não mutação arbitrária nem 100% do espaço); conclusão restrita à seleção.
- M15 sobreviveu na primeira rodada e exigiu teste novo; o histórico não foi apagado.
- Sem SQL, AAA-21, `@cvg/shared`, runtime, banco/rede/certificação; sem durabilidade física, G_QUALITY ou DONE.
- Isolamento em `/tmp/opencode/aaa12-mutation` com cópia própria das dependências; cópias de trabalho removidas após cada execução.
