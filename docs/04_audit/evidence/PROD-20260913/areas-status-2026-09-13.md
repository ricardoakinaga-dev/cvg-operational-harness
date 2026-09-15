# Status das 20 áreas após o lote M1 — 2026-09-13

Este documento **não reemite notas numéricas** da auditoria [0560](../../0560_docs_implementation_audit_2026-09-13.md): notas exigem re-auditoria integral com a rubrica congelada. Ele registra, por área, o que foi corrigido/verificado neste lote (`PROD-20260913`) e o que permanece aberto.

| Área                              | Nota 0560 | Delta verificado no lote M1                                                            | Gaps remanescentes                                                      |
| --------------------------------- | --------: | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| A01 Arquitetura/composição        |        55 | PROD-01 corrigiu a alegação factual do brief (D13-03); contrato M1 congelado           | Composição runtime segue D01/AAA-06/AAA-21                              |
| A02 Manutenibilidade              |        60 | Transação única reduz duplicação de cleanup; contrato único para 4 correções           | server.ts ainda grande; extração AAA-29                                 |
| A03 Tipagem/validação             |        85 | `typecheck` PASS revalidado; novos contratos tipados (auditContext, probes)            | Sem mudança estrutural                                                  |
| A04 Contratos HTTP                |        80 | PROD-06: ator/correlação reais e body sem autoridade; PROD-02: atomicidade HTTP        | Contratos de jornadas completas (PROD-07..11)                           |
| A05 AuthN/AuthZ                   |        55 | Sem mudança (identidade confiável é AAA-20/D04)                                        | IdP real e rotação pendentes                                            |
| A06 Multitenant                   |        70 | PROD-05 valida papel/RLS real no worker; PROD-02 mantém escopo por tenant na transação | Composição worker/consumer AAA-19/21                                    |
| A07 Aprovação vinculada           |        65 | PROD-04 **bloqueada por D01**; nada alterado                                           | ApprovalStore durável (D13-05)                                          |
| A08 Policy/ações sensíveis        |        80 | Sem mudança                                                                            | Qualificação integrada                                                  |
| A09 Runtime/limites               |        70 | Sem mudança                                                                            | Composição e D01                                                        |
| A10 Assincronismo/recuperação     |        75 | atomicidade SQL fecha replay parcial; `test:postgres` inclui worker contínuo           | Sweeps/outbound compostos no entrypoint (AAA-19/21)                     |
| A11 Persistência/transações       |        60 | D13-01 **corrigido e verificado** (rollback, replay, concorrência, contexto)           | Migrações 0015+ só com PROD-04/D01                                      |
| A12 RAG/proveniência              |        55 | Sem mudança                                                                            | Fonte institucional (D04/AAA-25)                                        |
| A13 Integrações modelo/canal      |        45 | Sem mudança                                                                            | Homologação (D04/AAA-26/37)                                             |
| A14 Logs/métricas/readiness       |        45 | D13-04 **corrigido e verificado** (`/ready` real, 503; `/live` 200; probe limitado)    | OTel composto (AAA-23); probe de consumer depende de AAA-21             |
| A15 Testes/qualidade              |        75 | +14 testes SQL/HTTP/UI/probes; inventário `test:postgres` fecha 3 arquivos antes fora  | Mutação 100% e holdout ainda `NOT_RUN`                                  |
| A16 Avaliação de IA               |        35 | Sem mudança                                                                            | Eval do entrypoint/holdout (AAA-27)                                     |
| A17 Frontend/experiência          |        55 | D13-02 **corrigido e verificado** (corrida de tenant; unitário RED/GREEN + Chromium)   | D13-07: drafts, handoff completo, paginação (PROD-07/08/09)             |
| A18 Dependências/CI/empacotamento |        75 | `test:postgres` ampliado; `npm test`/typecheck/lint PASS nos bytes finais              | Docker `NOT_RUN` (socket sem permissão); Node 22 alvo não requalificado |
| A19 Documentação/certificação     |        55 | Brief corrigido; evidências e contrato rastreáveis por hash; rastreabilidade 64/64     | Certificado da árvore permanece histórico (AAA-13/14/15/35/36)          |
| A20 Prontidão operacional         |        20 | Sem mudança de escopo: nenhuma homologação, medição ou signoff                         | D03/D04/D05 e ambiente autorizado                                       |

## Leituras de segurança

- Nenhuma capacidade real foi criada: confirmação/cancelamento/reagendamento e efeitos externos seguem negados; dados sintéticos e bancos descartáveis.
- Nenhum P0/P1 aberto no lote M1 após a revalidação independente.
- O avanço de nota depende de fechar A07/A10/A14/A17/A20 (PROD-04, AAA-19/21/23, PROD-07..11) e dos gates humanos D01–D05.
