# Plano executivo — programa PROD-20260926 — harness em produção controlada

- Status: `PROPOSED / WAITING_HUMAN_APPROVAL`. Este documento é planejamento;
  não autoriza BUILD, deploy, dado real, provider, canal ou ação sensível.
- Data: 26/09/2026. Programa: `PROD-20260926`.
- Baseline: [AUD-0577](../04_audit/0577_production_readiness_score_audit_2026-09-26.md)
  (67/100; prontidão para produção 25/100; isolamento do legado 30/100) e
  [AUD-0576](../04_audit/0576_repository_score_audit_2026-09-26.md) (69/100).
- Roadmap: [0355](0355_production_roadmap_2026-09-26.md). Backlog:
  [0356](0356_production_backlog_2026-09-26.md). Decisões:
  [0357](0357_production_decision_packet_2026-09-26.md).
- Antecessores: [PROD-20260913](../PLANO_EXECUTIVO_PRODUCAO.md) (histórico),
  [RA26](0353_score_backlog_2026-09-26.md) e [RA25](0351_audit0573_backlog.md).
  Os itens RA26 ainda abertos são absorvidos pelo backlog 0356 com
  referência cruzada; nenhum ID antigo é renumerado.

## 1. Objetivo

Colocar o **CVG Operational Harness como plataforma** em produção
controlada: runtime governado, orquestrador, API, worker, console web,
approvals, policy, auditoria, persistência e observabilidade operando em
ambiente real, prontos para que produtos consumam o harness pelos contratos
públicos. O harness não carrega regra de nenhum produto.

O programa legado de origem — a **Esmeralda V2** (`cvg-agent-secretary-v2`),
secretária de um hospital veterinário — não é alvo deste plano. Tudo o que
restar dele no repositório deve ficar isolado e identificado em
[`legacy/`](../../legacy/secretary-product/README.md) ou ser apagado quando não
for vital (decisões DL-01 a DL-04 em [0357](0357_production_decision_packet_2026-09-26.md)).

"Produção irrestrita" não é objetivo deste programa. A constituição em
[`07_agents/AGENTS.md`](../07_agents/AGENTS.md) continua valendo.

## 2. Definição de pronto para produção

O candidato só pode receber `GO` quando **todas** as condições abaixo
valerem para o mesmo digest de imagem e a mesma configuração:

1. Nenhum código, configuração ou documento vigente específico do legado
   fora de `legacy/`; guarda de CI impede regressão.
2. Capacidades de plataforma liberadas para produção definidas e rastreadas a
   testes e evidências atuais.
3. Zero itens P0/P1 abertos em 0356.
4. Todos os gates de CI verdes, sem skips, com Node 22 e PostgreSQL ativos,
   e `certification:verify` reproduzível em execução limpa.
5. Operadores autenticados por IdP com MFA; RBAC por tenant verificado.
6. Segredos em cofre gerenciado com rotação testada; nenhum segredo em
   arquivo ou imagem.
7. RLS obrigatório no boot de produção; roles separadas de migração e
   aplicação.
8. Inventário de dados pessoais tratados pela plataforma, retenção aplicada
   e fluxo de direitos do titular disponível para os produtos consumidores.
9. Backup com PITR, RPO/RTO definidos e restore exercitado em staging.
10. Telemetria exportada, dashboards, alertas e SLOs com dono; runbooks de
    incidente e on-call escalonado.
11. Pentest externo sem achado crítico/alto aberto.
12. Piloto com o primeiro produto consumidor concluído com critérios de
    saída atingidos.
13. Autorização humana registrada com hash do candidato e do escopo.

## 3. Não-objetivos permanentes

Estes limites valem inclusive depois do `GO`, para qualquer produto que
consuma o harness:

- Nenhuma alteração de agendamento real sem approval humano.
- Nenhuma ação clínica, financeira ou de registro definitivo.
- Nenhuma resposta baseada em conhecimento sem fonte aprovada e versionada.
- Toda ação sensível exige approval ou handoff.
- O harness não passa a depender de produto (direção de dependência
  produto → harness, nunca o contrário).

## 4. Estratégia em oito frentes

| Fase | Nome                            | Resultado                                                                                                 |
| ---- | ------------------------------- | --------------------------------------------------------------------------------------------------------- |
| F0   | Base verificável e higiene      | Certificado reproduzível, worktree limpo, repositório leve, ledgers rotacionados                          |
| FL   | Limpeza e isolamento do legado  | Legado inventariado, isolado em `legacy/` ou apagado; fluxo de referência neutro; guarda contra regressão |
| F1   | Decisões de plataforma e escopo | PRD adendo de plataforma, primeiro consumidor, fornecedores, governança proporcional                      |
| F2   | Fundação de engenharia          | Hotspots decompostos, configuração única, dependências limpas                                             |
| F3   | Segurança e identidade          | IdP/OIDC + MFA, cofre de segredos, borda endurecida, supply chain assinado                                |
| F4   | Dados, privacidade e LGPD       | Inventário, retenção, direitos do titular, RLS obrigatório, PITR                                          |
| F5   | Integrações reais controladas   | Provider LLM, canal, conhecimento com fonte aprovada, efeito externo com approval, kill switch            |
| F6   | Infraestrutura e operação       | IaC, CD por digest, observabilidade de produção, runbooks, on-call                                        |
| F7   | Homologação, piloto e GA        | UAT, auditoria independente, piloto com primeiro consumidor, go/no-go, expansão                           |

FL começa logo depois de F0 e precisa terminar antes de F5: integrar
provider e canal reais sobre código legado espalhado multiplicaria a
confusão. F3, F4 e F6 correm em paralelo a F2 depois de F1. O detalhamento
está no [roadmap 0355](0355_production_roadmap_2026-09-26.md).

## 5. Limpeza e isolamento do legado (frente FL)

Estado encontrado em 26/09/2026:

- `legacy/` contém só um README; nenhum código foi isolado.
- Pacotes sem nenhum consumidor e específicos da secretária: `workflows`,
  `tools` e `memory`.
- Domínio da secretária entrelaçado no código vivo: jornadas tutor → pet →
  rascunho de consulta (`packages/persistence/src/journeys*.ts`, migration
  `0014_journeys.sql`, rotas em `apps/api/src/server.ts`,
  `apps/web/src/features/journeys`), `secretary-preset` no `platform`, grants
  da secretária no `policy-engine`, resumo de handoff tutor/pet no
  `agent-core` e dataset de evals da secretária. É hoje o único fluxo ponta a
  ponta exercitado por testes, E2E e certificação.
- Documentação de produto da Esmeralda misturada à do harness (discovery e
  PRD originais, `blueprint/`, `CODEX_MASTER_INSTRUCTIONS.md`) e constituição
  que manda "construir a Esmeralda V2".
- Resíduos de nome: `AGENTS.md` da raiz, tag de imagem no `Dockerfile`, nome
  de banco no `.env.example` e chave do advisory lock de migrações.

Decisões já tomadas pelo usuário em 26/09/2026 (DL-01 a DL-04):

1. Isolar o domínio vivo da secretária em `legacy/`, fatia a fatia, com
   testes verdes em cada fatia.
2. Apagar os pacotes sem consumidor (`workflows`, `tools`, `memory`).
3. Mover a documentação de produto para `legacy/docs`, deixando no lugar o
   histórico de auditoria vinculado por hash, apenas identificado.
4. O alvo de produção é o harness como plataforma.

Regra da frente: o legado pode depender do harness, o harness nunca depende
do legado. O código isolado é apagado assim que um fluxo de referência
neutro (PR-L07) substituir o papel que ele cumpre nos testes e na
certificação.

## 6. Decisões humanas necessárias

O [pacote 0357](0357_production_decision_packet_2026-09-26.md) traz opções e
recomendações. Resumo:

| ID       | Decisão                                                                   | Bloqueia      |
| -------- | ------------------------------------------------------------------------- | ------------- |
| DL-01–04 | Legado: isolar, apagar, docs e alvo de produção                           | **Decididas** |
| DL-05    | Quando apagar o legado isolado                                            | FL (fim)      |
| D-01     | Resolvida por `f9f84c9` (fatia 3 de RA25-07); resta confirmar os gates    | F0            |
| D-02     | Remover estado Gauntlet do versionamento (sem reescrever histórico)       | F0            |
| D-03     | Capacidades de plataforma liberadas para produção                         | F1 → todas    |
| D-04     | Primeiro produto consumidor, tenant piloto e níveis de serviço            | F1, F7        |
| D-05     | Provider de LLM (DPA, região, retenção, orçamento)                        | F5            |
| D-06     | Canal                                                                     | F5            |
| D-07     | Dono e processo de aprovação de fontes de conhecimento                    | F5            |
| D-08     | Provedor de nuvem, região (preferência Brasil) e orçamento                | F6            |
| D-09     | IdP corporativo (OIDC) e política de MFA                                  | F3            |
| D-10     | Encarregado de dados (DPO)                                                | F4, F7        |
| D-11     | Destino de `conversation`, `rag`, `channel-gateway` e Drizzle             | F2            |
| D-12     | Governança proporcional: gate por release em vez de por edição documental | F1 → todas    |
| D-13     | Fechamento ou reclassificação de M07-S1/C1M                               | F0/F1         |
| D-14     | Go/no-go do piloto                                                        | F7            |
| D-15     | Go/no-go da produção controlada e plano de expansão                       | F7            |

## 7. Governança proposta

- O pipeline `DISCOVERY -> PRD -> SPEC -> BUILD -> AUDIT` continua. Cada
  capacidade nova (provider, canal, conhecimento, IdP) precisa de PRD adendo
  e SPEC antes do BUILD.
- **Governança proporcional (D-12):** uma mudança documental fora do escopo
  (`0190_spec_validation.md`) derrubou o gate C1L. A proposta: gate
  hash-bound por **release candidate** e por **capacidade sensível**;
  refatorações sem efeito externo (incluindo as fatias FL) seguem SPEC curta +
  CI verde + revisão; baselines de gate excluem documentos que não são inputs
  daquele gate.
- Ledgers com rotação por ciclo (PR-005).
- Papéis mínimos: patrocinador (D-03/D-14/D-15), responsável técnico, DPO,
  dono do primeiro produto consumidor, segurança.

## 8. Riscos principais

| Risco                                                | Mitigação                                                                  |
| ---------------------------------------------------- | -------------------------------------------------------------------------- |
| Resíduo do legado confunde escopo e decisões         | Frente FL com inventário, isolamento, remoção e guarda de CI (PR-L01–L12)  |
| Remover o legado deixa a certificação sem fluxo real | Fluxo de referência neutro (PR-L07) antes de apagar o legado isolado       |
| Vazamento de dado pessoal para o provider de LLM     | Minimização antes do provider, DPA com retenção zero, teste negativo em CI |
| Resposta sem fonte                                   | Conhecimento só com fonte aprovada; handoff quando não houver fonte; evals |
| Efeito externo indevido                              | Rascunho + approval, teste negativo, kill switch (PR-507)                  |
| Prompt injection pelo canal                          | Red team em evals, policy antes de tool, capacidades mínimas               |
| Processo impede entrega                              | Governança proporcional (D-12), backlog priorizado                         |
| Certificação frágil (flakes, ambiente)               | Toolchain fixado, CI como fonte da certificação                            |
| Dependência de fornecedor (canal/LLM)                | Gateway neutro existente, circuit breaker, fallback para handoff           |

## 9. Indicadores de sucesso

- Técnicos: disponibilidade ≥ 99,5% em horário de operação; p95 de turno
  ≤ 8 s; 0 incidentes de dado pessoal; custo de LLM dentro do orçamento.
- Limpeza: 0 ocorrência de termos do legado fora de `legacy/` e do histórico
  de auditoria; 0 pacote sem consumidor.
- Plataforma: tempo para integrar um produto novo pelos contratos públicos;
  taxa de handoff; 0 efeitos externos sem approval.

Os valores numéricos são propostas para D-03/D-04 e só valem depois de
aprovados.

## 10. Primeiros 30 dias

1. Decidir D-02, D-12 e D-13 e confirmar os gates de `f9f84c9` (D-01).
2. Executar F0: Node 22, certificado reproduzível, estado Gauntlet fora do
   índice, rotação de ledgers.
3. Iniciar FL: inventário do legado (PR-L01), remoção dos pacotes mortos
   (PR-L02) e estrutura de `legacy/` com a regra de dependência (PR-L03).
4. Conduzir o discovery de plataforma para D-03 a D-10.

## 11. Estimativa

Com 2–3 engenheiros e decisões humanas em até uma semana cada: 24 a 32
semanas até o piloto (a frente FL acrescenta cerca de 4 semanas ao caminho
crítico) e mais 6 a 8 semanas até a produção controlada. É uma estimativa de
planejamento, sem medição de velocidade da equipe, e deve ser revista no fim
de F1.
