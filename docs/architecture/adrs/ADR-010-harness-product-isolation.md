# ADR-010 — Operational Harness e produtos consumidores isolados

- Data: 03/10/2026.
- Direção: **confirmada pelo pedido atual do usuário** — “esse repositorio é do operational harness”, com o programa acoplado mantido isolado.
- Layout e execução: **extração estrutural implementada conforme SPEC0178**, por pedido posterior de implementação integral. O aceite positivo de isolamento permanece pendente. A [SPEC0228 foi verificada na candidata localf11](../../04_audit/evidence/B6-0228-BUILD-20261017/REPORT.md), retirando falsos PASS e mantendo INCOMPLETE, sem integração automática ao principal. SPEC0179/0180 receberam [aprovação humana para BUILD local sintético](../../04_audit/evidence/HARNESS-ISO-EXEC-20261003/audit-actions/human-t3-approval.json) em03/10; isso não concede aceite ou produção.
- Fontes: [ADR-001](ADR-001-harness-independent-products.md), [ADR-009](ADR-009-assistente-de-plantao.md), [AUD0594](../../04_audit/0594_repository_score_audit_2026-10-02.md), [roadmap 0369](../../03_build/0369_harness_product_isolation_roadmap.md) e [backlog 0370](../../03_build/0370_harness_product_isolation_backlog.md).

## Decisão de direção

O `cvg-operational-harness` é a infraestrutura reutilizável: contratos, orquestração, execução governada e adapters compartilhados. O Assistente de Plantão é um **produto consumidor**, com domínio, configuração, estado, testes, operação e liberação próprios.

Esta decisão substitui a identificação do repositório inteiro com o Assistente de Plantão na ADR-009. As decisões D1–D4, o princípio de confirmação humana, a SPEC 0177 e a barra 0368 continuam aplicáveis **ao produto**. A separação não autoriza dado real, integração externa, piloto ou release do harness, nem reabre automaticamente UP91/0356/0367.

## Fronteira implementada em verificação

```text
cvg-operational-harness/
  packages/                      contratos/runtime/adapters reutilizáveis
  apps/api/                      host do harness existente
  apps/worker/                   worker operacional existente
  products/shift-assistant/
    package.json                 workspace privado consumidor
    src/                         domínio, comandos, composição e entrypoint
    tests/ ou src/__tests__/      testes próprios e sondas de regressão
    sandbox/ ou src/sandbox/      simuladores e demos somente sintéticos
    deploy/                      Dockerfile, compose e exemplo de env próprios
    docs/                        SPEC, guia, operação, barra e backlog do produto
  docs/                          arquitetura e continuidade do harness
```

Os testes e simuladores estão em `src/__tests__` e `src/sandbox`, conforme SPEC0178. Dezessete arquivos TypeScript foram movidos preservando seus bytes; deploy, workspace, docs e backlog agora têm caminhos próprios. Os dados e volumes existentes foram preservados. Criar outro repositório ou publicar pacotes não faz parte desta entrega.

Direção permitida: **produto → exports públicos de contratos/runtime/adapters suportados → dependências de infraestrutura**. O harness e seus hosts não importam o produto, não carregam suas variáveis `SHIFT_*`, não montam seus webhooks e não iniciam seu agendador. Hospedar tudo no mesmo monorepo não concede acesso de um processo aos dados ou segredos do outro.

O consumidor atual importa `@cvg/model-gateway` e `zod`; não compõe `createOperationalHarness` nem `ModelGateway.complete`. A extração não deve fingir que essa integração já existe. Os exports suportados e o alcance do caminho direto constam na [API pública](../PUBLIC_API.md); migrar o organizador para o gateway de budgets/telemetria exige SPEC e gate T3, observando a ADR-004. Não adicionar loop autônomo ou ferramentas clínicas para tornar o consumidor artificialmente “genérico”.

## Critérios de isolamento

1. Domínio, prompts, comandos, identidade de pacientes, regras de lembrete e retenção do assistente ficam no produto.
2. Imports estáticos, dinâmicos, relativos, por alias e dependências transitivas do harness para o produto são recusados por gate executável com caso negativo conhecido.
3. Harness compila e executa uma jornada sintética sem arquivos, variáveis, volume, simuladores ou processo do produto; isolamento é comprovado em cópia descartável.
4. Consumidor tem entrypoint, comandos, configuração, imagem e volume próprios. Um não importa, inicializa ou precisa parar o processo do outro.
5. Testes e coverage têm denominadores identificados por proprietário; o gate agregado conserva as regressões existentes durante a migração. Mover arquivos não remove testes nem esconde falhas.
6. API/schema/export públicos e eventos/documentos persistidos são preservados pela extração. Adaptação de formato de estado requer SPEC, backup sintético e recuperação demonstrada.
7. Backlog, evidência, nota e release de um produto não representam qualidade ou autorização do harness inteiro; barra 0368 permanece própria do assistente.

## Consequências

Os 14 achados da AUD0594 serão encaminhados pelo backlog 0370: defeitos de pacientes, confirmação, JSONL e WhatsApp pertencem ao produto; limite do transporte de modelo e manutenção das dependências afetam adapters/infraestrutura compartilhados. Não mover rotinas clínicas ou scheduler do plantão para `packages/harness`.

O backlog0370 é a carteira canônica HISO do harness. Os dez cartões PISO vivem somente no [backlog do produto](../../../products/shift-assistant/docs/backlog.md); o documento do harness mantém apenas links e dependências de integração, sem duplicar status. A [correspondência AP–PISO–HISO e o mapa documental](../../../products/shift-assistant/docs/requisitos-ap.md) indicam os donos e preservam as origens aprovadas. README/AGENTS, índices e entradas atuais dos ledgers seguem esta direção; o [plano0388](../../03_build/0388_documentation_isolation_reconciliation.md) registra a reconciliação e seus checks. Histórico e evidências hash-bound permanecem preservados. Esta ADR não declara o isolamento aceito. Resultados anteriores conservam suas datas no [handoff histórico de execução](../../08_runtime/handoffs/harness_isolation_execution_20261003.md).
