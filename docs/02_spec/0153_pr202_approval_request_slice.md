# SPEC-PR202-001 — extrair a etapa de solicitação de approval

- Trilha: **T2** sob D-12; refatoração interna sem mudança de contrato público, schema, SQL, permissão ou efeito externo. BUILD local sintético autorizado pela task [PR-202](../03_build/0356_production_backlog_2026-09-26.md) e pela instrução do usuário de corrigir/validar o programa. Não concede GO nem altera o gate T3 de identidade.
- Recon: [AUD-0583](../04_audit/0583_pr202_runtime_hotspot_recon_2026-09-28.md). Baseline `2e7e9ee`, `runtime.ts` SHA-256 `0834639780a3c8c6a73d1d05edc5551d3a5ff432b9c921f83c4c285f8c849bf8`.
- Estado: `BUILD_LOCAL_AUTHORIZED / EVIDENCE_PENDING`. Worktree isolado `codex/pr202-runtime-20260928`; sem tocar caminhos ativos PR‑L04.

## Fatia e invariante

O `runTurn` atual tem cerca de 655 linhas; o backlog preserva a contagem antiga de 2.233. A primeira fatia move **somente** o ramo `decision.decision === 'REQUIRE_APPROVAL'` nas linhas 814–892 para um método privado nomeado `#requestApprovalTurn` na mesma classe. O `if` e o `return await` ficam em `runTurn`, dentro do `try` que fecha spans em exceção inesperada. A fatia não muda exports, `GovernedTurnInput`, `GovernedTurnResult`, opções, política, proposal, adapter, journal, outbox ou banco. O arquivo continua grande; esta é a primeira etapa, não fechamento completo da PR‑202.

O helper recebe `input`, `decision`, `modelResult`, `payloadForEffect`, `correlationId` e um contexto com `approvals`, `telemetry`, `clock`, `appendAudit` e `finish`. `approvals` e `telemetry` são as referências capturadas no início de `runTurn`; o helper não relê `#options` após aguardar o modelo. Preservar a ordem byte a byte das operações dentro do ramo, salvo recuo e leitura das dependências pelo parâmetro: `clock()` para `createdAt`, validação/canonicalização do proposal, `approvals.request`, métrica, audit e `finish`. Erros de proposal e approval continuam produzindo os mesmos códigos e outcomes; o ramo nunca executa ferramenta/outbox. O snapshot do turno e o budget não são recalculados no helper.

## Prova mínima e regressão

1. Guardar baseline do bloco fonte e fazer comparação estrutural AST do bloco movido, permitindo só `this.#options`/variáveis livres → parâmetros/desestruturação e recuo. Nenhum statement do corpo muda de ordem. Inspecionar diff manualmente; se comparação falhar, não aceitar a fatia como mecânica.
2. Testes públicos de request/proposal, falha de proposal/approval, payload congelado, relógio/TTL, métricas, auditoria e ausência de tool/outbox em `agent-runtime`, `runtime-kernel-coverage` e `runtime-binding`. Baseline Node 22: 13 arquivos/274 testes incluindo `agent-evals`; separar no relatório os testes que realmente chamam `runTurn` dos evals laterais. Acrescentar negativo novo apenas se faltar observação material.
3. `typecheck`, lint, formato, suíte completa `npm test` sem skips com PostgreSQL sintético, `test:postgres`, E2E Chromium e cobertura acima dos thresholds no branch. Crítica independente read-only compara artefato e invariantes, não apenas o resumo do builder. Depois de integrar no root compartilhado, repetir checks do SHA composto antes de certificar.

## Limite de saída

Aceite desta fatia só reduz e nomeia o ramo de approval. O restante da PR‑202 — execução, recuperação/replay e tamanho da classe — fica aberto no backlog com métricas atuais. Produção segue `NO_GO` até o programa 0354 cumprir as 13 condições no mesmo candidato.
