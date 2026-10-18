# SPEC0214 — revisão documental R2

Resultado: `IMPLEMENTED_DOCUMENT / R2_DESIGN_REVIEW_READY`, sem autoaceite. [SPEC0214 revisada](../../../../02_spec/0214_pare100_platform_kernel_delegation.md) e [resposta a F01–F04](revision-r2/response-to-review.md) prontas para fresh design review.

A crítica independente estática da R1 foi `REVISE_SPEC` sobre SHA-256 `f02a7d2e036bf3eaf758b3a2fe61dce820fbdb0087e06d2c06280264b9589fb2`; relatório SHA-256 `8417f03596164379b43d79035c842aa93db542b39741640e77b1eb4126c70e61`. [Proveniência](revision-r2/provenance.json) preserva os80 hashes anteriores, a candidata original e os bytes do relatório/verdict. Fontes R1 e resultados documentais R1 permanecem históricos; não certificam esta revisão. R2 ainda não recebeu aceite independente.

Correções técnicas especificadas: entrada/saída transformadas uma vez em comando/resultado canônicos; procedência privada de handler/validators antes de clones; matriz completa dos23 stops com trace/HTTP/worker e precedência de falhas; latch irreversível para audit/log/ledger/checkpoint/approval obrigatório, mesmo quando safeAudit tolera exceção. Fato CONFIRMED privado é preservado, mas um turno falho não deixa succeeded público que permita200 na rota approval. EventBus continua best-effort separado.

OPEN-04 HOW local foi resolvido por composição interna com portas tipadas existentes, sem nova ABI pública/schema. Primeira fatia permanece sintética, com uma tool pura revisada; cutover durável/restart, consumidores legados e retirada legacy continuam exigidos posteriormente. [Grafo capturado](dependency-recon.json) e [74 inputs R1](recon.json) permanecem; R2 acrescenta [3 inputs do mapping](revision-r2/additional-inputs.json).

Escolhas de usuário ainda PENDING, com recomendações e exemplos concretos nas seções5/9:

- U1: recorte sintético local com tool atestada, N≤1 público e gateway custom sem procedência recusado, ou preparar primeiro o cutover durável em SPEC própria.
- U2: sequência fail-fast e sucesso público condicionado ao turno inteiro; falha posterior mantém confirmação privada, mas trace.failed/target.failed, approval400 e worker runtimeStatus failed.
- U3: budgets finitos, prazo iniciado após preparação e provider/audit/timeout como trace seguro de handoff; TestLab200/tracefailed versus approval400, sem retry/fallback novo.
- U4: revisão explícita da candidata final antes de BUILD T3. Nenhuma aprovação0211/0212 ou pedido genérico36 substitui esse gate.

Verificações desta revisão serão registradas em `revision-r2/verification.json`; [changedfiles.json](changedfiles.json) traz o inventário exato e `revision-r2/changedfiles.json` distingue o delta R2. Hashes atuais em `SHA256SUMS.txt`, preservados os hashes R1 na proveniência. Retry de capacidade consta em [infrastructure-events.json](revision-r2/infrastructure-events.json), sem mudança de modelo/escopo/autoridade.

Limites: documentação somente no worktree autorizado e nos mesmos dois caminhos; nenhum fonte/runtime/teste/manifest/lock/ledger/root editado. BUILD `NOT_STARTED`, gate T3 `NOT_APPROVED`; testes funcionais, DB, providers, rede, descendentes, commit/push/deploy/release não executados. O goal36, PDSH-003b/P100-010/P100-011 e produção NO_GO não são encerrados por esta entrega.

Próxima ação: Lead congela R2, obtém nova crítica independente e prepara o pacote de escolhas/gate do usuário; estado/log/backlog permanecem sob sua responsabilidade e não são escritos pela lane documental.
