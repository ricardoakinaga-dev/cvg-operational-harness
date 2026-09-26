# Plano executivo — programa PROD-20260926 — produção controlada

- Status: `PROPOSED / WAITING_HUMAN_APPROVAL`. Este documento é planejamento;
  não autoriza BUILD, deploy, dado real, provider, canal ou ação sensível.
- Data: 26/09/2026. Programa: `PROD-20260926`.
- Baseline: [AUD-0577](../04_audit/0577_production_readiness_score_audit_2026-09-26.md)
  (68/100; prontidão para produção 25/100) e
  [AUD-0576](../04_audit/0576_repository_score_audit_2026-09-26.md) (69/100).
- Roadmap: [0355](0355_production_roadmap_2026-09-26.md). Backlog:
  [0356](0356_production_backlog_2026-09-26.md).
- Antecessores: [PROD-20260913](../PLANO_EXECUTIVO_PRODUCAO.md) (histórico),
  [RA26](0353_score_backlog_2026-09-26.md) e [RA25](0351_audit0573_backlog.md).
  Os itens RA26 ainda abertos são absorvidos pelo backlog 0356 com
  referência cruzada; nenhum ID antigo é renumerado.

## 1. Objetivo

Levar o CVG Operational Harness do estado atual (fundação controlada,
sintética, `NO_GO`) para **produção controlada**: um tenant piloto real,
com provider de modelo, canal e fontes institucionais aprovados, operadores
autenticados por IdP, dados tratados conforme a LGPD, operação observável e
suporte humano em horário definido. Depois do piloto, expandir por tenant
de forma gradual.

"Produção irrestrita" não é objetivo deste programa. A constituição em
[`07_agents/AGENTS.md`](../07_agents/AGENTS.md) continua valendo.

## 2. Definição de pronto para produção

O candidato só pode receber `GO` quando **todas** as condições abaixo
valerem para o mesmo digest de imagem e a mesma configuração:

1. Escopo funcional aprovado (PRD adendo de produção) rastreado a testes e
   evidências atuais.
2. Zero itens P0/P1 abertos em 0356.
3. Todos os gates de CI verdes, sem skips, com Node 22 e PostgreSQL ativos,
   e `certification:verify` reproduzível em execução limpa.
4. Operadores autenticados por IdP com MFA; RBAC por tenant verificado.
5. Segredos em cofre gerenciado com rotação testada; nenhum segredo em
   arquivo ou imagem.
6. RLS obrigatório no boot de produção; roles separadas de migração e
   aplicação.
7. RIPD aprovado, inventário de dados, retenção aplicada e fluxo de
   direitos do titular funcionando.
8. Backup com PITR, RPO/RTO definidos e restore exercitado em staging.
9. Telemetria exportada, dashboards, alertas e SLOs com dono; runbooks de
   incidente e on-call escalonado.
10. Pentest externo sem achado crítico/alto aberto.
11. Piloto concluído com critérios de saída atingidos.
12. Autorização humana registrada com hash do candidato e do escopo.

## 3. Não-objetivos permanentes

Estes limites valem inclusive depois do `GO`:

- Não confirmar, cancelar ou reagendar consulta real automaticamente;
  qualquer alteração de agenda exige approval humano.
- Não executar ação clínica, financeira ou de prontuário definitivo.
- Não responder com RAG sem fonte institucional aprovada e versionada.
- Toda ação sensível exige approval ou handoff.

## 4. Estratégia em sete fases

| Fase | Nome                          | Resultado                                                                        |
| ---- | ----------------------------- | -------------------------------------------------------------------------------- |
| F0   | Base verificável e higiene    | Certificado reproduzível, worktree limpo, repositório leve, ledgers rotacionados |
| F1   | Decisões de produto e escopo  | PRD adendo de produção, fornecedores escolhidos, governança proporcional         |
| F2   | Fundação de engenharia        | Hotspots decompostos, config única, dependências limpas                          |
| F3   | Segurança e identidade        | IdP/OIDC + MFA, cofre de segredos, edge endurecido, supply chain assinado        |
| F4   | Dados, privacidade e LGPD     | RIPD, retenção, direitos do titular, RLS obrigatório, PITR                       |
| F5   | Integrações reais controladas | Provider LLM, canal, RAG institucional, agenda somente leitura, kill switch      |
| F6   | Infraestrutura e operação     | IaC, CD por digest, observabilidade de produção, runbooks, on-call               |
| F7   | Homologação, piloto e GA      | UAT, auditoria independente, piloto, go/no-go e expansão gradual                 |

F3, F4 e F6 correm em paralelo a F2 depois de F1. F5 depende de F1, F3 e F4.
F7 depende de todas. O detalhamento está no [roadmap 0355](0355_production_roadmap_2026-09-26.md).

## 5. Decisões humanas necessárias

Nenhuma destas decisões pode ser assumida por agente. Cada uma deve ser
registrada com data, responsável e hash do documento decidido.

| ID   | Decisão                                                                   | Bloqueia   |
| ---- | ------------------------------------------------------------------------- | ---------- |
| D-01 | Resolvida por `f9f84c9` (fatia 3 de RA25-07); resta confirmar os gates    | F0         |
| D-02 | Remover estado Gauntlet do versionamento (sem reescrever histórico)       | F0         |
| D-03 | Escopo do MVP de produção e casos de uso liberados                        | F1 → todas |
| D-04 | Tenant piloto, volume esperado, horário de cobertura humana e SLA         | F1, F7     |
| D-05 | Provider de LLM (DPA, região, retenção, orçamento)                        | F5         |
| D-06 | Canal (WhatsApp Business API oficial, Evolution ou Chatwoot)              | F5         |
| D-07 | Dono e processo de aprovação das fontes institucionais de RAG             | F5         |
| D-08 | Provedor de nuvem, região (preferência Brasil) e orçamento                | F6         |
| D-09 | IdP corporativo (OIDC) e política de MFA                                  | F3         |
| D-10 | Encarregado de dados (DPO) e aprovação do RIPD                            | F4, F7     |
| D-11 | Destino de pacotes órfãos, Drizzle, RAG e canal (RA26-09/10/12/13)        | F2         |
| D-12 | Governança proporcional: gate por release em vez de por edição documental | F1 → todas |
| D-13 | Fechamento ou reclassificação de M07-S1/C1M                               | F0/F1      |
| D-14 | Go/no-go do piloto                                                        | F7         |
| D-15 | Go/no-go da produção controlada e plano de expansão                       | F7         |

## 6. Governança proposta

- O pipeline `DISCOVERY -> PRD -> SPEC -> BUILD -> AUDIT` continua. Cada
  capacidade nova (provider, canal, RAG, agenda, IdP) precisa de PRD adendo
  e SPEC antes do BUILD.
- **Governança proporcional (D-12):** o custo de processo virou gargalo. Uma
  mudança documental fora do escopo (`0190_spec_validation.md`) derrubou o
  gate C1L. A proposta é: gate hash-bound por **release candidate** e por
  **capacidade sensível**; mudanças de código sem efeito externo seguem
  SPEC curta + CI verde + revisão; baselines de gate excluem documentos que
  não são inputs daquele gate.
- Ledgers com rotação por ciclo (PR-005): o estado vigente fica em um
  arquivo curto e os ciclos encerrados vão para `docs/08_runtime/archive/`.
- Papéis mínimos: patrocinador (decide D-03/D-14/D-15), responsável técnico,
  DPO, operação clínica (dona do handoff), segurança.

## 7. Riscos principais

| Risco                                             | Mitigação                                                                       |
| ------------------------------------------------- | ------------------------------------------------------------------------------- |
| Vazamento de dado de saúde para o provider de LLM | Redação antes do provider, DPA com retenção zero, teste negativo em CI (PR-403) |
| Alucinação ou resposta sem fonte                  | RAG só com fonte aprovada, handoff quando não houver fonte, evals de regressão  |
| Ação indevida na agenda                           | Somente leitura + rascunho com approval; teste negativo; kill switch (PR-506)   |
| Prompt injection pelo canal                       | Red team em evals, policy antes de tool, capacidades mínimas                    |
| Processo impede entrega                           | Governança proporcional (D-12), backlog priorizado                              |
| Certificação frágil (flakes, ambiente)            | Toolchain fixado, CI como fonte da certificação, não máquina local              |
| Dependência de fornecedor (canal/LLM)             | Gateway neutro existente, circuit breaker, fallback para handoff                |
| Equipe pequena                                    | Escopo mínimo do MVP, fases paralelas só onde não há dependência                |

## 8. Indicadores de sucesso

- Técnicos: disponibilidade ≥ 99,5% em horário comercial; p95 de resposta
  ≤ 8 s por turno; 0 incidentes de dado sensível; custo de LLM dentro do
  orçamento aprovado.
- Operacionais: taxa de handoff, tempo até atendimento humano, taxa de
  resolução sem handoff nas intenções liberadas, satisfação do operador.
- Qualidade: evals ≥ barra definida na SPEC do provider; 0 respostas sem
  fonte em domínio institucional; 0 alterações de agenda sem approval.

Os valores numéricos são propostas para D-03/D-04 e só valem depois de
aprovados.

## 9. Primeiros 30 dias

1. Decidir D-02, D-12 e D-13 e confirmar os gates de `f9f84c9` (D-01).
2. Executar F0 inteira: worktree, Node 22, certificado reproduzível,
   remoção do estado Gauntlet do índice, rotação de ledgers.
3. Conduzir o discovery de produção para D-03 a D-10 e escrever o PRD adendo.
4. Abrir as SPECs de F3 (IdP, segredos) e F4 (RIPD, RLS obrigatório).

## 10. Estimativa

Com uma equipe de 2–3 engenheiros, 1 responsável de produto/DPO em tempo
parcial e decisões humanas em até uma semana cada, a estimativa é de 20 a
28 semanas até o piloto e mais 6 a 8 semanas até a produção controlada.
É uma estimativa de planejamento, sem medição de velocidade da equipe, e
deve ser revista no fim de F1.
