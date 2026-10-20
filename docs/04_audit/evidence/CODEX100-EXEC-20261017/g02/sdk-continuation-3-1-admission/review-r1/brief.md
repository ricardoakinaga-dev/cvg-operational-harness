# Revisão independente R1 — DX100-G02:IMPLEMENT-AND-ADMIT-SDK-SOURCE-CONTINUATION-3-1

Unidade: `docs/04_audit/evidence/CODEX100-EXEC-20261017/g02/sdk-continuation-3-1-admission/` na candidata
`/mnt/dados/cvg-work/cvg-codex100-c31-20261019` (HEAD destacado em `bd97df323`). Objeto da revisão: `review-freeze-r1.json`
(sha256 `fa574e2f7608b52dec3b8e04ceba045f4a856abcedbd74fadbb6b0e15e5daef9`, 619 arquivos; ficam fora o próprio freeze e `review-r1/`).

## Regras do revisor

- Somente leitura fora de `review-r1/`. O único arquivo que você escreve na unidade é `review-r1/review.json`.
- Trabalhe em cópias dentro de `/mnt/dados/tmp/ricardo/claude-1000/-home-ricardo--rea-de-trabalho-cvg-operational-harness/d9ef2deb-79ba-4d9f-9adb-2a72f0539942/scratchpad/review-c31-r1/`.
- Antes e depois da revisão, confira o freeze: bytes e sha256 de cada arquivo listado, nenhum arquivo fora dele (exceto `review-r1/`) e nenhum `__pycache__`.
- Nenhum serviço novo (systemd-run, bwrap), sem rede, sem PG, sem porta TCP, nada em `/mnt/ia`. SDK e Pydantic não são importados no host.
- Rode Python com `python3 -I -B`. Pode rodar os autotestes, o validador e a reavaliação offline em cópia.
- Observação de cliente não é paridade: 0 recibos funcionais, 0 crédito de paridade.

## O que a unidade afirma

- Especificação: `inputs/spec-c3/` (cópia da `sdk-source-continuation-3-spec`, conferida em `preflight.json`), com
  `cases-c3-1.json`, `freeze-r4-c3-delta.json`, `evaluator-r4-c3-delta.json`, `next-task.json` e `review-r2/executor-disposition.json`.
- Implementação: D3-01, D3-02, D3-03, D3-07 e D3-08 (pilha Python do CONTROL) e as cláusulas E3-01 a E3-06; resumo em `state.json#/implementation`.
- Duas pilhas no host: `tslane/` (supervisor e avaliador TypeScript, base 2AC) e `python/` (pilha do 2B-2), com um único source freeze,
  identity freeze, diag-admission, `budget.json` e `case-ledger.json`.
- Ordem: autotestes (94/94) e validador, `source-freeze-r4-c31.json`, `identity-freeze-r4-c31.json`, 8 DIAG (todos DIAG_PASS),
  `diag-admission-c31.json`, CONTROL `C31-CTRL01` (MISMATCH pela regra 6 só por `wire.no_turn_interrupt`), 14 slots TypeScript em ordem de
  slot, uma vez cada, sem retry (14 PASS_CLIENT_OBSERVATION; C3-TS04, C3-TS12 e C3-TS13 na forma KNOWN_SIGNAL_TERMINATION).
- Orçamento: 15/15 vagas, 8/12 serviços, 0 retry. Reavaliação offline 15/15 igual, com `plan_binding` em todas.

## Pontos obrigatórios desta revisão

1. **Errata C3-SPEC/R2-F01** (`inputs/spec-c3/next-task.json#/carry_over`): confira em `tslane/acceptance.py` (`node_abort_termination`) que
   o predicado `abort.child_terminated_by_node_abort` julga só os itens (1) a (5); que a ordem entre processos só é registrada (nunca MISMATCH)
   e que não há predicado order_unilateral novo; que o driver emite `ABORT_REQUESTED` antes da chamada `abort()` (`node/ts-driver.mjs`,
   modo `next_abort_at_barrier`); e que existe o autoteste obrigatório (SIGNAL do adapter antes do marco do driver não dá MISMATCH).
2. **R2-F02**: o getter de testemunha captura erro de listagem, devolve o valor ao SDK e registra o erro; `tmp.getter_witness_recorded`
   falha nesse caso; o registro vale para qualquer passo com invocação.
3. **Carry-overs 2B2-ADM R1-F02, R1-F03 e R1-F04** (D3-08) na pilha Python do CONTROL, com os autotestes pedidos.
4. **Vocabulário fechado do D3-02**: passo, chave, modo ou marcador fora da lista termina INVALID; nenhum caminho do driver mata o filho do SDK.
5. **Capacidade**: o usuário negou capacidade nova (Q4). Confira que nada usa testemunha privilegiada, rede, artefato distribuído ou
   injeção de falha nova; a testemunha do SO é o rastreador de PID do 2B-2 (estado, status de zombie, ausência).
6. **Predicados não vazios**: que os PASS dos slots TS se apoiam em capturas reais (por exemplo, listagens do getter com diretório real,
   SUSPENDED com adapter vivo, ordem de liberação, SIGTERM testemunhado). Perturbações em cópias são bem-vindas.
7. Desvios declarados DV1 a DV6 em `state.json#/implementation/deviations`.

## Formato de saída

Escreva `review-r1/review.json` com: `kind` INDEPENDENT_REVIEW, `round` 1, `task`, `reviewer`, `reviewed_at`, `subject`
(`review-freeze-r1.json`), `subject_sha256`, `subject_hash_check` (`before`/`after`), `verdict` (APPROVE ou REVISE), `verdict_reason`,
`erratum_r2_f01` (`verdict` e `evidence`), `findings` (lista com `id` R1-Fnn, `severity` P1/P2/P3, `area`, `title`, `evidence`,
`detail`, `required_action`), `summary_counts`, `functional_receipts` 0 e `parity_credit` 0. P1/P2 bloqueiam; P3 são endurecimentos e
registros. Texto em português.
