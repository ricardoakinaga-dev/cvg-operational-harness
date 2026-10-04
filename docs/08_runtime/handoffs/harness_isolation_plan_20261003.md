# HARNESS-ISO-PLAN — handoff de isolamento — 03/10/2026

## Entrega e direção vigente

Pedido do usuário: este repositório é do **Operational Harness**; o programa acoplado deve permanecer isolado. Roadmap e backlog solicitados, sem pedido de implementação nesta rodada. A direção atual corrige a identificação global da ADR-009 com o Assistente de Plantão, preservando D1–D4 e requisitos do produto.

Entregas T1: [roadmap 0369](../../03_build/0369_harness_product_isolation_roadmap.md), [backlog 0370](../../03_build/0370_harness_product_isolation_backlog.md), [ADR-010](../../architecture/adrs/ADR-010-harness-product-isolation.md) e [evidências próprias](../../04_audit/evidence/HARNESS-ISO-PLAN-20261003/). São seis milestones e 24 cartões: 14 HISO e dez PISO, com dependências, gates, aceites e rastreabilidade F01–F14. Planejamento entregue; execução pendente.

Layout proposto: consumidor privado em `products/shift-assistant`, com domínio/configuração/processo/dados/build/testes/deploy/docs/backlog próprios; dependência unidirecional para interfaces suportadas do harness. Core e hosts genéricos não importam domínio/entrypoint/env do produto. Aceite do harness não espera o piloto administrativo do produto.

Baseline observado: HEAD `cc1402ff163a34352c10405e9e5c77c653596084`, checkout modificado; 17 fontes TypeScript do consumidor alojados em `apps/worker/src/shift-assistant`. Acoplamento de localização, descoberta/build/testes/deploy e missão documental. Busca textual não é prova de grafo transitivo/dinâmico; HISO-005 formaliza esse gate. O assistente consome provider de modelo, não a factory/runtime completo; HISO-009 decide a interface suportada.

Estado de continuidade: `status = READY_FOR_NEXT_STEP`; `last_completed_action = HARNESS-ISO-PLAN (roadmap/backlog T1)`; `next_action = HISO-001 (baseline/owners/claims)`; etapa de implementação `NOT_STARTED`. A task documental está concluída; os cartões de execução continuam pendentes.

## Entradas prontas para integração dos ledgers

Os ledgers 99/20/30, README e índice têm modificações de outras rodadas. A regra 5 de [coordenação](../agent_coordination.md) exige preservar esses arquivos. Os trechos abaixo são propostas para inserir no topo pelo owner quando coordenado, sem reescrever entradas anteriores. HISO-002 fará a reconciliação completa.

### docs/99_runtime_state.md

> 03/10/2026 — HARNESS-ISO-PLAN concluído documentalmente, sem commit. Direção explícita atual: repositório do Operational Harness; Assistente de Plantão é consumidor isolado. ADR-010 corrige somente a identificação global da ADR-009; D1–D4/SPEC 0177/barra 0368 continuam do produto. Roadmap 0369/backlog 0370 entregues: seis marcos, 14 HISO/10 PISO, execução não iniciada. Próxima ação HISO-001; layout products/shift-assistant proposto, extração HISO-004 após SPEC/gate. Nenhum release concedido. Ledgers preservados conforme coordenação; continuidade neste handoff.

### docs/20_master_execution_log.md

> 03/10/2026 — HARNESS-ISO-PLAN / T1: inventário da fronteira e planejamento solicitados pelo usuário. Entregues ADR-010, 0369 e 0370 com 24 cartões, ownership core/consumidor e encaminhamento F01–F14. Código, lockfile, volumes e processos não alterados; sem commit/push/deploy. Checks documentais e integridade registrados em docs/04_audit/evidence/HARNESS-ISO-PLAN-20261003. AUD0594 é entrada histórica de testes/notas, não nova execução nesta rodada.

### docs/30_backlog_master.md

> Direção de 03/10/2026: backlog canônico da transição de isolamento é 0370_harness_product_isolation_backlog.md, acompanhado do roadmap 0369 e ADR-010. HISO-001 READY; demais 23 cartões TODO; nenhum DONE. AP-001–AP-016 são origem de requisitos do assistente e devem ser reconciliados, sem duplicação de status, em HISO-001/HISO-008. Programas antigos permanecem históricos. Após transferência, cartões PISO têm status apenas no backlog do consumidor e ponteiros na carteira do harness. Próxima tarefa HISO-001; implementação só após SPEC/gate da fatia.

## Continuidade, limites e recursos

- Retomar com HISO-001 e claims livres; HISO-002/003 reconciliam missão e SPEC antes do BUILD de extração.
- Não tratar o layout, gates futuros ou tarefas T3 como aprovados por esta entrega. A direção de independência foi pedida pelo usuário; detalhes de implementação ainda são proposta.
- Não repetir aprovações D1–D4 já existentes. Uso real e alteração sensível seguem gates específicos; HISO-014 não concede piloto ou produção.
- Não mover volumes, apagar arquivos de terceiros ou fazer wrapper do produto no worker genérico. Não publicar/abrir repositório externo implicitamente.
- Escritas da rodada restritas aos quatro documentos novos, evidências e seção própria de coordenação. Sem instalação/lockfile/certify/E2E/SBOM/licenses/serviços/commit/push/deploy. Recursos temporários em `/tmp/cvg-harness-iso-plan-20261003/`.
- Validação documental: formato, links e higiene de evidências PASS em Node 22; DAG dos 24 cartões sem ciclos, 14 achados encaminhados e nenhuma dependência HISO→PISO. Os 821 inputs comparados à AUD0594 e HEAD permanecem idênticos. Resultados/comandos estão em `planning-summary.json` na pasta de evidências. Suítes de código da AUD0594 permanecem históricas; T1 não executa novamente as integrações da migração futura.
