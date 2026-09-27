# PR-101 — Discovery do primeiro consumidor da plataforma

- Estado: `IN_PROGRESS / DISCOVERY_DOCUMENTAL` em 27/09/2026.
- Fonte: [plano executivo 0354](../03_build/0354_production_executive_plan_2026-09-26.md),
  [backlog 0356](../03_build/0356_production_backlog_2026-09-26.md),
  [decisões 0357](../03_build/0357_production_decision_packet_2026-09-26.md)
  e [AUD-0578](../04_audit/0578_program_comprehensive_audit_2026-09-26.md).
- Decisões do usuário: D-03 = **A, núcleo governado completo** como escopo
  pretendido para o primeiro piloto; D-04 = **definir o primeiro consumidor e
  o contexto no discovery**. Ao consultar candidatos em 27/09/2026, o usuário
  respondeu **“sem candidatos definidos”**. Nenhuma dessas respostas é
  autorização de produção ou de integração real.

## Problema e hipótese

O harness já exercita runtime, aprovações, handoff, policy, auditoria,
persistência e console com dados sintéticos. A auditoria 0578 atribuiu
`25/100` à prontidão de produção: identidade, privacidade, integrações e
operação real ainda não satisfazem as 13 condições de 0354. Falta um primeiro
consumidor definido para testar se os contratos públicos da plataforma
atendem um fluxo real sob supervisão humana.

Hipótese a validar: um produto consumidor consegue usar o núcleo governado
sem incorporar regras de produto no harness, manter ações sensíveis sob
approval ou handoff e operar com observabilidade e suporte mensuráveis.

## Fronteira da descoberta

O objeto é o **harness como plataforma**. A Esmeralda V2 é legado isolado;
seu domínio, usuário ou canal não são escolhidos por padrão. A escolha D-03
abrange runtime single-pass e iterativo, orquestrador, approvals, policy,
handoff, auditoria, outbox durável e console. Provider, canal e conhecimento
só entram após decisões D-05/D-06/D-07, PRD/SPEC e gates T4 próprios. Nenhuma
consulta real será confirmada, cancelada ou reagendada automaticamente;
ações clínicas, financeiras e de prontuário definitivo ficam fora do escopo.

## Dados a levantar com o candidato a consumidor

| Campo                 | Informação necessária                                                               | Estado   |
| --------------------- | ----------------------------------------------------------------------------------- | -------- |
| Produto e responsável | Nome, dono de produto e responsável operacional                                     | Pendente |
| Fluxo piloto          | Entrada, resultado esperado, exceções e ponto de handoff                            | Pendente |
| Tenant e isolamento   | Tenant piloto, papéis, acesso do operador e fronteira de dados                      | Pendente |
| Volume e horário      | Turnos/dia, simultaneidade, picos e janela de cobertura humana                      | Pendente |
| SLA de handoff        | Tempo máximo de primeira resposta e escalonamento                                   | Pendente |
| Dados e retenção      | Classes de dados, localização, prazo e base de tratamento revisada pelo encarregado | Pendente |
| Dependências          | Provider, canal, fontes aprovadas e sistemas externos necessários                   | Pendente |
| Sucesso               | Metas numéricas de disponibilidade, conclusão, latência, segurança e satisfação     | Pendente |
| Reversão              | Gatilhos de pausa, dono do kill switch e processo de retorno ao atendimento humano  | Pendente |

## Critérios para selecionar o primeiro consumidor

1. Há dono do produto e equipe humana capaz de cobrir o horário proposto e
   receber handoffs; o SLA cabe nessa cobertura.
2. O fluxo piloto pode ser limitado por tenant, política e feature flags,
   com reversão operacional demonstrável.
3. O produto aceita começar com dados sintéticos e staging; dados reais só
   após privacidade, identidade, segurança e autorização de piloto.
4. As integrações exigidas têm contrato, fonte de dados e aprovação próprios;
   a plataforma não precisa absorver lógica específica do produto.
5. Há métricas e volume definidos para qualificar o piloto e seu resultado.

## Validação e saída

PR-101 só poderá ser marcada `DISCOVERY_VALIDATED` quando existir ao menos um
candidato a consumidor e quando produto, fluxo,
tenant, cobertura humana, volume, SLA, dependências, métricas e dono forem
registrados e revisados com o usuário. O resultado alimenta PR-102 (PRD
adendo) e PR-103 (contexto do piloto). Até lá, F1 permanece incompleta e
produção `NO_GO`.
