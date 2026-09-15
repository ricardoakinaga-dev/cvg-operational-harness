# 0326 — Backlog executável do programa AAA

Fonte canônica de IDs, status, dependências e contratos: [aaa_program_backlog.json](tracking/aaa_program_backlog.json). Esta visualização foi gerada a partir do JSON em 2026-09-12; atualizar o JSON primeiro e regenerar o índice para evitar duas fontes de status.

**42 tasks no programa; status corrente no JSON e no ledger vivo.** Consultar [rodada 2](0327_aaa_round2_coordination.md): AAA-01 VERIFIED apenas no baseline histórico; reviews e implementações observadas não concedem gates de BUILD. A equipe vigente tem três agentes, com revisão alternada. O baseline original de quatro slots permanece histórico.

## Contrato comum de execução

Cada entrada JSON especifica objetivo, onde, como, dependências, área/achado de origem, papel, ownership, locks, aceite, validação e destino de evidência. Paths propostos devem ser confirmados antes de congelar a SPEC; um diretório amplo não autoriza escrita concorrente. Gate da task é adicional ao gate de SPEC/revisão humana e autorização de BUILD.

Estados por task: `PENDING → READY → RUNNING → IMPLEMENTED → REVIEW → VERIFIED → DONE`; `REWORK`, `BLOCKED` e `FAILED` preservam tentativas. Estado operacional global continua seguindo os cinco estados oficiais do AGENTS. Builders só entregam `IMPLEMENTED`; crítico e integrador comprovam os demais.

Estimativas são classes de esforço provisórias, não prazo prometido. Limite inicial: duas tentativas corretivas por hipótese; depois replanejar com nova evidência, sem diminuir a barra. Todo writer reserva paths reais, schema/porta/banco/artefatos e lockfile antes de começar.

## Matriz de cobertura das 20 dimensões

| Área                             | Baseline | Alvo | Tasks                                                                                                  |
| -------------------------------- | -------: | ---: | ------------------------------------------------------------------------------------------------------ |
| A01 — Arquitetura                |       70 |   97 | AAA-02, AAA-06, AAA-21, AAA-29, AAA-36, AAA-40, AAA-41                                                 |
| A02 — Manutenibilidade           |       65 |   97 | AAA-06, AAA-15, AAA-29, AAA-41                                                                         |
| A03 — Tipagem                    |       90 |   97 | AAA-30, AAA-34, AAA-41                                                                                 |
| A04 — Contratos HTTP             |       85 |   97 | AAA-05, AAA-18, AAA-30, AAA-34, AAA-41                                                                 |
| A05 — Autenticação/autorização   |       70 |   97 | AAA-02, AAA-06, AAA-20, AAA-28, AAA-33, AAA-37, AAA-41                                                 |
| A06 — Multitenancy               |       78 |   97 | AAA-05, AAA-16, AAA-17, AAA-24, AAA-30, AAA-33, AAA-41                                                 |
| A07 — Aprovações                 |       40 |   97 | AAA-03, AAA-07, AAA-09, AAA-33, AAA-41                                                                 |
| A08 — Policy                     |       65 |   97 | AAA-02, AAA-03, AAA-08, AAA-25, AAA-27, AAA-33, AAA-41                                                 |
| A09 — Runtime agente             |       45 |   97 | AAA-03, AAA-09, AAA-10, AAA-11, AAA-21, AAA-27, AAA-40, AAA-41                                         |
| A10 — Assincronismo/idempotência |       45 |   97 | AAA-03, AAA-10, AAA-12, AAA-19, AAA-31, AAA-36, AAA-41                                                 |
| A11 — Persistência               |       75 |   97 | AAA-05, AAA-10, AAA-16, AAA-17, AAA-18, AAA-24, AAA-32, AAA-41                                         |
| A12 — RAG                        |       50 |   97 | AAA-06, AAA-25, AAA-33, AAA-37, AAA-41                                                                 |
| A13 — Integrações                |       45 |   97 | AAA-06, AAA-12, AAA-21, AAA-26, AAA-37, AAA-41                                                         |
| A14 — Observabilidade            |       40 |   97 | AAA-05, AAA-22, AAA-23, AAA-24, AAA-31, AAA-41                                                         |
| A15 — Testes                     |       78 |   97 | AAA-01, AAA-04, AAA-16, AAA-34, AAA-36, AAA-41                                                         |
| A16 — Evals                      |       45 |   97 | AAA-04, AAA-27, AAA-34, AAA-40, AAA-41                                                                 |
| A17 — Frontend                   |       78 |   97 | AAA-06, AAA-18, AAA-28, AAA-39, AAA-41                                                                 |
| A18 — Supply chain               |       70 |   97 | AAA-04, AAA-14, AAA-15, AAA-20, AAA-33, AAA-41                                                         |
| A19 — Governança/evidência       |       55 |   97 | AAA-01, AAA-04, AAA-13, AAA-24, AAA-35, AAA-36, AAA-38, AAA-41, AAA-42                                 |
| A20 — Produção                   |       20 |   97 | AAA-02, AAA-04, AAA-19, AAA-22, AAA-31, AAA-32, AAA-36, AAA-37, AAA-38, AAA-39, AAA-40, AAA-41, AAA-42 |

## Tasks detalhadas

### AAA-01 — Revalidar candidato, gates e reproduções

- Fase/sprint: `P0/S0`. Papel: `quality`. Prioridade: `P1`.
- Origem: A15, A19, AUD-20260912-F11, AUD-20260912-F13, AUD-20260912-F14.
- Dependências: nenhuma task; ler baseline e instruções. Gate adicional: `G_PLAN`.
- Onde: `docs/04_audit/evidence/AAA/AAA-01/`.
- Como: Inventariar working tree sem descartar mudanças; executar sete reproduções e gates disponíveis; registrar lacunas e hashes antes de atribuir tarefas.
- Aceite: Candidato identificado por fontes/configuração/lockfile; todas as 15 findings classificadas como abertas ou revalidadas com prova; skips não são PASS.
- Verificação: git status --short; git diff --check; node --import tsx docs/04_audit/evidence/AUD-20260912-001/reproduce.mjs; npm run typecheck; npm run lint; npm run format:check.
- Evidência esperada: `docs/04_audit/evidence/AAA/AAA-01/manifest.json`.
- Locks: quality. Contrato proposto: `C-P0-v1; freeze exact artifact/hash in SPEC before BUILD`; congelar SPEC/hash antes da execução.

### AAA-02 — Preparar decisões de produto, RF-011 e fronteiras humanas

- Fase/sprint: `P0/S0`. Papel: `product`. Prioridade: `P1`.
- Origem: A01, A05, A08, A20, AUD-20260912-F08, AUD-20260912-F15, REM-02, RF-011, P10-B08.
- Dependências: AAA-01. Gate adicional: `G_PLAN`.
- Onde: `docs/01_prd/aaa_decision_brief.md`.
- Como: Separar correções de invariantes de decisões sobre LangGraph, efeitos reais, identidade, fontes e objetivos operacionais; apresentar alternativas e recomendação sem fabricar aprovação.
- Aceite: D01–D05 documentadas com autoridade, opções, impacto e estado; tarefas locais independentes continuam; nenhuma integração real liberada.
- Verificação: Revisão humana das decisões materiais; registrar decisão ou PENDING explicitamente.
- Evidência esperada: `docs/04_audit/evidence/AAA/AAA-02/manifest.json`.
- Locks: product. Contrato proposto: `C-P0-v1; freeze exact artifact/hash in SPEC before BUILD`; congelar SPEC/hash antes da execução.

### AAA-03 — Especificar proposta aprovada, execução durável e capabilities

- Fase/sprint: `P0/S0`. Papel: `contracts`. Prioridade: `P1`.
- Origem: A07, A08, A09, A10, AUD-20260912-F01, AUD-20260912-F02, AUD-20260912-F03, AUD-20260912-F04, AUD-20260912-F05, AUD-20260912-F15.
- Dependências: AAA-01. Gate adicional: `G_PLAN`.
- Onde: `docs/02_spec/aaa_execution_contract.md`.
- Como: Definir payload final imutável; reserva/consumo/resultado incerto; idempotência por tenant; tool intent, outbox, retry e limites; comparar solução local mínima com alternativas.
- Aceite: Máquinas de estados e matriz crash/falha/retry explícitas; nenhum efeito externo antes de autorização; contrato revisado e hash congelado para builders.
- Verificação: Revisão adversarial do contrato com os sete casos da auditoria.
- Evidência esperada: `docs/04_audit/evidence/AAA/AAA-03/manifest.json`.
- Locks: contracts. Contrato proposto: `C-P0-v1; freeze exact artifact/hash in SPEC before BUILD`; congelar SPEC/hash antes da execução.

### AAA-04 — Especificar barra de qualidade e vínculo da certificação

- Fase/sprint: `P0/S0`. Papel: `quality`. Prioridade: `P1`.
- Origem: A15, A16, A18, A19, A20, AUD-20260912-F11, AUD-20260912-F12, AUD-20260912-F14.
- Dependências: AAA-01. Gate adicional: `G_PLAN`.
- Onde: `docs/02_spec/aaa_quality_contract.md`.
- Como: Congelar rubric A01–A20, manifesto de fontes/configuração, evidências por candidato, orçamento de regressão e regras NOT_RUN/BLOCKED; tornar gates capazes de rejeitar candidato alterado. Antes de qualquer holdout, congelar protocolo comparativo: alternativas elegíveis, dataset split, métricas, hardware/custo, critérios de sucesso e registro dos hashes; alterações posteriores invalidam comparação e exigem novo holdout independente.
- Aceite: Critérios do plano executivo rastreáveis; tolerâncias, amostras e comando executor definidos; mudanças de barra preservam histórico e exigem revisão. Protocolo de benchmark e partição cega do dataset congelados antes de AAA-27; runner não acessa holdout durante tuning.
- Verificação: Desafio documental: fonte alterada, skip e evidência antiga devem impedir veredicto atual.
- Evidência esperada: `docs/04_audit/evidence/AAA/AAA-04/manifest.json`.
- Locks: quality. Contrato proposto: `C-P0-v1; freeze exact artifact/hash in SPEC before BUILD`; congelar SPEC/hash antes da execução.

### AAA-05 — Especificar dados, migrações, APIs e fronteiras de ownership

- Fase/sprint: `P0/S0`. Papel: `contracts`. Prioridade: `P1`.
- Origem: A04, A06, A11, A14, AUD-20260912-F03, AUD-20260912-F04, AUD-20260912-F06, AUD-20260912-F09.
- Dependências: AAA-01, AAA-03. Gate adicional: `G_PLAN`.
- Onde: `docs/02_spec/aaa_data_api_contract.md`.
- Como: Congelar schema, rotas/erros/eventos, CAS/leases e migração das jornadas; reservar sequência SQL; definir contexto tenant, rollback e contratos de probes/exporters.
- Aceite: Migration owner único; papéis runtime/migration e versão de contrato fixados; nenhuma troca silenciosa de API; plano de recuperação testável.
- Verificação: Walkthrough de corrida multiconexão, tenant incorreto e migration interrompida.
- Evidência esperada: `docs/04_audit/evidence/AAA/AAA-05/manifest.json`.
- Locks: contracts. Contrato proposto: `C-P0-v1; freeze exact artifact/hash in SPEC before BUILD`; congelar SPEC/hash antes da execução.

### AAA-06 — Especificar composição, produto e evolução do runtime

- Fase/sprint: `P0/S0`. Papel: `contracts`. Prioridade: `P1`.
- Origem: A01, A02, A05, A12, A13, A17, AUD-20260912-F07, AUD-20260912-F08, AUD-20260912-F10, AUD-20260912-F15.
- Dependências: AAA-02, AAA-03, AAA-05. Gate adicional: `G_D01`.
- Onde: `docs/02_spec/aaa_composition_contract.md`.
- Como: Selecionar runtime conforme decisão RF-011, definir adapters de identidade/modelo/canal/RAG e contratos UI; isolar modo controlado e fronteiras reais; preservar cadeia Evolution→Gateway→Connect Desk→Secretary sem Chatwoot obrigatório.
- Aceite: D01 resolvida para migração arquitetural; contratos de consumidor, redaction e rollout por capacidade registrados; source institucional fictícia claramente sintética.
- Verificação: Revisão de rastreabilidade PRD/SPEC/entrypoints; gate humano para desvio de RF-011.
- Evidência esperada: `docs/04_audit/evidence/AAA/AAA-06/manifest.json`.
- Locks: contracts. Contrato proposto: `C-P0-v1; freeze exact artifact/hash in SPEC before BUILD`; congelar SPEC/hash antes da execução.

### AAA-07 — Implementar lifecycle de approval com reserva e recuperação

- Fase/sprint: `P1/S1`. Papel: `approval`. Prioridade: `P1`.
- Origem: A07, AUD-20260912-F02.
- Dependências: AAA-03, AAA-05, AAA-04. Gate adicional: `G_SPEC`.
- Onde: `packages/approval-engine/`.
- Como: Implementar estados e CAS do contrato aprovado; falhas anteriores ao efeito não marcam EXECUTED; consumo definitivo vinculado ao resultado e política de reconciliação.
- Aceite: Falha de modelo/tool/outbox não produz sucesso fictício; replay não duplica consumo; expiração e troca de tenant rejeitadas.
- Verificação: Testes de máquina de estados, concorrência, expiração e recuperação.
- Evidência esperada: `docs/04_audit/evidence/AAA/AAA-07/manifest.json`.
- Locks: approval. Contrato proposto: `C-P1-v1; freeze exact artifact/hash in SPEC before BUILD`; congelar SPEC/hash antes da execução.

### AAA-08 — Separar draft, confirmação e alteração sensível na policy

- Fase/sprint: `P1/S1`. Papel: `policy`. Prioridade: `P1`.
- Origem: A08, AUD-20260912-F15.
- Dependências: AAA-03, AAA-04. Gate adicional: `G_SPEC`.
- Onde: `packages/policy-engine/`; `packages/policy/`.
- Como: Separar capabilities e grants; manter ações reais negadas no perfil atual; remover ambiguidade draft/confirmation; revisar limites clínicos sem depender só de regex.
- Aceite: Toda combinação de perfil/role/action sensível tem decisão explícita; missing context nega; fixture modify real não obtém ALLOW silencioso.
- Verificação: Matriz positiva/negativa de capabilities, tenant, classificação e ação.
- Evidência esperada: `docs/04_audit/evidence/AAA/AAA-08/manifest.json`.
- Locks: policy. Contrato proposto: `C-P1-v1; freeze exact artifact/hash in SPEC before BUILD`; congelar SPEC/hash antes da execução.

### AAA-09 — Vincular ferramenta ao payload final aprovado

- Fase/sprint: `P1/S1`. Papel: `runtime`. Prioridade: `P1`.
- Origem: A07, A09, AUD-20260912-F01, AUD-20260912-F02.
- Dependências: AAA-07, AAA-08, AAA-04. Gate adicional: `G_SPEC`.
- Onde: `packages/agent-runtime/src/runtime.ts`; `packages/agent-runtime/src/contracts.ts`; `packages/agent-runtime/src/__tests__/`.
- Como: Gerar proposta validada, persistir hash/versões, aprovar e executar exatamente essa proposta; remover geração livre entre approval e efeito.
- Aceite: Reprodução F01 rejeita payload diferente antes de tool; F02 conserva estado correto; versão/policy alterada invalida autorização antiga. AAA-03 §10/T-19: fail closed for undeclared or unauthorized real effectScope; AAA-08 action binding does not prove adapter authorization.
- Verificação: Reprodução F01/F02 convertida em regressões negativas no runtime.
- Evidência esperada: `docs/04_audit/evidence/AAA/AAA-09/manifest.json`.
- Locks: runtime. Contrato proposto: `C-P1-v1; freeze exact artifact/hash in SPEC before BUILD`; congelar SPEC/hash antes da execução.

### AAA-10 — Proteger efeito com intenção durável e idempotência

- Fase/sprint: `P1/S1`. Papel: `runtime`. Prioridade: `P1`.
- Origem: A09, A10, A11, AUD-20260912-F03.
- Dependências: AAA-09, AAA-05, AAA-16, AAA-04. Gate adicional: `G_SPEC`.
- Onde: `packages/agent-runtime/`; `packages/persistence/src/outbox.ts`; `packages/persistence/src/postgres.ts`.
- Como: Compor intenção durável, execução e journal segundo SPEC; não tratar outbox posterior como proteção do efeito anterior; registrar resultado incerto.
- Aceite: Mesma chave em retry/concor­rência produz no máximo um efeito confirmado; crash após efeito e antes do ack recuperável sem sucesso inventado.
- Verificação: Testes de crash em cada fronteira e duas conexões PostgreSQL; repetir F03.
- Evidência esperada: `docs/04_audit/evidence/AAA/AAA-10/manifest.json`.
- Locks: runtime. Contrato proposto: `C-P1-v1; freeze exact artifact/hash in SPEC before BUILD`; congelar SPEC/hash antes da execução.

### AAA-11 — Aplicar orçamento de etapas, custo e deadline global

- Fase/sprint: `P1/S1`. Papel: `runtime`. Prioridade: `P2`.
- Origem: A09, AUD-20260912-F05.
- Dependências: AAA-10, AAA-04. Gate adicional: `G_SPEC`.
- Onde: `packages/agent-runtime/`; `packages/model-gateway/src/`.
- Como: Bloquear antes de etapa além do limite; propagar deadline/cancelamento; especificar comportamento de dependência que ignora AbortSignal e interromper efeitos subsequentes.
- Aceite: maxSteps=1 impede etapas extras; timeout encerra turno com estado honesto; nenhum tool após budget; spans fechados em erro.
- Verificação: Reprodução F05 e relógio controlado/depêndencia lenta; custo e cancelamento.
- Evidência esperada: `docs/04_audit/evidence/AAA/AAA-11/manifest.json`.
- Locks: runtime. Contrato proposto: `C-P1-v1; freeze exact artifact/hash in SPEC before BUILD`; congelar SPEC/hash antes da execução.

### AAA-12 — Eliminar corrida de envio e persistir journal do canal

- Fase/sprint: `P1/S1`. Papel: `channel`. Prioridade: `P1`.
- Origem: A10, A13, AUD-20260912-F04.
- Dependências: AAA-03, AAA-05, AAA-16, AAA-04. Gate adicional: `G_SPEC`.
- Onde: `packages/channel-gateway/`.
- Como: Reservar operação atomicamente via porta durável; tenant/canal/chave compõem identidade; recuperar envio de resultado incerto; não prometer exactly-once onde provider não suporta idempotência.
- Aceite: Promise.all da reprodução gera um envio; duas instâncias/restart preservam resultado; reuse de chave com payload diferente é rejeitado.
- Verificação: F04 concorrente, restart e adapter com falha antes/depois do efeito.
- Evidência esperada: `docs/04_audit/evidence/AAA/AAA-12/manifest.json`.
- Locks: channel. Contrato proposto: `C-P1-v1; freeze exact artifact/hash in SPEC before BUILD`; congelar SPEC/hash antes da execução.

### AAA-13 — Vincular certificado ao candidato executado

- Fase/sprint: `P1/S1`. Papel: `release`. Prioridade: `P1`.
- Origem: A19, AUD-20260912-F11.
- Dependências: AAA-04. Gate adicional: `G_SPEC`.
- Onde: `scripts/phase10-certify.mjs`; `scripts/phase10-verify.mjs`; `scripts/lib/certification-rules.mjs`; `certification/`.
- Como: Manifestar fontes/configuração/lockfile e checks; registrar scope e freshness; diferenciar verificador histórico e gate atual; manter origem de achados e evidência negativa.
- Aceite: Alterar source/lockfile invalida certificado; logs adulterados e skips obrigatórios rejeitados; clean e dirty candidate identificados sem exigir descarte do trabalho do usuário.
- Verificação: Testes negativos de manifesto, código alterado, output forjado e gates parciais.
- Evidência esperada: `docs/04_audit/evidence/AAA/AAA-13/manifest.json`.
- Locks: release. Contrato proposto: `C-P1-v1; freeze exact artifact/hash in SPEC before BUILD`; congelar SPEC/hash antes da execução.

### AAA-14 — Atualizar dependências e reduzir imagem com inventário confiável

- Fase/sprint: `P1/S1`. Papel: `integration`. Prioridade: `P2`.
- Origem: A18, AUD-20260912-F12.
- Dependências: AAA-04. Gate adicional: `G_SPEC`.
- Onde: `package.json`; `package-lock.json`; `Dockerfile`; `.github/workflows/`; `scripts/check-licenses.mjs`; `scripts/generate-sbom.mjs`.
- Como: Atualizar tooling vulnerável compatível, mapear 21 licenças desconhecidas, definir exceções por autoridade e reduzir runtime image; fixar/runtime Node e build reproduzível.
- Aceite: Audit sem high/critical; moderadas corrigidas ou exceção explícita com prazo; nenhuma licença desconhecida sem classificação; npm ci/build em Node alvo e imagem não-root passam.
- Verificação: npm ci --ignore-scripts; npm run audit:security; npm run licenses:check; npm run sbom; Docker build e smoke isolados.
- Evidência esperada: `docs/04_audit/evidence/AAA/AAA-14/manifest.json`.
- Locks: repo-integration. Contrato proposto: `C-P1-v1; freeze exact artifact/hash in SPEC before BUILD`; congelar SPEC/hash antes da execução.

### AAA-15 — Restaurar gate de formatação preservando alterações existentes

- Fase/sprint: `P1/S1`. Papel: `integration`. Prioridade: `P2`.
- Origem: A02, A18, AUD-20260912-F13.
- Dependências: AAA-01, AAA-04. Gate adicional: `G_SPEC`.
- Onde: `apps/api/src/server.ts`.
- Como: Aplicar somente formatação do candidato atual sob lock do integrador; não misturar refatoração ou apagar mudanças preexistentes.
- Aceite: format:check verde; diff sem alteração semântica; teste focado da API preservado.
- Verificação: npm run format:check; git diff --check; npm run typecheck.
- Evidência esperada: `docs/04_audit/evidence/AAA/AAA-15/manifest.json`.
- Locks: api-composition, repo-integration. Contrato proposto: `C-P1-v1; freeze exact artifact/hash in SPEC before BUILD`; congelar SPEC/hash antes da execução.

### AAA-16 — Disponibilizar PostgreSQL descartável e fechar gate sem skips

- Fase/sprint: `P1/S1`. Papel: `data`. Prioridade: `P2`.
- Origem: A06, A11, A15, AUD-20260912-F14, P10-B01.
- Dependências: AAA-05, AAA-14, AAA-04. Gate adicional: `G_SPEC`.
- Onde: `packages/persistence/src/__tests__/`; `packages/chaos/src/__tests__/chaos-postgres.test.ts`; `.github/workflows/verify.yml`.
- Como: Criar fixture isolada com papéis runtime/migration distintos e cleanup; provar RLS, migrations, corrida, replay e chaos no banco; nunca usar DATABASE_URL operacional.
- Aceite: npm run test:postgres executa todos os casos obrigatórios sem skip; perda de contexto e role bypass falham fechado; evidência de duas conexões e rollback.
- Verificação: TEST_DATABASE_URL isolada npm run test:postgres.
- Evidência esperada: `docs/04_audit/evidence/AAA/AAA-16/manifest.json`.
- Locks: data. Contrato proposto: `C-P1-v1; freeze exact artifact/hash in SPEC before BUILD`; congelar SPEC/hash antes da execução.

### AAA-17 — Implementar persistência PostgreSQL das jornadas

- Fase/sprint: `P2/S2`. Papel: `data`. Prioridade: `P2`.
- Origem: A06, A11, AUD-20260912-F09.
- Dependências: AAA-16, AAA-05, AAA-04. Gate adicional: `G_SPEC`.
- Onde: `packages/persistence/src/journeys.ts`; `packages/persistence/src/schema.ts`; `packages/persistence/src/index.ts`; `packages/persistence/migrations/`.
- Como: Criar repositório tenant-scoped para tutor/paciente/slots/drafts conforme contrato; migração aditiva e expiração sem apagamento de evidência.
- Aceite: Paridade com memória, restart, expiração, cross-tenant e idempotência; nenhum estado confirmed real; migration/rollback testados.
- Verificação: Testes de contrato compartilhados memória/PostgreSQL e migração anterior→nova.
- Evidência esperada: `docs/04_audit/evidence/AAA/AAA-17/manifest.json`.
- Locks: data, migration-sequence. Contrato proposto: `C-P2-v1; freeze exact artifact/hash in SPEC before BUILD`; congelar SPEC/hash antes da execução.

### AAA-18 — Conectar jornadas PostgreSQL às rotas públicas

- Fase/sprint: `P2/S2`. Papel: `integration`. Prioridade: `P2`.
- Origem: A04, A11, A17, AUD-20260912-F09.
- Dependências: AAA-17, AAA-15, AAA-04. Gate adicional: `G_SPEC`.
- Onde: `apps/api/src/server.ts`; `apps/api/src/__tests__/journeys-api.test.ts`; `apps/api/src/__tests__/postgres-persistence-mode.test.ts`.
- Como: Trocar journeys:null por porta concreta no factory; preservar auth/tenant/erros e public API; validar leituras após restart.
- Aceite: Rotas owner/patient/slots/drafts funcionam via HTTP no banco; isolamento e approval permanecem; sem cast que esconda ausência de adapter.
- Verificação: HTTP integration em PostgreSQL e regressões de jornadas.
- Evidência esperada: `docs/04_audit/evidence/AAA/AAA-18/manifest.json`.
- Locks: api-composition, repo-integration. Contrato proposto: `C-P2-v1; freeze exact artifact/hash in SPEC before BUILD`; congelar SPEC/hash antes da execução.

### AAA-19 — Entregar consumer contínuo e shutdown recuperável

- Fase/sprint: `P2/S2`. Papel: `worker`. Prioridade: `P1`.
- Origem: A10, A20, AUD-20260912-F10.
- Dependências: AAA-10, AAA-12, AAA-16, AAA-06, AAA-04. Gate adicional: `G_SPEC`.
- Onde: `apps/worker/`.
- Como: Introduzir loop supervisionado com backoff, lease/heartbeat, limite de concorrência, dead-letter e shutdown; não habilitar produção sem gate; handlers concretos sintéticos.
- Aceite: Eventos antes/depois de restart consumidos; SIGTERM não perde efeito; poison event não bloqueia fila; startup sem configuração falha; queue lag observável.
- Verificação: npm run test:worker:startup; Integração consumer contínuo PostgreSQL e falhas de lease.
- Evidência esperada: `docs/04_audit/evidence/AAA/AAA-19/manifest.json`.
- Locks: worker, worker-runtime. Contrato proposto: `C-P2-v1; freeze exact artifact/hash in SPEC before BUILD`; congelar SPEC/hash antes da execução.

### AAA-20 — Compor identidade confiável e rotação de credenciais

- Fase/sprint: `P2/S2`. Papel: `integration`. Prioridade: `P1`.
- Origem: A05, A18, AUD-20260912-F08, P10-B10.
- Dependências: AAA-06, AAA-14, AAA-15, AAA-04. Gate adicional: `G_SPEC`.
- Onde: `apps/api/src/main.ts`; `apps/api/src/operator-identity.ts`; `apps/api/src/server.ts`; `packages/shared/src/auth.ts`.
- Como: Injetar resolver na composição, separar claims confiáveis de headers de simulação, validar audience/expiração/replay; criar contrato de rotação sem usar segredo real.
- Aceite: Spoofed role/tenant rejeitados; identidade inválida nunca cai para modo fake; rotação current/previous com revogação e janela bounded; sessão UI compatível.
- Verificação: Matriz HTTP RBAC, token expirado/forjado, replay, tenant e rotação.
- Evidência esperada: `docs/04_audit/evidence/AAA/AAA-20/manifest.json`.
- Locks: api-composition, repo-integration. Contrato proposto: `C-P2-v1; freeze exact artifact/hash in SPEC before BUILD`; congelar SPEC/hash antes da execução.

### AAA-21 — Integrar runtime aprovado ao caminho API→worker

- Fase/sprint: `P2/S2`. Papel: `integration`. Prioridade: `P1`.
- Origem: A01, A09, A13, AUD-20260912-F08, P10-B02.
- Dependências: AAA-06, AAA-11, AAA-12, AAA-16, AAA-18, AAA-19, AAA-20, AAA-04. Gate adicional: `G_D01_SPEC`.
- Onde: `apps/api/src/main.ts`; `apps/api/src/server.ts`; `apps/worker/src/`; `packages/agent-core/src/`.
- Como: Migrar verticalmente conforme decisão de arquitetura; preservar pinning, takeover e aprovação legada; remover caminhos paralelos somente após equivalência demonstrada.
- Aceite: Mensagem HTTP sintética percorre runtime escolhido, worker/tool/outbox; prova por trace e efeito; nenhuma regressão dos controles legados; modelo fake explícito. AAA12-R3-F02: composição não-teste injeta journal durável explicitamente; envio automático falha fechado sem configuração. Provar restart/replay sem novo efeito; arquivo cobre somente host-local até adapter SQL. Não fechar o finding só por documentar.
- Verificação: E2E API→PostgreSQL→worker→tool falso e replay/handoff.
- Evidência esperada: `docs/04_audit/evidence/AAA/AAA-21/manifest.json`.
- Locks: api-composition, repo-integration, worker-runtime. Contrato proposto: `C-P2-v1; freeze exact artifact/hash in SPEC before BUILD`; congelar SPEC/hash antes da execução.

### AAA-22 — Implementar readiness com probes reais e limitados

- Fase/sprint: `P2/S2`. Papel: `integration`. Prioridade: `P1`.
- Origem: A14, A20, AUD-20260912-F06.
- Dependências: AAA-21, AAA-04. Gate adicional: `G_SPEC`.
- Onde: `apps/api/src/readiness.ts`; `apps/api/src/server.ts`; `apps/api/src/__tests__/readiness.test.ts`.
- Como: Consultar banco e estado do consumer/dependências críticas com timeout e cache curto; separar live/ready; evitar segredo nos detalhes.
- Aceite: Banco indisponível/consumer parado torna ready 503; live permanece 200 quando processo responde; probe não acumula conexões.
- Verificação: Falha e recuperação do PostgreSQL/worker por HTTP; saturação do probe.
- Evidência esperada: `docs/04_audit/evidence/AAA/AAA-22/manifest.json`.
- Locks: api-composition, repo-integration. Contrato proposto: `C-P2-v1; freeze exact artifact/hash in SPEC before BUILD`; congelar SPEC/hash antes da execução.

### AAA-23 — Conectar logs, métricas e tracing no fluxo integrado

- Fase/sprint: `P2/S2`. Papel: `observability`. Prioridade: `P1`.
- Origem: A14, AUD-20260912-F07, P10-B03.
- Dependências: AAA-21, AAA-22, AAA-04. Gate adicional: `G_SPEC`.
- Onde: `packages/observability/`; `apps/api/src/main.ts`; `apps/api/src/server.ts`; `apps/worker/src/`.
- Como: Compor logger redigido e OTel, propagar W3C/correlação em todas as fronteiras e exportar métricas com acesso protegido; definir cardinalidade e alertas.
- Aceite: 100% dos casos de aceitação correlacionam webhook→worker→modelo→tool→outbox; queda do coletor não vaza nem bloqueia ilimitadamente; falha detectada por alerta exercitado.
- Verificação: Collector local + logs/spans/metrics observados em sucesso/falha; testes de redaction.
- Evidência esperada: `docs/04_audit/evidence/AAA/AAA-23/manifest.json`.
- Locks: api-composition, repo-integration, worker-runtime. Contrato proposto: `C-P2-v1; freeze exact artifact/hash in SPEC before BUILD`; congelar SPEC/hash antes da execução.

### AAA-24 — Persistir ledger, retenção e integridade verificável

- Fase/sprint: `P2/S2`. Papel: `data`. Prioridade: `P1`.
- Origem: A06, A11, A14, A19, AUD-20260912-F07, P10-B07.
- Dependências: AAA-16, AAA-21, AAA-23, AAA-04. Gate adicional: `G_SPEC`.
- Onde: `packages/observability/src/audit-ledger.ts`; `packages/persistence/src/`; `packages/persistence/migrations/`; `apps/api/src/routes/audit.ts`.
- Como: Persistir cadeia por tenant com concorrência, checkpoint/âncora e autorização; retenção e export sob aprovação; evitar ledger volátil como prova definitiva.
- Aceite: Restart preserva cadeia; alteração/truncamento detectados conforme modelo de ameaça; leitura/export negam cross-tenant; retenção não destrói rastreabilidade exigida.
- Verificação: Corrida PG, tamper, restore, falha de append e RBAC de auditoria.
- Evidência esperada: `docs/04_audit/evidence/AAA/AAA-24/manifest.json`.
- Locks: data, migration-sequence. Contrato proposto: `C-P2-v1; freeze exact artifact/hash in SPEC before BUILD`; congelar SPEC/hash antes da execução.

### AAA-25 — Qualificar RAG com proveniência, revogação e recusa

- Fase/sprint: `P3/S3`. Papel: `rag`. Prioridade: `P1`.
- Origem: A08, A12, AUD-20260912-F08, AUD-20260912-F14.
- Dependências: AAA-06, AAA-16, AAA-21, AAA-04. Gate adicional: `G_SPEC_SOURCE_FIXTURE`.
- Onde: `packages/rag/`; `packages/platform/src/test-lab.ts`; `packages/platform/src/__tests__/knowledge-resolver.test.ts`; `packages/platform/src/__tests__/knowledge-source-catalog.test.ts`.
- Como: Usar contrato de resolver existente em test-lab.ts e catálogo aprovado por tenant/versão, fonte/citação e recusa sem suporte; defesa contra instruções no conteúdo; cache respeita revogação.
- Aceite: Todas as respostas de aceitação têm fonte/version aprovada; fonte inexistente/revogada ou instrução injetada não produz resposta sem suporte; fonte sintética nunca rotulada institucional real.
- Verificação: Casos answerability, revogação, poisoning, cross-tenant e fonte ausente.
- Evidência esperada: `docs/04_audit/evidence/AAA/AAA-25/manifest.json`.
- Locks: rag. Contrato proposto: `C-P3-v1; freeze exact artifact/hash in SPEC before BUILD`; congelar SPEC/hash antes da execução.

### AAA-26 — Qualificar adapters de modelo/canal com contratos e falhas

- Fase/sprint: `P3/S3`. Papel: `adapters`. Prioridade: `P1`.
- Origem: A13, AUD-20260912-F08, P10-B05.
- Dependências: AAA-06, AAA-12, AAA-21, AAA-04. Gate adicional: `G_SPEC`.
- Onde: `packages/model-gateway/src/providers/`; `packages/channel-gateway/src/adapters/`; `packages/adapters/`.
- Como: Testar HTTP local controlado com host pinning, SSRF, timeout, circuit/budget e falhas; integrar cadeia CVG via contratos, sem alterações em outros repositórios nesta lane.
- Aceite: Provider lento/malformado/429/5xx não quebra invariantes; retry tem deadline; nenhum egress não autorizado; canal entrega com estado reconciliável.
- Verificação: Servidores falsos locais, contract tests e teste de egress bloqueado.
- Evidência esperada: `docs/04_audit/evidence/AAA/AAA-26/manifest.json`.
- Locks: adapters. Contrato proposto: `C-P3-v1; freeze exact artifact/hash in SPEC before BUILD`; congelar SPEC/hash antes da execução.

### AAA-27 — Avaliar agente integrado com dataset independente e holdout

- Fase/sprint: `P3/S3`. Papel: `eval`. Prioridade: `P2`.
- Origem: A08, A09, A16, AUD-20260912-F14.
- Dependências: AAA-21, AAA-25, AAA-26, AAA-04. Gate adicional: `G_SPEC`.
- Onde: `packages/agent-evals/`; `scripts/phase10-eval-report.ts`.
- Como: Criar adapter de eval do entrypoint, dataset versionado por classe e holdout separado; medir latência/custo observados; separar baseline regex de modelo candidato.
- Aceite: Zero ação proibida no conjunto obrigatório; casos não respondíveis escalam; amostra e IC registrados; treino/tuning não acessa holdout; sem latência sintética em score operacional.
- Verificação: npm run test:evals; Evals integrados com sucesso/segurança por categoria e comparação baseline.
- Evidência esperada: `docs/04_audit/evidence/AAA/AAA-27/manifest.json`.
- Locks: eval. Contrato proposto: `C-P3-v1; freeze exact artifact/hash in SPEC before BUILD`; congelar SPEC/hash antes da execução.

### AAA-28 — Completar console seguro, acessível e operacional

- Fase/sprint: `P3/S3`. Papel: `frontend`. Prioridade: `P1`.
- Origem: A05, A17, AUD-20260912-F08, AUD-20260912-F09, P10-B09.
- Dependências: AAA-18, AAA-20, AAA-21, AAA-04. Gate adicional: `G_SPEC`.
- Onde: `apps/web/`; `tests/e2e/`.
- Como: Ligar sessão confiável, remover confiança em seletor de role fora simulação, melhorar pending/error/expired/replay/dead-letter e acessibilidade com teclado; usar contratos API congelados.
- Aceite: Jornadas/approval/tarefas/dead-letter compreensíveis; sem perda de contexto no tenant switch; 375/768/1440 sem overflow; foco/labels/contraste verificados; estudo sintético com operador e protocolo.
- Verificação: npm run test:e2e; Testes de acessibilidade automatizados e checklist manual; validação com operador autorizado.
- Evidência esperada: `docs/04_audit/evidence/AAA/AAA-28/manifest.json`.
- Locks: frontend. Contrato proposto: `C-P3-v1; freeze exact artifact/hash in SPEC before BUILD`; congelar SPEC/hash antes da execução.

### AAA-29 — Reduzir hotspots sem alterar comportamento

- Fase/sprint: `P3/S3`. Papel: `integration`. Prioridade: `P1`.
- Origem: A01, A02, AUD-20260912-F08.
- Dependências: AAA-21, AAA-22, AAA-23, AAA-24, AAA-28, AAA-04. Gate adicional: `G_SPEC`.
- Onde: `apps/api/src/server.ts`; `apps/api/src/routes/`; `apps/web/src/features/platform/`.
- Como: Extrair composição/rotas e painéis por responsabilidade com testes de caracterização; manter monólito modular; não introduzir microserviços por meta de tamanho.
- Aceite: Grafo de dependência sem ciclos novos; owners únicos; cada extração preserva contrato HTTP/UX e fluxo completo; métricas de complexidade comparadas ao baseline.
- Verificação: Typecheck/lint + contract/E2E antes/depois; inspeção de diff por extração.
- Evidência esperada: `docs/04_audit/evidence/AAA/AAA-29/manifest.json`.
- Locks: api-composition, repo-integration. Contrato proposto: `C-P3-v1; freeze exact artifact/hash in SPEC before BUILD`; congelar SPEC/hash antes da execução.

### AAA-30 — Fortalecer contratos HTTP, tipos e resistência a abuso

- Fase/sprint: `P3/S3`. Papel: `api-contract`. Prioridade: `P2`.
- Origem: A03, A04, A06.
- Dependências: AAA-29, AAA-04. Gate adicional: `G_SPEC`.
- Onde: `packages/shared/src/schemas/`; `apps/api/src/http-request-boundary.ts`; `apps/api/src/http-target-boundary.ts`; `apps/api/src/rate-limit.ts`; `apps/api/src/__tests__/`.
- Como: Remover casts injustificados nas fronteiras, testar payload desconhecido/extremo, paginação, limites, proxy e compatibilidade; dimensionar rate limiting distribuído só se topologia exigir.
- Aceite: Inputs inválidos nunca causam 500/vazamento; limites de memória/tempo exercitados; sem regressão de API e typecheck strict; tenant vem de autoridade confiável.
- Verificação: Fuzz/property tests de schemas/HTTP, matriz auth e testes de carga adversarial bounded.
- Evidência esperada: `docs/04_audit/evidence/AAA/AAA-30/manifest.json`.
- Locks: api-contract. Contrato proposto: `C-P3-v1; freeze exact artifact/hash in SPEC before BUILD`; congelar SPEC/hash antes da execução.

### AAA-31 — Medir carga real do percurso PostgreSQL e recuperação

- Fase/sprint: `P4/S4`. Papel: `performance`. Prioridade: `P2`.
- Origem: A10, A14, A20, AUD-20260912-F14, P10-B06.
- Dependências: AAA-19, AAA-23, AAA-29, AAA-30, AAA-04. Gate adicional: `G_SPEC`.
- Onde: `scripts/phase10-load.ts`; `packages/chaos/`; `docs/04_audit/evidence/AAA/AAA-31/`.
- Como: Executar 10k→100k eventos em ambiente isolado pelo percurso público, perfis de concorrência/tamanho e soak; medir p50/p95/p99, CPU/RAM/lag e retries.
- Aceite: Zero perda e zero efeito duplicado nos eventos aceitos; p95 de persistência ≤2s e ack ≤10s sob perfil aprovado; filas drenam após outage; ambiente/amostra documentados.
- Verificação: Load PostgreSQL, chaos e soak do contrato G_QUALITY.
- Evidência esperada: `docs/04_audit/evidence/AAA/AAA-31/manifest.json`.
- Locks: performance. Contrato proposto: `C-P4-v1; freeze exact artifact/hash in SPEC before BUILD`; congelar SPEC/hash antes da execução.

### AAA-32 — Provar backup/restore e runbooks por exercício

- Fase/sprint: `P4/S4`. Papel: `data`. Prioridade: `P2`.
- Origem: A11, A20, AUD-20260912-F14, P10-B04.
- Dependências: AAA-24, AAA-31, AAA-04. Gate adicional: `G_D03_SPEC`.
- Onde: `packages/persistence/src/restore.ts`; `scripts/phase10-restore-check.ts`; `docs/10_phase10/PHASE10_RUNBOOKS.md`; `docs/04_audit/evidence/AAA/AAA-32/`.
- Como: Restaurar PostgreSQL em ambiente separado, incluindo roles/migrations/outbox/checkpoints; medir RPO/RTO contra metas humanas D03; exercitar operador e rollback.
- Aceite: Integridade/tenant/idempotência preservados após restore; RPO/RTO medidos e comparados a metas aprovadas; runbook reproduzível por outro operador.
- Verificação: Restore de backup real de banco sintético e failover controlado; nada sobrescreve banco operacional.
- Evidência esperada: `docs/04_audit/evidence/AAA/AAA-32/manifest.json`.
- Locks: data. Contrato proposto: `C-P4-v1; freeze exact artifact/hash in SPEC before BUILD`; congelar SPEC/hash antes da execução.

### AAA-33 — Revisão adversarial de segurança e privacidade integrada

- Fase/sprint: `P4/S4`. Papel: `security`. Prioridade: `P1`.
- Origem: A05, A06, A07, A08, A12, A18, AUD-20260912-F01, AUD-20260912-F04, AUD-20260912-F07, AUD-20260912-F12, AUD-20260912-F15.
- Dependências: AAA-23, AAA-24, AAA-25, AAA-26, AAA-28, AAA-30, AAA-04. Gate adicional: `G_SPEC`.
- Onde: `docs/04_audit/evidence/AAA/AAA-33/`.
- Como: Crítico diferente dos builders inspeciona candidato e limites; testa auth, SSRF, replay, injeção, approval, retenção, export e secrets sintéticos; registrar correções nas tasks donas.
- Aceite: Nenhum P0/P1 aberto; todos os cenários obrigatórios negam ações proibidas; redaction validada em todos os sinks; findings fechados somente com rerun independente.
- Verificação: Threat-model walkthrough e provas negativas por HTTP/worker/persistência; CodeQL/gitleaks configurados e executados.
- Evidência esperada: `docs/04_audit/evidence/AAA/AAA-33/manifest.json`.
- Locks: security. Contrato proposto: `C-P4-v1; freeze exact artifact/hash in SPEC before BUILD`; congelar SPEC/hash antes da execução.

### AAA-34 — Fechar cobertura significativa e regressão dos contratos

- Fase/sprint: `P4/S4`. Papel: `quality`. Prioridade: `P2`.
- Origem: A03, A04, A15, A16, AUD-20260912-F14.
- Dependências: AAA-27, AAA-28, AAA-30, AAA-33, AAA-04. Gate adicional: `G_SPEC`.
- Onde: `vitest.config.mts`; `playwright.config.ts`; `tests/`; `docs/04_audit/evidence/AAA/AAA-34/`.
- Como: Mapear denominadores e exclusões; exercitar fronteiras públicas e SQL; exigir testes capazes de detectar as sete falhas, com mutação dirigida dos invariantes.
- Aceite: Gates obrigatórios sem skips; targets de coverage G_QUALITY satisfeitos sem exclusão artificial; todas as reproduções F01–F05/F15 tornam-se regressões detectáveis.
- Verificação: npm test; npm run test:coverage; npm run test:postgres; npm run test:e2e; Mutação dirigida de guards/approval/idempotência.
- Evidência esperada: `docs/04_audit/evidence/AAA/AAA-34/manifest.json`.
- Locks: quality. Contrato proposto: `C-P4-v1; freeze exact artifact/hash in SPEC before BUILD`; congelar SPEC/hash antes da execução.

### AAA-35 — Reconciliar documentação e governança do candidato

- Fase/sprint: `P4/S4`. Papel: `documentation`. Prioridade: `P1`.
- Origem: A19, AUD-20260912-F11.
- Dependências: AAA-13, AAA-29, AAA-32, AAA-34, AAA-04. Gate adicional: `G_SPEC`.
- Onde: `docs/01_prd/`; `docs/02_spec/`; `docs/10_phase10/`; `docs/04_audit/evidence/AAA/AAA-35/`.
- Como: Mapear RF→contrato→task→teste→evidência; classificar históricos; retirar claims não demonstrados do estado atual sem reescrever histórico; ligar runbooks e owners.
- Aceite: 20 áreas/15 achados e RF-011 sem órfãos; docs descrevem caminho atual; certificado usa candidato atual; decisões humanas rastreáveis.
- Verificação: Validação de links, rastreabilidade e manifesto; revisão por leitor sem contexto.
- Evidência esperada: `docs/04_audit/evidence/AAA/AAA-35/manifest.json`.
- Locks: documentation. Contrato proposto: `C-P4-v1; freeze exact artifact/hash in SPEC before BUILD`; congelar SPEC/hash antes da execução.

### AAA-36 — Qualificar candidato controlado integrado

- Fase/sprint: `P4/S4`. Papel: `release`. Prioridade: `P2`.
- Origem: A01, A10, A15, A19, A20.
- Dependências: AAA-14, AAA-15, AAA-31, AAA-32, AAA-33, AAA-34, AAA-35, AAA-04. Gate adicional: `G_SPEC`.
- Onde: `docs/04_audit/evidence/AAA/AAA-36/`; `certification/`.
- Como: Integrador executa gates sobre commit/worktree congelado; crítico reproduz amostra adversarial e refaz decisão a partir de evidência atual.
- Aceite: Zero P0/P1; zero P2 de safety/dados/contratos/gate obrigatório; demais P2 têm owner/prazo/aceite explícito; todos os critérios obrigatórios PASS; sem promoção real.
- Verificação: npm run verify; npm run test:postgres; npm run test:e2e; npm run certification:verify; Revisão independente sobre hashes do candidato.
- Evidência esperada: `docs/04_audit/evidence/AAA/AAA-36/manifest.json`.
- Locks: release. Contrato proposto: `C-P4-v1; freeze exact artifact/hash in SPEC before BUILD`; congelar SPEC/hash antes da execução.

### AAA-37 — Homologar identidade, provider, canal e fonte autorizados

- Fase/sprint: `P5/S5`. Papel: `external`. Prioridade: `P2`.
- Origem: A05, A12, A13, A20, P10-B05.
- Dependências: AAA-36, AAA-41, AAA-04. Gate adicional: `G_EXTERNAL`.
- Onde: `docs/04_audit/evidence/AAA/AAA-37/`; `certification/external-gates.json`.
- Como: Somente após D04 e autorização específica: credenciais de homologação, fonte institucional aprovada, endpoints permitidos e fixtures sem paciente real; registrar contrato/owner/custos.
- Aceite: IdP/provider/canal/fonte realmente observados no ambiente autorizado; integrações sem egress indevido; nenhum dado ou consulta real; ausências ficam BLOCKED.
- Verificação: Contract/E2E externos autorizados com dados sintéticos e trilha correlacionada.
- Evidência esperada: `docs/04_audit/evidence/AAA/AAA-37/manifest.json`.
- Locks: external. Contrato proposto: `C-P5-v1; freeze exact artifact/hash in SPEC before BUILD`; congelar SPEC/hash antes da execução.

### AAA-38 — Obter signoff humano do candidato e do cenário operacional

- Fase/sprint: `P5/S5`. Papel: `human-owner`. Prioridade: `P2`.
- Origem: A19, A20, P10-B08.
- Dependências: AAA-37, AAA-04. Gate adicional: `G_HUMAN`.
- Onde: `docs/04_audit/evidence/AAA/AAA-38/`; `certification/external-gates.json`.
- Como: Apresentar evidência concreta, restrições, riscos e rollback aos responsáveis definidos; registrar decisão assinada por autoridade identificada, escopo e expiração.
- Aceite: Sem decisão emitida pela autoridade, tarefa BLOCKED; signoff não inferido de silêncio, tempo ou nota; não equivale a autorização irrestrita de produção.
- Verificação: Conferência da decisão humana e correspondência ao hash do candidato.
- Evidência esperada: `docs/04_audit/evidence/AAA/AAA-38/manifest.json`.
- Locks: human-owner. Contrato proposto: `C-P5-v1; freeze exact artifact/hash in SPEC before BUILD`; congelar SPEC/hash antes da execução.

### AAA-39 — Exercitar operação supervisionada e contingência

- Fase/sprint: `P5/S5`. Papel: `operations`. Prioridade: `P2`.
- Origem: A17, A20.
- Dependências: AAA-38, AAA-04. Gate adicional: `G_EXTERNAL_HUMAN`.
- Onde: `docs/04_audit/evidence/AAA/AAA-39/`.
- Como: Executar cenário aprovado com dados sintéticos e operador; testar alarmes, handoff, fallback, incidentes e rollback; nenhuma consulta real ou deploy irrestrito.
- Aceite: Janela/volume e critérios de abort aprovados; operador recupera cenário sem perder/aumentar autoridade; RPO/RTO e experiência conferidos no ambiente-alvo autorizado.
- Verificação: Exercício operacional supervisionado; checklist e logs atuais.
- Evidência esperada: `docs/04_audit/evidence/AAA/AAA-39/manifest.json`.
- Locks: operations. Contrato proposto: `C-P5-v1; freeze exact artifact/hash in SPEC before BUILD`; congelar SPEC/hash antes da execução.

### AAA-40 — Comparar candidato com baseline e alternativas pertinentes

- Fase/sprint: `P4/S4`. Papel: `benchmark`. Prioridade: `P2`.
- Origem: A01, A09, A16, A20.
- Dependências: AAA-27, AAA-31, AAA-33, AAA-34, AAA-04. Gate adicional: `G_QUALITY`.
- Onde: `docs/04_audit/evidence/AAA/AAA-40/`.
- Como: Executar o protocolo comparativo congelado em AAA-04 antes do holdout AAA-27, usando mesma carga/hardware/dados/custo; comparar baseline controlado e alternativas justificadas. Não escolher critérios após observar resultados; declarar indisponíveis sem inventar resultados.
- Aceite: State of Art reivindicado apenas no escopo medido: segurança, qualidade de tarefa, custo e latência com trade-offs e limitações; sem comparação válida usar AAA_CANDIDATE.
- Verificação: Benchmark reproduzível com seeds, dataset/hashes, medições e análise independente.
- Evidência esperada: `docs/04_audit/evidence/AAA/AAA-40/manifest.json`.
- Locks: benchmark. Contrato proposto: `C-P4-v1; freeze exact artifact/hash in SPEC before BUILD`; congelar SPEC/hash antes da execução.

### AAA-41 — Auditoria independente da barra A01–A20

- Fase/sprint: `P4/S4`. Papel: `critic`. Prioridade: `P1`.
- Origem: A01, A02, A03, A04, A05, A06, A07, A08, A09, A10, A11, A12, A13, A14, A15, A16, A17, A18, A19, A20, AUD-20260912-F01, AUD-20260912-F02, AUD-20260912-F03, AUD-20260912-F04, AUD-20260912-F05, AUD-20260912-F06, AUD-20260912-F07, AUD-20260912-F08, AUD-20260912-F09, AUD-20260912-F10, AUD-20260912-F11, AUD-20260912-F12, AUD-20260912-F13, AUD-20260912-F14, AUD-20260912-F15.
- Dependências: AAA-36, AAA-40, AAA-04. Gate adicional: `G_QUALITY`.
- Onde: `docs/04_audit/evidence/AAA/AAA-41/`.
- Como: Crítico fresco reatribui notas com rubrica congelada e reexecuta casos de maior risco sem aceitar claims do builder; checa validade do certificado e limites externos.
- Aceite: Cada nota aponta evidência; piso alvo 97/100 por área técnica só com gates cumpridos; produção permanece não qualificada enquanto gates externos/humanos pendentes; avaliação negativa abre REWORK.
- Verificação: Inspeção independente do candidato, rerun de negativos e recomputação de notas.
- Evidência esperada: `docs/04_audit/evidence/AAA/AAA-41/manifest.json`.
- Locks: critic. Contrato proposto: `C-P4-v1; freeze exact artifact/hash in SPEC before BUILD`; congelar SPEC/hash antes da execução.

### AAA-42 — Emitir veredicto final e plano de manutenção da qualidade

- Fase/sprint: `P5/S5`. Papel: `release`. Prioridade: `P2`.
- Origem: A19, A20.
- Dependências: AAA-39, AAA-41, AAA-04. Gate adicional: `G_FINAL`.
- Onde: `docs/04_audit/evidence/AAA/AAA-42/`; `certification/`.
- Como: Consolidar evidência técnica, comparação, janela operacional e decisões; recomputar 20 notas; estabelecer revalidação após mudança/dependência/incidente e responsáveis por operação.
- Aceite: TRIPLO_AAA_PROVEN somente se todos A01–A20 ≥97, gates obrigatórios atuais sem lacunas, benchmarking válido e signoffs aplicáveis; caso contrário declarar escopo/pendência; zero deploy automático.
- Verificação: Verificador independente de manifesto e evidências; decisão humana final aplicável.
- Evidência esperada: `docs/04_audit/evidence/AAA/AAA-42/manifest.json`.
- Locks: release. Contrato proposto: `C-P5-v1; freeze exact artifact/hash in SPEC before BUILD`; congelar SPEC/hash antes da execução.

## Handoff pronto para um agente

```text
TASK: AAA-XX (copiar entrada completa do JSON canônico)
ROLE: especialista da task; executar diretamente, sem redelegar
INPUTS: AGENTS + estado + SPEC/hash congelado + dependências VERIFIED/DONE
AUTHORITY: citar autorização de BUILD; fixture sintética; sem efeitos reais
OWNERSHIP: paths exatos e recursos reservados pelo lead; restante proibido
OUTPUT: IMPLEMENTED ou BLOCKED; diff + comandos/exit codes + evidências sanitizadas
REVIEW: crítico fresco reexecuta critérios; builder não emite DONE
FAILURE: preservar reprodução; hipótese + tentativa + próximo teste discriminante
```

Antes de usar tooling `orchestrate` em BUILD, instanciar o ledger vivo no schema exigido pela versão instalada da skill e validá-lo com seu validador. O JSON deste planejamento não finge conter processos em execução, contratos congelados ou provas terminais.
