# Delta de ledgers proposto ao Lead — CONT-20261018-D9EF / CODEX100

Unidade `DX100-G02:SPECIFY-SDK-SOURCE-CONTINUATION-3`, T1 documental, estado final
depois da R2. O executor não editou ledgers, coordenação, 0384–0386, catálogo central
nem código. Não houve commit, branch nem worktree. Os links abaixo são relativos a
este arquivo. Ao transcrever para `docs/`, prefixar com
`04_audit/evidence/CODEX100-EXEC-20261017/g02/sdk-source-continuation-3-spec/`; para
`docs/03_build/0386_backlog_paridade_codex.md`, com
`../04_audit/evidence/CODEX100-EXEC-20261017/g02/sdk-source-continuation-3-spec/`.

Fontes:

- unidade: [estado](state.json), [verificação de entrada](input-verification.json),
  [próxima unidade](next-task.json);
- casos e plano: [casos do C3-1](cases-c3-1.json), [casos do C3-2](cases-c3-2.json),
  [plano de cobertura e resíduos](coverage-plan-c3.json);
- contratos: [deltas do freeze r4](freeze-r4-c3-delta.json),
  [deltas do avaliador r4](evaluator-r4-c3-delta.json),
  [vagas CONTROL](control-slot-contract-c3.json), orçamentos do
  [C3-1](execution-budget-c3-1.json) e do [C3-2](execution-budget-c3-2.json);
- decisão: [avaliação T3](t3-assessment.json);
- verificação: [validação](validation.json);
- revisão: [R1](review-r1/review.json), [reparo](repair-r1.json),
  [R2](review-r2/review.json), [disposição da R2](review-r2/executor-disposition.json).

## Para `docs/99_runtime_state.md` (bloco CONT-20261018-D9EF, item Codex100)

- `last_completed_action`: DX100-G02:SPECIFY-SDK-SOURCE-CONTINUATION-3
  `COMPLETED_LOCAL_WITH_CARRIED_P2`. A continuação 3 do perfil de fonte ficou em dois
  sub-lotes, 29 vagas no total:
  - [C3-1](cases-c3-1.json), TypeScript: 15 vagas (14 SDK e 1 CONTROL Python) e 8
    serviços de qualificação. Cobre os resíduos de TS01 a TS09 e de TS11 a TS15;
  - [C3-2](cases-c3-2.json), Python: 14 vagas (13 SDK, 1 delas condicional, e 1
    CONTROL) e 10 serviços. Cobre PY02, PY03, PY05, PY08, PY12, PY13, PY14, PY15,
    PY16, PY17 e PY18, com duas réplicas do 2B (C3-PY13F e C3-PY13ER).
- 45 braços mirados, cada um com passo que distingue o ramo contrário. Entre eles
  estão os dois braços abertos explícitos do v5 (PY05.B10 e PY13.B06) e a errata T1
  do known_bad "pular o cleanup" do PY13.
- Nenhuma capacidade nova de harness. O que muda entra como 8 deltas D3 e 9
  cláusulas E3 sobre o freeze r4, o delta 2B e o avaliador r4.
- Sem T3 e sem T4. 0 execução, 0 recibos funcionais e 0 crédito de paridade.
- `next_action`: DX100-G02:IMPLEMENT-AND-ADMIT-SDK-SOURCE-CONTINUATION-3-1, com
  execução local contida e sem T3 ([task](next-task.json)). A errata do R2-F01 é
  obrigatória e entra antes do source freeze do C3-1.

## Para `docs/20_master_execution_log.md`

- 19/10/2026 — DX100-G02:SPECIFY-SDK-SOURCE-CONTINUATION-3 (Claude Code,
  CONT-20261018-D9EF).
  - Passo 0 [PASS 27/27](input-verification.json). Conferem:
    - o BIND do 2B-2 (v5, HOW v2 e errata Q1–Q5), pelos sha aceitos pelo Lead;
    - a especificação 2B, o BIND do 2B-1, as admissões 2A, 2AC e 2B-2 e as
      especificações 2A e 2A-cont, no commit `7e1da11a4`;
    - as fontes do SDK no pin, contra a identity freeze;
    - os contratos G01;
    - o fato de fonte que torna o PY04 não aplicável.
  - Casos: os valores esperados saem da fonte do pin, com 113 âncoras de linha e sha.
    A normalização de versão do C3-PY05 sai do padrão lido do packaging preparado,
    sem importá-lo.
  - Escopo: 77 resíduos classificados. Entram 36. Ficam fora 41:
    - 11 por exigirem capacidade nova (injeção de falha de fs ou do lado Node, fault
      novo de adapter, modo de peer que fecha só o stdout, oráculo de schema);
    - 6 por corrida natural;
    - 12 que apontam para as perguntas Q1–Q5;
    - 3 de gate T4 e 5 do nativo;
    - 4 casos isolados: limite de plataforma, não aplicável, inalcançável e já
      observado.
  - Validador em Node, segunda implementação do mesmo executor (não é revisão
    independente): [PASS 14/14](validation.json), com 24 controles negativos
    recusados.
  - Revisão:
    - R1 REVISE, com 2 P2. O known_bad do PY13 ainda caía em INVALID_CAPTURE pelo
      fault. A vigia inotify de /work/tmp nunca foi admitida;
    - reparo agrupado 1/1. A testemunha passou a ser o getter do próprio driver. Foram
      acrescentados a classe CLIENT_EFFECT_UNLESS_ALIVE e a regra de zero chamadas do
      fault;
    - R2 REVISE, com 1 P2 e 3 P3. Os 9 achados da R1 foram dados por resolvidos. O
      P2 é o predicado novo do C3-TS12, que embutia ordem entre processos.
  - Com as rodadas e o reparo esgotados, o P2 vai à IMPLEMENT do C3-1 como errata
    obrigatória: o oráculo client perde as cláusulas de ordem, e a ordem, se julgada,
    vira order_unilateral (R3-01). Nenhum valor congelado muda.
  - Sem serviço, SDK, rede, commit ou branch. O gitleaks rodou sobre uma cópia, sem
    achados ([registro](secret-scan.json)).

## Para `docs/30_backlog_master.md`

- Trocar o item "DX100-G02:SPECIFY-SDK-SOURCE-CONTINUATION-3" por
  "DX100-G02:IMPLEMENT-AND-ADMIT-SDK-SOURCE-CONTINUATION-3-1, execução local contida,
  sem T3, errata do R2-F01 obrigatória ([task](next-task.json))".
- Acrescentar "DX100-G02:IMPLEMENT-AND-ADMIT-SDK-SOURCE-CONTINUATION-3-2. Depende do
  C3-1 admitido ([orçamento](execution-budget-c3-2.json),
  [disposição](review-r2/executor-disposition.json))".

## Para `docs/03_build/0386_backlog_paridade_codex.md` (cartão DX100-G02)

- Acrescentar ao cartão: "Continuação 3 do perfil de fonte especificada em dois
  sub-lotes ([C3-1](cases-c3-1.json), 15 vagas; [C3-2](cases-c3-2.json), 14 vagas),
  sem capacidade nova de harness. Os 41 resíduos fora estão classificados
  ([plano](coverage-plan-c3.json)) e os de decisão apontam para Q1–Q5. Se tudo
  passar, o mapa segue 33/11, sem linha mudando de status. R2 REVISE, com 1 P2 levado
  à IMPLEMENT; 0 recibos."
- O estado do cartão segue `IN_PROGRESS`. Não incrementa o numerador.
