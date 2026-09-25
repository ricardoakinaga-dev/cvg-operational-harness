# Preview — habilitar a pasta C1E para evidência candidate-bound

Status: proposta, não aplicada nem executada. A tentativa C1 original e seus logs permanecem intactos.

## `config/workspace-dependency-policy.json`

Alterar somente `candidateBinding.npmVersionFilePath` do path R1 para:

`docs/04_audit/evidence/AUD-20260923/M07-S1-R1-C1E/npm-version.txt`

## `scripts/workspace-dependency-audit.mjs`

Atualizar a constante usada para validar o registro npm do candidato para o path C1E acima; alinhar a mensagem de erro a C1E; e permitir exatamente `M07-S1-R1-C1E` no allowlist de `validateOutputPath`. Preservar traversal checks, verificação de symlink e as duas pastas históricas permitidas. Não aceitar nomes arbitrários nem flexibilizar raiz, extensão ou controles de symlink/traversal.

## `tests/workspace-dependency-audit.test.js`

- Atualizar a expectativa de `candidateBinding.npmVersionFilePath` para o path C1E.
- No teste `accepts only an M07 evidence output path and rejects traversal or symlink escape`, criar `docs/04_audit/evidence/AUD-20990101/M07-S1-R1-C1E`, confirmar que `candidate.json` é aceito e confirmar que `M07-S1-R1-C1E-UNAPPROVED/candidate.json` é rejeitado. Preservar os casos M07-BUILD-S1, M07-S1-R1, traversal e symlink.

Nenhum arquivo de produto, fixture conversacional, threshold, manifesto, CI, `.nvmrc` ou evidência histórica será alterado por esta proposta. A correção C1 do fixture já aplicada permanece byte-estável neste gate e entra no novo candidate como quarto path autorizado.
