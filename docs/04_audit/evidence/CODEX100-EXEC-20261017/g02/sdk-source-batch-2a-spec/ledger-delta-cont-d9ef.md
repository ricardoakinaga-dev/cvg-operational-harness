# Delta de ledgers proposto ao Lead — CONT-20261018-D9EF / CODEX100

Unidade `DX100-G02:SPECIFY-SDK-SOURCE-BATCH-2A`, T1 documental, estado final depois da
R3. O executor não editou ledgers, coordenação, 0384–0386 nem código. Os links abaixo
são relativos a este arquivo. Ao transcrever para `docs/`, prefixar com
`04_audit/evidence/CODEX100-EXEC-20261017/g02/sdk-source-batch-2a-spec/`; para
`docs/03_build/0386_backlog_paridade_codex.md`, com
`../04_audit/evidence/CODEX100-EXEC-20261017/g02/sdk-source-batch-2a-spec/`. Este
delta substitui o [adendo da R2](ledger-delta-addendum-r2.md), que fica como
histórico.

Fontes: [estado](state.json), [verificação de entrada](input-verification.json),
[casos](cases-2a.json), [plano de cobertura](coverage-plan-2a.json),
[peer v2](peer-v2-contract.json), [avaliador r3](evaluator-r3-contract.json),
[captura](capture-contract.json), [vaga CONTROL](control-slot-contract.json),
[orçamento](execution-budget.json), [avaliação T3](t3-assessment.json),
[validação](validation.json) e [próxima unidade](next-task.json). Revisões:
[R1](review-r1/verdict.md), [R2](review-r2/verdict.md) e [R3](review-r3/verdict.md);
reparos [R1](repair-r1.json) e [R2](repair-r2.json); extensão do Lead em
[lead-budget-extension-r3.json](lead-budget-extension-r3.json).

## Para `docs/99_runtime_state.md` (bloco CONT-20261018-D9EF, item Codex100)

- `last_completed_action`: DX100-G02:SPECIFY-SDK-SOURCE-BATCH-2A `COMPLETED_LOCAL`,
  com R3 APPROVE. [Casos congelados](cases-2a.json) do lote 2A: 24 vagas, sendo 23
  casos SDK (16 TypeScript e 7 Python) e 1 vaga CONTROL. Cobrem os 14 contratos novos
  do lote (TS01–TS09, PY03, PY04, PY08, PY15, PY16), o resíduo de PY07 e TS10–TS15 e
  os reforços de TS14 e PY10. Contratos do peer v2, do avaliador r3, da captura e da
  CONTROL prontos. 0 execução, 0 recibos funcionais, 0 crédito de paridade.
- `next_action`: DX100-G02:IMPLEMENT-AND-ADMIT-SDK-SOURCE-BATCH-2A
  ([task](next-task.json)). Não exige T3 nem T4 ([avaliação](t3-assessment.json)).

## Para `docs/20_master_execution_log.md`

- 18–19/10/2026 — DX100-G02:SPECIFY-SDK-SOURCE-BATCH-2A (Claude Code,
  CONT-20261018-D9EF). Passo 0 [PASS](input-verification.json): a entrega anterior
  bate com o commit `b70cb6df`, o unit-manifest da admissão (692 arquivos) e o
  identity freeze conferem, e as fontes SDK citadas batem com o identity freeze.
- Casos: cada valor esperado vem da leitura da fonte do pin, com âncora de linha e
  sha256. Uma divergência na execução será MISMATCH preservado. Cada um dos 79
  predicados tem classe e oráculo congelados, e todo known-bad é julgado por
  predicado de cliente.
- O desfecho segue uma composição fixa de sete regras. Falha de sanidade, de captura,
  de ordem ou do próprio avaliador dá INVALID_CAPTURE. MISMATCH só sai de forma de
  captura não aceita ou de falhas só de cliente.
- Os casos Python usam o peer v2: pedido sem script recebe erro -32601, com `method`
  acrescentado ao `data`, sem `server_overloaded` nem faixa de servidor. A vaga
  CONTROL roda antes dos casos SDK e deve dar MISMATCH vindo de
  `wire.no_turn_interrupt`.
- Revisão:
  - R1 REVISE (5 P2); o reparo R1 resolveu os 13 achados;
  - R2 REVISE (2 P2, o gatilho do relato do schema no 2A-TS04 e a composição entre
    classes);
  - o Lead estendeu o orçamento (opção A) com mais um reparo e uma revisão;
  - o reparo R2 declarou o gatilho no fixture e fixou a composição;
  - R3 APPROVE, sem obrigatórios, com 3 P3 levados à IMPLEMENT ou registrados no
    fechamento.
- Orçamento da execução: 24 vagas (1 CONTROL), 9 de 12 serviços planejados, 2
  revisões, 1 reparo, 0 retries. O DIAG-TS-ENOENT, de código próprio sem SDK, decide
  antes se a vaga do 2A-TS10 é usada.
- Validador em Node, segunda implementação do mesmo executor (não é revisão
  independente): [41 checagens PASS](validation.json) e
  [18 controles negativos rejeitados](negative-controls.json).
- Sem serviço, SDK, compilador, Codex CLI, rede, Docker ou PG. Sem commit.

## Para `docs/30_backlog_master.md`

- Trocar o item "DX100-G02:SPECIFY-SDK-SOURCE-BATCH-2A" por
  "DX100-G02:IMPLEMENT-AND-ADMIT-SDK-SOURCE-BATCH-2A, execução local contida, sem T3
  ([task](next-task.json))".

## Para `docs/03_build/0386_backlog_paridade_codex.md` (cartão DX100-G02)

- Acrescentar ao cartão: "Lote 2A especificado no recorte T1 e aprovado na R3:
  [24 vagas congeladas](cases-2a.json) (23 SDK e 1 CONTROL),
  [plano de cobertura](coverage-plan-2a.json), peer v2 e avaliador r3 com composição
  determinística. Execução seguinte sem T3, com orçamento de 12 serviços (9
  planejados) e 0 retries; 0 recibos."
- O estado do cartão segue `IN_PROGRESS`. Não incrementa o numerador.
