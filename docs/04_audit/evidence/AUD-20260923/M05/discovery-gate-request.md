# M05 — Pedido de validação Discovery

Data: 23/09/2026  
Estado: `AWAITING_HUMAN_APPROVAL`  
Discovery: [0018_m05_public_harness_composition.md](../../../../00_discovery/0018_m05_public_harness_composition.md)  
Task: [M05 no backlog](../../../../03_build/0341_50_improvements_backlog.md)  
Quality bar: [M05-DISCOVERY-v1](quality-bar.json)

## Resultado entregue

O mapa estático separa a API pública `/v1/executions` → PostgreSQL operacional → worker `operational-harness` → factory público `createOperationalHarness()` do webhook inbound/outbox → `published-agent`/`kernel`. Também registra a opção inline, os ports públicos/duráveis, as lacunas de trace e o limite das fontes de teste não executadas.

## Revisão independente

Uma crítica I1 fresh-context e uma revisão final I1 aprovaram M05-D1 a M05-D5. O run Gauntlet `m05-discovery-20260923` encerrou em `CONDITIONAL_PASS`: a revisão documental passou, mas a verificação integrada/runtime ficou `NOT_RUN` porque depende de PRD, SPEC e gate local de BUILD. Consulte [`final-review-record.json`](final-review-record.json), [`final-verification.json`](final-verification.json) e [`final-critic-result.json`](final-critic-result.json). Este resultado não substitui a decisão humana solicitada abaixo.

## Decisões solicitadas

1. O Discovery é base suficiente para iniciar o PRD documental de M05?
2. Qual topologia é a composição canônica a demonstrar?
   - **A. Recomendada como hipótese:** `/v1/executions` → `PostgresOperationalExecutionStore` → `OperationalExecutionWorker` → `createOperationalHarness()`. O termo “kernel” no handoff refere-se ao runtime composto pelo Harness, não ao handler separado em `kernel-composition.ts`.
   - **B. Inbound legado:** webhook → `outbox_events` → worker selecionado para `kernel`.
   - **C. Definir uma ponte/cutover entre as filas** (amplia o escopo e requer decisão de produto explícita).
3. O par de paths legados é `published-agent` versus opt-in `kernel`, ou ingress inline versus durable/outbox? A paridade deve cobrir contrato HTTP/resposta, tenant/session, approval, tool/journal, ou outra fronteira?

## Limite da aprovação

Uma aprovação aqui libera somente o PRD documental de M05 depois da decisão humana pendente de M07 e do fechamento das ambiguidades acima. Não aprova SPEC, BUILD, alteração de código, execução de teste, banco/serviço, integração externa ou produção. M05 exige SPEC e gate local próprios antes de qualquer prova executada. G21-5/G21-6 continuam fechados; produção `NO_GO`.

## Checklist

- [x] Rotas, filas, worker selectors e factory público mapeados com fontes.
- [x] Campos de trace e limites de join separados entre observação e incógnita.
- [x] Testes existentes classificados como fontes lidas, não execução.
- [x] Plano futuro limitado a IDs sintéticos, PostgreSQL descartável e ferramentas fake.
- [ ] Decisão humana: aprovar Discovery M05 para PRD documental.
- [ ] Decisão humana: escolher a rota canônica e nomear o par legado/limite de paridade.

## Preservação e segurança

Não houve edição de código, teste, build, typecheck, lint, serviço, banco, rede, dado real ou ação sensível. Nenhum caminho de produção foi validado; G21-5/G21-6 seguem fechados e produção `NO_GO`.
