# SPEC 0171 — regressão pública do payload antes da proposta

Task UP91-004-R2, subfatia de qualidade de UP91-004. T2 **somente testes**, sem alterar implementação, contrato público, schema de produto, política ou autoridade de approval. Fixtures sintéticas e recursos próprios do claim UP91-EXEC. Não concede BUILD das candidatas T3 pendentes ou release.

## Recon e comportamento existente

`GovernedAgentRuntime.runTurn` usa o output estruturado do gateway para criar uma proposta quando a policy requer approval. Schemas Zod podem validar JSON e transformá-lo em objetos não representáveis pelo serializador canônico. `createExecutionProposal` já rejeita esses payloads com `proposal_payload_invalid`; o handler já deve negar antes de solicitar approval. O teste atual de proposal-errors exercita a função isolada; runtime-kernel-coverage cobre os erros do serviço de approval, mas não estes payloads transformados pelo gateway real.

Esta task verifica a conexão, sem invocar privados ou mockar o handler/proposal. Usar runtime, policy, model gateway e engine/store de approval reais; somente provider local e ferramentas/outbox são fixtures contadas. Contrato observado permanece o mesmo; qualquer correção de comportamento de segurança descoberta exige SPEC e revisão T3 própria.

## Casos e critérios de pronto

1. Positivo: JSON válido e transformador válido produzem approval_required, exatamente um approval REQUESTED com payload canonizado esperado, sem ferramenta/outbox antes de approval.
2. Negativos: transformadores de schema produzem BigInt, ciclo, número não finito e profundidade além do limite canônico. A entrada pública retorna denied/proposal_payload_invalid; nenhuma chamada ao request de approval nem registro no store, zero tool/outbox, contagem de modelo preservada e spans encerrados.
3. Não reduzir limites, capturar erros para fingir PASS ou duplicar testes preexistentes de falha genérica/tipada do serviço. Não chamar método privado, usar cast de identidade ou substituir policy por stub permissivo para alcançar caminho.
4. Novo arquivo somente: `packages/agent-runtime/src/__tests__/runtime-approval-request-boundary.test.ts`. Implementações/barrel/manifest/lockfile permanecem inalterados. Node22 typecheck/lint/unit/PG/E2E pertinentes; ao fim da rodada com código, execução nativa certify com seus failures preservados. Crítica independente dos novos casos. Gates integrais vermelhos continuam impedindo certificado/AAA e conclusão do cartão pai.

## Estado e recuperação

IMPLEMENTED_TESTS_ONLY / VERIFY. Aprovações UP91-012/0170 continuam pendentes. Preservar primeiro resultado real; não mudar expectation só para obter verde. Restaurar recurso próprio não apaga evidências. Ledgers compartilhados receberão handoff, sem sobrescrever holders concorrentes.

## Checkpoint observado — rodada2

Cinco casos pela entrada pública PASS, typecheck/lint/build e unit2.486/PG288/E2E12 PASS em Node22.23.2, candidato `6646a56024d746bf319fec45cff24403892bea0e69d17bacc81f4240b6d70f5d`. Teste SHA `c39c6c31d8b7eab73d7f2512f264e6ede678edbc624425e8ae5aa7724546f2b3`; implementação runtime permanece SHA `0f4ca214e94ca554da2cc590a392f8bf2b737acac3281f9fb2b6092700a18e85`. Rawls I1 APPROVE_TEST_ONLY. Primeira falha de fixture preservada; correção passou a conferir o contrato existente (request.payload e record.proposalPayload), sem mudança do produto.

Certificação global FAIL: formato/security e erro metrics.unit:null no parserANSI; nenhum resultado/certificado novo emitido. Kernel branches505/526=96,01%, guard10mutações/10mortas. Provas em [relatório da rodada2](../04_audit/evidence/UP91-EXEC-20260930/round2-report.md). Este checkpoint documental posterior não reemite candidato nem transfere seus gates a outros bytes. Parent004 e programa continuam abertos.
