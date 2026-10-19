# Delta de ledgers proposto ao Lead — CONT-20261018-D9EF / CODEX100

Unidade `DX100-G02:SPECIFY-SDK-SOURCE-BATCH-2B`, T1 documental, estado final depois
da R2. O executor não editou ledgers, coordenação, 0384–0386, catálogo central nem
código. Não houve commit nem branch. Os links abaixo são relativos a este arquivo. Ao
transcrever para `docs/`, prefixar com
`04_audit/evidence/CODEX100-EXEC-20261017/g02/sdk-source-batch-2b-spec/`; para
`docs/03_build/0386_backlog_paridade_codex.md`, com
`../04_audit/evidence/CODEX100-EXEC-20261017/g02/sdk-source-batch-2b-spec/`.

Fontes:

- unidade: [estado](state.json), [verificação de entrada](input-verification.json),
  [próxima unidade](next-task.json);
- casos e plano: [casos do 2B-1](cases-2b-1.json), [casos do 2B-2](cases-2b-2.json),
  [plano de cobertura](coverage-plan-2b.json);
- contratos: [capacidades novas](capability-contracts-2b.json),
  [deltas do freeze r4](freeze-r4-2b-delta.json),
  [deltas do avaliador r4](evaluator-r4-2b-delta.json),
  [vagas CONTROL](control-slot-contract-2b.json),
  orçamentos do [2B-1](execution-budget-2b-1.json) e do
  [2B-2](execution-budget-2b-2.json);
- decisão: [avaliação T3](t3-assessment.json);
- verificação: [validação](validation.json);
- revisão: [R1](review-r1/review.json), [reparo](repair-r1.json),
  [R2](review-r2/review.json), [disposição da R2](review-r2/executor-disposition.json).

## Para `docs/99_runtime_state.md` (bloco CONT-20261018-D9EF, item Codex100)

- `last_completed_action`: DX100-G02:SPECIFY-SDK-SOURCE-BATCH-2B
  `COMPLETED_LOCAL_WITH_CARRIED_P2`. O lote 2B ficou em dois sub-lotes, 34 vagas no
  total:
  - [2B-1](cases-2b-1.json): 16 vagas (15 SDK, 3 delas condicionais, e 1 CONTROL) e 9
    serviços de qualificação. Cobre PY01, PY02 sem o caminho empacotado, PY11, PY12 e
    os resíduos de PY05, PY08 e PY10;
  - [2B-2](cases-2b-2.json): 18 vagas (17 SDK e 1 CONTROL) e 10 serviços. Cobre PY09,
    PY13, PY17, PY18 e o resíduo de PY14.
- Há oito capacidades novas de harness, cada uma com contrato, autotestes e DIAG:
  driver async, barreira de concorrência, relógio e aleatório, falha por corte,
  oráculos Pydantic, login sintético, notificação antes da resposta e testemunha de
  processo.
- O freeze r4 e o avaliador r4 valem sem mudança. O que muda entra como 15 deltas
  D2B e 14 cláusulas E2B.
- Sem T3; há uma pergunta T3 contingente para a leitura de `/proc`. 0 execução, 0
  recibos funcionais e 0 crédito de paridade.
- `next_action`: DX100-G02:IMPLEMENT-AND-ADMIT-SDK-SOURCE-BATCH-2B-1, com execução
  local contida e sem T3 ([task](next-task.json)). O R2-F01 é obrigatório. A
  IMPLEMENT do 2B-2 só começa com ele fechado.

## Para `docs/20_master_execution_log.md`

- 19/10/2026 — DX100-G02:SPECIFY-SDK-SOURCE-BATCH-2B (Claude Code,
  CONT-20261018-D9EF).
  - Passo 0 [PASS 19/19](input-verification.json): o binding v2 em `1fb7e884`, a
    continuação em `f65f43e5` (freeze r4 e avaliador r4), a especificação 2A, a
    admissão 2A, os contratos G01, as fontes do SDK no pin e os arquivos Pydantic
    preparados conferem.
- Casos: os valores esperados saem da fonte do pin, com 175 âncoras de linha e sha.
  Onde o caso declara, também saem da Pydantic 2.13.4 preparada e da stdlib do
  CPython 3.12.3.
- Divisão: o 2B passa de 24 vagas e precisa de 8 capacidades novas, então foi dividido
  em dois sub-lotes. Cada um tem CONTROL e orçamento próprios. O 2B-2 herda as
  capacidades do 2B-1.
- Validador em Node, segunda implementação do mesmo executor (não é revisão
  independente): [PASS](validation.json), com 23 controles negativos recusados, cada
  um pela checagem que nomeia.
- Revisão:
  - R1 REVISE, com 7 P2 (corrida do excepthook, registrador fora do 2B-1, regra de
    login contra o próprio roteiro, `/proc` antes do execv, semântica de resultado,
    `wire.absent` e retain);
  - reparo agrupado 1/1;
  - R2 REVISE, com 1 P2 (contagem de ocorrência de gancho call+return, que só afeta o
    2B-PY13D do 2B-2) e 7 P3.
- Com as rodadas e o reparo esgotados, o P2 foi levado à IMPLEMENT como
  interpretação vinculante e obrigatória. A regra é contar por (id, event), que é a
  leitura do próprio caso; nenhum valor congelado muda.
- Sem serviço, SDK, rede, commit ou branch. O gitleaks rodou sobre uma cópia, sem
  achados.

## Para `docs/30_backlog_master.md`

- Trocar o item "DX100-G02:SPECIFY-SDK-SOURCE-BATCH-2B" por
  "DX100-G02:IMPLEMENT-AND-ADMIT-SDK-SOURCE-BATCH-2B-1, execução local contida, sem
  T3, R2-F01 obrigatório ([task](next-task.json))".
- Acrescentar "DX100-G02:IMPLEMENT-AND-ADMIT-SDK-SOURCE-BATCH-2B-2. Depende do 2B-1
  admitido e do R2-F01 fechado
  ([orçamento](execution-budget-2b-2.json),
  [disposição](review-r2/executor-disposition.json))".

## Para `docs/03_build/0386_backlog_paridade_codex.md` (cartão DX100-G02)

- Acrescentar ao cartão: "Lote 2B especificado em dois sub-lotes
  ([2B-1](cases-2b-1.json), 16 vagas; [2B-2](cases-2b-2.json), 18 vagas), com 8
  capacidades novas de harness ([contratos](capability-contracts-2b.json)). Se tudo
  passar, a projeção é de 29 contratos observados sobre o mapa v2 e 33 com a
  continuação, com as seis lacunas ainda OPEN. R2 REVISE com 1 P2 levado à IMPLEMENT;
  0 recibos."
- O estado do cartão segue `IN_PROGRESS`. Não incrementa o numerador.
