# Revisão independente R2 — DX100-G02:BIND-SDK-DISTRIBUTED-PROFILE

Unidade T1 documental: `docs/04_audit/evidence/CODEX100-EXEC-20261017/g02/sdk-distributed-profile-binding/` no checkout principal
`/home/ricardo/Área de trabalho/cvg-operational-harness` (pasta não rastreada). Objeto da revisão: `review-freeze-r2.json`
(sha256 `0fe3c38f89ecf6fb0ea62358db0a5c19e97f1fc51cac3a13c6a5ae11499d3061`, 25 arquivos; ficam fora o próprio freeze e `review-r2/`).
Esta é a última rodada do orçamento (2 revisões, 1 reparo agrupado já usado).

## Regras do revisor

- Somente leitura fora de `review-r2/`. O único arquivo que você escreve na unidade é `review-r2/review.json`.
- Trabalhe em cópias dentro de `/mnt/dados/tmp/ricardo/claude-1000/-home-ricardo--rea-de-trabalho-cvg-operational-harness/d9ef2deb-79ba-4d9f-9adb-2a72f0539942/scratchpad/review-dpbind-r2/`.
  Os scripts da unidade gravam na pasta da unidade: rode-os só sobre uma cópia espelhada (o `<repo_root>` apontando para a cópia).
- Antes e depois da revisão, confira o freeze: bytes e sha256 de cada arquivo listado, nenhum arquivo fora dele (exceto `review-r2/`) e
  nenhum `__pycache__`.
- Sem serviço, SDK, rede, PG, porta TCP, commit, branch; nada em `/mnt/ia`; não execute nada do cache distribuído. Python com
  `python3 -I -B`. Não edite nenhuma outra pasta.
- Observação de cliente não é paridade: 0 recibos funcionais, 0 crédito de paridade.

## Contexto

O pedido do Lead e o que a unidade afirma estão em `review-r1/brief.md`. A R1 (`review-r1/review.json`) deu REVISE com 3 P2 e 9 P3. O
reparo agrupado único está em `repair-r1.json`, com as preimagens em `archives/r1-preimages/`. Mudaram o build, o v7, as lacunas v7,
a validação, o HOW e o script de fechamento; `state.json` e `next-task.json` foram regravados na fase `repaired`
(`REPAIRED_PENDING_R2`).

## Pontos obrigatórios

1. **Cada achado da R1**: diga se foi resolvido (RESOLVED, PARTIAL ou NOT_RESOLVED), com evidência. Em especial:
   - R1-F01: a nova resposta do HOW ("ainda não", cinco condições, plano de runners e acesso por família, mapa dos itens sem decisão
     nova para D01, A01 e Z02) frente ao aceite e ao "Como" do cartão DX100-G02 no `docs/03_build/0386_backlog_paridade_codex.md`;
   - R1-F02: a leitura R2-F03 do DP-1 no lugar da R1-F04, nos registros, nas observações e nos braços do PK06 e do PK08;
   - R1-F03: a ordem da limpeza (âncora dos seis commits antes de apagar worktrees; cache mantido).
2. **Regressões do reparo**: o reparo não pode mudar crédito, partes, status, contagens 44/0 nem as 50 partes; confira contra as
   preimagens e recalcule das entradas o que precisar.
3. **Decisões**: as dez decisões do usuário e a do Lead (D-NEWCAP), com os ganhos batendo com `decisions_that_would_unlock`; a
   reclassificação do R-PY19-4 e do R-PY19-5 (needs_new_decision true, D-PIN-VERSION) e o D-PIN-BUILD sem resíduo.
4. **Validação**: os controles novos testam o que dizem (38/38), e a sonda da R1 (R-PK07-2 inalcançável e fora do D-PLATFORM) agora
   é recusada.
5. Afirmações do `repair-r1.json`, do `state.json` e do `next-task.json` sustentadas pelos arquivos.

## Formato de saída

Escreva `review-r2/review.json` com: `kind` INDEPENDENT_REVIEW, `round` 2, `task`, `reviewer`, `reviewed_at`, `subject`
(`review-freeze-r2.json`), `subject_sha256`, `subject_hash_check` (`before`/`after`), `verdict` (APPROVE ou REVISE),
`verdict_reason`, `r1_findings_after_r2` (cada id da R1 com RESOLVED, PARTIAL ou NOT_RESOLVED e evidência), `g02_close_reading`
(`verdict` e `evidence`), `findings` (lista com `id` R2-Fnn, `severity` P1/P2/P3, `area`, `title`, `evidence`, `detail`,
`required_action`), `summary_counts`, `functional_receipts` 0 e `parity_credit` 0. P1/P2 bloqueiam; P3 são endurecimentos e
registros. Texto em português.
