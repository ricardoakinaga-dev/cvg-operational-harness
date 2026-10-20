# Revisão independente R2 — DX100-G02:BIND-SDK-SOURCE-CONTINUATION-3

Unidade T1 documental: `docs/04_audit/evidence/CODEX100-EXEC-20261017/g02/sdk-continuation-3-binding/` no checkout principal
`/home/ricardo/Área de trabalho/cvg-operational-harness` (pasta nova, não rastreada). Objeto da revisão: `review-freeze-r2.json`
(sha256 `ad94b206a337591f17e36043e5cf368daa62ffaf554314cd434d2650a41530cb`, 25 arquivos; ficam fora o próprio freeze e `review-r2/`).
Esta é a última rodada (2/2) e o reparo agrupado já foi usado (1/1): achados P1/P2 desta rodada ficam como carry-over declarado.

## Regras do revisor

- Somente leitura fora de `review-r2/`. O único arquivo que você escreve na unidade é `review-r2/review.json`.
- Trabalhe em cópias dentro de `/mnt/dados/tmp/ricardo/claude-1000/-home-ricardo--rea-de-trabalho-cvg-operational-harness/d9ef2deb-79ba-4d9f-9adb-2a72f0539942/scratchpad/review-bind3-r2/`.
  Os scripts da unidade gravam na pasta da unidade: rode-os só sobre cópias que escrevam fora dela.
- Antes e depois da revisão, confira o freeze: bytes e sha256 de cada arquivo listado, nenhum arquivo fora dele (exceto `review-r2/`).
- Sem serviço, SDK, rede, PG, porta TCP, commit, branch; nada em `/mnt/ia`. Python com `python3 -I -B`. Não edite nenhuma outra pasta
  (`../sdk-distributed-profile-spec/` é de outra unidade em andamento; não leia como entrada nem edite).
- Observação de cliente não é paridade: 0 recibos funcionais, 0 crédito de paridade.

## O que mudou desde a R1

A R1 (`review-r1/review.json`, REVISE com 0 P1, 1 P2 e 4 P3) foi tratada num reparo agrupado registrado em `repair-r1.json`, com as
preimagens em `archives/r1-preimages/`. Em resumo:

- R1-F01 (P2): `arms_v5_partial_not_targeted_remaining` e `open_items_outside_plan` (V6-PY02-ENV) no v6; HOW v3, `next-task.json` e
  `state.json` corrigidos; validador exige lado restante e destino.
- R1-F02: `v5_partial_scope` também para `arms_closed_v3_carried`; 13 braços parciais fechados (TS07.B03 e TS07.B04 entram); TS05.B04 e
  PY13.B18 em `arms_v5_qualification_strengthened_by_c3`; TS03.B03 entre os não mirados; TS12.B01 e PY17.B04 com o que segue aberto.
- R1-F03: base da capacidade nova (regra da unidade, não decisão do usuário; a Q4 negou só a testemunha privilegiada).
- R1-F04: `forced_side_observed` nos seis OUT_NONDETERMINISTIC; PK03 de volta à linha de plataforma.
- R1-F05: condição do DV-C32-02; R-PY13-4 como OPEN_PART_NOT_CREDITED; C32-ADM/R1-F01 inteiro; ganho da continuação 4 corrigido.

Créditos, contagens de partes, status das linhas e lacunas não mudaram (resíduos: 34 resolvidos, 1 parcial, 39 abertos, 3 fechados sem
observação). Validador: PASS com 28/28 controles negativos.

## Pontos obrigatórios

1. Cada achado da R1: resolvido, parcial ou aberto, com evidência no estado atual dos arquivos.
2. O reparo não introduziu erro novo: recalcule das entradas o crédito por parte (58/57), as listas de braços do v5 (fechados, reforçados,
   não mirados com lado restante), a resolução dos 77 resíduos e o item fora do plano, e confira o HOW v3, o `next-task.json` e o
   `state.json` contra o v6.
3. Que nenhuma outra afirmação do HOW v3 fique sem suporte e que nada do perfil distribuído tenha sido promovido (os 11 seguem abertos).
4. Que o reparo ficou dentro do escopo dos achados (`repair-r1.json`; preimagens).

## Formato de saída

Escreva `review-r2/review.json` com: `kind` INDEPENDENT_REVIEW, `round` 2, `task`, `reviewer`, `reviewed_at`, `subject`
(`review-freeze-r2.json`), `subject_sha256`, `subject_hash_check` (`before`/`after`), `verdict` (APPROVE ou REVISE), `verdict_reason`,
`r1_findings_status` (lista com `id`, `status` RESOLVED/PARTIAL/OPEN e `evidence`), `findings` (lista com `id` R2-Fnn, `severity` P1/P2/P3,
`area`, `title`, `evidence`, `detail`, `required_action`), `summary_counts`, `functional_receipts` 0 e `parity_credit` 0. Texto em português.
