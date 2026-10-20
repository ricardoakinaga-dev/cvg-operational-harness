# Delta de ledgers proposto ao Lead — CONT-20261018-D9EF / CODEX100

Unidade `DX100-G02:BIND-SDK-SOURCE-BATCH-2B-2`, T1 documental, estado final depois da
R2. O executor não editou ledgers, coordenação, 0384–0386, catálogo central nem
código. Não houve commit nem branch. Os links abaixo são relativos a este arquivo. Ao
transcrever para `docs/`, prefixar com
`04_audit/evidence/CODEX100-EXEC-20261017/g02/sdk-batch-2b2-binding/`; para
`docs/03_build/0386_backlog_paridade_codex.md`, com
`../04_audit/evidence/CODEX100-EXEC-20261017/g02/sdk-batch-2b2-binding/`.

Fontes:

- unidade: [estado](state.json), [verificação de entrada](input-verification.json),
  [próxima unidade](next-task.json);
- mapa: [cobertura observada v5](coverage-observed-v5.json), ao lado do
  [v4](../sdk-batch-2b1-binding/coverage-observed-v4.json), que não muda;
- lacunas: [revisão das lacunas](gaps-review-v5.json);
- próximo perfil: [HOW v2](HOW-next-profile-v2.md), lido com a
  [errata das perguntas](review-r2/executor-disposition.json);
- entrada: [admissão do 2B-2](../sdk-batch-2b2-admission/state.json), a
  [adjudicação](../sdk-batch-2b2-admission/adjudication-r1.json), a
  [tabela de discriminação](../sdk-batch-2b2-admission/discrimination-check-2b2.json) e
  a [decisão F01](../sdk-batch-2b2-admission/lead-decision-f01.json);
- verificação: [validação](validation.json);
- revisão: [R1](review-r1/review.json), [reparo](repair-r1.json),
  [R2](review-r2/review.json), [disposição da R2](review-r2/executor-disposition.json);
- varredura de segredos: [gitleaks](secret-scan.json).

## Para `docs/99_runtime_state.md` (bloco CONT-20261018-D9EF, item Codex100)

- `last_completed_action`: DX100-G02:BIND-SDK-SOURCE-BATCH-2B-2
  `COMPLETED_LOCAL_WITH_CARRIED_P2`.
  - O [mapa v5](coverage-observed-v5.json) consome os 17 casos SDK da admissão do 2B-2
    só nas partes que a tabela de discriminação distingue. O CONTROL não entra.
  - O v5 tem 33 contratos observados e 11 abertos; o v4 tinha 29 e 15. PY09, PY13,
    PY17 e PY18 passam a OBSERVED_CLIENT_PARTIAL. PY14 só ganha observações.
  - São 76 braços observados, 8 deles com escopo parcial. O PY13.B06 fica aberto,
    porque o caso não distingue o ramo.
  - Pela decisão F01 do Lead, o 2B-PY13E não ganha crédito pela discriminação do
    known_bad "pular o cleanup": PY13.B17 e PY13.B18 entram só pela observação
    positiva.
  - As erratas do BIND do 2B-1 (PY12.B03, PY02.B02 e PY02.B07) foram aplicadas.
  - Os 11 abertos são PY19, PY20 e PK01 a PK09, todos do perfil distribuído. O perfil
    de fonte do lote 2 está completo.
- As [seis lacunas](gaps-review-v5.json) seguem OPEN: GAP-PY-API 13/13, GAP-PY-RPC
  11/11, GAP-GENERATED 4/4, GAP-PROVENANCE 1/3, GAP-TS-LANGUAGE 15/15 e
  GAP-PLATFORM-PACKAGING 1/12.
- 0 execução, 0 recibos funcionais e 0 crédito de paridade.
- `next_action`: DX100-G02:SPECIFY-SDK-SOURCE-CONTINUATION-3, T1 documental, com os
  resíduos de fonte que cabem sem decisão nova ([task](next-task.json)).
- `pending_user_decision`: pacote com as perguntas Q1 a Q5 da
  [errata](review-r2/executor-disposition.json), que prevalecem sobre as do HOW v2:
  - Q1 (T3), identidade dos artefatos frente ao pin;
  - Q2 (T4), aquisição com rede;
  - Q3 (T3), recorte keyless;
  - Q4 (T3), testemunha privilegiada do TS12;
  - Q5 (T4), outras versões da pydantic e do Node.

  Elas não bloqueiam a próxima unidade.

## Para `docs/20_master_execution_log.md`

- 19/10/2026 — DX100-G02:BIND-SDK-SOURCE-BATCH-2B-2 (Claude Code, CONT-20261018-D9EF).
  - Passo 0: [PASS 19/19](input-verification.json). Conferem:
    - a admissão do 2B-2 no commit de conteúdo `d4057ddb` e no commit `7e1da11a` do
      PR documental #7, que está na ref `origin/candidate/d9ef-docs-20261019`;
    - a tabela de discriminação contra a adjudicação (68/8/1);
    - a decisão F01;
    - a especificação 2B e o BIND do 2B-1;
    - os sha das bases de fonte do v4 contra a identity freeze.
  - Mapa: [v5](coverage-observed-v5.json) 33/11, com 4 mudanças de status, 76 braços
    observados (8 parciais) e o PY13.B06 aberto. A projeção feita sobre o v4 se
    confirma.
  - Validador em Node, segunda implementação do mesmo executor (não é revisão
    independente): [PASS](validation.json), com 57 controles negativos recusados.
  - [HOW v2](HOW-next-profile-v2.md): o que resta depois do perfil de fonte, as
    decisões do perfil distribuído e os resíduos de fonte sem decisão nova.
  - Revisão:
    - R1 REVISE, com 4 P2: o status da SPEC0239, as perguntas Q1 e Q2, o resíduo do
      PY18 e a evidência do teto do PY09.B02. Também 4 P3;
    - reparo agrupado 1/1;
    - R2 REVISE, com 1 P2: a lista da Q1 e da Q2 não cobria o proxy npm do PK07 e do
      PK08, o download do PY20, a pydantic e o Node. Também 4 P3.
  - Com as rodadas e o reparo esgotados, o texto certo das perguntas (Q1 a Q5) e do
    mapa de decisões ficou como errata obrigatória na
    [disposição](review-r2/executor-disposition.json). O mapa v5, as lacunas e o
    validador não têm achado obrigatório.
  - Sem serviço, SDK, rede, commit ou branch. O gitleaks rodou sobre uma cópia
    ([registro](secret-scan.json)).

## Para `docs/30_backlog_master.md`

- Trocar o item "DX100-G02:BIND-SDK-SOURCE-BATCH-2B-2" por
  "DX100-G02:SPECIFY-SDK-SOURCE-CONTINUATION-3, T1 documental, resíduos de fonte sem
  decisão nova ([task](next-task.json))".
- Acrescentar "Pacote de decisão do usuário para o perfil distribuído e afins, com as
  perguntas Q1 a Q5 da [errata](review-r2/executor-disposition.json)".
- Acrescentar "SPECIFY do perfil distribuído no linux-x64, depois de Q1, Q2 e Q3
  respondidas ([HOW v2](HOW-next-profile-v2.md))".

## Para `docs/03_build/0386_backlog_paridade_codex.md` (cartão DX100-G02)

- Acrescentar ao cartão: "Sub-lote 2B-2 vinculado no mapa v5
  ([v5](coverage-observed-v5.json)), com o perfil de fonte do lote 2 completo. São 33
  contratos com observação parcial de cliente e 11 abertos (v4: 29/15). Os abertos são
  PY19, PY20 e PK01 a PK09, todos do perfil distribuído. As seis lacunas seguem OPEN.
  O perfil distribuído depende de decisões do usuário (Q1 a Q3, mais Q5), descritas no
  [HOW v2](HOW-next-profile-v2.md) e na errata. R2 REVISE com 1 P2 registrado como
  errata; 0 recibos."
- O estado do cartão segue `IN_PROGRESS`. Não incrementa o numerador.
