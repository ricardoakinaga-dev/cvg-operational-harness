# Delta de ledgers proposto ao Lead — CONT-20261018-D9EF / CODEX100

Unidade `DX100-G02:SPECIFY-SDK-SOURCE-BATCH-2A-CONTINUATION`, T1 documental, estado
final depois da R2. O executor não editou ledgers, coordenação, 0384–0386, catálogo
central nem código. Não houve commit nem branch. Os links abaixo são relativos a este
arquivo. Ao transcrever para `docs/`, prefixar com
`04_audit/evidence/CODEX100-EXEC-20261017/g02/sdk-source-batch-2a-continuation-spec/`;
para `docs/03_build/0386_backlog_paridade_codex.md`, com
`../04_audit/evidence/CODEX100-EXEC-20261017/g02/sdk-source-batch-2a-continuation-spec/`.

Fontes:

- unidade: [estado](state.json), [verificação de entrada](input-verification.json),
  [próxima unidade](next-task.json);
- casos e plano: [casos](cases-2a-cont.json),
  [plano de cobertura](coverage-plan-2a-cont.json);
- contratos: [freeze r4](freeze-r4-contract.json),
  [avaliador r4](evaluator-r4-contract.json),
  [vaga CONTROL](control-slot-contract.json), [orçamento](execution-budget.json);
- decisões: [avaliação T3](t3-assessment.json),
  [encaixe do lote 2B](batch-2b-fit-assessment.json);
- verificações: [sondas de viabilidade](feasibility-probes.json),
  [validação](validation.json);
- revisão: [R1](review-r1/review.json), [reparo](repair-r1.json),
  [R2](review-r2/review.json), [disposição da R2](review-r2/executor-disposition.json).

## Para `docs/99_runtime_state.md` (bloco CONT-20261018-D9EF, item Codex100)

- `last_completed_action`: DX100-G02:SPECIFY-SDK-SOURCE-BATCH-2A-CONTINUATION
  `COMPLETED_LOCAL`, R2 APPROVE. A continuação do lote 2A está congelada em
  [9 vagas](cases-2a-cont.json):
  - reexecuções com vaga própria: 2A-TS03R, 2A-TS06R e 2A-TS07R;
  - condicionais: 2A-TS12R (testemunha inotify sem privilégio) e 2A-TS10E (EPIPE do
    TS10.B04);
  - resíduos determinísticos: 2A-TS06X, 2A-TS07X e 2A-TS08X;
  - controle: 2AC-CTRL01.
- Freeze r4 com 12 itens e avaliador r4 com 10 cláusulas. O lote 2B não coube (mínimo
  de 26 vagas sozinho) e vira unidade própria. Sem T3; há uma pergunta T3 contingente
  pronta. 0 execução, 0 recibos funcionais, 0 crédito de paridade.
- `next_action`: DX100-G02:IMPLEMENT-AND-ADMIT-SDK-SOURCE-BATCH-2A-CONTINUATION, com
  execução local contida e sem T3 ([task](next-task.json)).

## Para `docs/20_master_execution_log.md`

- 19/10/2026 — DX100-G02:SPECIFY-SDK-SOURCE-BATCH-2A-CONTINUATION (Claude Code,
  CONT-20261018-D9EF).
  - Passo 0 [PASS 10/10](input-verification.json): o binding em `1fb7e884`, a admissão
    2A (unit-manifest `b4bb8aae…`) e a especificação 2A (`147a906d…`) conferem.
- Casos:
  - as três reexecuções copiam o caso 2A congelado sem mudar valor esperado;
  - o 2A-TS12R e o CONTROL declaram cada campo que mudam;
  - os casos novos têm valores tirados da fonte do pin, com âncoras.
- Freeze r4:
  - o `case_input` passa a vir dos bytes congelados, com testemunha do supervisor,
    dos papéis e do avaliador;
  - a integridade do fio TS e do stdout do peer v2 é checada também sob sinal;
  - o peer v2 compara por tipo estrito e fecha o stdout antes do
    `EXIT_AFTER_SCRIPT`;
  - a testemunha inotify é sem privilégio, com disciplina de janela, e
    PREFRAME_TERMINATION e NO_CHILD ficam mutuamente exclusivas;
  - há fault do adapter, marcadores e recorder no driver;
  - os 9 DIAG da admissão são requalificados e entram 2 novos: 11 de 12 serviços.
- [Sondas de viabilidade](feasibility-probes.json), código próprio fora do sandbox e
  só informativas, confirmaram três pontos: o EPIPE escapa como uncaught com o stdio
  em socketpair; o IN_OPEN aparece sem privilégio num spawn pré-abortado; e a
  semântica de linguagem usada nos valores esperados confere.
- Validador em Node, segunda implementação do mesmo executor (não é revisão
  independente): [PASS](validation.json), com 18 controles negativos rejeitados.
- Revisão:
  - R1 REVISE com 3 P2: o 2A-TS12R mudava mais do que declarava; PREFRAME e NO_CHILD
    não eram exclusivas; dois DIAG estavam fora da requalificação;
  - reparo agrupado 1/1;
  - R2 APPROVE, 0 obrigatórios, 5 P3 levados à IMPLEMENT.
- Sem serviço, SDK, rede, commit ou branch.

## Para `docs/30_backlog_master.md`

- Trocar o item "DX100-G02:SPECIFY-SDK-SOURCE-BATCH-2A-CONTINUATION" por
  "DX100-G02:IMPLEMENT-AND-ADMIT-SDK-SOURCE-BATCH-2A-CONTINUATION, execução local
  contida, sem T3 ([task](next-task.json))".
- Acrescentar "DX100-G02:SPECIFY-SDK-SOURCE-BATCH-2B (T1), que não coube na
  continuação ([avaliação](batch-2b-fit-assessment.json))". Pode correr em paralelo
  à IMPLEMENT.

## Para `docs/03_build/0386_backlog_paridade_codex.md` (cartão DX100-G02)

- Acrescentar ao cartão: "Continuação do lote 2A especificada (R2 APPROVE):
  [9 vagas](cases-2a-cont.json), [freeze r4](freeze-r4-contract.json) com a correção
  da entrega do `case_input` e testemunha sem privilégio, projeção de 25 contratos
  observados se todas passarem; 2B como unidade própria; 0 recibos."
- O estado do cartão segue `IN_PROGRESS`. Não incrementa o numerador.
