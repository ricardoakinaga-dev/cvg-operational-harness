# Revisão independente R1 — DX100-G02:IMPLEMENT-AND-ADMIT-SDK-DISTRIBUTED-PROFILE-DP-2

Você é o crítico independente desta unidade de implementação e admissão. Não herdou contexto. Revise o código, os freezes,
os serviços executados e os resultados, e escreva o veredito em JSON.

Unidade: `docs/04_audit/evidence/CODEX100-EXEC-20261017/g02/sdk-distributed-profile-dp2-admission/` na candidata
`/mnt/dados/cvg-work/cvg-codex100-dp2-20261020` (HEAD destacado em `3ca3fd3b0`, o recibo do DP-1; sem commit desta unidade ainda).
Objeto da revisão: `review-freeze-r1.json` (sha256 `beacbae2e99a653a493b5f330906cbd8fb5edb9513016ad1807fc7c98259f5cc`, 375 arquivos;
ficam fora o próprio freeze e `review-r1/`). Runtime privado, fora de `docs/`: `/mnt/dados/cvg-work/cvg-codex100-dp2-runtime-20261020`
(`dist/` do sub-lote, `attempts/`, `dry/`). Cache somente leitura: `/mnt/dados/cvg-work/cvg-codex100-distributed-cache-20261019`.

## Regras do revisor

- Somente leitura fora de `review-r1/`. O único arquivo que você escreve na unidade é `review-r1/review.json`.
- Trabalhe em cópias dentro de `/mnt/dados/tmp/ricardo/claude-1000/-home-ricardo--rea-de-trabalho-cvg-operational-harness/d9ef2deb-79ba-4d9f-9adb-2a72f0539942/scratchpad/review-dp2-r1/`.
- Antes e depois da revisão, confira o freeze: bytes e sha256 de cada arquivo listado, nenhum arquivo fora dele (exceto `review-r1/`)
  e nenhum `__pycache__`.
- Proibido: serviço (systemd-run), bwrap, o supervisor em qualquer modo (`run`, `dry`, `freeze`, `freeze-identities`, `diag-admission`,
  `init-ledgers`, `stage-dist`, `stage-trees`, `fixtures`, `plan`), `selftests/selftest_dp2.py` (usa bwrap próprio e o runtime),
  importar ou executar o SDK, o Pydantic, os wrappers publicados ou qualquer arquivo do cache e do `dist/`; rede, Docker, PG, porta TCP,
  `/mnt/ia`, commit, branch ou worktree.
- Pode rodar, com `python3 -I -B` e só em uma cópia sua da pasta: `python/acceptance.py reevaluate <pasta-do-caso>` (o DP-PY20A lê o
  cache por sha, sem executar nada), `tools/validate_unit.py`, `tools/topology_checks.py`, e leituras de arquivos. Perturbações em cópias
  são bem-vindas.
- Observação de cliente não é paridade: 0 recibos funcionais, 0 crédito de paridade.

## Pedido da unidade

Implementar e admitir o sub-lote DP-2 (Python) do perfil distribuído keyless: PY19 (DP-PY19A/B/C), o ramo empacotado do PY02
(DP-PY02P, binário publicado 0.153.4 só dentro da contenção, condicional ao DIAG-DP-REAL-CLI-APPSERVER) e PY20 (DP-PY20A, verificação de
artefato sem serviço), conforme:

- `inputs/spec-dp/cases-dp-2.json`, `freeze-r4-dp-delta.json` (DDP-01..11), `evaluator-r4-dp-delta.json` (EDP-01..08),
  `capability-contracts-dp.json`, `control-slot-contract-dp.json`, `execution-budget-dp-2.json`;
- a errata do R2-F01 (`inputs/spec-dp/review-r2/executor-disposition.json`), obrigatória antes do source freeze;
- o `inputs/dp1/next-task.json` (carry-overs e P3 levados ao DP-2) e a decisão do Lead `inputs/dp1/lead-decision-dv1-dv4.json`;
- `inputs/spec-dp/lead-confirmation-20261019.json` (capability nova = do kernel ou privilégio; o DP-PY02P cabe na Q3);
- os carry-overs da C3-2 na pilha Python (`inputs/c32/`): registro de threads por `threading.local` com autoteste (guarda E3-07),
  lista fechada de `wait_class` do D3-05 e `case_plan_file` no manifesto (DV-C32-02).

Orçamento rígido: 6 vagas (CONTROL primeiro, exigindo MISMATCH), 12 serviços, 2 revisões, 1 reparo agrupado, 0 retries; load até 12.
Só artefatos do cache conferidos por sha; nenhum binário em `docs/`; sem PG, porta ou rede; sem capability ou privilégio novo.

## O que a unidade afirma

- Pilha Python única em `python/` (base: a pilha da C3-2, ver DV-DP2-01) com `stage_dp.py` (CAP-DP-STAGE, derivado do `dplane/stage.py`
  do DP-1, com o wheel A1 em zip). Resumo por item em `state.json#/implementation`.
- Ordem: preflight (51/51), autotestes (59/59) e validador (11 controles negativos), fixtures e plano, ledgers, `source-freeze-dp2.json`
  (45 arquivos), `identity-freeze-dp2.json`, 10 DIAG (todos DIAG_PASS), `diag-admission-dp2.json` (DP-PY02P com decisão RUN), CONTROL
  `DP2-CTRL01` (MISMATCH pela regra 6 só por `wire.no_turn_interrupt`), 5 vagas em ordem de vaga, uma vez cada, sem retry: DP-PY19A
  PASS_CLIENT_OBSERVATION (driver_only, forma PASS), DP-PY19B e DP-PY19C PASS_CLIENT_OBSERVATION (adapter_peer, forma
  CLIENT_TERMINATED_SIGTERM; o ledger traz o candidato `SIGTERM_CANDIDATE`), DP-PY02P PASS_CLIENT_OBSERVATION (driver_only, forma
  REAL_CLI_KEYLESS), DP-PY20A PASS_CLIENT_OBSERVATION (ARTIFACT_CHECK, sem serviço).
- Orçamento: 6/6 vagas, 10/12 serviços, 0 retry. Reavaliação offline 6/6 igual em predicados e desfecho, com `plan_binding_ok`.
  `topology-checks-dp2.json` ok com 5/5 controles negativos. 15 unidades `cvg-dx100-dp2-*` liberadas; 60 artefatos vazios esperados em
  `empty-artifact-delta.json`.
- Desvios DV-DP2-01 a DV-DP2-07 em `state.json#/implementation/deviations`. Atenção ao **DV-DP2-02**: o primeiro source freeze e a
  identity freeze foram gravados com um autoteste falhando (arquivados em `archives/pre-service-refreeze/`) e refeitos antes de qualquer
  serviço. Avalie se a disciplina de freeze ficou íntegra.

## Pontos obrigatórios desta revisão

1. **Errata R2-F01 (DDP-12 declarado)**: topologia por caso declarada no plano, na config e no resultado; o canal recusa outra;
   `observer.reconcile_driver_only` recusa quadro de adapter ou peer; base driver_only vira PASS ou REAL_CLI_KEYLESS conforme o caso; os
   três autotestes obrigatórios existem e testam o que dizem (`selftests/selftest_dp2.py`, `selftests/selftest-results.json`).
2. **Oráculos**: cada predicado de `python/acceptance.py` usado pelos casos do DP-2 segue o oráculo e a classe da tabela de
   `cases-dp-2.json` (EDP-01/02); algum é vácuo ou passa sem observar o que diz? Formas e composição (EDP-03, regras 2, 3, 4, 6 e 7).
   Atenção a `stage.bound_to_cache`, `fixture.tree_exact`, `keyless.no_network_no_credential`, `service.limits_declared` (EDP-08),
   `realcli.*`, `runtime.sys_path_exact`, `proc.env_path_exact` e `artifact.*`.
3. **DP-PY02P e o binário publicado**: só dentro do serviço, keyless (rede só lo, 0 rotas, lista fechada de credenciais, CODEX_HOME
   ausente), limites 1 GiB/256 só no DP-PY02P e no DIAG-DP-REAL-CLI-APPSERVER, `realcli.witness` depois do PROC_RETAIN; nenhum predicado
   de adapter nem `process.spawns/argv` sobre o binário real (DP-SPEC/R2-F03, mensagem exata no validador). O stderr do binário só como
   bytes e sha.
4. **DP-PY20A**: verificação de artefato sem serviço, lida do cache por sha (A1, A5, M7), campos por `jeq`.
5. **Freeze e orçamento**: recalcule o sha de cada arquivo de `source-freeze-dp2.json` e confira a identity freeze contra o cache e o
   `dist/`; `budget.json` e `case-ledger.json` coerentes (10 serviços DIAG, 6 vagas, nenhuma repetição); o modo `dry` restrito às linhas
   de código próprio (DP1-ADM/DV2-DV3); RuntimeMaxSec 45 e propriedades iguais à tabela herdada fora de DDP-05 (DP1-ADM/R2-F05).
6. **Carry-overs**: os do DP-1 em `state.json#/implementation/carry_over_dp1` (aplicado, não aplicável ou a aplicar no fechamento) e
   os da C3-2 em `carry_over_c32`: o DIAG-PY-BARRIER agora registra o thread `cvg-own-raiser` que a C3-2 perdia
   (`thread_registry_covers_frames`); WAIT_APIS fechado; `case_plan_file` em todo `profile-manifest.json`.
7. **CONTROL**: `DP2-CTRL01` antes das vagas, cópia do 2B2-CTRL01 fora do último elemento do argv (DDP-09), MISMATCH só por
   `wire.no_turn_interrupt`.
8. **Contenção e capacidade**: sem capability do kernel nem privilégio (Q4); `/dist`, `/fixture` e `/profile` só-leitura; nada escrito
   fora de `/work`; nenhum arquivo ELF, gzip, zip ou wheel em `docs/`; `NO_BUILD_LINK_DECLARED` nos acceptance não CONTROL; 0 recibos e
   0 crédito.
9. **Registros**: `state.json` (status EXECUTED_PENDING_REVIEW), `case-results.json`, `reevaluation-dp2.json`,
   `resource-receipt-final.json`, `empty-artifact-delta.json`, `preflight.json`, `validation-unit.json`, `topology-checks-dp2.json` e
   `dry-runs-before-freeze.json`.

## Formato de saída

Escreva `review-r1/review.json` com: `kind` INDEPENDENT_REVIEW, `round` 1, `task`, `reviewer`, `reviewed_at`, `subject`
(`review-freeze-r1.json`), `subject_sha256`, `subject_hash_check` (`before`/`after`), `verdict` (APPROVE ou REVISE), `verdict_reason`,
`erratum_r2_f01` (`verdict` e `evidence`), `declared_deviations` (DV-DP2-01 a DV-DP2-07, cada um com `assessment`, `severity` e
`evidence`), `findings` (lista com `id` R1-Fnn, `severity` P1/P2/P3, `area`, `title`, `evidence`, `detail`, `required_action`),
`summary_counts`, `functional_receipts` 0 e `parity_credit` 0. P1/P2 bloqueiam; P3 são endurecimentos e registros. Texto em português.
