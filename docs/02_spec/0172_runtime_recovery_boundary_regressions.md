# SPEC0172 — regressões públicas de recovery e identidade durável

Task UP91-004-R3, subfatia de qualidade de004 e regressão da extração021. T2 somente testes; SPEC/task registradas antes de BUILD. Sem alteração da implementação, dos contratos públicos, policy/approval, journal/schema, limites, filtros/thresholds ou código de certificação. Fixtures de efeito controlled_fake, memória/local, recursos exclusivos UP91-EXEC.

## Recon e delta verificável

Diagnósticos em Node22:135testes/3arquivos e270testes/13arquivos PASS; comandosinstrumentados exit1 porque suíte parcial não atende pisosglobais, conservados semlowering. CoberturaV8 privada mostra guards pouco exercitados em RuntimeEffectRecovery, mas não constitui prova global de lacuna. Confrontar casos com corpus antes de adicioná-los; não duplicar positivos/genericthrows existentes nem chamar métodos privados para pintar branches.

Lacunas públicas escolhidas: reserva legada expirada sem operationKey persistida não ganha prova de ausência; approval EXECUTING expirado com journal ausente permanece incerto; mudança de row entre leitura de recuperação e leitura ativa (proposalHash divergente, UNCERTAIN, erro de segunda leitura) não rearma efeito; disputa real em reserve após leitura de terminal no-effect retorna in-progress sem executar o perdedor. TTL sweep distingue RESERVED conhecido sem efeito de EXECUTING sem prova. Guards já existem; a task observa seu enforcement conectado.

## Método e limites

GovernedAgentRuntime.runTurn e sweepExpiredApprovals públicos, PolicyEngine/reference profile, ModelGateway/PromptRegistry, ApprovalEngine/InMemoryApprovalStore e InMemoryEffectJournal reais. Provider, ferramenta e outbox são fixtures locais contadas. Port wrapper tipado pode inserir/transicionar row depois de capturar primeira leitura, ou produzir fault de leitura; usar stores/journal reais e clock/barrier determinísticos, sem mock de runtime/policy nem cast de record inválido. Receber operationKey pela port na fixture evita copiar algoritmo interno. Spies observam calls; alterações do estado de fixture vêm de APIs públicas.

Não fabricar sinal de no_effect, resultado confirmado ou approval liberado para alcançar branch. Casos legacy usam o contrato opcional público existente de reserva sem operationKey; negativos de conflito usam row tipada explicitamente de outra proposta. Tempo avança em clock controlado, sem sleeps. Candidato positivo de recuperação/no-effect já existente é executado em conjunto para detectar always-deny, sem duplicá-lo.

## Critérios de pronto

- Negativos observados pela entrada pública: denied/operation_uncertain ou operation_in_progress conforme guard; zero tool/outbox e zero novo provider no resume, nenhuma reserva/release quando proibidas. Store/journal preservam identidade/tentativa e estado honesto; audit chain e spans fechados conferidos.
- Legacy e chave persistida têm casos próprios de UNCERTAIN surgido entre leituras. Runner distingue essa condição do throw na primeira leitura já coberto.
- Disputa de rearm usa verdadeira reserva do journal por outra tentativa, não outcome hardcoded; perdedor mantém fence/reserva e não chama efeito. Sweep público com EXECUTING/journalausente não libera; controle RESERVED/journalausente prova liberação existente, sem efeito em ambos.
- Novo arquivo único runtime-recovery-boundary.test.ts; implementações/barrel/catalog/manifest/lock inalterados. Após casos meaningful: Node22 typecheck/lint/unit/PG/E2E, cobertura atual e crítica I1; certify nativo ao fim da rodada com código, preservando falhas preexistentes/skipgovernance/parser.
- Não exigir100% por testes artificiais de fallback inalcançável; não prometer margemglobal3pp por suíte parcial. Parent004/021 e149critérios continuam abertos até aceites integrais.

## Estado e recuperação

REGISTERED / BUILD_TESTS_ONLY / NOT_RUN. Todo primeirofailure é retido, ajustes de fixture não mudam contrato do produto. Se expectativa de segurança falhar por bug real, nenhum fix de policy/approval/recovery nesta trilha; SPEC/revisãoT3 separadas. ConteúdosT3 atualmente enviados (012/0170/lote7 SHA312d5e5d…) congelados e sem autoridade por silêncio. Sem dados reais/efeito externo/commit/push/deploy/GO. Ledgers compartilhados receberão handoff pelo holder.

## Checkpoint de testes implementados — rodada3 LIVE

A seção REGISTERED/NOT_RUN acima é o registro inicial anterior ao BUILD. Estado corrente: IMPLEMENTED_TESTS_ONLY / VERIFY. Teste novo SHA71ac93f0025f2e11bf297cfabf5a86a40f763cc5c8cfd8530cb685aecf5d51f8, root/snapshot idênticos. Primeiras execuções focada8/8 e corpus14arquivos/278testes/zero skips PASS; scopedtypecheck/lint/formatPASS. Nenhum primeirofailure nesses comandos. [Prova](../04_audit/evidence/UP91-EXEC-20260930/test-builder-r3/proof.json), [logs originais](../04_audit/evidence/UP91-EXEC-20260930/test-builder-r3/report.md) e [I1 APPROVE_TEST_ONLY](../04_audit/evidence/UP91-EXEC-20260930/recovery-boundary-review.json). Produto e contratos permaneceram intactos; sem bug comportamental observado.

Nativecert atual LIVE em candidato867485b8b2f08eef940d2dadcff8d9d3b3a3e01b87db23bb8f9e39859bec9fa0, runmunwg9ku: unit2.494/330arquivos/zero skips, typecheck/lint/build PASS; formato3docs preexistentesFAIL, restantes ainda não terminais neste checkpoint. Snapshot conserva a SPEC iniciala3ab754b…; [bytes originais testados](../04_audit/evidence/UP91-EXEC-20260930/spec0172-tested-source.md.txt) arquivados, este acréscimo somente registra resultados sem mudar normas/testes. Nenhum certificado novo/qualificaçãoPG/E2E/fechamentoparent/AAA/GO é inferido antes do término. Rodada3 final será acrescentada com evidências atuais, preservando este checkpoint temporal.

## Retificação terminal —09:41UTC

O checkpointLIVE anterior é histórico. Nativecert terminouexit1 em961,354s no mesmocandidato/run:2.494unit/330arquivos,288PG/35arquivos,12E2E/zero skipped-unexpected-flaky, typecheck/lint/buildPASS. Cobertura kernel511/526branches97,15%,globalB87,84%,mutation10/10KILLED.14/16comandosexit0; format3docs/security3HIGHFAIL, skipgovernance3source_driftadjudicaunitFAILe parsermetrics.unit:nullimpede emissão. Nenhumresult/certnovo. [Manifesto34rawartefatos](../04_audit/evidence/UP91-EXEC-20260930/round3-native-certification/manifest.json), [classificação](../04_audit/evidence/UP91-EXEC-20260930/round3-artifact-classification.json) e [relatóriocorrente](../04_audit/evidence/UP91-EXEC-20260930/round3-report.md). Parent004/021/integral149continuamabertos; fatia permaneceVERIFY até qualificação aplicável. Crítica integrada/Gauntlet3 ainda em andamento; aceitelocalI1 não substituiglobal. FrozenT3authoritypermanecePENDING e ledgervazio.
