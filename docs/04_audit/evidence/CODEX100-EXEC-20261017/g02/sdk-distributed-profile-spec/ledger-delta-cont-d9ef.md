# Delta de ledgers proposto ao Lead — CONT-20261018-D9EF / CODEX100

Unidade `DX100-G02:SPECIFY-SDK-DISTRIBUTED-PROFILE-KEYLESS`, T1 documental, estado final
depois da R2. O executor não editou ledgers, coordenação, 0384–0386, catálogo central
nem código. Não houve commit, branch nem worktree. Os links abaixo são relativos a
este arquivo. Ao transcrever para `docs/`, prefixar com
`04_audit/evidence/CODEX100-EXEC-20261017/g02/sdk-distributed-profile-spec/`; para
`docs/03_build/0386_backlog_paridade_codex.md`, com
`../04_audit/evidence/CODEX100-EXEC-20261017/g02/sdk-distributed-profile-spec/`.

Fontes:

- unidade: [estado](state.json), [verificação de entrada](input-verification.json),
  [próxima unidade](next-task.json);
- casos e plano: [casos do DP-1](cases-dp-1.json), [casos do DP-2](cases-dp-2.json),
  [plano de cobertura, condições e resíduos](coverage-plan-dp.json);
- contratos: [capacidades](capability-contracts-dp.json),
  [deltas do freeze r4](freeze-r4-dp-delta.json),
  [deltas do avaliador r4](evaluator-r4-dp-delta.json),
  [vagas CONTROL](control-slot-contract-dp.json), orçamentos do
  [DP-1](execution-budget-dp-1.json) e do [DP-2](execution-budget-dp-2.json);
- decisão: [avaliação T3](t3-assessment.json);
- verificação: [validação](validation.json);
- revisão: [R1](review-r1/review.json), [reparo](repair-r1.json),
  [R2](review-r2/review.json), [disposição da R2](review-r2/executor-disposition.json).

## Para `docs/99_runtime_state.md` (bloco CONT-20261018-D9EF, item Codex100)

- `last_completed_action`: DX100-G02:SPECIFY-SDK-DISTRIBUTED-PROFILE-KEYLESS
  `COMPLETED_LOCAL_WITH_CARRIED_P2`. O perfil distribuído keyless (pin 0.153.4, sem
  vínculo de build) ficou em dois sub-lotes, 18 vagas no total:
  - [DP-1](cases-dp-1.json), Node: 12 vagas (11 casos, 1 deles condicional, e 1
    CONTROL de código próprio) e 5 serviços. Cobre PK01 a PK09 com os pacotes npm
    publicados do cache e filho sintético; o DP-REAL01 roda o binário publicado só
    com `--version`;
  - [DP-2](cases-dp-2.json), Python: 6 vagas (5 casos, 1 deles condicional, e 1
    CONTROL copiado do 2B2-CTRL01) e 10 serviços. Cobre PY19, PY20 e o ramo
    empacotado do PY02; o DP-PY02P roda o binário do wheel só com app-server,
    initialize e close.
- 48 resíduos (14 IN, 34 OUT) e 124 condições dos braços G01 e novos, 30 delas fora,
  cada uma com destino. Seis capacidades de harness sem privilégio (CAP-DP-\*), no
  regime de capacidade nova do 2B; a leitura de "capability nova" no sentido da Q4
  fica para confirmação do Lead.
- Sem T3 e sem T4 agora. Três perguntas contingentes não feitas: T4 para obter as
  fontes do bootstrap do PY20, T3 para a identidade TLS de teste do github.com no
  sandbox e T4 para as assinaturas npm. 0 execução, 0 recibos funcionais e 0 crédito
  de paridade.
- `next_action`: DX100-G02:IMPLEMENT-AND-ADMIT-SDK-DISTRIBUTED-PROFILE-DP-1, com
  execução local contida e sem T3 ([task](next-task.json)). A errata do R2-F01
  (forma de captura só com o driver) é obrigatória e entra antes do source freeze.

## Para `docs/20_master_execution_log.md`

- 19/10/2026 — DX100-G02:SPECIFY-SDK-DISTRIBUTED-PROFILE-KEYLESS (Claude Code,
  CONT-20261018-D9EF).
  - Passo 0 [PASS 17/17](input-verification.json). Conferem:
    - a aquisição fechada, o cache contra o registro e os membros contra os
      metadados, inclusive o metadado M7 da release;
    - as decisões Q1–Q4 do usuário e a do Lead sobre o loopback;
    - o mapa v5, os contratos G01 e as bases 2B, 2B-2, 2AC e 2A-cont no commit
      `7e1da11a4`;
    - as fontes do pin contra a identity freeze.
  - Casos: os valores esperados saem dos textos publicados da release 0.153.4, lidos
    do cache em memória, e da fonte do pin, com 88 âncoras de linha e sha. Todo caso
    não CONTROL declara `NO_BUILD_LINK_DECLARED`.
  - O loopback do A5 não é usado. O bootstrap do PY20 importa `release_version.py`,
    que não está nas entradas, e baixa por HTTPS fixo do github.com.
  - Validador em Node, segunda implementação do mesmo executor (não é revisão
    independente): [PASS 12/12](validation.json), com 23 controles negativos
    recusados.
  - Revisão:
    - R1 REVISE, com 2 P1, 8 P2 e 5 P3. Os P1 eram a versão esperada em
      `serverInfo`, que o app-server desta família não devolve, e os predicados de
      processo do 2B usados fora da sua topologia;
    - reparo agrupado 1/1: os 15 achados foram tratados. Entraram a versão derivada
      pelo SDK, os predicados `realcli.*`, espera limitada no filho sintético, as
      condições por braço G01, o formato 2B das capacidades, os limites de 1 GiB e
      256 tarefas e o DP-PY19C;
    - R2 REVISE, com 0 P1, 1 P2 e 5 P3. Treze achados da R1 foram dados por
      resolvidos e dois por parciais, com o resto nos P3. O P2 é a forma de captura
      PASS numa topologia sem adapter e sem peer, que os observadores admitidos não
      reconhecem.
  - Com as rodadas e o reparo esgotados, o P2 vai às IMPLEMENT como errata
    obrigatória: o observador passa a aceitar a topologia só com o driver por
    declaração do caso, com autotestes. Nenhum valor congelado muda.
  - Sem serviço, SDK, rede, commit ou branch. O gitleaks rodou sobre uma cópia, sem
    achados ([registro](secret-scan.json)).

## Para `docs/30_backlog_master.md`

- Trocar o item "DX100-G02:SPECIFY-SDK-DISTRIBUTED-PROFILE-KEYLESS" por
  "DX100-G02:IMPLEMENT-AND-ADMIT-SDK-DISTRIBUTED-PROFILE-DP-1, execução local contida,
  sem T3, errata do R2-F01 obrigatória ([task](next-task.json))".
- Acrescentar "DX100-G02:IMPLEMENT-AND-ADMIT-SDK-DISTRIBUTED-PROFILE-DP-2. Depende do
  DP-1 admitido ([orçamento](execution-budget-dp-2.json),
  [disposição](review-r2/executor-disposition.json))".

## Para `docs/03_build/0386_backlog_paridade_codex.md` (cartão DX100-G02)

- Acrescentar ao cartão: "Perfil distribuído keyless 0.153.4 especificado em dois
  sub-lotes ([DP-1](cases-dp-1.json), 12 vagas; [DP-2](cases-dp-2.json), 6 vagas),
  com os artefatos do cache ligados por sha e sem vínculo de build. Os 34 resíduos
  fora estão classificados com destino ([plano](coverage-plan-dp.json)). Se tudo
  passar, PY19, PY20 e PK01–PK09 vão a OBSERVED_CLIENT_PARTIAL (44/0), sem cobrir o
  requisito inteiro; GAP-PROVENANCE e GAP-PLATFORM-PACKAGING seguem OPEN. R2 REVISE,
  com 1 P2 levado à IMPLEMENT; 0 recibos."
- O estado do cartão segue `IN_PROGRESS`. Não incrementa o numerador.
