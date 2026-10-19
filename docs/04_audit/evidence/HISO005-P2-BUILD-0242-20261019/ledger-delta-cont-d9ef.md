# Delta proposto para os ledgers — HISO005-P2-BUILD-0243 e HISO005-P2-BUILD-0242 (CONT-20261018-D9EF)

Texto para o lead integrar. Estas unidades não editaram `99`, `20`, `30`, a coordenação, o catálogo central nem a raiz, fora destas duas pastas de evidência. Evidência:

- [aceites 0242](acceptance-status.json) e [aceites 0243](../HISO005-P2-BUILD-0243-20261019/acceptance-status.json);
- [promoção 0242](promotion-deltas-prepared.json) e [promoção 0243](../HISO005-P2-BUILD-0243-20261019/promotion-deltas-prepared.json);
- [recibo de liberação](runtime-release-receipt.json).

## `docs/99_runtime_state.md`

- `last_completed_action`: BUILD local da SPEC0243 e da SPEC0242 numa candidata detached, a partir de `bcd49fa6` (PR #6, já mergeado). Três commits:
  - `131ee6cd`: 0243;
  - `188745d0`: 0242;
  - `32b92121`: correção de teste da 0243.
- Gates da composição: 16/16 (certify r2, CONDITIONAL_GO) e verificador com 38 hashes.
- Medição B6 final na raiz `228e7918`: INCOMPLETE, corpo integral 1.341/1.341, 13.521 diagnósticos, 0 provas, 0 violações, validation true, normal igual a strict.
- `status`: `READY_FOR_NEXT_STEP`.
- `next_action`:
  1. o lead confere os dois diffs que não passaram por rodada de crítica: 0243 r2→r3 (correção do R2-01) e o commit `32b92121`;
  2. promove os caminhos por PR sobre pré-imagens iguais, 0243 antes de 0242.
- B6: continua `INCOMPLETE`. A barreira de `maxContexts` caiu; os UNKNOWN do corpo inteiro agora estão visíveis.

## `docs/20_master_execution_log.md`

### 19/10/2026 — HISO005-P2-BUILD-0243 e HISO005-P2-BUILD-0242 (Claude Code, CONT-20261018-D9EF)

- **Base.** As pré-imagens da SPEC0242 §5 conferiram byte a byte em `bcd49fa6`. O `node_modules` foi copiado da candidata do porte, sem install.
- **0243 (`131ee6cd` + `32b92121`).**
  - `docs/04_audit/evidence/**` saiu do snapshot instalado e do archive compilado, sem mudar limite.
  - A guarda fail-closed roda antes de config, resolução e archive. O archive literal tem conferência física. Os recibos levam `sourceExclusions`, e a compilada passa a v2.
  - Crítica: R1 REVISE com 5 achados, corrigidos. R2 REVISE com 1 achado (lock acima de 16 MiB), corrigido em r3 sem terceira rodada.
  - Testes congelados: portátil 17/17, nativo 79/79, focal 810/810.
  - RS06 em `228e7918`: B6 2.410 = 2.410, tupla a tupla, e os recibos diferem só na lista fechada.
  - RS07: snapshot de 279 MB e tar de 45 MB, contra 3,78 GB sem escopo; leitor PROVEN.
- **0242 (`188745d0`).**
  - L1/L2: 256 contextos, 250.000 estados, prazo de 300 s. O espelho INTERPRETER do helper de resolução foi atualizado, como desvio registrado.
  - L3: relógio do comparador por fase, com COMPARISON_AFTER_FINALIZE.
  - Crítica R1: APPROVE, sem obrigatórios.
  - Testes congelados: novo 12/12, focal 822/822, nativo 79/79.
  - LB04: só some a tupla de envelope maxContexts.
- **Gates.**
  - certify r1: 14/16. O pin de hermeticidade do perfil nativo ficou fora do focal e foi corrigido em `32b92121`.
  - certify r2: 16/16. `certification:verify`: 38 hashes. Consumidor fresco PASS em `131ee6cd`, `188745d0` e `32b92121`.
- **Medição final (pós-gates).**
  - Corpo COMPLETED 1.341/1.341, com 1.535 arestas contidas.
  - 13.521 diagnósticos, contra 2.410 do BUILD0241; 0 provas, 0 violações.
  - Etapa semântica: 100 s de 300 s. Fases do verificador: 23 s e 2 s. Worker com 1,2 GB.
- **Segredos.** gitleaks 8.28.0 (release) em modo git sobre os 3 commits e em modo dir sobre as duas pastas: código de saída 0. `test:secrets:config`: 33/33.
- **Liberação.** PG 56262 parado e removido; portas 3448/4448 livres; 11,6 GB de runtime e o worktree `eval-228e` removidos; a candidata ficou como âncora.

## `docs/30_backlog_master.md`

- HISO005-P2-BUILD-0243: `COMPLETED_LOCAL`, promoção pendente com o lead (PR), com ponto aberto de conferência dos diffs sem rodada de crítica.
- HISO005-P2-BUILD-0242: `COMPLETED_LOCAL`, promoção pendente com o lead (PR), depois da 0243.
- Riscos registrados:
  - `maxNodes` está a 1,18× de folga: 1.693.845 de 2.000.000.
  - A fronteira de 13.521 diagnósticos é a nova linha de base. Mais UNKNOWN não é regressão, e menos não é crédito.
- Observações P3 para o backlog técnico:
  - teste do checker para `identityPhaseMs`;
  - mutação durante o intervalo entre finalizações;
  - forma de `testOnly` (chave extra, `null`, `{}`);
  - memoização de `workspaceMatches` diante de manifesto hostil;
  - código próprio para divergência de fechamento já aplicado (`COMPILED_SOURCE_CLOSURE_MISMATCH`).
