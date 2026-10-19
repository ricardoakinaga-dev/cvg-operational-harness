# Veredito R2 — DX100-G02:BIND-SDK-OBSERVATIONS-TO-COVERAGE

**Veredito: `APPROVE`.** Não há achado obrigatório. Os oito achados R1 estão resolvidos. Os critérios C1–C7 do brief R1 continuam válidos no objeto atual, e o reparo não ampliou crédito:

- as 44 linhas continuam com `whole_requirement_covered=false`, `functional_receipt=null` e `parity_credit=0`;
- os totais são 0;
- status, `selected_case_ids` e flags de crédito não mudaram em nenhuma linha.

Ficam cinco P3, nenhum obrigatório. Dois deles são mudanças de conteúdo que o `repair-r1.json` não registra.

Abaixo, `E/` = `docs/04_audit/evidence/CODEX100-EXEC-20261017/` e `B/` = `E/g02/sdk-coverage-binding/`.

## Estado dos achados R1

| Achado      | Estado       | Evidência                                        |
| ----------- | ------------ | ------------------------------------------------ |
| R1-F01 (P2) | **RESOLVED** | Ver abaixo                                       |
| R1-F02 (P2) | **RESOLVED** | Ver abaixo                                       |
| R1-F03 (P3) | **RESOLVED** | Ver abaixo (resíduo de planejamento em R2-F03)   |
| R1-F04 (P3) | **RESOLVED** | Ver abaixo (há mudanças não registradas, R2-F01) |
| R1-F05 (P3) | **RESOLVED** | Ver abaixo                                       |
| R1-F06 (P3) | **RESOLVED** | Ver abaixo                                       |
| R1-F07 (P3) | **RESOLVED** | Ver abaixo                                       |
| R1-F08 (P3) | **RESOLVED** | Ver abaixo (sobra de redação em R2-F05)          |

**R1-F01 — RESOLVED.**

- PY14 (`B/coverage-observed.json:533`) traz os cinco itens pedidos:
  - prioridade do turn ID `current_turn_id` → `completed_turn.id` → `started_turn.id`, e ID ausente sem interrupt;
  - exceção não-InvalidRequest suprimida sem retry;
  - ID extraído ausente com fallback `state.current_turn()`;
  - falha suprimida do segundo interrupt;
  - BaseException em `pause_goal`.
- Conferi esses itens contra `python-contracts.json` (`future_positive` e `source_contract` do PY14) e contra `payload-and-goal-facts.json#goal` (`turn_id_priority`, `candidate_expression`, `no_retry_predicate`). Também conferi os fixtures de SDKPY08/09: só current=A, segundo interrupt com sucesso no SDKPY08, primeiro interrupt nunca com sucesso.
- PY10 (`:422`) passou a "Cancelamento depois do resultado síncrono", coerente com o `case-plan`/`cases.json` do SDKPY07 (abort depois do pedido retido).
- Nas 11 linhas observadas há `remaining_open_scope_exhaustive=false` e `authoritative_residual_refs`. Os sha256 conferem com os arquivos atuais: `25c48bdd…`, `b90b17ce…` e, para PY14, também `payload-and-goal-facts.json` `c0584ebc…#goal`.
- O validador ganhou `residual.non_exhaustive_with_authoritative_refs` e `residual.py14_goal_facts_ref` (32/32 PASS). Os controles `residual_marked_exhaustive` e `residual_ref_removed` foram rejeitados (10/10).

**R1-F02 — RESOLVED.**

- `B/HOW-next-profile.md:132-141` e `B/next-task.json:40` usam:
  - `<=` no mesmo CLOCK_MONOTONIC;
  - "se não valer, `INCONCLUSIVE` ou `INVALID_CAPTURE`, nunca `MISMATCH`";
  - tratamento à parte de `acceptance.py:537-540` no avaliador r3;
  - "fecha só a parte de ordem do R1-F05".
- Isso bate com o `fix` do R2-F01 em `E/g02/sdk-admission/review-r2/review.json`.
- O conflito interno sumiu: `:70` diz "parte TS14 do R1-F05", e o `carry_over[4]` também. Não sobrou "resto do R1-F05" em nenhum arquivo.

**R1-F03 — RESOLVED.**

- O HOW traz a tabela "Resíduo dos 11 contratos parciais" (`:79-95`), e cada linha observada tem `residual_planned_profile_proposal`.
- O peer v2 ficou restrito a PY10/PY14 (SDKPY07/08/09), com TS10–TS15 declarados independentes do peer (`:29-34`).
- Conferi a restrição: SDKPY02/04 têm `success_result` para `turn/start` no `fixture-cases.json`, então o known-bad do PY05 já é alcançável sem o peer v2.

**R1-F04 — RESOLVED.**

- TS15 sem "dois turn.completed".
- TS10 com argv exato `["exec","--experimental-json"]` (`argv.exec_experimental_json`) e com "stderr ausente".
- TS11 com "error sem exit".
- TS12 com falha de kill e prioridade de erros.
- TS14 com cache_write null/presente e turn.failed/error no modo streamed.
- PY10 `known_bad_limits` alinhado ao KNOWN_BAD do `acceptance-r2.json` do SDKPY07 e ao R2-F02 da admissão.

**R1-F05 — RESOLVED.**

- Os campos `capture_verdict_*`, `predicates_*` e `failed_predicates_*` estão separados em `_service_r1`/`_offline_r2`, e `by_judge_offline_r2` tem rótulo próprio.
- Recontei os 19 casos: SDKPY02/04 têm 14/15 predicados, os demais são iguais, e a soma do `by_judge` é igual a `predicates_offline_r2`.

**R1-F06 — RESOLVED.** O `scope_vocabulary` (`:6-12`) declara leitura analítica, "não é cobertura de ramo medida".

**R1-F07 — RESOLVED.**

- O `input-verification.json` grava razão, referência, commit `ff823afe…` e blob para os três arquivos pós-conclusão.
- Recalculei:
  - `git log -1` dos três é `ff823afe…`;
  - `git ls-tree` dá `f3f18278…`, `1efb141f…` e `e10660a0…`;
  - o SHA-1 git dos bytes atuais é idêntico.
- As referências `next-task.json#/carry_over[0|1]` e `executor-disposition.json#/residuals[id=R1-F10|R2-F05]` existem e dizem o que o registro afirma.

**R1-F08 — RESOLVED.**

- O ledger (`:50-54`) põe o distribuído no condicional e inclui o ramo empacotado do PY02.
- O GAP-PROVENANCE aparece com PY05 parcial e rótulo mantido de propósito (`:47-49`).
- O validador é descrito como "segunda implementação do mesmo executor" (`:42-43`).
- No HOW (`:45-48`), o PY02 não empacotado entra no 2B.

## Achados novos

### R2-F01 — P3 — obrigatório: não

**Local:**

- `B/repair-r1.json:37` (`findings[R1-F04].how`)
- `B/coverage-observed.json:753` (TS10 `observed_scope`) e `:1195` (TS15 `remaining_open_scope`)
- `B/build-binding.py.txt:81` e `:112`

**Evidência.** O reparo fez duas mudanças de conteúdo que o `repair-r1.json` não registra. As duas reduzem o resíduo.

- **(a) TS10.** O `observed_scope` passou de "stdin e stdout presentes" para "stdin, stdout e stderr presentes" (SDKTS01). O acceptance do SDKTS01 não discrimina a presença de stderr:
  - o fixture tem `stderr:""` e exit 0, e com exit 0 presente e ausente dão o mesmo resultado;
  - `wire.fixture_bytes_relayed` é `peer_or_capture_sanity` e só compara os bytes comprometidos do fixture (`acceptance.py:369-370`).

  A observação que de fato discrimina o braço presente do TS10.B06 está no SDKTS09 (linha TS11): `"Codex Exec exited with code 7: synthetic detail"`, `stderr_bytes:16`. Pela regra nova do `scope_vocabulary` ("resíduo autoritativo = contrato G01 menos apenas o que `observed_scope` descreve"), esse texto subtrai o braço presente do resíduo do TS10 com base em leitura analítica do caso citado. O braço já constava em `analytic_branch_arms_observed` na R1, que o aceitou, e nenhuma flag muda.

- **(b) TS15.** Saiu "cancelamento por break do consumidor". A `expectation` G01 do TS15 diz "conferir últimos valores e cancelamento por break". O `observed_scope` do TS15 não descreve break nem fechamento do gerador. Pela própria regra, o item continua no resíduo autoritativo, e o ponteiro `expectation|branches` o inclui. O break de "return" do consumidor também segue no TS12 ("ordens do finally (normal, erro, return)"). Os SDKTS07/08 mostram o break do agregador fechando o gerador (`cleanup.signal_source`), mas isso não está escrito no mapa.

**Correção sugerida.**

- Registrar (a) e (b) no `repair-r1.json`, ou num adendo de proveniência.
- Em (a), citar SDKTS09 ou marcar o "stderr presente" do SDKTS01 como inferência analítica.
- Em (b), recolocar no resumo "cancelamento por break (o break do agregador em turn.failed aparece só como fechamento do gerador em SDKTS07/08)", ou justificar a remoção.

### R2-F02 — P3 — obrigatório: não

**Local:**

- `B/coverage-observed.json:9` (`scope_vocabulary.remaining_open_scope`)
- os ponteiros em `:255`, `:306`, `:357`, `:430`, `:541`, `:767`, `:849`, `:901`, `:983`, `:1038` e `:1210`
- `B/build-binding.py.txt:152-161`

**Evidência.** O vocabulário diz "o contrato G01 **inteiro** apontado em `authoritative_residual_refs`", mas os ponteiros recortam campos:

- TS: `contracts[id=TSxx].expectation|branches`. Ficam de fora `external_limits` e `existing_owner_requirements` (CDX100-09-01..05) de `typescript/contracts.json`:
  - TS10–TS12 e TS14: L-NODE e L-CONCURRENCY;
  - TS13: L-NODE e L-CLI;
  - TS15: L-NODE, L-CLI e L-CONCURRENCY.

  Os L-\* têm `future_obligation` próprio, por exemplo L-NODE "Futuro Node pinado … PIDs/erro/cause/liveness em recibo".

- PY: `source_contract|future_positive|future_known_bad`. Fica de fora `boundary`. No PY07, o texto de governança está no `source_contract`, então o efeito é menor.

O sha256 é do arquivo inteiro e nenhuma flag de crédito muda. A imprecisão é de definição: quem calcular o resíduo pelo ponteiro perde os limites externos.

**Correção sugerida.** Apontar a entrada inteira (`contracts[id=TSxx]` e `rows[id=PYxx]`) ou trocar "inteiro" pela lista exata de campos, acrescentando `external_limits` nos TS.

### R2-F03 — P3 — obrigatório: não

**Local:**

- `B/coverage-observed.json:892` e `:896` (TS12)
- `B/HOW-next-profile.md:19-22`, `:71-72` e `:173-187`
- `B/ledger-delta-cont-d9ef.md:50-54`

**Evidência.**

- O resumo do TS12 lista "outras versões de Node", e o `residual_planned_profile_proposal` manda o resíduo inteiro ao `SOURCE_BATCH_2A`, com exceção só de close/removeAllListeners. O HOW fixa o 2A na mesma infraestrutura, Node v24.20.0 (`:3-4`, `:19-22`, `:155-157`). Os pré-requisitos do perfil distribuído só falam de plataformas (`:186-187`). Esse item fica com um destino que não consegue observá-lo.
- O ledger (`:50-54`) resume o 2B como "resíduo de PY05, PY10 e PY14" e o distribuído sem o resíduo do PY06. O mapa manda:
  - o PY06 inteiro ao distribuído;
  - a identidade de runtime do PY05 ao distribuído, e os metadados CVG ao BUILD nativo;
  - o cenário governado do PY07 ao BUILD nativo.
- No HOW, `:71-72` ("O lote 2A também recebe o resíduo de fonte dos contratos parciais listado na seção seguinte") só fica claro com o `next-task.json` "(PY07, TS10-TS15)".

Tudo isso é planejamento. Nenhuma linha muda de status.

**Correção sugerida.**

- Dar destino explícito a "outras versões de Node" (perfil distribuído ou de plataforma) ou marcá-lo como sem destino.
- Alinhar o ledger com o `residual_planned_profile_proposal`.
- Na frase do HOW, escrever "o resíduo destinado ao 2A (PY07, TS10–TS15)".

### R2-F04 — P3 — obrigatório: não

**Local:** `B/coverage-observed.json`, linhas observadas, `observations[*]`, campos `client_fact_only`, `parity_receipt` e `functional_receipts`; `B/build-binding.py.txt` (`acc_entry`).

**Evidência.** Depois do R1-F05, esses três campos ainda vêm só de `acceptance.json` (r1) e não têm rótulo de versão. Conferi os 19 `acceptance-r2.json`: os valores são iguais (`true`/`null`/0). Não há erro, só proveniência implícita.

**Correção sugerida.** Rotular `_service_r1` ou conferir e declarar a igualdade com o r2. Pode ficar para o próximo BIND.

### R2-F05 — P3 — obrigatório: não

**Local:** `B/validate-binding.mjs.txt:1`.

**Evidência.** O cabeçalho ainda diz "validador independente (Node, só leitura)". A linha 4 e o ledger corrigido (R1-F08) dizem "segunda implementação do mesmo executor (não é revisão independente)".

**Correção sugerida.** Trocar "independente" no comentário da linha 1.

## Checagens feitas

1. **Hashes e preimagens.**
   - sha256 dos 14 arquivos do objeto: os 14 batem com o brief R2.
   - sha256 das 12 preimagens em `archives/r1-preimages/`: as 12 batem com `sha256_r1` do `repair-r1.json`, que também bate com o brief R1. Os 12 atuais batem com `sha256_r2`.
   - `review_raw_sha256` confere.
   - `review-r1/verdict.md` difere do `.raw.txt` só por linhas em branco e `*`→`_`.
2. **Diferenças em relação às preimagens.**
   - `gaps-review.json` é semanticamente igual à preimagem. A mudança foi só de formatação, como declarado.
   - Fiz diff semântico, campo a campo, do `coverage-observed.json`, do `next-task.json` e do `input-verification.json`. Conferi o diff textual do HOW, do ledger e dos quatro scripts. Toda mudança cabe nos registros do `repair-r1.json`, com as exceções do R2-F01.
   - O único campo novo de topo é `scope_vocabulary`. Nenhuma das 33 linhas abertas mudou.
3. **C1 (passo 0).**
   - 692/692 arquivos do unit-manifest batem em sha256; o sha do próprio manifesto é `b5a52f6c…`.
   - Os 12 `readonly_inputs_sha256` batem.
   - Os três arquivos pós-conclusão batem em sha256 e blob git (commit `ff823afe`).
   - `git status` está limpo em `sdk-admission`, `sdk-reference-profile` e `g01/sdk-open-contracts`.
   - Os nove `sources` do mapa e o `source` das lacunas batem com os arquivos atuais.
4. **C2.**
   - 44 linhas na mesma ordem, com os mesmos `selected_case_ids` e `status_original` do `coverage.json` original.
   - Exatamente 11 transições: PY05, PY06, PY07, PY10, PY14 e TS10–TS15.
   - Alocação dos 33 abertos: 2A = 14, 2B = 8, distribuído = 11, mais a nota do PY02. Bate com o HOW, o `next-task` e o ledger.
5. **C3.**
   - 42 citações, 38 documentos distintos, todos com sha256 correto, no `attempt_dir` do caso certo e presentes no unit-manifest.
   - Em todos: outcome r1 e r2 `PASS_CLIENT_OBSERVATION`, `failed_predicates` vazio nas duas versões, `client_fact_only=true`, `parity_receipt=null` e `functional_receipts=0`.
   - `by_judge` e sha do r2 batem com `case-results-r2.json`.
6. **C4 / D3.**
   - Flags de crédito corretas nas 44 linhas.
   - Conferi os textos alterados (PY10, PY14, TS10, TS11, TS12, TS14 e TS15) contra `python-contracts.json`, `payload-and-goal-facts.json#goal`, `typescript/contracts.json` (`expectation`, `branches`, `external_limits`), `cases.json` (SDKTS01/05/06/07/08 e SDKPY07/08/09) e os predicados e KNOWN_BAD dos `acceptance-r2.json`. O KNOWN_BAD do PY10 bate com `acceptance.py:87` e com o R2-F02 da admissão.
   - `analytic_branch_arms_observed` não mudou.
   - Os campos novos são de planejamento ou proveniência; nenhum altera status ou crédito.
7. **C5.** As seis lacunas seguem `OPEN`. Os rótulos de progresso não mudaram (4/13, 4/11, 6/15), e a exclusão do GAP-PROVENANCE está mantida.
8. **C6 e C7.**
   - O HOW mantém a escolha explícita, o peer v2 e os R2-F01..R2-F04, comparados ao `review-r2/review.json` da admissão.
   - `next-task` e ledger não afirmam recibo, paridade, BUILD, push nem autorização nova.
   - Contagens 32/10 conferidas com `validation.json` e `negative-controls.json`.
9. Li sem executar `build-binding.py.txt`, `validate-binding.mjs.txt`, `negative-controls.py.txt` e `verify-inputs.py.txt`, e os diffs contra as preimagens. A lógica nova bate com os JSON produzidos: os textos do mapa aparecem literalmente no script.

## Limites

- Somente leitura. Usei apenas `cat`, `sed`, `grep`, `diff`, `sha256sum`, `python3 -I` para hash e comparação de JSON em memória, e `git log`/`git ls-tree`/`git status` de leitura. Não executei os scripts `.txt`, SDK, Pydantic, typescript.js, compilador, serviço, rede ou git com escrita. Nada foi gravado.
- Não refiz a validação Node nem os controles negativos. Aceitei `validation.json` e `negative-controls.json` como registrados, conferindo só a coerência deles com o código lido.
- Os bytes brutos, os testemunhos do SO e o runtime em `/mnt/ia/…` não foram relidos. O julgamento da admissão foi aceito como está nos acceptance.
- `state.json` (ainda um stub `REVIEW_R1_IN_PROGRESS`), o link quebrado para `review-r2/verdict.md` e os valores `COMPLETED_LOCAL` antecipados em `previous_status`/`last_completed_action` foram tratados como esperados nesta fase. Não são achado.
- Avaliei a completude do resumo `remaining_open_scope` só para os textos alterados pelo reparo. Os demais foram aprovados na R1 e não mudaram.
