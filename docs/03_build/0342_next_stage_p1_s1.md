# Próxima etapa entregue — P1-S1 — M07 → M05 → L09

> Este handoff foi atualizado pelo resultado M07-S1 e foi supersedido para a próxima ação operacional pelo [pacote corretivo 0345](0345_next_stage_m07_correction.md), baseado na [reauditoria 0569](../04_audit/0569_m07_delivery_and_repository_reaudit_2026-09-23.md). A sequência M07 → M05 → L09 continua, com A24-04 como primeiro passo.

Data: 23/09/2026
Estado: gate M07-S1 aprovado e executado; BUILD/AUDIT `FAIL`; M05 Discovery aprovada como sucessora, mas ainda dependente de M07
Escopo: local, sintético e descartável; G21-5/G21-6 fechados; produção NO_GO

## Objetivo da etapa

Estabilizar as fronteiras públicas do Harness antes de refatorar arquivos grandes ou ampliar capacidades. A sequência é M07 (dependências e manifests), M05 (composição pública canônica) e L09 (documentação da API por consumidor). O [backlog detalhado](0341_50_improvements_backlog.md) contém os contratos de cada ID; o [roadmap](0340_50_improvements_roadmap.md) fixa a ordem.

## Task inicial — M07

### Discovery

Inventariar os imports reais, package.json, exports, tsconfig e caminhos de build isolado em apps/_ e packages/_. Confirmar quais imports são públicos, privados ou circulares; registrar a diferença entre estado observado e arquitetura-alvo. Usar apenas leitura e dados sintéticos. Não classificar como defeito um import sem prova do contrato aplicável.

### PRD da task

Definir resultado observável: cada package declara suas dependências reais, compila pelo export público pertinente e não cria ciclo proibido. Fixar exceções legadas com owner e prazo, sem fingir que foram resolvidas. Identificar consumidores afetados e requisitos de compatibilidade.

### SPEC da task

Definir a direção permitida do grafo, o mapa de arquivos, a ordem de pequenas correções e a barra de regressão. A SPEC deve indicar o que permanece em product host, Harness e adapters e demonstrar como preservar o candidato histórico. Só após o gate aprovado iniciar código.

### Critério de pronto de M07

Relatório de grafo e manifests antes/depois; builds isolados e checks de direção sem import oculto; typecheck, lint e regressão pertinente quando houver código; evidência de compatibilidade de exports. A task termina com AUDIT, atualização de backlog/log/runtime e handoff explícito para M05.

## Task sucessora — M05

Caracterizar, em fixture sintética, o caminho HTTP → PostgreSQL → worker → kernel, com trace de tenant, session, policy, approval, tool, journal e resposta. Especificar os ports públicos e os dois caminhos legados que precisam de paridade. A prova deve atravessar a composição real sem integração externa ou ação sensível; seu gate SPEC é separado do de M07.

## Task complementar — L09

Após M05, atualizar docs/architecture/PUBLIC_API.md e exemplos para que outro consumidor consiga compor o Harness só pelos exports públicos. A validação final de generalidade pertence a M06 em P1-S3.

## Primeiro passo para o próximo agente

M07 Discovery, PRD e SPEC foram aprovados nas etapas documentais. O usuário aprovou exatamente o gate local [M07-S1 BUILD](../04_audit/evidence/AUD-20260923/M07-BUILD-S1/build-gate-request.md), e a implementação foi auditada no candidato `a00127c13b165b81bd95d2671891e737f50bfb60c482816d0ef9c1b26fa4a797`. O resultado é `FAIL`: coverage não alcançou statements/branches e a inventory completa registrou 22 achados de manifests no baseline. Testes focais, suite total, typecheck e lint passaram. Lead review é condicional no máximo; I1 está `UNAVAILABLE`. Ver [resultado final](../04_audit/evidence/AUD-20260923/M07-BUILD-S1/final-gate-result.md). Nenhum slice posterior está autorizado. M05 segue M07 com rota A e par legado `published-agent`/`kernel`.

## Atualização obrigatória ao terminar a etapa

Persistir evidência da task; atualizar docs/03_build/0341_50_improvements_backlog.md e docs/30_backlog_master.md; registrar o resultado em docs/20_master_execution_log.md; por último atualizar docs/99_runtime_state.md com last_completed_action, status e next_action. Atualizar os índices 0300–0302 e 99_operational_index se a etapa corrente mudar. O próximo handoff deve apontar M05 ou a dependência exata que o bloqueia.

## Histórico: rodada M07 Discovery e PRD antes da aprovação humana — 23/09/2026

O inventário somente leitura foi concluído em [0017](../00_discovery/0017_m07_package_dependencies.md). O PRD 0028 e a aprovação humana posterior estão registrados no gate PRD e em [P1-S1 human decisions](../04_audit/evidence/AUD-20260923/P1-S1/human-decisions-20260923.md). Este parágrafo preserva o estado anterior à decisão, quando a SPEC ainda aguardava validação do PRD. O Gauntlet Discovery permanece `CONDITIONAL_PASS` com limitação D4 explícita.

## Estado corrente da rodada M07 SPEC — 23/09/2026

A SPEC documental está em [0128](../02_spec/0128_m07_package_dependency_governance.md). A SPEC foi lead-only com D1–D9 PASS_LEAD_ONLY, I1 UNAVAILABLE, Gauntlet CONDITIONAL_PASS e verificação integrada NOT_RUN. Este estado histórico foi input-bound no candidato aprovado; o resultado posterior de M07-S1 está no [BUILD/AUDIT final](../04_audit/evidence/AUD-20260923/M07-BUILD-S1/final-gate-result.md), sem alteração da SPEC congelada.

## Estado da rodada M05 Discovery — 23/09/2026

O mapa read-only está em [0018](../00_discovery/0018_m05_public_harness_composition.md), com evidência e revisão em [M05](../04_audit/evidence/AUD-20260923/M05/). A resposta humana “Approve both; choose A (recommended)” aprovou o Discovery e selecionou a rota `/v1/executions` → outbox PostgreSQL operacional → worker `operational-harness` → `createOperationalHarness()`, com par legado `published-agent`/`kernel`. M05 segue M07. Seu PRD deverá explicitar a comparação de tenant, session, policy, approval, tool, journal e resposta, sem presumir igualdade interna. A aprovação Discovery não libera SPEC, BUILD, código ou produção.
