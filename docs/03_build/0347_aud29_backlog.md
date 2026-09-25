# Backlog AUD29 — delta após R1 — 24/09/2026

Estado AUD52: C1L executou o preview e parou no candidate freeze por drift de baseline em `docs/02_spec/0190_spec_validation.md`; não há candidate/testes. Consulte o [resultado C1L](../04_audit/evidence/AUD-20260924/M07-S1-C1L/final-gate-result.md), [disposição](../04_audit/evidence/AUD-20260924/M07-S1-C1L/run-disposition.json) e o [backlog detalhado M07](0344_reaudit_m07_backlog.md). M07-S1 continua `FAIL / OPEN`; M05 e downstream bloqueados.

## Histórico AUD48 — Pedido C1K preparado; decisão pendente naquele snapshot

- `A24-03-C1K-PACKET`: `COMPLETED_DOCUMENTARY / PACKET_VALIDATED`; escopo congelado e hashes verificados em [packet-validation](../04_audit/evidence/AUD-20260924/M07-S1-C1K/packet-validation.json).
- `A24-03-C1K-REVIEW`: `WAITING_HUMAN_APPROVAL / NOT_STARTED`; pedido [C1K](../04_audit/evidence/AUD-20260924/M07-S1-C1K/approval-request.md), SHA-256 `d334e883540d83aa4a77217fc66203befe8a930020ee5e5c4f8443cc8f5aa97c`.
- Naquele snapshot, a aprovação genérica havia chegado antes do pedido C1K; uma resposta posterior aprovou o C1K pelo hash integral e as duas tentativas ficaram indisponíveis, conforme AUD50/AUD51. O escopo original permitia somente duas tentativas fresh-context read-only.
- C1J-08/09 continuam indisponíveis; M07-S1 `FAIL / OPEN`; sem downstream M07/M05; produção `NO_GO`.

## Histórico AUD47 — C1J executada; gate permanece FAIL / OPEN

### A24-03-C1J-GATE — Resultado da decisão e replay C1J

- Estado: `EXECUTED / FAIL_OPEN_REVIEW_UNAVAILABLE`; decisão contextual registrada para request SHA-256 `f4351b91f8b0b4401d25bf3200a2355fe8148685936507bfe448b59c3d8c27e2`.
- Candidate C1J `e884796fd90192409230b0991524168186a9f65c824156a943102dcfacc98e1b`, 977 inputs; patch exatamente nos três paths aprovados e fixture snapshot-only inalterado.
- Matriz local: focused 25/25, full 2.137 pass/146 skipped, typecheck/lint pass, cobertura acima dos quatro thresholds, inventory 11 findings/zero gaps/unresolved, pós-check sem drift e command records `INTEGRITY_PASS`.
- C1J-08 I1 e C1J-09 Final Critic: ambas as solicitações fresh-context recusadas por `agent thread limit reached`; nenhum parecer. O gate termina `FAIL / OPEN`, sem aceitar S1.
- Próxima ação: preparar packet hash-bound separado para resolver a indisponibilidade; C1J não pode ser repetida sob o mesmo gate.

## Histórico AUD45 — C1J aguardava decisão humana

### A24-03-C1J-PACKET — Novo packet corretivo após C1I

- Estado: `COMPLETED_DOCUMENTARY / WAITING_HUMAN_APPROVAL`; validação estática aprovada, sem patch ou checks de produto.
- Evidência: [pedido](../04_audit/evidence/AUD-20260924/M07-S1-C1J/approval-request.md), SHA-256 `f4351b91f8b0b4401d25bf3200a2355fe8148685936507bfe448b59c3d8c27e2`; [packet validation](../04_audit/evidence/AUD-20260924/M07-S1-C1J/packet-validation.json).

### A24-03-C1J-GATE — Decisão humana e replay condicionado

- Estado: `WAITING_HUMAN_APPROVAL / NOT_STARTED`; a resposta genérica enviada antes da apresentação deste pedido não foi registrada para C1J.
- Escopo, paths e plano estão no [pedido hash-bound](../04_audit/evidence/AUD-20260924/M07-S1-C1J/approval-request.md). Aprovação ainda não registrada; nenhuma alteração de produto nem passo do plano iniciou.
- Próxima ação: obter decisão sobre o request SHA-256 `f4351b91f8b0b4401d25bf3200a2355fe8148685936507bfe448b59c3d8c27e2`.

## Histórico AUD44

### A24-03-C1I-PACKET — Preparar novo baseline candidate e gate corretivo

- Estado: `COMPLETE_DOCUMENTARY / NO_BUILD_EXECUTED`; packet preparado após C1H candidate-freeze exit 64.
- O que/onde: pacote hash-bound C1I em `docs/04_audit/evidence/AUD-20260924/M07-S1-C1I/`; nenhum path de produto pode ser alterado antes de decisão própria.
- Como: copiar o baseline R1 preservado, reconciliar somente os dois tuples 0190/AGENTS, recomputar fingerprint basis, preparar patch preview para binding do baseline e output C1I, snapshots, command plan e rollback.
- Gate/dependência: aprovação humana C1I separada da aprovação C1H; source baseline e patch precisam ter hashes conferíveis. Nada de rerun C1H.
- Pronto/evidência: packet estático completo com scope exato, qualidade, comandos, hashes e stop rules; S1 permanece `FAIL / OPEN` até novo candidate e critérios satisfeitos.

### A24-03-C1I-GATE — Decisão humana do replay C1I

- Estado: `APPROVED / FAILED_CANDIDATE_FREEZE / NO_CANDIDATE`; decisão literal “aprovo este gate” vinculada ao [pedido exato](../04_audit/evidence/AUD-20260924/M07-S1-C1I/approval-request.md), SHA-256 `86bc71b2bf7dac7f500a3dbb8a942e5d4cbeb9d6638ac43bf9dd65d923b1af57`.
- Resultado: candidate freeze exit 64 por referência indefinida a `C1H_NPM_VERSION_FILE`; nenhum candidate, inventory ou teste foi produzido. A execução está em [resultado C1I](../04_audit/evidence/AUD-20260924/M07-S1-C1I/final-gate-result.md); não repetir C1I.
- S1 permanece `FAIL / OPEN`; M07-S2/S3/S4 e M05 bloqueadas, G21-5/G21-6 fechados, produção `NO_GO`.

### A24-03-C1J-PACKET — Novo packet corretivo após C1I

- Estado corrente substituído por `COMPLETED_DOCUMENTARY / WAITING_HUMAN_APPROVAL`; consulte o registro AUD45 acima. Esta linha histórica preserva a definição inicial do trabalho documental.

### A29-11 — Preparar e decidir candidate replay C1G

- Estado: `DECISION_RECORDED / C1G_STOPPED_PRECHECK_FAILURE`; acompanha A24-03-C1G e C1F `FAIL / OPEN`.
- O que/onde: novo packet `docs/04_audit/evidence/AUD-20260924/M07-S1-C1G/`; nenhuma edição de código antes do gate.
- Como: conferir packet e registrar a decisão vinculada ao [approval request C1G](../04_audit/evidence/AUD-20260924/M07-S1-C1G/approval-request.md), SHA-256 `5700d97d2931dc08c622cdee470c5d869a9980f1a4c1bdb40b64afb7d3e6645f`. O comando de versão Node passou; o preflight TypeScript falhou pelo root incorreto do capturador. Preservar o resultado; não repetir C1G.
- Dependência/gate: aprovação C1G registrada; falha encerrada sem aceitar S1. A decisão C1G não se transfere para C1H; reviewers continuam necessários.
- Pronto/evidência: decisão e resultado da tentativa C1G registrados; replay incompleto, sem candidate e sem aceite de S1.

### A24-03-C1H — Replay interrompido no candidate freeze

- Estado: `APPROVED / FAILED_CANDIDATE_FREEZE / NO_CANDIDATE`; M07-S1 permanece `FAIL / OPEN`.
- O que/onde: novo packet em `docs/04_audit/evidence/AUD-20260924/M07-S1-C1H/`, helper C1H com raiz corrigida e patch de três paths de policy/scanner/teste.
- Como: a decisão C1H foi registrada em [decision-record](../04_audit/evidence/AUD-20260924/M07-S1-C1H/decision-record.md), vinculada ao SHA acima. A execução parou no `candidate-freeze` exit 64 ao detectar drift R1 em 0190 e AGENTS; o [resultado](../04_audit/evidence/AUD-20260924/M07-S1-C1H/final-gate-result.md) preserva a causa. Nenhuma etapa dependente foi executada.
- Dependência/gate: não rerodar C1H. Uma proposta nova deve preservar os bytes C1H/R1 e vincular um baseline corrigido a uma nova decisão humana.
- Pronto/evidência: C1H parou antes de criar candidate; resultado, command records e quality-bar adjudication estão preservados. Nova tentativa depende de packet e decisão próprios; S1 permanece aberta.

## Alta prioridade

### A29-01 — Decidir o gate C1

- Estado: `DECISION_RECORDED_C1_APPROVED`; origem A29-F01; mapeia A24-03-C1.
- O que/onde: [pedido C1](../04_audit/evidence/AUD-20260923/M07-S1-R1/correction-gate-proposal.md) e [preview](../04_audit/evidence/AUD-20260923/M07-S1-R1/correction-preview.md).
- Como: o usuário respondeu “aprovo este gate”; a decisão foi vinculada ao único gate C1 corrente após conferir os bytes/SHAs `9d865f7db78b479dacaf69ca2de7dffcc03892eff061dd49ca90ec2035eb83f1` e `9d7fc894b728967aaa4f0949bc5dc8ae466d31ecc616fe9a902a58859ebb0c17`. A24-03-C1 foi registrada antes do fixture.
- Dependência/gate: a decisão C1 não remove o bloqueio técnico do output path. O freeze terminou exit 64; o [resultado](../04_audit/evidence/AUD-20260923/M07-S1-R1-C1/final-gate-result.md) e o novo [gate C1E](../04_audit/evidence/AUD-20260923/M07-S1-R1-C1/output-path-correction-gate.md) preservam o estado e pedem nova decisão para paths adicionais.
- Pronto/evidência: decisão C1 registrada; A29-01 concluída para C1. A validação C1E é uma decisão separada.

### A29-02 — Persistir proveniência dos comandos C1

- Estado: `PARTIAL / C1_STOPPED_BEFORE_CHECKS`; origem A29-F02.
- O que/onde: novo diretório `M07-S1-R1-C1`, sem editar a pasta R1; registro por comando com argv, Node/npm/TypeScript, horário/duração, exit imediato, contagens/skips e caminho de stdout/stderr sanitizado.
- Como: preservar os preflights, snapshot/rollback, stdout/stderr do freeze, exits/durações e hashes em [command-records.json](../04_audit/evidence/AUD-20260923/M07-S1-R1-C1/command-records.json). O freeze C1 terminou exit 64; candidate não foi congelado, então inventário e demais checks não rodaram. Os timestamps exatos dos quatro preflights iniciais não foram persistidos e ficaram null. Não inventar logs retroativos para R1.
- Dependência/gate: somente se C1 aprovado e comandos executados; se o formato exigir arquivo de evidência novo, mantê-lo dentro do diretório autorizado.
- Pronto/evidência: proveniência parcial desta tentativa está registrada sem alegações de check não executado; completar registros somente numa nova tentativa aprovada.

### A29-03 — Corrigir fixture e repetir checks C1

- Estado: `BLOCKED_BY_C1E_GATE`; origem A29-F01; executa A24-03-C1.
- O que/onde: apenas `packages/conversation/src/__tests__/postgres-store.unit.test.ts`, conforme preview hash-bound, e diretório de evidência C1.
- Como: executar preflights Node 22.23.2 e candidato R1; criar snapshot/rollback; incluir `pendingProposal` e `pendingApproval` vinculados ao resume; preservar caso negativo e contrato de produção; congelar novo candidato; executar exatamente a sequência C1 com variáveis PostgreSQL removidas; pós-check mesmo após falha de qualidade local.
- Dependência/gate: A29-01 aprovado e task registrada, mas scanner/policy/teste do scanner precisam do [gate C1E](../04_audit/evidence/AUD-20260923/M07-S1-R1-C1/output-path-correction-gate.md), SHA-256 `75b6307384074660bde873ca4aa95bfedfb52c1f58d2448ad227e96e87ad34cc`. A tentativa original permanece imutável; nenhum outro path de código muda antes do novo gate.
- Pronto/evidência: focal, suíte, typecheck, lint, coverage, report/manifest e pós-check no mesmo candidato; falha ou I1 indisponível mantém S1 aberta.

### A29-04 — Adjudicar coverage do novo candidato

- Estado: `BLOCKED_BY_A29_03`; origem A29-F03.
- O que/onde: `M07-S1-R1-C1/coverage` e relatório final C1; thresholds de `vitest.config.mts` apenas para leitura.
- Como: usar percentuais produzidos por run C1 terminado corretamente; comparar statements ≥90%, branches ≥85%, functions ≥90%, lines ≥90%. Se falhar, listar arquivos/branches descobertos e preparar SPEC/gate separados para novos testes de comportamento.
- Dependência/gate: execução coverage do C1 autorizada; outro código requer nova aprovação.
- Pronto/evidência: percentuais, denominadores, exit code e candidato publicados; nenhum número do run S1 ou R1 reaproveitado como resultado C1.

### A29-05 — Auditar candidato C1 e preservar histórico

- Estado: `BLOCKED_BY_A29_03_A29_04`; origem A29-F02/F03.
- O que/onde: novo resultado C1, R1/S1 históricos, 0344, log, runtime state.
- Como: recalcular fingerprint do basis salvo, hashes dos inputs, comparar inventário e manifesto, inspecionar logs/coverage, registrar B1–B9 e limites; separar B3 `PASS_WITH_FINDINGS` da conformance S4.
- Dependência/gate: evidência C1 completa e sem drift; revisão I1 em A29-06.
- Pronto/evidência: veredito baseado em cada critério, sem alterar resultado histórico FAIL ou declarar S1 fechada com B6/B8 pendentes.

### A29-06 — Obter revisão I1 do candidato final S1

- Estado: `BLOCKED_BY_CANDIDATE_AND_REVIEWER`; origem A29-F04; mapeia A24-10 para S1.
- O que/onde: pacote read-only com gate, diff, manifesto, hashes, inventário, logs, coverage e resultado C1.
- Como: solicitar crítico fresh-context independente ou revisor humano independente conforme barra aplicável; registrar literalmente parecer/indisponibilidade e adjudicar achados. Não promover I0/lead a I1.
- Dependência/gate: candidato C1 congelado e revisor disponível.
- Pronto/evidência: I1 aceito sobre o mesmo candidato ou estado explícito `UNAVAILABLE`; fechamento S1 só se todos os critérios críticos passarem.

## Média prioridade

### A29-07 — Executar S2/S3 após S1 aceita

- Estado: `BLOCKED_BY_M07_S1`; mapeia A24-08.
- O que/onde: três packages neutros, direção, exports e consumidores descartáveis.
- Como: obter gates S2 e S3 separados; build bottom-up, testar consumer apenas pelos entry points aprovados e preservar `UNKNOWN` para outros packages.
- Dependência/gate: A29-05/A29-06 concluídas e M07-S1 aceita; SPEC/gates próprios.
- Pronto/evidência: direção e compatibilidade pública por candidato, sem aliases privados e sem regressão observada no escopo.

### A29-08 — Resolver 11 findings do inventário em S4

- Estado: `BLOCKED_BY_S2_S3`; origem A29-F05; mapeia A24-06/A24-07.
- O que/onde: dois vínculos API↔worker e nove mismatches de teste por relação/owner, conforme report R1.
- Como: adjudicar contrato por relação, escolher devDependency ou extração quando apropriado, planejar lotes de manifests/lockfile com rollback e executar somente sob gates S4; comparar inventário before/after.
- Dependência/gate: S2/S3 aceitas, SPEC e gate de manifest/lockfile por lote.
- Pronto/evidência: zero finding bloqueante ou exceção precisa aprovada, sem ciclo runtime acidental e com regressão pertinente.

### A29-09 — Integrar checker ao CI quando perfil estiver aceito

- Estado: `BLOCKED_BY_A29_08`; origem A29-F07; mapeia A24-09.
- O que/onde: contrato CI bar, workflow `verify.yml`, perfil do scanner e runbook.
- Como: definir semântica de exit e achados bloqueantes; anexar relatório candidate-bound; demonstrar que import ausente e candidato stale reprovam CI.
- Dependência/gate: S4 e perfil aprovados, SPEC/gate CI separado.
- Pronto/evidência: workflow mesmo candidato, falhas sintéticas detectadas e nenhum PASS sobre violation bloqueante.

## Baixa prioridade

### A29-10 — Automatizar frescor da navegação

- Estado: `DOCUMENTARY_RECONCILIATION_DONE / AUTOMATION_PROPOSED`; origem A29-F06; mapeia A24-11.
- O que/onde: `0300`–`0302`, `99_operational_index`, `README` e ledgers mestres.
- Como: os resumos correntes apontam a 0570/0346/0347/0348 e aos resultados C1F/C1G; o recheck AUD35 corrigiu os ponteiros ativos ainda stale em 0339/0341/0343/0344/0347 para C1G e preservou as entradas históricas. A atualização AUD36 aponta agora a decisão corretiva C1H. AUD38 reconciliou o [índice operacional](../99_operational_index.md) com o trabalho documental AUD37 e distinguiu essa navegação do estado da lane C1H. AUD39 preparou SPEC v0.1; AUD40 revisou v0.2 e confirmou que o parser deve parar no primeiro entre os 5–6 headings históricos encontrados por fonte. AUD49-DOC-001 refinou a regra em [SPEC-DOC-001 v0.4](../02_spec/0129_l03_operational_index_generator.md), SHA-256 `7a144a686d7a5ce7333efa50c7f476b662b9da4a6b97936f85a0bb07504bc0a9`; revisão lead-only, I1 indisponível, sem revisão humana ou BUILD. Evidências: [AUD38](../04_audit/evidence/AUD-20260924/L03-index-reconciliation/partial-record.md), [AUD39](../04_audit/evidence/AUD-20260924/L03-generator-spec/spec-preparation.md), [AUD40](../04_audit/evidence/AUD-20260924/L03-generator-spec/critique-and-revision-02.md) e [AUD49](../04_audit/evidence/AUD-20260924/L03-generator-spec/critique-and-revision-03.md). A verificação de links do recheck anterior está em [AUD35](../04_audit/evidence/AUD-20260924/A29-10-doc-freshness-audit.md); checker automatizado continua proposta separada e não foi executado.
- Dependência/gate: reconciliação documental autorizada por AUD29; automação requer task/SPEC/gate se houver código.
- Pronto/evidência: reconciliação manual documentada; [AUD49-DOC-001](../04_audit/evidence/AUD-20260924/L03-generator-spec/critique-and-revision-03.md) e SPEC v0.4 refinada, ainda sem I1/revisão humana/BUILD. C1J permanece `FAIL / OPEN` por reviews indisponíveis; o packet C1K atual aguarda confirmação hash-bound e não repete candidate/checks. Nenhum índice anuncia S1 aceita ou produção liberada.

## Próxima ação singular

Obter confirmação humana vinculada ao pedido C1K SHA-256 `d334e883540d83aa4a77217fc66203befe8a930020ee5e5c4f8443cc8f5aa97c`; iniciar as duas revisões somente após aprovação explícita desse pedido. Nenhum comando/check adicional autorizado; M07-S1 permanece `FAIL / OPEN`.
