# Revisão independente R1 — DX100-G02:IMPLEMENT-AND-ADMIT-SDK-SOURCE-CONTINUATION-3-2

Unidade: `docs/04_audit/evidence/CODEX100-EXEC-20261017/g02/sdk-continuation-3-2-admission/` na candidata
`/mnt/dados/cvg-work/cvg-codex100-c32-20261019` (HEAD destacado em `20daa7c75`). Objeto da revisão: `review-freeze-r1.json`
(sha256 `c758a732d1d1b465f6ccc3510508711337fe8beb25b6508ef0ca1f0c7d77930b`, 575 arquivos; ficam fora o próprio freeze e `review-r1/`).

## Regras do revisor

- Somente leitura fora de `review-r1/`. O único arquivo que você escreve na unidade é `review-r1/review.json`.
- Trabalhe em cópias dentro de `/mnt/dados/tmp/ricardo/claude-1000/-home-ricardo--rea-de-trabalho-cvg-operational-harness/d9ef2deb-79ba-4d9f-9adb-2a72f0539942/scratchpad/review-c32-r1/`.
- Antes e depois da revisão, confira o freeze: bytes e sha256 de cada arquivo listado, nenhum arquivo fora dele (exceto `review-r1/`) e nenhum `__pycache__`.
- Nenhum serviço novo (systemd-run, bwrap), sem rede, sem PG, sem porta TCP, nada em `/mnt/ia`. SDK e Pydantic não são importados no host.
- Rode Python com `python3 -I -B`. Pode rodar os autotestes, o validador, a reavaliação offline e `tools/repro_registry_ident_reuse.py` em cópia.
- Observação de cliente não é paridade: 0 recibos funcionais, 0 crédito de paridade.

## O que a unidade afirma

- Especificação: `inputs/spec-c3/` (cópia da `sdk-source-continuation-3-spec`, conferida em `preflight.json`), com `cases-c3-2.json`,
  `freeze-r4-c3-delta.json` (D3-01, D3-04, D3-05, D3-06, D3-07 e D3-08), `evaluator-r4-c3-delta.json` (E3-01, E3-07, E3-08 e E3-09),
  `execution-budget-c3-2.json` e `next-task.json` (carry-overs C3-SPEC/R2-F03 e R2-F04); `inputs/lead-decision-f01.json`;
  carry-overs da R1 do C3-1 em `inputs/c31-review/`.
- Implementação: uma pilha Python (base 2B-2) com `channel.py`, `control-client.py` e `acceptance.py` do C3-1; resumo em
  `state.json#/implementation`.
- Ordem: autotestes (46/46) e validador (17 controles negativos), `source-freeze-r4-c32.json` (36 arquivos), `identity-freeze-r4-c32.json`,
  10 DIAG (todos DIAG_PASS), `diag-admission-c32.json` (C3-PY02 com decisão RUN), CONTROL `C32-CTRL01` (MISMATCH pela regra 6 só por
  `wire.no_turn_interrupt`), 13 vagas SDK em ordem de vaga, uma vez cada, sem retry (13 PASS_CLIENT_OBSERVATION pela regra 7, forma PASS).
- Orçamento: 14/14 vagas, 10/12 serviços, 0 retry. Reavaliação offline 14/14 igual em predicados e desfecho.

## Achados já declarados pelo executor (avalie severidade e tratamento)

- **DV-C32-01, registro de threads por ident reusado.** `python/harness2b.py` `HookSet._profile` registra o nome só no primeiro evento de
  um `threading.get_ident()` novo; o CPython reusa o ident de thread terminado. No C3-PY13ER o thread `codex-goal-start-cleanup` rodou
  `h_stop` e o excepthook, o fault disparou uma vez, mas `THREAD_REGISTRY` não o lista e os `WAIT_RESULT` dos passos 11 a 13 trazem
  `thread_started` false (o passo 12 traz `ok` false). No DIAG-PY-BARRIER o `cvg-own-raiser` também falta. Reprodução offline em
  `registry-ident-reuse-repro.json`. O executor afirma que nenhum desfecho muda e que não houve reparo nem nova execução. Confira essa
  afirmação nos eventos do C3-PY13ER e diga se o PASS do C3-PY13ER e as provas do D3-05/E3-07 continuam válidos.
- **DV-C32-02, `case_plan_file` ausente no manifesto.** O supervisor do C3-2 não grava o sha do arquivo de plano em `profile-manifest.json`;
  na reavaliação `all_plan_binding_ok` é false só por isso e `all_plan_binding_content_ok` é true. Avalie se o R1-F03 (D3-08) fica cumprido.

## Pontos obrigatórios desta revisão

1. **Errata T1 do lead-decision-f01 no C3-PY13ER (D3-05, E3-07)**: passos 11, 12 e 13 com `CLIENT_EFFECT_UNLESS_ALIVE`; os autotestes
   (a) cleanup pulado dá MISMATCH pela regra 6 com os predicados exigidos, (b) alvo chamado duas vezes dá INVALID_CAPTURE e (c) thread vivo
   no estouro dá INVALID_CAPTURE; e o autoteste do C3-PY08 com W1 estacionado (MISMATCH por `consumer.results_exact`).
2. **Leituras C3-SPEC/R2-F03 (1) a (5) e R2-F04** em `state.json#/implementation/carry_over_spec_r2`.
3. **D3-04**: marcadores de entrada só no modo sdk, lista fechada de alvos do `fault.install`, ganchos por identidade (inclusive
   `next_login_notification`) e sondas em slots; nada importa o SDK fora do caso SDK.
4. **D3-05**: classe de espera lida do passo, `HARNESS_PRECONDITION` sem o campo, tabela `CLIENT_EFFECT_WAITS` retirada.
5. **Carry-overs da R1 do C3-1**: F01 aplicado em `termination_form` com autoteste negativo (zombie 9 seguido de ausência recusado);
   F02 e F03 não aplicáveis (driver e interpretador TS não reusados); F04 registrado.
6. **CONTROL e vaga condicional**: `C32-CTRL01` antes das vagas SDK, cópia do 2B2-CTRL01 fora do último elemento do argv; C3-PY02 só
   depois do DIAG-PY-PROCWITNESS aprovado.
7. **Capacidade**: o usuário negou capacidade nova (Q4). Confira que nada usa testemunha privilegiada, rede, artefato distribuído ou
   injeção de falha nova (os alvos novos do fault usam o modo `raise_before_call` existente).
8. **Predicados não vazios**: que os PASS se apoiam em capturas reais. Perturbações em cópias são bem-vindas.
9. Desvios DV-C32-03 a DV-C32-07 em `state.json#/implementation/deviations`.

## Formato de saída

Escreva `review-r1/review.json` com: `kind` INDEPENDENT_REVIEW, `round` 1, `task`, `reviewer`, `reviewed_at`, `subject`
(`review-freeze-r1.json`), `subject_sha256`, `subject_hash_check` (`before`/`after`), `verdict` (APPROVE ou REVISE), `verdict_reason`,
`erratum_t1` (`verdict` e `evidence`), `declared_findings` (DV-C32-01 e DV-C32-02, cada um com `assessment`, `severity` e `evidence`),
`findings` (lista com `id` R1-Fnn, `severity` P1/P2/P3, `area`, `title`, `evidence`, `detail`, `required_action`), `summary_counts`,
`functional_receipts` 0 e `parity_credit` 0. P1/P2 bloqueiam; P3 são endurecimentos e registros. Texto em português.
