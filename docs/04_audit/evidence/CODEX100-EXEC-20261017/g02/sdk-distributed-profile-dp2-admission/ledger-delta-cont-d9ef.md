# Delta de ledgers proposto ao Lead — CONT-20261018-D9EF / CODEX100

Unidade `DX100-G02:IMPLEMENT-AND-ADMIT-SDK-DISTRIBUTED-PROFILE-DP-2`, T1 com execução
local contida, estado final depois da R1. O executor não editou ledgers, coordenação,
0384–0386, catálogo central nem código de produto; commits só na candidata destacada.
Os links abaixo são relativos a este arquivo. Ao transcrever para `docs/`, prefixar
com `04_audit/evidence/CODEX100-EXEC-20261017/g02/sdk-distributed-profile-dp2-admission/`;
para `docs/03_build/0386_backlog_paridade_codex.md`, com
`../04_audit/evidence/CODEX100-EXEC-20261017/g02/sdk-distributed-profile-dp2-admission/`.

Fontes: [estado](state.json), [resultados](case-results.json),
[adjudicação](adjudication-dp2.json), [admissão dos DIAG](diag-admission-dp2.json),
[freeze de fontes](source-freeze-dp2.json),
[freeze de identidade](identity-freeze-dp2.json),
[reavaliação](reevaluation-dp2.json), [validador](validation-unit.json),
[topologia e propriedades](topology-checks-dp2.json),
[autotestes](selftests/selftest-results.json), [preflight](preflight.json),
[dry runs](dry-runs-before-freeze.json), [recursos](resource-receipt-final.json),
[vazios](empty-artifact-delta.json), [triagem do gitleaks](lead-secret-scan-triage.json)
e [próxima unidade](next-task.json). Revisão: [R1](review-r1/review.json), com a
[disposição](review-r1/executor-disposition.json).

## Para `docs/99_runtime_state.md` (bloco CONT-20261018-D9EF, item Codex100)

- `last_completed_action`: DX100-G02:IMPLEMENT-AND-ADMIT-SDK-DISTRIBUTED-PROFILE-DP-2
  `COMPLETED_LOCAL_WITH_CARRIED_FINDINGS`, R1 APPROVE (errata R2-F01 conforme). Sub-lote
  DP-2 executado uma vez, em série, sem retry: CONTROL DP2-CTRL01 MISMATCH (regra 6, só
  `wire.no_turn_interrupt`) e 5 casos Python PASS_CLIENT_OBSERVATION (DP-PY19A, DP-PY19B,
  DP-PY19C, o condicional DP-PY02P com o binário publicado 0.153.4 keyless e o DP-PY20A
  sem serviço). 0 recibos funcionais, 0 crédito de paridade.
- `next_action`: mini-unidade DP-1R (caso novo do PK07 com errata da fixture, decisão do
  Lead) e depois o BIND do perfil distribuído (DP-1, DP-1R e DP-2), ordem a critério do
  Lead ([task](next-task.json)).

## Para `docs/20_master_execution_log.md`

- 20/10/2026 — DX100-G02:IMPLEMENT-AND-ADMIT-SDK-DISTRIBUTED-PROFILE-DP-2 (Claude Code,
  CONT-20261018-D9EF). Candidata destacada (base `3ca3fd3b0`, recibo do DP-1, sem
  branch), runtime privado; sem PG, sem porta TCP, sem rede, nada em `/mnt/ia`; nenhuma
  capability do kernel nem privilégio (Q4).
- Artefatos só do cache, conferidos por sha antes de cada uso; nenhum binário em
  `docs/`. O `/dist` do sub-lote foi apagado no fechamento, conforme o CAP-DP-STAGE
  (manifesto `764d89eb…` registrado).
- Implementação sobre a pilha Python da C3-2 (DV-DP2-01):
  - deltas DDP-01, 02, 05, 06, 07, 09, 10 e 11 e cláusulas EDP-01 a EDP-08;
  - errata R2-F01 declarada como DDP-12 (topologia driver_only por caso, com
    `observer.reconcile_driver_only` e os três autotestes obrigatórios);
  - carry-overs do DP-1 e da C3-2: registro de threads por `threading.local`, lista
    fechada de `wait_class` do D3-05 e `case_plan_file` no manifesto.
- Autotestes offline 59/59, validador com 11 controles negativos e preflight 51/51.
- O primeiro freeze foi gravado com um autoteste falhando e refeito antes de qualquer
  serviço (DV-DP2-02, aceito pela R1 com registro).
- 10 DIAG, todos DIAG_PASS; o DIAG-DP-REAL-CLI-APPSERVER liberou o DP-PY02P.
- Execução: CONTROL MISMATCH e 5/5 PASS_CLIENT_OBSERVATION pela regra 7. A reavaliação
  offline é igual nas 6 vagas em predicados, desfecho e ligação ao plano.
- R1 APPROVE, 0 P1/P2 e 10 P3:
  - dois corrigidos nos registros (R1-F07 e R1-F10);
  - dois registrados para o BIND: o PY19.B02 é creditado só por `api.steps_exact`, e a
    forma REAL_CLI_KEYLESS do DP-PY02P vem da declaração do caso;
  - seis levados à próxima unidade que reusar a pilha Python (endurecimentos do freeze,
    da testemunha de rede, do controle de ordem do witness, do autoteste do plano, do
    validador e do staging).
- Os desvios DV-DP2-01 a DV-DP2-07 foram aceitos pela R1; o aceite do Lead está pendente.
- Orçamento: 6/6 vagas, 10/12 serviços, 1/2 revisões, 0/1 reparo, 0 retries, 0 esperas
  de carga (load average máximo 1,81 no início dos serviços).
- Recursos: 15 unidades `cvg-dx100-dp2-*` coletadas, nenhum cgroup restante; pico de
  37 PIDs e 86 MiB.
- gitleaks v8.28.0 (docker, `.gitleaks.toml` da raiz) sobre a pasta, contado pelo código
  de saída do próprio gitleaks: ver a [triagem](lead-secret-scan-triage.json).

## Para `docs/30_backlog_master.md`

- Trocar o item "DX100-G02:IMPLEMENT-AND-ADMIT-SDK-DISTRIBUTED-PROFILE-DP-2" por
  "DX100-G02:IMPLEMENT-AND-ADMIT-SDK-DISTRIBUTED-PROFILE-DP-1R e depois o BIND do perfil
  distribuído, T1 ([task](next-task.json))".

## Para `docs/03_build/0386_backlog_paridade_codex.md` (cartão DX100-G02)

- Acrescentar ao cartão: "Sub-lote DP-2 do perfil distribuído executado e admitido (R1
  APPROVE): [5 observações de cliente Python](adjudication-dp2.json) em PY19, PY20 e no
  ramo empacotado do PY02, consumíveis pelo BIND do perfil distribuído só nos braços
  creditados; build_link NO_BUILD_LINK_DECLARED; 0 recibos."
- O estado do cartão segue `IN_PROGRESS`. Não incrementa o numerador.

## Para `docs/04_audit/evidence/empty-artifact-status.json` (catálogo central)

- Incorporar as 60 entradas de [empty-artifact-delta.json](empty-artifact-delta.json),
  todas `expected_empty`, com comando, exitCode, timestamp e ambiente reais.
