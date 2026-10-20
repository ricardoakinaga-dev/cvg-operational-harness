# Delta de ledgers proposto ao Lead — CONT-20261018-D9EF / CODEX100

Unidade `DX100-G02:IMPLEMENT-AND-ADMIT-SDK-DISTRIBUTED-PROFILE-DP-1`, T1 com execução local
contida, estado final depois da R2. O executor não editou ledgers, coordenação, catálogo
central nem código de produto. Commit só na candidata destacada
`/mnt/dados/cvg-work/cvg-codex100-dp1-20261019`, sem branch, push nem PR. Os links abaixo
são relativos a este arquivo.

Fontes:

- unidade: [estado](state.json), [próxima unidade](next-task.json),
  [preflight](preflight.json), [validação](validation-unit.json);
- freezes: [source](source-freeze-dp1.json), [identity](identity-freeze-dp1.json),
  [adendo](freeze-addendum-dp1.json);
- serviços: [DIAG](diag-admission-dp1.json), [resultados](case-results.json),
  [adjudicação](adjudication-dp1.json), [reavaliação](reevaluation-dp1.json),
  [recursos](resource-receipt-final.json), [vazios](empty-artifact-delta.json);
- revisão: [R1](review-r1/review.json), [reparo](repair-r1.json),
  [R2](review-r2/review.json), [disposição](review-r2/executor-disposition.json).

## Para `docs/99_runtime_state.md` (bloco CONT-20261018-D9EF, item Codex100)

- `last_completed_action`: DX100-G02:IMPLEMENT-AND-ADMIT-SDK-DISTRIBUTED-PROFILE-DP-1
  `COMPLETED_LOCAL_WITH_CARRIED_FINDINGS`.
  - CONTROL DP1-CTRL01 deu MISMATCH pela regra 6, só por wrap.exit_mirror_exact, antes
    dos slots.
  - 10 slots deram PASS_CLIENT_OBSERVATION: DP-PK01A, DP-PK02A, DP-PK02R, DP-PK03A,
    DP-PK04A, DP-REAL01, DP-PK05A, DP-PK06A, DP-PK08A e o ARTIFACT_CHECK DP-PK09A, este
    sem serviço.
  - 1 slot deu INVALID_CAPTURE: DP-PK07A, adjudicado como defeito de fixture da
    especificação. O filho sintético `.exe` cai no escopo `"type": "module"` do pacote do
    proxy e o Node recusa a extensão. Não houve MISMATCH falso e nada foi contado.
  - A vaga condicional DP-REAL01 foi liberada pelo DIAG-DP-REAL-CLI; o binário publicado
    respondeu `codex-cli 0.153.4`.
- Orçamento: 12/12 vagas, 5/12 serviços, 2/2 revisões, 1/1 reparo e 0 retries. Load
  máximo 9,81. 16 units `cvg-dx100-dp1-*`, todas liberadas. Sem PG, porta ou rede.
- A errata DP-SPEC/R2-F01 (topologia driver_only) foi aplicada antes do source freeze.
- Desvios DV1 a DV4 aguardam aceite do Lead:
  - DV1: DIAG-TS-ECHO requalificado na pilha DP;
  - DV2: modo selftest-sandbox, só com as linhas DIAG de código próprio;
  - DV3: RuntimeMaxSec 90 em vez de 45;
  - DV4: leitura do layout do registro do filho sintético.
- 0 recibos funcionais e 0 crédito de paridade.
- `next_action`: DX100-G02:IMPLEMENT-AND-ADMIT-SDK-DISTRIBUTED-PROFILE-DP-2, sem T3 nem
  T4, com os carry-overs ([task](next-task.json)). Um caso novo do PK07, com a errata de
  fixture, só com decisão do Lead.

## Para `docs/20_master_execution_log.md`

- 20/10/2026 — DX100-G02:IMPLEMENT-AND-ADMIT-SDK-DISTRIBUTED-PROFILE-DP-1 (Claude Code,
  CONT-20261018-D9EF).
  - Candidata destacada em `76c047257`. Os inputs são cópias byte a byte da especificação
    e da aquisição ([preflight PASS 10/10](preflight.json)).
  - A pilha `dplane/` e `node/` deriva da pilha TypeScript do C3-1:
    - driver Node com vocabulário fechado;
    - loader com entradas de SDK pelo sha do membro A7;
    - filho sintético;
    - wrapper de controle;
    - staging do cache fora de `docs/`.
  - Os serviços rodaram com 1 GiB e 256 tarefas. O pico foi de 35 tarefas, acima dos 32
    herdados.
  - Ordem seguida:
    - autotestes 69/69 e validador 7/7, com 9 controles negativos;
    - source e identity freeze;
    - 5 DIAG, todos com DIAG_PASS;
    - CONTROL;
    - 11 slots, em ordem.
  - A reavaliação offline das 12 pastas é igual por predicado, por desfecho e no vínculo
    do plano.
  - Revisão:
    - R1 REVISE, com 3 P2: registro do delta do observador e checagem por caso,
      autotestes de capacidade ausentes e RuntimeMaxSec não declarado;
    - reparo agrupado sem tocar nos freezes, sem serviço e sem vaga: adendo de freeze
      (DDP-12, DDP-13, EDP-09, DV1 a DV4), 20 autotestes de capacidade e checagens
      pós-revisão com 9 controles de mensagem exata;
    - R2 APPROVE, com 6 P3, todos levados ao DP-2 ou registrados.
  - Gitleaks sem achados ([recibo](commit-receipt.json)).

## Para `docs/30_backlog_master.md`

- Trocar o item "DX100-G02:IMPLEMENT-AND-ADMIT-SDK-DISTRIBUTED-PROFILE-DP-1" por
  "DX100-G02:IMPLEMENT-AND-ADMIT-SDK-DISTRIBUTED-PROFILE-DP-2, execução local contida,
  sem T3 nem T4 ([task](next-task.json))".
- Acrescentar dois itens:
  - "Aceite do Lead dos desvios DV1 a DV4 do DP-1
    ([adendo](freeze-addendum-dp1.json))";
  - "Caso novo do PK07 com a errata de fixture, só com decisão do Lead
    ([adjudicação](adjudication-dp1.json))".

## Para `docs/03_build/0386_backlog_paridade_codex.md` (cartão DX100-G02)

- Acrescentar ao cartão: "Sub-lote DP-1 do perfil distribuído keyless 0.153.4 admitido.
  CONTROL MISMATCH; 10 PASS_CLIENT_OBSERVATION (PK01 a PK06, PK08, PK09 e DP-REAL01 com o
  binário publicado); PK07 INVALID_CAPTURE por defeito de fixture, sem observação. Sem
  vínculo de build (`NO_BUILD_LINK_DECLARED`). Falta o BIND; 0 recibos."
- O estado do cartão segue `IN_PROGRESS`. Não incrementa o numerador.
