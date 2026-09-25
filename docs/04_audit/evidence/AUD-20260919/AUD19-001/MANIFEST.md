# Manifesto de verificação — AUD19-001

- task: `AUD19-001`; onda: `W0`; status: `VERIFIED`.
- runtime: Node `v22.23.2`, npm `10.9.8` (engine do projeto `>=22 <23`).
- prettier travado: `3.8.3`.
- autorização: prompt humano de 2026-09-19 (gate `G0` para `AUD19-001`–`AUD19-016`,
  escopo local/sintético/descartável; sem commit/push, sem produção).

## Comandos e resultados

| Comando                                     | Resultado                                                                                              |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `npm run format:check` (antes)              | FAIL, exatamente os 9 arquivos de F-01 (`format-before.txt`)                                           |
| `npx prettier --write` (9 paths congelados) | 9 arquivos reescritos (`prettier-write.txt`)                                                           |
| `npm run format:check` (depois)             | PASS — `All matched files use Prettier code style!` (`format-after.txt`)                               |
| `git diff --check` (antes e depois)         | PASS (`diffcheck-before.txt`, `diffcheck-after.txt`)                                                   |
| JSON parse-compare vs `HEAD` (5 arquivos)   | `ALL_JSON_EQUAL` (saída capturada no log da rodada)                                                    |
| Markdown `git diff -w` (4 arquivos)         | somente formatação determinística (escapes, ênfase, tabelas, blank lines); tokens de conteúdo intactos |

## Arquivos desta evidência

- `SPEC.md` — SPEC congelada da task.
- `sha256-before.txt` / `sha256-after.txt` — hashes dos 9 arquivos.
- `HASH_TRANSITION.md` — mapeamento de supersessão explícita.
- `format-before.txt` / `format-after.txt` — saídas do gate.
- `diffcheck-before.txt` / `diffcheck-after.txt` — `git diff --check`.
- `prettier-version.txt` / `prettier-write.txt` — versão travada e escrita.

## Limitações declaradas

- `certification:verify` continua com `CANDIDATE_DRIFT` (pré-existente);
  identidade canônica nova será congelada em `AUD19-002`.
- Citação histórica `59dde900…` supersedida por `d92f69f0…` (conteúdo
  idêntico); reconciliação narrativa em `AUD19-012`.
- Produção: `NO_GO` (inalterado).
