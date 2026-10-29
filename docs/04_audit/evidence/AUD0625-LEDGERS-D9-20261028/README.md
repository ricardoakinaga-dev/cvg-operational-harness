# AUD0625-LEDGERS-D9-20261028 — evidência (F20)

Base origin/main 8429019b. Node v22.23.2.
- Cópias (97 arquivos: relatório 0625, AUD-SCORE-20261028, handoff, USER-DECISIONS-20261028): `sha256sum` na origem (checkout compartilhado) e `sha256sum -c` na worktree após o cp, 0 divergências (verificado com LC_ALL=C: 97 OK, 0 falhas). Lista: copied-artifacts-sha256.txt (caminhos relativos à raiz do repositório).
- `npx prettier --check` nos 100+ arquivos do diff: exit 0.
- `npm run docs:check-links`: exit 0 (EVIDENCE_HYGIENE_OK). O report-review.md do Codex tinha 16 links relativos ao local do relatório; resolvidos com 16 entradas `movedTargets` em docs/doc-link-policy.json, sem editar o artefato.
- gitleaks 8.28.0 (binário de outra pasta de trabalho, sha256 5fd1b3b0…3298) `git --log-opts=origin/main..HEAD --config .gitleaks.toml`: exit 0, 1 commit, no leaks (gitleaks-output.txt).

## Rodada final (AUD0625-LEDGERS-FINAL-D9-20261028)

Node v22.23.2. `human-decisions-3.json` copiado byte a byte (sha256 8e667305…57e5, conferido depois do prettier). Ledgers 99/20/30 e README com o estado final da onda (0267/0268/0270 `IMPLEMENTED_LOCAL`, 0269 implementada, 0272 em BUILD, 0271 adiada, imagem com o Codex, publicação autorizada). `prettier --check`: exit 0. `npm run docs:check-links`: exit 0 (EVIDENCE_HYGIENE_OK). gitleaks 8.28.0 `origin/main..HEAD`: exit 0, ver gitleaks-final-output.txt.
