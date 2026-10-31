# Onda 7 AUD0625 — resultado (07)

Branch `claude/aud0625-wave7` @ `a3eb0fe12` (local, sem push), sobre a onda 6 (PR #37, `c05031b40`). Produção `NO_GO`.

## O que entrou
- PAR-X03 fatia 1 (`f0b6ca3b6`, merge `004f6a7f1`), revisada em AUD0625-REVIEW-0294-S1-07.
- PAR-S02 (SPEC 0292) com o reparo 07 e o S02-REPAIR-F04 (`78ca338dd`, Codex APPROVE_SCOPED_F04_FINAL 77089): merge `fc9066b79`.
- PAR-S05 / SPEC 0295 (`9544042f4`, Codex APPROVE_SCOPED_F07_FINAL 76829): merge `78f2580f6`. Correções de integração: o teste PG da S05 grava a origem da aprovação no INSERT (a 0035 a torna imutável); `SKIP-PG-S05-002` religado (11 pulados, hash novo).
- PAR-A01 / SPEC 0296 (`6799bb84b`, recibo 28): merge `43853651b`; teste de memória trocado por contagem determinística (`0befd5c0d`), merge `4f22d756a`.
- A onda 6 (PR #37): merge `a3eb0fe12`. Conflito só na tabela de cartões do 0380 (S02 `IN_PROGRESS`; M02, S01, S04 e C01 `DONE`).
- Documentos correntes do Q01 (recibos 30 e 32, denominador 272): 7 das 10 trocas exatas do commit `60b906f6e` da Codex aplicadas como edições (0379: 3, 0380: 3, 0381: 1), mais as pastas de evidência `AUD0625-Q01-CURRENT-DOCS-272-20261031` e `AUD0625-PAR-Q01-CATALOG-20261031/denominator-272` (os links do 0380 apontam para a medida). Não aplicáveis (3): 0379 #0, 0380 #7 e 0381 #9 trocam texto que só existe nos documentos sujos do root, não nesta base; nada a trocar.

## Gates
typecheck, eslint, prettier, `docs:check-links` (`EVIDENCE_HYGIENE_OK`), `skip:governance`, `mutation:guard`, testes Python do SDK (com `PYTHONDONTWRITEBYTECODE=1`), `npm audit --package-lock-only` (0 na onda 6).

## Suíte completa com cobertura por arquivo (`npm run test:coverage:per-file`, PG 16 real, locais `--testTimeout/--hookTimeout=240000`)
| Rodada | Duração | Arquivos | Testes | Falhas | Veredito |
| --- | --- | --- | --- | --- | --- |
| 1 | 3386 s | 665 passaram, 1 pulado | 10013 passaram, 1 pulado | 0 testes | exit 1: 2 erros não tratados do pool ("Failed to start forks worker", b6-0237 e b6-0244), causados pela minha carga paralela; sem veredito de cobertura (agregado 94,02% / 91,13% / 95,26% / 94,98%) |
| 2 | 4472 s | 665 passaram, 2 falharam, 1 pulado | 10131 passaram, 4 falharam, 1 pulado | 4 | exit 1: `reference-port/cli-entry` (SIGINT e SIGTERM durante o import da CLI, prazo de 3 s do filho) e `reference-port/controller.test.js` (2 testes, 63 s e 45 s, revalidação recursiva de diretórios fixados sob carga); isolados: 52/52 em 50 s |
| 3 | 2994 s, `--retry=1` só local | 667 passaram, 1 pulado | 10135 passaram, 1 pulado | 0 | exit 0, `[core-coverage] PASS` agregado: statements 94,02%, branches 91,12%, funções 95,26%, linhas 94,98% |

As rodadas 1 e 2 ficam registradas: não contam como verdes. A rodada 3 usou um único retry local (limites do repositório intactos). Os dois flakes observados a pedido do DF (equivalência aleatória da S02 slice 1 e o teste de memória da 0296) passaram nas três rodadas. O veredito oficial é o da barra da CI; o `controller.test.js` ganha cartão de desempenho próprio do DF (não é desta onda).
