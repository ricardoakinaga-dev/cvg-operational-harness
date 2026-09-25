# Backlog corretivo da reauditoria M07 — atualizado em 24/09/2026

> Estado corrente AUD53: task documental `A24-03-C1M-PACKET` em andamento para preparar baseline refreshed sem alterar baseline C1J/C1L. A inspeção estática encontrou somente um tuple divergente em 973 inputs: `docs/02_spec/0190_spec_validation.md`; ainda não há pedido de gate C1M nem edição de produto. C1L continua [FAIL / OPEN](../04_audit/evidence/AUD-20260924/M07-S1-C1L/final-gate-result.md); M07-S1 permanece aberta.
>
> Atualização 2026-09-25 (ciclo AUD-0573 / AUD53): o único tuple divergente mudou de novo. `docs/02_spec/0190_spec_validation.md` passou de `9e4432…` (observado em C1L) para `443f6a…`, porque as SPECs [0130](../02_spec/0130_doc_link_checker_extraction.md), [0131](../02_spec/0131_worker_startup_error_redaction.md) e [0132](../02_spec/0132_run_bound_closure_registry.md) foram registradas nele. O preview C1M precisa ser rederivado a partir desse hash antes de qualquer pedido de gate; nenhuma baseline, preview ou aprovação C1M/C1L foi reaproveitada, e `A24-03-C1M-PACKET` continua `IN_PROGRESS / DOCUMENTARY` sem gate aprovado. O ciclo AUD-0573 e a correção do certificado estão em [0574](../04_audit/0574_aud0573_execution_evidence_2026-09-25.md) e [0575](../04_audit/0575_aud53_closure_rebind_decision_packet.md).

## AUD53 — Preparar reconciliação de baseline para C1M — 24/09/2026

### A24-03-C1M-PACKET — Propor novo candidate com baseline currentizada

- Estado: `IN_PROGRESS / DOCUMENTARY`; nenhuma alteração de produto, candidate, scanner ou teste C1M executado.
- O que/onde: preparar packet isolado em `docs/04_audit/evidence/AUD-20260924/M07-S1-C1M/`, preservando C1J e C1L; se aprovado, atualizar apenas os três paths de policy, scanner e teste do scanner.
- Como: comparar os 973 inputs da baseline C1J aos bytes atuais; rebasear apenas tuples explicados e reproduzíveis; congelar preview, command plan, quality bar, rollback e resultado fail-closed para uma matriz local fresh.
- Dependência: C1L parou no candidate freeze por drift em `docs/02_spec/0190_spec_validation.md`. A preparação não herda aprovação C1L; nova decisão humana hash-bound será necessária antes de editar produto ou executar checks.
- Critérios de pronto: divergências identificadas uma a uma; baseline proposed de 973 entradas e fingerprint reproduzíveis; preview limitado a três paths e gates/inventário/thresholds sem relaxamento; packet validado estaticamente com SHA exato para decisão.

## AUD52 — Executar C1L; parar por drift de baseline — 24/09/2026

### A24-03-C1L-GATE — Executar matriz local e correção condicionada

- Estado: `FINISHED / STOP / FAIL`; decisão do usuário e escopo vinculados ao pedido SHA-256 `0a6dd3efa5bc3a45b8e42062680b338e58e3b4e45a924dd177d6a12b77601f6c`.
- Execução: preflight, versões do toolchain, snapshots de rollback, `git apply --check` e aplicação do preview passaram. O preview mudou somente policy, scanner e testes do scanner; fixture conversacional permaneceu byte-idêntico.
- Bloqueio: candidate freeze retornou exit 64 por drift de `docs/02_spec/0190_spec_validation.md` (`1cb32b…` na baseline C1J; `9e4432…` observado em C1L). O input é `governance-input` e está fora do allowlist; nenhum candidate foi criado.
- Limite: não rodei inventory, testes, typecheck, lint, coverage, pós-check ou ciclo de reparo. A regra C1L exige parar quando a causa fica fora dos três paths permitidos. Sanitização (22 logs, zero matches) e integridade histórica C1J passaram.
- Evidência: [resultado final](../04_audit/evidence/AUD-20260924/M07-S1-C1L/final-gate-result.md), [disposition](../04_audit/evidence/AUD-20260924/M07-S1-C1L/run-disposition.json), [command records](../04_audit/evidence/AUD-20260924/M07-S1-C1L/command-records.json).
- Próxima ação: preparar packet separado para reconciliar a baseline do candidate com os inputs atuais e obter gate próprio antes de qualquer nova execução. M07-S1 permanece `FAIL / OPEN`; nenhum downstream foi liberado.

## Histórico AUD51 — Preparar gate local fresh C1L — 24/09/2026

### A24-03-C1L-PACKET — Preparar reteste e correção local limitada

- Estado: `COMPLETED_DOCUMENTARY / PACKET_VALIDATED`.
- Escopo proposto: três paths de produto — policy, scanner e teste do scanner — com snapshot-only do fixture conversacional; preservar candidate baseline e evidência C1J/C1K.
- Correção inicial: SHA-256 `910f076883f247877845c32fd7b516275789004e145cb63f8112dbf2a53ba44f`; retargeta npm/output para C1L, mantendo o baseline C1J, compatibilidade histórica, rejeições de traversal/symlink e cobertura positiva/negativa do novo diretório.
- Validação: 16 checks estáticos passaram em [packet-validation](../04_audit/evidence/AUD-20260924/M07-S1-C1L/packet-validation.json). Não houve `git apply --check`, edição de produto ou comando/teste do plano.
- Critério de pronto: packet e hash apresentados ao usuário; task de gate registrada separadamente.

### A24-03-C1L-GATE — Executar matriz local e, se necessário, uma correção

- Estado: `WAITING_HUMAN_APPROVAL / NOT_STARTED`; pedido SHA-256 `0a6dd3efa5bc3a45b8e42062680b338e58e3b4e45a924dd177d6a12b77601f6c`.
- Se aprovado: aplicar apenas o preview congelado, capturar rollback/evidência, criar candidate fresh 977 entradas e executar os 36 passos C1L. Uma correção adicional só poderá ocorrer após falha observada, com patch hasheado e validado no mesmo allowlist de três paths.
- Critérios: inventário esperado (11 findings, zero gaps/unresolved), testes focados/full, typecheck, lint, thresholds 90/85/90/90, pós-check, sanitização e integridade histórica; npm offline e env PostgreSQL removido.
- Limites: reviewers indisponíveis não serão tentados de novo; C1L não aceita M07-S1, não libera downstream M07/M05 nem produção. Mesmo com matriz local PASS, S1 fica `FAIL / OPEN` sem I1 e Final Critic válidos.
- Próxima ação única: obter decisão explícita vinculada ao SHA integral do pedido C1L.

## AUD50 — C1K aprovado; reviewers indisponíveis — 24/09/2026

- Decisão: o usuário aprovou `M07-S1-R1-C1K` e confirmou o SHA-256 integral `d334e883540d83aa4a77217fc66203befe8a930020ee5e5c4f8443cc8f5aa97c`. O registro está em [decision-record](../04_audit/evidence/AUD-20260924/M07-S1-C1K/decision-record.json).
- `A24-03-C1K-REVIEW`: uma tentativa fresh-context I1 e uma tentativa separada de Final Critic foram feitas (`fork_turns=none`); ambas foram recusadas pelo serviço com `agent thread limit reached`. Os dois papéis estão `UNAVAILABLE`; nenhum reviewer, inspeção ou parecer foi produzido. Evidências em [I1](../04_audit/evidence/AUD-20260924/M07-S1-C1K/i1-review.md), [Final Critic](../04_audit/evidence/AUD-20260924/M07-S1-C1K/final-critic-review.md), [ledger](../04_audit/evidence/AUD-20260924/M07-S1-C1K/review-ledger.json) e [disposição](../04_audit/evidence/AUD-20260924/M07-S1-C1K/final-disposition.md).
- Limites: nenhum comando/check de produto foi executado; nenhum arquivo de produto foi alterado. A recusa não satisfaz C1J-08/09; não há retry ou substituto permitido sob C1K. C1J permanece imutável em `FAIL / OPEN`; M07-S1 aberta, S2/S3/S4 e M05 bloqueadas, G21-5/G21-6 fechados e produção `NO_GO`.
- Próxima ação: aguardar capacidade de criação de contextos independentes; qualquer revisão posterior exige packet e decisão hash-bound distintos. Não repetir C1K ou C1J.

## AUD49 — Revisão documental lead-only da SPEC L03 v0.4 concluída

### A24-11-L03-SPEC-REVIEW — Criticar e refinar SPEC-DOC-001

- Estado: `COMPLETED_DOCUMENTARY / LEAD_ONLY / I1_UNAVAILABLE`.
- O que/onde: revisão read-only da SPEC `docs/02_spec/0129_l03_operational_index_generator.md`; v0.4 SHA-256 `7a144a686d7a5ce7333efa50c7f476b662b9da4a6b97936f85a0bb07504bc0a9`. Achados e limites em [AUD49-DOC-001](../04_audit/evidence/AUD-20260924/L03-generator-spec/critique-and-revision-03.md), SHA-256 `cc609f13145e1ea50db09d4ae14dfef98eb6747f23f3c12fb4148a5f49705dc6`.
- Como: verificar corte histórico, fences/comments/código inline, gramática do subconjunto de links, resolução/symlink, deduplicação com fragmentos e atomicidade contra drift; refinar somente a SPEC draft. Duas tentativas de criar I1 fresh-context foram recusadas (`agent thread limit reached`), sem reviewer ou parecer.
- Dependências/gate: L03 depende de M01/L02 documentais, ambas concluídas. Nenhum código/check ou autoridade de BUILD neste subtask. Revisão independente e humana permanecem pendentes.
- Pronto: críticas e correções lead-only rastreadas; SPEC segue `SPEC_DRAFT_FOR_REVIEW`. O primeiro BUILD depende de revisão/aprovação e packet hash-bound próprios, incluindo bootstrap separado dos marcadores do índice.

> Estado corrente AUD48: packet documental C1K concluído para solicitar I1 e Final Critic read-only sobre o candidate C1J `e884796fd90192409230b0991524168186a9f65c824156a943102dcfacc98e1b`. Pedido C1K SHA-256 `d334e883540d83aa4a77217fc66203befe8a930020ee5e5c4f8443cc8f5aa97c`; `A24-03-C1K-REVIEW` aguarda aprovação exata. M07-S1 segue `FAIL / OPEN`; nenhum review ou check começou.

## AUD48 — Packet C1K documental; decisão humana pendente

- Reconciliação: o gate C1 antigo foi aprovado e tentado conforme o resultado C1 e AUD31; o freeze encerrou exit 64 sem candidate. A afirmação conflitante de 0570 permanece histórica e foi corrigida por novo registro, sem reescrever 0570. C1J é o último candidate e não pode ser repetido.
- `A24-03-C1K-PACKET`: `COMPLETED_DOCUMENTARY`; escopo, briefs separados, source hashes, decisão pendente e stop rules estão em [C1K](../04_audit/evidence/AUD-20260924/M07-S1-C1K/approval-request.md). Validação estática em [packet-validation](../04_audit/evidence/AUD-20260924/M07-S1-C1K/packet-validation.json).
- `A24-03-C1K-REVIEW`: `WAITING_HUMAN_APPROVAL / NOT_STARTED`; a mensagem genérica recebida antes de o pedido C1K ser apresentado não é decisão vinculada a C1K. Só uma decisão que cite o pedido e seu SHA integral autoriza duas tentativas fresh-context read-only.
- Sem comando, teste, review ou edição de produto nesta rodada. C1J permanece `FAIL / OPEN`; M07-S2/S3/S4 e M05 bloqueadas, G21-5/G21-6 fechados e produção `NO_GO`.

### A24-03-C1K-PACKET — Preparar gate documental de reviews C1J

- Estado: `COMPLETED_DOCUMENTARY / PACKET_VALIDATED`.
- O que/onde: packet independente em `docs/04_audit/evidence/AUD-20260924/M07-S1-C1K/` e reconciliação AUD48. Referencia apenas o candidate C1J congelado `e884796fd90192409230b0991524168186a9f65c824156a943102dcfacc98e1b` e suas evidências já existentes.
- Como: definir escopo read-only, dois reviewers fresh-context independentes (I1 e Final Critic), hashes das fontes, saída permitida, decisão requerida e stop rules. Não executar scripts, checks, testes nem editar arquivos de produto.
- Dependência/gate: pedido hash-bound SHA-256 `d334e883540d83aa4a77217fc66203befe8a930020ee5e5c4f8443cc8f5aa97c`; a execução dos reviews aguarda decisão humana vinculada a esse hash.
- Pronto: packet e source hashes reconciliados; oito checks estáticos passaram após corrigir uma asserção do validador documental. M07-S1 não foi aceita por antecipação.

### A24-03-C1K-REVIEW — Revisar candidate C1J congelado

- Estado: `WAITING_HUMAN_APPROVAL / NOT_STARTED`.
- Escopo: somente duas revisões separadas, fresh-context e read-only do candidate C1J e das evidências congeladas; relatórios e ledger novos limitados ao diretório C1K.
- Proibido por este gate: editar produto, reexecutar comandos/checks/testes, alterar o candidate, substituir reviewer ausente ou declarar S1 aceita.
- Aprovação: requer resposta explícita ao pedido C1K com seu SHA-256 integral. A mensagem “aprovo este gate” recebida antes do pedido não autoriza C1K.

> Snapshot histórico AUD47: C1J congelou candidate `e884796fd90192409230b0991524168186a9f65c824156a943102dcfacc98e1b` e passou todos os checks locais; I1 e Final Critic não puderam ser criados por `agent thread limit reached`. O estado corrente está no AUD48 acima. C1J não pode ser repetida.

## Histórico AUD47 — C1J local PASS_WITH_FINDINGS; reviews obrigatórios indisponíveis — 24/09/2026

- Evidência: [resultado final C1J](../04_audit/evidence/AUD-20260924/M07-S1-C1J/final-gate-result.md), [quality bar](../04_audit/evidence/AUD-20260924/M07-S1-C1J/quality-bar-results.json), [candidate](../04_audit/evidence/AUD-20260924/M07-S1-C1J/execution-candidate-manifest.json), [inventory](../04_audit/evidence/AUD-20260924/M07-S1-C1J/workspace-dependency-report.json) e [command records](../04_audit/evidence/AUD-20260924/M07-S1-C1J/command-records.json).
- `A24-03-C1J-GATE`: executada após aprovação contextual registrada para request SHA-256 `f4351b91f8b0b4401d25bf3200a2355fe8148685936507bfe448b59c3d8c27e2`. O patch alterou somente os três paths aprovados; fixture conversacional inalterado; candidate de 977 inputs congelado com fingerprint `e884796fd90192409230b0991524168186a9f65c824156a943102dcfacc98e1b`.
- Resultado local: focused 25/25; suite 2.137 passed/146 skipped; typecheck/lint PASS; coverage 90,86/85,87/92,91/91,80%. Inventory completo com 11 findings, zero gaps/unresolved e report ligado ao mesmo candidate. 36 passos capturados e verifier `INTEGRITY_PASS`; logs saneados e históricos íntegros.
- C1J-08 e C1J-09: I1 e Final Critic foram pedidos separadamente, mas a criação de cada reviewer foi recusada por `agent thread limit reached`; nenhum parecer existe. C1J termina `FAIL / OPEN`; M07-S1 não aceita.
- Próxima task: preparar documentalmente um pedido hash-bound separado para revisão do candidate C1J ou para uma nova execução. Não repetir código/checks sob C1J; nenhum downstream M07/M05 começa; G21-5/G21-6 fechados e produção `NO_GO`.

## Histórico AUD46 — Gate C1J aprovado; execução ainda não iniciada — 24/09/2026

- Decisão: o usuário respondeu “Aprovo exatamente este gate” e “aprovo este gate” diretamente à pergunta sobre M07-S1, os três paths de produto e os comandos locais congelados. Registrei a decisão contextual para o pedido C1J SHA-256 `f4351b91f8b0b4401d25bf3200a2355fe8148685936507bfe448b59c3d8c27e2`, com escopo exclusivo `M07-S1-R1-C1J`.
- Task: `A24-03-C1J-GATE` agora está `APPROVED / NOT_STARTED`. Os únicos paths de produto autorizados são `config/workspace-dependency-policy.json`, `scripts/workspace-dependency-audit.mjs` e `tests/workspace-dependency-audit.test.js`; o fixture conversacional permanece snapshot-only.
- Estado antes da execução: `command-records.json` continua `NOT_STARTED`, sem registros; ainda não houve preflight, patch, archive C1I, candidate ou checks. A aprovação não aceita M07-S1, não autoriza S2/S3/S4 ou M05 e não libera produção.
- Próxima ação única: iniciar e executar individualmente os 36 passos do plano congelado C1J, registrando proveniência e parando na primeira falha.

## Histórico AUD45 — Packet C1J pronto; gate aguardava decisão — 24/09/2026

- Evidência C1I: [resultado final](../04_audit/evidence/AUD-20260924/M07-S1-C1I/final-gate-result.md) e [command records](../04_audit/evidence/AUD-20260924/M07-S1-C1I/command-records.json). O erro ocorreu antes de candidate, inventory e checks downstream.
- `A24-03-C1J-PACKET`: `COMPLETED_DOCUMENTARY / WAITING_HUMAN_APPROVAL`. O [packet-validation](../04_audit/evidence/AUD-20260924/M07-S1-C1J/packet-validation.json) passou 30 checks estáticos; nenhum patch C1J, comando do plano ou teste de produto foi executado.
- [Pedido C1J](../04_audit/evidence/AUD-20260924/M07-S1-C1J/approval-request.md), SHA-256 `f4351b91f8b0b4401d25bf3200a2355fe8148685936507bfe448b59c3d8c27e2`; [preview exato](../04_audit/evidence/AUD-20260924/M07-S1-C1J/correction-preview.patch), [plano congelado](../04_audit/evidence/AUD-20260924/M07-S1-C1J/command-plan.json) com 36 passos e [validação estática](../04_audit/evidence/AUD-20260924/M07-S1-C1J/packet-validation.json).
- `A24-03-C1J-GATE`: `APPROVED / NOT_STARTED`, decisão registrada no [decision record](../04_audit/evidence/AUD-20260924/M07-S1-C1J/decision-record.json). O gate propõe somente três paths de produto, candidate de 977 inputs, matriz local e reviews I1/Final Critic separados; uma falha mantém S1 `FAIL / OPEN`.
- A decisão foi contextualizada à pergunta direta sobre o gate M07-S1, seus três paths e comandos, e vinculada ao pedido C1J SHA integral acima. Ela não transfere aprovações de C1I nem amplia o escopo C1J.
- Próxima ação singular: iniciar o primeiro preflight e executar somente os comandos congelados C1J, parando na primeira falha.

## Histórico AUD44 — C1I interrompida no candidate freeze — 24/09/2026

- Evidência: [resultado C1I](../04_audit/evidence/AUD-20260924/M07-S1-C1I/final-gate-result.md), [quality bar](../04_audit/evidence/AUD-20260924/M07-S1-C1I/quality-bar-results.json), [command records](../04_audit/evidence/AUD-20260924/M07-S1-C1I/command-records.json). Os 11 source hashes e o baseline C1I passaram; o patch exato foi aplicado aos três paths aprovados e o fixture permaneceu idêntico. Candidate freeze falhou com `C1H_NPM_VERSION_FILE is not defined`; não há manifesto ou inventory.
- O final verifier encontrou zero problemas nos 24 registros prévios; a ledger contém 25 registros. Testes, typecheck, lint, coverage, pós-check, sanitização, hash histórico, I1 e Final Critic não rodaram por stop rule. C1I está `FINISHED / STOP / FAIL`; M07-S1 segue `FAIL / OPEN`.
- `A24-03-C1I-GATE`: `APPROVED / FAILED_CANDIDATE_FREEZE / NO_CANDIDATE`, decisão literal registrada com escopo exclusivo C1I e request SHA acima.
- Próxima task documental: `A24-03-C1J-PACKET`. Preparar evidência fresca que corrija a referência residual, vincule paths C1J e preserve R1/C1H/C1I; sem aplicar patch ou executar checks antes de novo gate humano.

### A24-03-C1J-PACKET — Preparar correção hash-bound após falha C1I

- Estado: `COMPLETED_DOCUMENTARY / WAITING_HUMAN_APPROVAL`.
- Entrega: packet próprio em `docs/04_audit/evidence/AUD-20260924/M07-S1-C1J/`, baseline byte-idêntico ao C1I reconciliado, preview limitado a três paths, command plan de 36 passos, quality bar e rollback/snapshots previstos.
- Evidência: [approval request](../04_audit/evidence/AUD-20260924/M07-S1-C1J/approval-request.md), SHA-256 `f4351b91f8b0b4401d25bf3200a2355fe8148685936507bfe448b59c3d8c27e2`; [packet validation](../04_audit/evidence/AUD-20260924/M07-S1-C1J/packet-validation.json), 30 checks estáticos aprovados.
- Limite: nenhuma alteração de produto, candidate, execução C1J ou teste ocorreu. C1I e todo o histórico permanecem preservados.

### A24-03-C1J-GATE — Decisão e replay C1J

- Estado: `EXECUTED / FAIL_OPEN_REVIEW_UNAVAILABLE`; request SHA-256 `f4351b91f8b0b4401d25bf3200a2355fe8148685936507bfe448b59c3d8c27e2`. I1 e Final Critic indisponíveis.
- O que/onde: aplicar somente `config/workspace-dependency-policy.json`, `scripts/workspace-dependency-audit.mjs` e `tests/workspace-dependency-audit.test.js`; manter `packages/conversation/src/__tests__/postgres-store.unit.test.ts` snapshot-only. Evidências novas ficam em `M07-S1-C1J/`, com archive C1I e `.gauntlet/` conforme o plano.
- Como: depois da decisão aprovada e registrada, executar individualmente os 36 passos congelados por `capture_command.py`; parar no primeiro precondition/exit inesperado e não repetir C1J sob este gate. Manter thresholds 90/85/90/90, npm offline, PostgreSQL env removido e candidate/inventory ligados ao mesmo fingerprint.
- Dependências/gate: pedido C1J hash-bound e a task registrada antes do primeiro comando; reviews I1 e Final Critic separados para o mesmo candidate congelado.
- Pronto: somente com evidência atual para os dez critérios e reviews requeridos. Qualquer critério crítico ausente/falho ou reviewer indisponível mantém M07-S1 `FAIL / OPEN`; S2/S3/S4 e M05 continuam bloqueadas e produção `NO_GO`.

## Histórico AUD43 — Preparar packet corretivo C1I, sem BUILD — 24/09/2026

## AUD42 — C1H candidate freeze falhou; novo gate corretivo necessário — 24/09/2026

- A decisão C1H permaneceu vinculada ao approval request SHA-256 `d2e03fb29f0e95efdb418fa47e984ee2bcac4e77fbd244bb9f2b162caead046f`. A24-03-C1H foi registrada antes dos comandos.
- Preflights, lock, archive C1F, init C1H, snapshots, patch check/aplicação e deltas concluíram como esperado. O fixture conversacional ficou byte-idêntico.
- `candidate-freeze` terminou exit 64 ao rejeitar hashes divergentes em `docs/02_spec/0190_spec_validation.md` e `docs/07_agents/AGENTS.md`. Nenhum candidate foi criado. O verifier final encontrou zero problemas nos 21 registros anteriores; a execução C1H ficou incompleta.
- Evidência: [resultado](../04_audit/evidence/AUD-20260924/M07-S1-C1H/final-gate-result.md), [critérios](../04_audit/evidence/AUD-20260924/M07-S1-C1H/quality-bar-results.json), [proveniência](../04_audit/evidence/AUD-20260924/M07-S1-C1H/command-records.json). M07-S1 continua `FAIL / OPEN`; nenhum S2/S3/S4 ou M05 autorizado; G21-5/G21-6 fechados; produção `NO_GO`.
- Próxima task documental: preparar novo packet corretivo que preserve R1/C1H e vincule um baseline atualizado aos bytes correntes. Nenhum C1H rerun ou downstream check está autorizado.

## AUD43 — Preparar packet corretivo C1I, sem BUILD — 24/09/2026

- C1H é uma tentativa encerrada `FAIL / OPEN`; o baseline R1 histórico e a evidência C1H permanecem imutáveis. Os dois únicos deltas de entrada observados são 0190 e AGENTS, com hashes anteriores/atuais registrados no resultado C1H.
- Task documental concluída: `A24-03-C1I-PACKET`. O packet propõe uma cópia explícita do baseline R1, atualiza somente os dois tuples comprovadamente diferentes, recalcula o fingerprint herdado e limita o patch aos três paths de policy/scanner/teste para aceitar o baseline/output C1I exatos. Validação estática `PASS` em [packet-validation](../04_audit/evidence/AUD-20260924/M07-S1-C1I/packet-validation.json).
- Decisão humana: o usuário respondeu “aprovo este gate” ao pedido C1I. Registrei a resposta literal em [decision-record](../04_audit/evidence/AUD-20260924/M07-S1-C1I/decision-record.json), vinculada ao SHA-256 `86bc71b2bf7dac7f500a3dbb8a942e5d4cbeb9d6638ac43bf9dd65d923b1af57`, com escopo exclusivo `M07-S1-R1-C1I`. Isso não aceita M07-S1 nem libera produção.
- Antes do primeiro comando: `A24-03-C1I-GATE` registrada; decisão `APPROVED / NOT_STARTED`; `command-records.json` ainda `NOT_STARTED`. Nenhum patch foi aplicado e nenhum comando BUILD do plano foi executado.
- Próxima ação: executar apenas o command plan C1I em ordem, registrando cada etapa individualmente e interrompendo dependências na primeira falha ou precondição inesperada.
- Fonte e resultado: [C1H final](../04_audit/evidence/AUD-20260924/M07-S1-C1H/final-gate-result.md); SPEC aplicável: [0128](../02_spec/0128_m07_package_dependency_governance.md), que exige candidate freshness e fingerprinting de todos os inputs.

### A24-03-C1I-PACKET — Preparar correção documental do baseline R1 stale

- Estado: `COMPLETE_DOCUMENTARY / NO_BUILD_EXECUTED`.
- O que/onde: pacote C1I em `docs/04_audit/evidence/AUD-20260924/M07-S1-C1I/`; incluir baseline derivado, relatório dos dois deltas, patch preview limitado a policy/scanner/teste, quality bar, plano command-by-command, snapshots/source hashes, decisão pendente e stop rules.
- Como: manter R1 e C1H intocados; copiar o baseline de 973 inputs para um novo artefato; reconciliar somente os hashes/tamanhos atuais de `docs/02_spec/0190_spec_validation.md` e `docs/07_agents/AGENTS.md`; recomputar o fingerprint basis canônico; allowlist do novo baseline por path e SHA exatos; validar estaticamente o packet e registrar limitações do crítico independente. Não executar código ou os comandos propostos.
- Dependências: final result e command records C1H; SPEC 0128 aprovada para M07-S1; decisão humana específica do packet C1I antes de qualquer patch ou check.
- Pronto: pedido C1I completo, hashes recalculáveis, escopo e rollback explícitos, baseline R1 preservado, nenhuma execução iniciada e próximo passo único: decisão sobre approval request C1I.

## Histórico AUD41 — C1H aprovado; replay autorizado antes da execução — 24/09/2026

- Decisão: o usuário respondeu “aprovo este gate” referindo-se ao único gate pendente, M07-S1-R1-C1H. A decisão foi vinculada ao approval request SHA-256 `d2e03fb29f0e95efdb418fa47e984ee2bcac4e77fbd244bb9f2b162caead046f`; [decision-record](../04_audit/evidence/AUD-20260924/M07-S1-C1H/decision-record.md). Os hashes congelados do packet e os cinco source-baseline hashes conferiam antes do registro.
- Estado antes do primeiro comando: C1H `APPROVED / NOT_STARTED`; A24-03-C1H registrada; `command-records.json` ainda `NOT_STARTED`. M07-S1 permanece `FAIL / OPEN` e produção `NO_GO`.
- Escopo autorizado: os três paths de produto listados no pedido, helper/plan C1H, a movimentação exata do `.gauntlet` C1F para o archive aprovado, novo state C1H e somente os 33 passos/verifier do command plan. Falha interrompe etapas dependentes; não há rerun sem novo gate. Não autoriza S2/S3/S4, M05, produção, serviços externos, dados reais, banco ou ação sensível.

## Histórico AUD36 — C1G interrompido no preflight; C1H aguardava decisão — 24/09/2026

- C1G: decisão registrada antes dos comandos; `node-version-preflight` passou (`v22.23.2`) e `typescript-version-preflight` terminou exit 1. O helper usou `HERE.parents[5]`, que seleciona a pasta-mãe do repo. A falha e os logs preservados estão em [final-gate-result.md](../04_audit/evidence/AUD-20260924/M07-S1-C1G/final-gate-result.md). Nenhum passo posterior, edição de código, archive, candidate ou check de produto ocorreu.
- A24-03-C1H: packet estático preparado com helper corrigido (`HERE.parents[4]`), evidence dir novo, 33 passos, 10 critérios e 110 hashes históricos. Crítica fresh-context do packet foi recusada por `agent thread limit reached`; sem parecer independente.
- C1H approval request SHA-256: `d2e03fb29f0e95efdb418fa47e984ee2bcac4e77fbd244bb9f2b162caead046f`. M07-S1 permanece `FAIL / OPEN` e produção `NO_GO`.

## Histórico AUD35 — C1G aprovado; replay iniciado — 24/09/2026

- C1F continua histórico e imutável: candidate `89e4d30ce8b2fd1d102a200bc729249a99ebc47499e4d04a79cd7f6633890f1a`, checks locais verdes, `FAIL / OPEN` por C1F-05 `PARTIAL` e C1F-08/B8 `BLOCKED` (I1 `UNAVAILABLE`); nenhum Final Critic separado foi obtido.
- `A24-03-C1G` foi aprovada para replay local controlado. A resposta “Aprovo exatamente este gate” foi dada à pergunta específica que limitava o gate a três paths e aos comandos locais listados; a decisão e o contexto estão registrados no [decision record](../04_audit/evidence/AUD-20260924/M07-S1-C1G/decision-record.md), vinculado ao pedido SHA-256 `5700d97d2931dc08c622cdee470c5d869a9980f1a4c1bdb40b64afb7d3e6645f`. O escopo altera somente policy, scanner e teste do scanner; o fixture conversacional C1F deve permanecer byte-idêntico.
- Outputs propostos: somente `docs/04_audit/evidence/AUD-20260924/M07-S1-C1G/`, `.gauntlet/` e `.gauntlet-archive/m07-s1-c1f-20260924-finished-fail/`. A mudança do Gauntlet só ocorre após conferir state `FINISHED`, alvo de archive ausente e lock livre.
- Candidate esperado: 977 inputs e quatro additions aprovadas contra R1; matriz local, thresholds 90/85/90/90, hashes históricos, I1 e Final Critic estão congelados no packet. Candidate fingerprint C1G ainda não existe.
- O contexto da pergunta e a resposta aprovam somente este pacote C1G; nenhum consentimento é inferido para outros gates ou stages.
- Limites mantidos: sem production/runtime code, manifestos, lockfile, CI, banco, serviço, rede externa, dados reais ou ação sensível; S2/S3/S4 e M05 permanecem bloqueadas; G21-5/G21-6 fechados; produção `NO_GO`.

### A24-03-C1G — Candidate replay com proveniência completa

- Estado: `APPROVED / STOPPED_PRECHECK_FAILURE / NO_CANDIDATE`; continuação corretiva de A24-03 e A29-03–A29-06.
- O que/onde: editar somente `config/workspace-dependency-policy.json`, `scripts/workspace-dependency-audit.mjs` e `tests/workspace-dependency-audit.test.js`; manter `packages/conversation/src/__tests__/postgres-store.unit.test.ts` byte-idêntico. Todos os resultados novos ficam em `docs/04_audit/evidence/AUD-20260924/M07-S1-C1G/`.
- Como: aplicar apenas o [patch preview](../04_audit/evidence/AUD-20260924/M07-S1-C1G/correction-preview.patch), após conferir os cinco source hashes. Registrar cada preflight, lock, archive, snapshot, checksum, patch, candidate, inventory, comando de verificação e pós-check com horário UTC, duração, exit e logs/hash por meio do command plan e capturador C1G. Espera-se candidate de 977 inputs, os mesmos quatro additions R1, inventory com 11 findings completos e thresholds 90/85/90/90. Preservar C1E/C1F por hashes.
- Dependências/gate: aprovação registrada aqui e em [decision-record](../04_audit/evidence/AUD-20260924/M07-S1-C1G/decision-record.md), vinculada ao [approval-request](../04_audit/evidence/AUD-20260924/M07-S1-C1G/approval-request.md). O escopo não se estende à aceitação de S1 nem a fases posteriores.
- Critério de aceite do replay C1G: dez critérios críticos da [quality bar](../04_audit/evidence/AUD-20260924/M07-S1-C1G/quality-bar.json) no mesmo candidate, incluindo logs completos, post-check sem drift, I1 independente e Final Critic separado. A execução parou antes do candidate; nenhum critério de produto foi adjudicado. Reviewer indisponível, qualquer falha ou drift mantém `FAIL / OPEN`; não há rerun sem nova decisão.

### A24-03-C1H — Corrigir capturador e preparar novo replay

- Estado: `APPROVED / FAILED_CANDIDATE_FREEZE / NO_CANDIDATE`; continuação separada após a falha de preflight C1G.
- O que/onde: os mesmos três paths de produto (`config/workspace-dependency-policy.json`, `scripts/workspace-dependency-audit.mjs`, `tests/workspace-dependency-audit.test.js`), mais o helper e command plan próprios do novo diretório `docs/04_audit/evidence/AUD-20260924/M07-S1-C1H/`; fixture conversacional somente para snapshot.
- Como: aplicar apenas o preview hash-bound após a decisão. O helper seleciona `HERE.parents[4]`; command plan e outputs usam exclusivamente C1H. C1G, C1F e C1E permanecem preservados.
- Dependências/gate: aprovação humana registrada no [decision-record](../04_audit/evidence/AUD-20260924/M07-S1-C1H/decision-record.md), vinculada ao [pedido C1H](../04_audit/evidence/AUD-20260924/M07-S1-C1H/approval-request.md), SHA-256 `d2e03fb29f0e95efdb418fa47e984ee2bcac4e77fbd244bb9f2b162caead046f`. Não rerodar C1G.
- Resultado/evidência: `candidate-freeze` exit 64 por drift do baseline R1; sem candidate, inventory, tests, typecheck, lint, coverage, post-check, sanitization, histórico hash check ou reviews. Ver [resultado C1H](../04_audit/evidence/AUD-20260924/M07-S1-C1H/final-gate-result.md) e [quality-bar results](../04_audit/evidence/AUD-20260924/M07-S1-C1H/quality-bar-results.json). M07-S1 permanece `FAIL / OPEN`; qualquer retomada exige packet/gate novo.

## AUD33 — C1E reprovado; C1F executado e reprovado — 24/09/2026

- Resultado C1E: [relatório final](../04_audit/evidence/AUD-20260923/M07-S1-R1-C1E/final-gate-result.md). Candidate `58dce96bb29255f77bc99c4f883f8205e4272c2a94cb26d34f10b395ab042501`; teste focado/full e coverage falharam no caso de approval mismatch; coverage não publicou percentuais; I1 `UNAVAILABLE`. O histórico C1E permanece preservado.
- Decisão humana C1F: resposta “aprovo este gate”, vinculada ao escopo C1F descrito na conversa; registro, gate e preview com hashes estão em [decision-record.md](../04_audit/evidence/AUD-20260924/M07-S1-C1F/decision-record.md). Escopo restrito aos quatro paths e à matriz local especificados; não implica S1 aceito nem produção.
- Task `A24-03-C1F`: registrada antes de qualquer mudança de código, como continuação corretiva de A24-03/A29-03. Pré-condições, snapshots, candidato C1F, comandos, critérios e rollback estão no gate hash-bound.
- Resultado C1F: candidate 977 inputs/4 additions; inventory exit 1 semanticamente completo; focused 25/25; full 2.137 pass/146 skipped; typecheck/lint/coverage/pós-check exit 0; coverage 90,86% statements, 85,88% branches, 92,91% functions, 91,81% lines. Logs C1F estão hash-verificados; houve um comando auxiliar de leitura com quoting incorreto, preservado e seguido por inspeções bem-sucedidas.
- Revisão: I1 fresh-context foi recusada por `agent thread limit reached`; fingerprints antes/depois coincidem, mas nenhum parecer foi produzido. M07-S1 segue `FAIL / OPEN`; M07-S2/S3/S4 e M05 continuam bloqueadas; G21-5/G21-6 fechados, produção `NO_GO`.
- Gauntlet: `m07-s1-c1f-20260924-1` finalizado `FAIL`; o C1E anterior foi finalizado `FAIL` e arquivado intacto, com seus critérios stale após C1F. O state C1F começou após implementação porque o C1E ainda estava ativo; a barra C1F e snapshots foram congelados antes do código.

### A24-03-C1F — Corrigir expectativa negativa e repetir a matriz M07-S1

- Estado: `EXECUTED_FAIL / OPEN / I1_UNAVAILABLE`; origem AUD33/A29-03; continuação de A24-03-C1 e C1E.
- O que/onde: paths editáveis exatos: `config/workspace-dependency-policy.json`, `scripts/workspace-dependency-audit.mjs`, `tests/workspace-dependency-audit.test.js` e `packages/conversation/src/__tests__/postgres-store.unit.test.ts`; outputs somente em `docs/04_audit/evidence/AUD-20260924/M07-S1-C1F/`.
- Como: aplicar apenas o [preview C1F](../04_audit/evidence/AUD-20260924/M07-S1-C1F/correction-preview.md): mismatch negativo espera `STATE_CONFLICT`, resume válido continua `EXECUTE`, e path de output/npm é vinculado ao diretório C1F sem enfraquecer controles existentes. Snapshots dos quatro arquivos precedem a edição. Congelar candidate de 977 inputs e capturar inventário, report/fingerprint, focused/full, typecheck, lint, coverage e pós-check em logs C1F próprios.
- Dependências/gate: aprovação humana registrada em [decision-record](../04_audit/evidence/AUD-20260924/M07-S1-C1F/decision-record.md); proposal SHA `fe12424140bf93785ff520bc804dd0954a82ce976dd26311365a5a5bc57f8535`, preview SHA `244143d81efd8559401dc40c9a11f4d510464e40b54c830700a85bfbab3ba191`. Aprovação C1E não autorizou o path conversacional nem o output C1F; este gate é específico.
- Pronto/evidência: checks locais e thresholds 90/85/90/90 passaram no mesmo candidate e pós-check sem drift; critérios C1F-05 e C1F-08 não passaram (setup sem logs/timestamps/duração e I1 `UNAVAILABLE`). Resultado `FAIL / OPEN` em [final-gate-result](../04_audit/evidence/AUD-20260924/M07-S1-C1F/final-gate-result.md); próximo passo: preparar proposta de gate separado para recapturar completamente a proveniência C1F-05; após revalidação sem drift, obter I1 quando houver capacidade. I1 isolada não fecha C1F-05.

## AUD32 — Gate C1E aprovado; task registrada antes da implementação — 24/09/2026

- Decisão humana: resposta “aprovo este gate” ao pedido de aprovação de C1E; gate SHA-256 `75b6307384074660bde873ca4aa95bfedfb52c1f58d2448ad227e96e87ad34cc`, preview SHA-256 `3c4b80ad07a1bf59cce8279b40e916140c908b5d7f7a518caf1d0362e57100ec`; os dois hashes foram recalculados e conferem.
- Task: `A24-03-C1E` registrada antes de código, com escopo exato de `config/workspace-dependency-policy.json`, `scripts/workspace-dependency-audit.mjs` e `tests/workspace-dependency-audit.test.js`; fixture C1 permanece fora do escopo e deve ficar byte-estável.
- Estado de entrada: pasta de evidência `M07-S1-R1-C1E` ausente; preflight Node/TypeScript/npm, snapshot e mudanças ainda pendentes. Nenhum código ou check C1E foi executado neste registro.
- Limites: executar somente comandos do gate; preservar controles de traversal/symlink, thresholds 90/85/90/90, os outputs C1 históricos, G21-5/G21-6 fechados, produção `NO_GO`.

## AUD31 — C1 interrompido no freeze; gate de compatibilidade proposto — 24/09/2026

- Decisão C1: resposta “aprovo este gate”, vinculada ao gate vigente `M07-S1-R1-C1`; hashes do pedido e preview conferidos antes da execução.
- Resultado: preflight Node `v22.23.2`, TypeScript `6.0.3`, npm `10.9.8` e verificação R1 do candidato passaram. O fixture C1 foi alterado apenas no path autorizado e o snapshot de rollback foi preservado. O freeze do candidate C1 terminou exit `64`; o output exige allowlist de diretório que o scanner não concede a `M07-S1-R1-C1`.
- Causa estática adicional: a validação candidate-bound também requer `M07-S1-R1/npm-version.txt`, incompatível com o arquivo C1 indicado no gate. Esse segundo bloqueio foi identificado por leitura e não executado.
- Evidência: [resultado C1](../04_audit/evidence/AUD-20260923/M07-S1-R1-C1/final-gate-result.md), [registros por comando](../04_audit/evidence/AUD-20260923/M07-S1-R1-C1/command-records.json), [proposta C1E](../04_audit/evidence/AUD-20260923/M07-S1-R1-C1/output-path-correction-gate.md), [preview C1E](../04_audit/evidence/AUD-20260923/M07-S1-R1-C1/output-path-correction-preview.md).
- Estado: A24-03-C1 `BLOCKED_BY_C1E_GATE`; candidate C1 não congelado; nenhum check, coverage ou I1 C1 foi executado. M07-S1 `FAIL / OPEN`; M05 segue bloqueada; produção `NO_GO`.
- Próxima ação única: aprovar exatamente o gate C1E pelo SHA integral acima ou pedir correção. Nenhum path adicional de código está autorizado até essa decisão.

## AUD30 — Gate C1 aprovado; correção do fixture iniciada — 24/09/2026

- Decisão: resposta do usuário “aprovo este gate”, vinculada ao único gate corrente de BUILD, M07-S1-R1-C1. O pedido e o preview foram recalculados antes de prosseguir e seus hashes correspondem aos bytes listados acima.
- Pré-condições: Node `v22.23.2` (exit 0); TypeScript `6.0.3` (exit 0); verificação R1 do manifesto/toolchain (exit 0; fingerprint `1038f996b0577e56ecd795f1f08b6e13bb3a752d454c80f3fc0601f51c045b5f`); diretório `M07-S1-R1-C1` ausente (exit 0).
- Limite: gate permite alterar somente `packages/conversation/src/__tests__/postgres-store.unit.test.ts` e registrar a tentativa em novo diretório C1. Testes/C1 ainda não executados; M07-S1 continua `FAIL / OPEN`, I1 `UNAVAILABLE`, produção `NO_GO`.

### A24-03-C1 — Corrigir fixture de retomada e repetir matriz M07-S1

- Estado: `BLOCKED_BY_C1E_GATE / FIXTURE_APPLIED_UNVERIFIED`; origem A29-F01; execução corretiva da A24-03.
- O que/onde: único path editável `packages/conversation/src/__tests__/postgres-store.unit.test.ts`; outputs e logs somente em `docs/04_audit/evidence/AUD-20260923/M07-S1-R1-C1/`.
- Como: seguir a ordem e os comandos do [gate C1](../04_audit/evidence/AUD-20260923/M07-S1-R1/correction-gate-proposal.md): criar pasta de tentativa única e snapshot; aplicar somente o [preview hash-bound](../04_audit/evidence/AUD-20260923/M07-S1-R1/correction-preview.md); congelar candidato; capturar argv, versões, horário/duração, stdout/stderr sanitizados, exit imediato e skips para cada comando; inventariar, comparar fingerprints, executar checks autorizados sem variáveis PostgreSQL e validar pós-check. Não alterar adapter, manifests, CI, thresholds ou outros paths.
- Dependências/gate: aprovação C1 vinculada ao SHA-256 `9d865f7db78b479dacaf69ca2de7dffcc03892eff061dd49ca90ec2035eb83f1`; preview SHA-256 `9d7fc894b728967aaa4f0949bc5dc8ae466d31ecc616fe9a902a58859ebb0c17`. Preflight Node/R1 passou. I1 fresh-context continua obrigatório depois do candidato congelado; indisponibilidade mantém S1 aberta.
- Pronto/evidência: apenas se critérios B1–B9 aplicáveis passarem no mesmo candidato, incluindo coverage statements ≥90%, branches ≥85%, functions ≥90%, lines ≥90%, fingerprint e pós-check estáveis, e revisão I1 aceita. O freeze parou em exit 64 por incompatibilidade do allowlist; nenhum candidato/check/I1 C1 existe. A correção do fixture permanece sem verificação. O snapshot é somente rollback local; nenhum rollback amplo ou limpeza de worktree.

### A24-03-C1E — Permitir path de evidência C1 e registro npm candidate-bound

- Estado: `APPROVED / IN_PROGRESS`; resposta humana “aprovo este gate” vinculada ao gate SHA-256 `75b6307384074660bde873ca4aa95bfedfb52c1f58d2448ad227e96e87ad34cc` e preview `3c4b80ad07a1bf59cce8279b40e916140c908b5d7f7a518caf1d0362e57100ec`; registrada antes de código em AUD32. Origem AUD31/A29-F01; habilita a retomada de A24-03-C1.
- O que/onde: proposta limitada a `config/workspace-dependency-policy.json`, `scripts/workspace-dependency-audit.mjs` e `tests/workspace-dependency-audit.test.js`; outputs somente em `M07-S1-R1-C1E`.
- Como: aplicar o [preview C1E](../04_audit/evidence/AUD-20260923/M07-S1-R1-C1/output-path-correction-preview.md), que alinha allowlist do diretório e path do npm ao novo candidato, mantendo controles de traversal/symlink e rejeitando nomes não aprovados. Depois congelar 977 inputs e executar a matriz sob Node 22.23.2 com logs por comando.
- Dependências/gate: aprovação separada do [gate C1E](../04_audit/evidence/AUD-20260923/M07-S1-R1-C1/output-path-correction-gate.md), SHA-256 `75b6307384074660bde873ca4aa95bfedfb52c1f58d2448ad227e96e87ad34cc`; preview SHA-256 `3c4b80ad07a1bf59cce8279b40e916140c908b5d7f7a518caf1d0362e57100ec`. A aprovação C1 não cobre esses paths.
- Pronto/evidência: allowlist exato passa teste positivo C1E e negativo de nome não aprovado; manifesto/report/comandos/pós-check usam o mesmo candidate; thresholds permanecem 90/85/90/90; qualquer falha ou I1 indisponível mantém M07-S1 `FAIL / OPEN`. O fixture C1 permanece byte-estável.

## AUD28 — Resultado M07-S1-R1; correção C1 aguarda gate — 24/09/2026

- Resultado: R1 foi executado em Node 22.23.2 no candidato `1038f996b0577e56ecd795f1f08b6e13bb3a752d454c80f3fc0601f51c045b5f`. B3 `PASS_WITH_FINDINGS`: inventário completo, 11 findings (9 `DEPENDENCY_CATEGORY_MISMATCH`, 2 `MISSING_DIRECT_DEPENDENCY`), zero gaps/unresolved; relatório e manifesto coincidem. B6 `FAIL`: um teste sintético de retomada de aprovação falhou nas execuções focada, completa e coverage; typecheck/lint passaram. B7 pós-check passou sem drift. I1 `UNAVAILABLE`; M07-S1 segue `FAIL / OPEN`.
- Evidências: [resultado do gate](../04_audit/evidence/AUD-20260923/M07-S1-R1/final-gate-result.md), [tentativa I1-02](../04_audit/evidence/AUD-20260923/M07-S1-R1/i1-attempt-02.md), [gate C1 proposto](../04_audit/evidence/AUD-20260923/M07-S1-R1/correction-gate-proposal.md), SHA-256 `9d865f7db78b479dacaf69ca2de7dffcc03892eff061dd49ca90ec2035eb83f1`; [preview](../04_audit/evidence/AUD-20260923/M07-S1-R1/correction-preview.md), SHA-256 `9d7fc894b728967aaa4f0949bc5dc8ae466d31ecc616fe9a902a58859ebb0c17`.
- Estado: A24-01/A24-02/A24-12 executadas com evidência parcial aprovada nos critérios correspondentes; A24-03 não satisfeita; A24-05 `FAIL / OPEN`. A task C1 ainda não foi registrada como autorizada nem executada; aguarda decisão humana. O histórico S1 `FAIL`, G21-5/G21-6 fechados e produção `NO_GO` permanecem.
- Próxima ação única: aprovar ou corrigir o gate C1 exato acima. Até a aprovação, não editar o fixture nem iniciar S2/S3/S4 ou handoff M05.

> Histórico AUD27: a aprovação R1 foi informada antes da execução. A tentativa Node 24 parou; novo shell Node 22 passou preflights read-only em observação separada. Esse estado foi substituído pelo resultado AUD28 acima.

## Contrato da carteira

Estas doze tasks são um **delta** para a carteira H/M/L de 50 melhorias. A origem factual é a [auditoria 0569](../04_audit/0569_m07_delivery_and_repository_reaudit_2026-09-23.md); a ordem está no [roadmap 0343](0343_reaudit_m07_roadmap.md). Os IDs são estáveis. `PROPOSED` significa trabalho definido, não gate de BUILD. A24-11 tem apenas a reconciliação manual concluída; a automação permanece proposta. A24-04 concluiu a adjudicação documental, identificou a proposta A24-12 e preparou o novo gate R1. Qualquer código, teste ou execução nova requer SPEC/gate próprios conforme `docs/07_agents/AGENTS.md` e o escopo humano registrado. O gate M07-S1 anterior autorizou somente os paths e comandos já executados naquele slice.

## Alta prioridade

### A24-01 — Tornar o fingerprint publicável e reproduzível

- Estado: `R1_IMPLEMENTED / CANDIDATE_REPLAY_PASS / M07_S1_OPEN`; onda R1; origem A24-F01.
- O que/onde: `scripts/workspace-dependency-audit.mjs`, formato `execution-candidate-manifest.json` e fixture de verificação independente.
- Como: especificar uma serialização canônica única para calcular e persistir o `fingerprint_basis`; produzir verificador que lê o JSON salvo, recalcula o digest sem depender de ordem perdida e compara hashes dos inputs. O basis R1 deve registrar separadamente os quatro paths aprovados do delta, sem herdar como lista completa os três paths do baseline histórico; o valor npm vem do arquivo de preflight local e tem seu hash vinculado ao manifesto. Preservar manifestos históricos como evidência de algoritmo antigo.
- Dependências/gate: SPEC-M07-001 emenda prospectiva, revisão humana e gate de código que nomeie paths/comandos; não editar o artefato histórico M07-S1.
- Pronto/evidência: digest do novo manifesto recalculável diretamente do arquivo salvo; um byte alterado em input ou basis falha; candidate/report/commands usam o mesmo digest; revisão e rollback registrados.

### A24-02 — Revalidar o S1 no Node suportado

- Estado: `R1_EXECUTED / NODE22_AND_POSTCHECK_PASS / M07_S1_OPEN`; onda R1; origem A24-F02.
- O que/onde: `.nvmrc`, `package.json`, CI e novo diretório de evidência M07-S1-R1; a task não presume mudar a versão do projeto.
- Como: antes de editar, comparar os 973 inputs do baseline e os três additions M07-S1 com seus hashes registrados, confirmar que o novo teste e o diretório R1 estão ausentes e capturar Node/npm/TypeScript localmente. Depois congelar um candidato com exatamente quatro paths de delta (977 inputs esperados) e executar apenas a matriz aprovada sob Node `22.23.2`, sem variáveis de PostgreSQL. Revalidar fingerprint/toolchain após os checks, comparar o fingerprint do relatório e do manifesto e marcar diferenças/tempos/skips frente ao run Node 24.
- Dependências/gate: A24-01/A24-03 e gate de execução com comando/ambiente delimitados. Se a versão suportada não estiver disponível, registrar `BLOCKED`; não usar Node 24 como substituto implícito.
- Pronto/evidência: comando e exit code de cada check no Node 22, cobertura e inventário do mesmo fingerprint, zero drift pós-check e divergências explicadas.

### A24-03 — Recuperar coverage sem afrouxar a barra

- Estado: `R1_EXECUTED_FAIL / C1_GATE_PENDING`; onda R1; origem A24-F03.
- O que/onde: `coverage/coverage-summary.json`, `vitest.config.mts` somente para leitura inicial, testes pertinentes dos módulos descobertos no diagnóstico.
- Como: identificar branches/statements descobertos que representam regras críticas e escrever casos sintéticos que verifiquem resultado e falha reais. O déficit aritmético no denominador atual é ≥103 statements e ≥87 branches; recalcular após qualquer alteração de fonte.
- Dependências/gate: diagnóstico read-only pode começar; novos testes/edições exigem SPEC/gate próprio. Manter thresholds 90/85/90/90 e exclusões existentes até decisão técnica explícita.
- Pronto/evidência: coverage statements ≥90% e branches ≥85%, functions/lines ≥90%, testes significativos passam e nenhuma exclusão/skip oportunista foi introduzida; relatório por arquivo e candidato publicado.

### A24-04 — Adjudicar os 22 achados e a semântica do inventário

- Estado: `COMPLETED_DOCUMENTAL`; onda R0; origem A24-F04/A24-F05. Evidência: [ledger](../04_audit/evidence/AUD-20260923/A24-04-R0/adjudication-ledger.md), [adendo SPEC proposto](../04_audit/evidence/AUD-20260923/A24-04-R0/spec-r1-amendment.md) e [pedido de gate R1](../04_audit/evidence/AUD-20260923/A24-04-R0/r1-gate-request.md).
- O que/onde: relatório M07-S1, nove manifests afetados, imports em localizações citadas e contrato B3/B6 da barra.
- Como: ledger relaciona as 22 ocorrências e 19 relações owner-target-código; separa dois vínculos ausentes, nove mismatches independentes e onze findings compartilhados com produção type-only segura. Interpreta B3 como `PASS_WITH_FINDINGS` somente para inventário completo/visível; B6 continua sujeito aos checks e thresholds fixos. Nenhum manifest foi alterado.
- Dependências/gate: inspeção/documentação R0 não exigiu gate de código. A interpretação type-only, o adendo SPEC e o gate R1 foram aprovados conforme decisão informada; R1 foi executado e terminou com B6 `FAIL`. A correção do fixture está proposta no gate C1, ainda sem aprovação.
- Pronto/evidência: ledger rastreável; gate R1 concreto com preflight dos hashes e additions históricos, toolchain local, paths, candidato, comandos, snapshots/rollback, post-check, reviewer e aceite. Revisão I1 independente da adjudicação e da retomada do pedido R1 ficou `UNAVAILABLE` por limite de threads; o gate humano foi informado como aprovado, mas o candidato R1 ainda exige I1 após BUILD.

### A24-05 — Fechar o novo candidato M07-S1 com AUDIT

- Estado: `R1_EXECUTED_FAIL / M07_S1_OPEN / I1_UNAVAILABLE`; onda R1.
- O que/onde: novo manifesto, comandos, cobertura, inventário, revisão e registros mestres; não alterar o dossiê histórico `M07-BUILD-S1`.
- Como: aplicar a barra corretiva aprovada, verificar input hashes e digest reprodutível, executar comandos autorizados em Node 22, auditar critérios e registrar diferenças frente ao run FAIL.
- Dependências/gate: A24-01–A24-04 e A24-12, gate humano corretivo, nenhuma mudança de candidato durante checks; I1 conforme barra aplicável.
- Pronto/evidência: critérios críticos PASS no mesmo candidato, nenhuma divergência de input pós-check, interpretação do exit 1 registrada, resultado independente não falsificado e M07-S1 encerrada somente se sua barra permitir.

### A24-12 — Reconciliar dependência de produção type-only compartilhada com testes

- Estado: `R1_IMPLEMENTED / B3_PASS_WITH_FINDINGS / M07_S1_OPEN`; onda R1; origem: adjudicação A24-04, linhas 7–12 e 18–22 do [ledger](../04_audit/evidence/AUD-20260923/A24-04-R0/adjudication-ledger.md).
- O que/onde: regra de reconciliação em `scripts/workspace-dependency-audit.mjs` e regressões em `tests/workspace-dependency-audit.test.js`.
- Como: manter cada edge como PRODUCTION ou TEST; quando o mesmo owner-target tem production type-only classificado `DECLARED_RUNTIME_SAFE` em `dependencies`, tratar essa declaração como compartilhada pela edge de teste sem marcar mismatch nem exigir categoria duplicada. Preservar mismatch para relação test-only sem edge de produção e não resolver `UNRESOLVED`/categoria conflitante por inferência.
- Dependências/gate: adendo SPEC-M07-R1-v2 e gate humano R1 específicos; não alterar manifests nesta task. A revisão I1 do candidato deve criticar essa semântica.
- Pronto/evidência: fixtures positivas e negativas demonstram a regra; o relatório R1 mantém roles separados e deixa os nove mismatchs independentes e dois imports ausentes visíveis para S4.

## Média prioridade

### A24-06 — Corrigir dois vínculos diretos ausentes

- Estado: `PROPOSED / M07-S4_GATE_REQUIRED`; onda R3.
- O que/onde: `apps/api/package.json` e `apps/worker/package.json`, vínculos de teste `api → worker` e `worker → api`.
- Como: confirmar se o contrato é teste direto, fixture compartilhada ou acoplamento a remover; escolher `devDependencies` ou extração permitida pela SPEC. Evitar criar ciclo de runtime por conveniência.
- Dependências/gate: A24-04, A24-08 e gate de manifest M07-S4 com paths/rollback; lockfile somente se explicitamente autorizado.
- Pronto/evidência: ambas relações têm contrato documentado, inventário deixa de apontar `MISSING_DIRECT_DEPENDENCY`, regressão API/worker e builds pertinentes passam no candidato do lote.

### A24-07 — Corrigir categorias de dependência por owner

- Estado: `PROPOSED / M07-S4_GATE_REQUIRED`; onda R3.
- O que/onde: manifests dos nove owners afetados conforme ledger A24-04; nove mismatchs independentes confirmados no ledger. As onze relações que compartilham declaração de produção type-only seguem A24-12 e não devem virar mudanças de manifest por contagem histórica.
- Como: agrupar por owner/relação, rever uso teste-only, produção/type-only e exports, e escolher categoria aprovada por contrato. Aplicar lotes pequenos, com relatório before/after e rollback local.
- Dependências/gate: A24-04, A24-08 e gates de lote; não usar exceção genérica nem mover tudo para `dependencies`.
- Pronto/evidência: nove relações independentes resolvidas ou exceções precisas aprovadas e vigentes; qualquer divergência remanescente do relatório R1 é reconciliada antes do lote. Zero novo gap, testes/builds isolados afetados passam e o grafo final é auditado.

### A24-08 — Demonstrar M07-S2/S3 em fronteira pública

- Estado: `BLOCKED_BY_M07_S1`; onda R2; corresponde aos slices já previstos em SPEC-M07-001.
- O que/onde: três packages neutros, exports e consumidores descartáveis dos entry points aprovados.
- Como: executar direção/ciclos e builds bottom-up S2; após gate S3, compilar consumidores sem aliases privados e registrar compatibilidade por versão. Outros 22 packages ficam `UNKNOWN` até decisão explícita.
- Dependências/gate: A24-05 e gates separados S2/S3; não reutilizar o gate S1.
- Pronto/evidência: regras do subgrafo neutro sem aresta proibida não aprovada, builds e consumidores do mesmo candidato passam, unknown permanece visível.

### A24-09 — Integrar inventário aceito ao CI bar

- Estado: `BLOCKED_BY_A24_06_TO_08`; onda R4; origem A24-F06.
- O que/onde: `package.json`, `scripts/ci-bar-contract.mjs`, `.github/workflows/verify.yml` e runbook de resultado.
- Como: definir perfil que retorna sucesso apenas quando os critérios aprovados estão satisfeitos; anexar relatório candidate-bound e status de unresolved/finding ao CI sem reescrever os 35 gates históricos.
- Dependências/gate: perfil e manifests aceitos, SPEC e gate de CI próprios; contrato de Node 22 preservado.
- Pronto/evidência: CI rejeita um import interno não declarado e um candidato stale em fixtures; workflow do mesmo run publica relatório e não declara PASS com violation bloqueante.

### A24-10 — Obter revisão independente do candidato final M07

- Estado: `BLOCKED_BY_FINAL_CANDIDATE_AND_I1_AVAILABILITY`; onda R4; origem A24-F07.
- O que/onde: dossiê M07 final, frozen bar, diff e critic report.
- Como: solicitar crítico fresh-context em leitura sobre os bytes congelados, evidência de Node 22, coverage, manifests, exports e limitações; registrar parecer literal.
- Dependências/gate: A24-05–A24-09, serviço/revisor disponível; se indisponível, `UNAVAILABLE` permanece e não há aceitação independente.
- Pronto/evidência: I1 aceito para mesmo candidato/run e achados adjudicados; `CONDITIONAL_PASS` não fecha requisito de aceitação limpa quando exigido.

## Baixa prioridade

### A24-11 — Manter navegação e estado derivados sincronizados

- Estado: `DOCUMENTARY_RECONCILIATION_DONE / AUTOMATION_PROPOSED`; onda R0/R4; origem A24-F06.
- O que/onde: `docs/03_build/0340_50_improvements_roadmap.md`, `0341_50_improvements_backlog.md`, `0300`–`0302`, `docs/99_operational_index.md`, `docs/README.md`.
- Como: nesta rodada, atualizar manualmente os resumos atuais e linkar 0569/0343/0344/0345; depois definir detecção automática de rodapé/índice stale contra runtime state, preservando histórico append-only.
- Dependências/gate: correção documental já autorizada pela reauditoria; código de automação exigirá task, SPEC e gate se vier a ser construído.
- Pronto/evidência: índices apontam M07-S1 FAIL, M05 dependente, I1 ausente e produção NO_GO; links resolvem e nenhuma evidência histórica muda. Automação só fecha com checker demonstrado em outro gate.

## Próxima ação singular

Preparar um packet documental hash-bound distinto para tratar C1J-08/C1J-09 no candidate `e884796fd90192409230b0991524168186a9f65c824156a943102dcfacc98e1b`, ou definir uma nova execução se reviewers fresh-context continuarem indisponíveis. C1J não pode ser repetida sob o mesmo gate; nenhum código/check começa sem decisão própria. M07-S1 continua `FAIL / OPEN`; M05 aguarda M07.
