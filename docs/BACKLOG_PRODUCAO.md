> Atualização13/09/2026: [reauditoria M1](04_audit/0562_prod_m1_reaudit_2026-09-13.md) encontrou e corrigiu oito lacunas adicionais. Revisão CONDITIONAL PASS; tarefas afetadas REVIEW e produção NO-GO. [Pacote de decisões e sequência](02_spec/prod20260913_decision_packet.md). O conteúdo abaixo preserva o planejamento/diagnóstico histórico; estados atuais nos backlogs canônicos.

# Backlog para produção — visão de execução consolidada

Programa PROD-20260913; 56 IDs rastreados, sem autorização de execução implícita. [Plano](PLANO_EXECUTIVO_PRODUCAO.md) · [Roadmap](ROADMAP_PRODUCAO.md) · [Relatório](RELATORIO_AUDITORIA_2026-09-13.md).

## Fontes de status e regra de uso

Os **42 IDs AAA** continuam canônicos em [aaa_program_backlog.json](03_build/tracking/aaa_program_backlog.json), com [contratos detalhados](03_build/0326_aaa_backlog.md) e ledger existentes. Os **14 IDs PROD** são correções/complementos canônicos em [production_delta_backlog.json](03_build/tracking/production_delta_backlog.json). Esta visão não mantém um segundo status AAA. Valores VERIFIED antigos pertencem a seus candidatos; revalidar alcance antes de dar aceite ao novo.

Total de 56 IDs no plano consolidado, com trabalho reaproveitado e sobreposições de aceite explícitas; não significam 56 implementações do zero. Tasks PROD refinam lacunas que tarefas AAA integradoras precisam aceitar. O JSON delta registra dependências adicionais de **fechamento**, cumulativas às existentes. Nunca executar filho duas vezes por aparecer em duas áreas.

Para cada BUILD: contrato/hash + autorização aplicável; entradas/dependências atuais; paths/recursos exclusivos; dados sintéticos. Estados PROD: PLANNED→READY→RUNNING→IMPLEMENTED→REVIEW→VERIFIED→DONE, com REWORK/BLOCKED. Somente PROD-01 tem preparação documental imediatamente disponível; PLANNED não é autorização de código. Tasks externas só progridem quando seus gates/autoridades específicos existem.

## Checklist comum de aceite por task

Negativo reproduzível antes e positivo depois; regressão real do chamador/HTTP/worker/SQL/UI; todos estados de erro pertinentes; isolamento/ator/correlação; testes correntes com exit e skips; diff preservando demais autores; identidade de fontes/config/lockfile/runtime; evidência sanitizada em path declarado; revisão independente da implementação; riscos e rollback/roll-forward. BUILDER não emite seu próprio DONE. Falta de ambiente é BLOCKED/NOT_RUN, não isenção de requisito.

Comandos disponíveis: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build`, `npm run test:coverage`, `npm run test:postgres`, `npm run test:worker:startup`, `npm run test:evals`, `npm run test:chaos`, `npm run test:e2e`, `npm audit --json`, `npm run licenses:check`, `npm run sbom`, `npm run certification:verify`, `git diff --check`. Rodar gates que escrevem em cópia isolada. `TEST_DATABASE_URL` deve apontar exclusivamente ao banco descartável desta task. E2E usa portas reservadas e `--retries=0` na aceitação, registrando falhas. Incluir attendance-approval-postgres e continuous-worker-postgres no inventário CI; exit 0 com skip obrigatório não fecha gate. Certify apenas após candidato congelado e geradores serializados.

## Integração com as 42 tarefas existentes

Para cada linha, o contrato completo (onde/como/dependências/aceite) está na seção homônima do backlog 0326 e no JSON. O executor deve carregá-lo, não substituir a task pela descrição resumida abaixo. Status não copiado: consultar fonte canônica.

| ID     | Trabalho existente a reaproveitar/revalidar                      | Gate existente        | Pré-requisito novo de fechamento                 |
| ------ | ---------------------------------------------------------------- | --------------------- | ------------------------------------------------ |
| AAA-01 | Revalidar candidato, gates e reproduções                         | G_PLAN                | Contrato original + evidência do candidato atual |
| AAA-02 | Preparar decisões de produto, RF-011 e fronteiras humanas        | G_PLAN                | Contrato original + evidência do candidato atual |
| AAA-03 | Especificar proposta aprovada, execução durável e capabilities   | G_PLAN                | Contrato original + evidência do candidato atual |
| AAA-04 | Especificar barra de qualidade e vínculo da certificação         | G_PLAN                | Contrato original + evidência do candidato atual |
| AAA-05 | Especificar dados, migrações, APIs e fronteiras de ownership     | G_PLAN                | Contrato original + evidência do candidato atual |
| AAA-06 | Especificar composição, produto e evolução do runtime            | G_D01                 | Contrato original + evidência do candidato atual |
| AAA-07 | Implementar lifecycle de approval com reserva e recuperação      | G_SPEC                | Contrato original + evidência do candidato atual |
| AAA-08 | Separar draft, confirmação e alteração sensível na policy        | G_SPEC                | Contrato original + evidência do candidato atual |
| AAA-09 | Vincular ferramenta ao payload final aprovado                    | G_SPEC                | Contrato original + evidência do candidato atual |
| AAA-10 | Proteger efeito com intenção durável e idempotência              | G_SPEC                | Contrato original + evidência do candidato atual |
| AAA-11 | Aplicar orçamento de etapas, custo e deadline global             | G_SPEC                | Contrato original + evidência do candidato atual |
| AAA-12 | Eliminar corrida de envio e persistir journal do canal           | G_SPEC                | Contrato original + evidência do candidato atual |
| AAA-13 | Vincular certificado ao candidato executado                      | G_SPEC                | Contrato original + evidência do candidato atual |
| AAA-14 | Atualizar dependências e reduzir imagem com inventário confiável | G_SPEC                | Contrato original + evidência do candidato atual |
| AAA-15 | Restaurar gate de formatação preservando alterações existentes   | G_SPEC                | Contrato original + evidência do candidato atual |
| AAA-16 | Disponibilizar PostgreSQL descartável e fechar gate sem skips    | G_SPEC                | Contrato original + evidência do candidato atual |
| AAA-17 | Implementar persistência PostgreSQL das jornadas                 | G_SPEC                | Contrato original + evidência do candidato atual |
| AAA-18 | Conectar jornadas PostgreSQL às rotas públicas                   | G_SPEC                | PROD-02, PROD-06                                 |
| AAA-19 | Entregar consumer contínuo e shutdown recuperável                | G_SPEC                | PROD-05                                          |
| AAA-20 | Compor identidade confiável e rotação de credenciais             | G_SPEC                | Contrato original + evidência do candidato atual |
| AAA-21 | Integrar runtime aprovado ao caminho API→worker                  | G_D01_SPEC            | PROD-04                                          |
| AAA-22 | Implementar readiness com probes reais e limitados               | G_SPEC                | Contrato original + evidência do candidato atual |
| AAA-23 | Conectar logs, métricas e tracing no fluxo integrado             | G_SPEC                | Contrato original + evidência do candidato atual |
| AAA-24 | Persistir ledger, retenção e integridade verificável             | G_SPEC                | Contrato original + evidência do candidato atual |
| AAA-25 | Qualificar RAG com proveniência, revogação e recusa              | G_SPEC_SOURCE_FIXTURE | Contrato original + evidência do candidato atual |
| AAA-26 | Qualificar adapters de modelo/canal com contratos e falhas       | G_SPEC                | Contrato original + evidência do candidato atual |
| AAA-27 | Avaliar agente integrado com dataset independente e holdout      | G_SPEC                | Contrato original + evidência do candidato atual |
| AAA-28 | Completar console seguro, acessível e operacional                | G_SPEC                | PROD-03, PROD-07, PROD-08, PROD-09               |
| AAA-29 | Reduzir hotspots sem alterar comportamento                       | G_SPEC                | Contrato original + evidência do candidato atual |
| AAA-30 | Fortalecer contratos HTTP, tipos e resistência a abuso           | G_SPEC                | PROD-10, PROD-11                                 |
| AAA-31 | Medir carga real do percurso PostgreSQL e recuperação            | G_SPEC                | Contrato original + evidência do candidato atual |
| AAA-32 | Provar backup/restore e runbooks por exercício                   | G_D03_SPEC            | Contrato original + evidência do candidato atual |
| AAA-33 | Revisão adversarial de segurança e privacidade integrada         | G_SPEC                | Contrato original + evidência do candidato atual |
| AAA-34 | Fechar cobertura significativa e regressão dos contratos         | G_SPEC                | Contrato original + evidência do candidato atual |
| AAA-35 | Reconciliar documentação e governança do candidato               | G_SPEC                | Contrato original + evidência do candidato atual |
| AAA-36 | Qualificar candidato controlado integrado                        | G_SPEC                | PROD-12                                          |
| AAA-37 | Homologar identidade, provider, canal e fonte autorizados        | G_EXTERNAL            | PROD-14                                          |
| AAA-38 | Obter signoff humano do candidato e do cenário operacional       | G_HUMAN               | Contrato original + evidência do candidato atual |
| AAA-39 | Exercitar operação supervisionada e contingência                 | G_EXTERNAL_HUMAN      | Contrato original + evidência do candidato atual |
| AAA-40 | Comparar candidato com baseline e alternativas pertinentes       | G_QUALITY             | Contrato original + evidência do candidato atual |
| AAA-41 | Auditoria independente da barra A01–A20                          | G_QUALITY             | Contrato original + evidência do candidato atual |
| AAA-42 | Emitir veredicto final e plano de manutenção da qualidade        | G_FINAL               | PROD-13                                          |

## Tarefas complementares — contratos de execução

Toda mudança de schema/estado requer rollback ou roll-forward ensaiado e preservação de evidência; nenhuma migração destrutiva presumida. Paths aqui são superfícies permitidas a detalhar no lock da task, não autorização de edição simultânea de diretórios inteiros. Estimativa S/M/L não inclui espera de autoridade.

### PROD-01 — Revalidar baseline e fechar mapa de requisitos/contratos

- Marco/prioridade: **M0/P1**. Papel: lead/arquitetura. Tamanho: M. Estado inicial PLANNED; atual no JSON.
- Origem: D13-08, A01-A20. Dependências: nenhuma; ler fontes e preservar árvore. Gate: G_PLAN e autoridades aplicáveis.
- Onde: `docs/02_spec/`; `docs/04_audit/evidence/PROD-20260913/PROD-01/`.
- Como: Capturar fontes, config, lockfile e ambiente; reaproveitar evidência somente para bytes idênticos. Revisar todas linhas da matriz RF/RNF/UC/REM/plataforma e congelar SPEC específica das próximas correções. Corrigir alegações factuais do decision brief sobre composição já existente, preservando alternativas D01.
- Pronto quando: Cada requisito possui tarefa, teste de aceite e estado de evidência; nenhum gap sem owner. Snapshot e SPEC das tarefas PROD-02/03/05/06 disponíveis para revisão; nenhuma aprovação inventada.
- Verificação: git diff --check; Recomputar hashes dos inputs do relatório e confrontar arquivo atual; Reproduzir probes SQL/UI/readiness em ambiente sintético antes de corrigir.
- Evidência: `docs/04_audit/evidence/PROD-20260913/PROD-01/manifest.json`; resultado deve citar hashes e limites.
- Recuperação: preservar prova negativa e diff; reverter somente alteração da task quando seguro; mutação/efeito incerto exige reconciliação ou restore/roll-forward aprovado, não retry cego.

### PROD-02 — Tornar mutação SQL de jornada e auditoria atômicas

- Marco/prioridade: **M1/P1**. Papel: persistência. Tamanho: M. Estado inicial PLANNED; atual no JSON.
- Origem: D13-01, Q-A11-01. Dependências: PROD-01, AAA-17. Gate: G_SPEC e autoridades aplicáveis.
- Onde: `packages/persistence/src/journeys-postgres.ts`; `packages/persistence/src/__tests__/journeys-postgres.test.ts`; `apps/api/src/__tests__/journeys-api-postgres.test.ts`.
- Como: Usar transação curta por mutação e audit na mesma conexão tenant-scoped; revisar tutor, paciente, vínculo, appointment, expiração e concorrência. Não incluir I/O externo na transação.
- Pronto quando: Falha audit deixa zero alteração parcial. Retry produz uma mutação e um audit. Concorrência, TTL, tenant e paridade HTTP preservados; confirmação real permanece bloqueada.
- Verificação: Probe preservado backend-pg-probe.ts adaptado a DB exclusivo; TEST_DATABASE_URL=<banco-descartavel> npm run test:postgres; Testes novos de rollback/replay pelo repositório e HTTP.
- Evidência: `docs/04_audit/evidence/PROD-20260913/PROD-02/manifest.json`; resultado deve citar hashes e limites.
- Recuperação: preservar prova negativa e diff; reverter somente alteração da task quando seguro; mutação/efeito incerto exige reconciliação ou restore/roll-forward aprovado, não retry cego.

### PROD-03 — Impedir continuação UI de identidade/sessão obsoleta

- Marco/prioridade: **M1/P1**. Papel: frontend. Tamanho: M. Estado inicial PLANNED; atual no JSON.
- Origem: D13-02, Q-A17-02. Dependências: PROD-01. Gate: G_SPEC e autoridades aplicáveis.
- Onde: `apps/web/src/features/journeys/index.tsx`; `apps/web/src/api/client.ts`; `apps/web/src/__tests__/`; `tests/e2e/`.
- Como: Vincular cada requisição/mutação da jornada a geração de tenant/ator/papel/sessão; invalidar resultados e erros atrasados, abortar transporte quando possível; limpar caches de identidade.
- Pronto quando: A→B, logout e troca de sessão com respostas sucesso/erro fora de ordem não repõem dados A, estado de processamento ou mensagens obsoletas. Não alterar autorização backend.
- Verificação: Converter ui/race.cjs da auditoria em regressão; E2E atraso/reordenação e troca de tenant/role/sessão.
- Evidência: `docs/04_audit/evidence/PROD-20260913/PROD-03/manifest.json`; resultado deve citar hashes e limites.
- Recuperação: preservar prova negativa e diff; reverter somente alteração da task quando seguro; mutação/efeito incerto exige reconciliação ou restore/roll-forward aprovado, não retry cego.

### PROD-04 — Persistir ApprovalStore do runtime canônico

- Marco/prioridade: **M2/P1**. Papel: runtime/persistência. Tamanho: L. Estado inicial PLANNED; atual no JSON.
- Origem: D13-05, Q-A07-01, Q-A07-02, Q-A07-03. Dependências: PROD-01, AAA-06, AAA-07, AAA-16. Gate: G_SPEC e autoridades aplicáveis.
- Onde: `packages/approval-engine/src/`; `packages/persistence/src/`; `packages/persistence/migrations/`.
- Como: Implementar a porta de aprovação escolhida por D01 com proposta imutável, CAS, fencing e operação vinculada ao journal. Reservar migration nova após ler catálogo atual; não reutilizar 0012/0013/0014 nem duplicar autoridade SQL da plataforma.
- Pronto quando: Restart de processo mantém aprovação/proposta/reserva; falha antes do efeito libera de modo seguro; efeito incerto não reexecuta; duas conexões e múltiplas gerações não reutilizam token.
- Verificação: Testes SQL + reinício real de processo + crash nas transições; Reexecutar F01–F05/F15/T-19 e cenário multigeração P2-8.
- Evidência: `docs/04_audit/evidence/PROD-20260913/PROD-04/manifest.json`; resultado deve citar hashes e limites.
- Recuperação: preservar prova negativa e diff; reverter somente alteração da task quando seguro; mutação/efeito incerto exige reconciliação ou restore/roll-forward aprovado, não retry cego.

### PROD-05 — Validar papel SQL e RLS no bootstrap do worker

- Marco/prioridade: **M1/P1**. Papel: backend/segurança. Tamanho: M. Estado inicial PLANNED; atual no JSON.
- Origem: D13-06, Q-A06-03. Dependências: PROD-01, AAA-16. Gate: G_SPEC e autoridades aplicáveis.
- Onde: `apps/worker/src/postgres-controlled.ts`; `apps/worker/src/worker.ts`; `apps/worker/src/__tests__/`.
- Como: Conferir papel efetivo, policies/RLS e privilégios antes do primeiro claim, alinhando contrato do bootstrap da API; flag não substitui consulta.
- Pronto quando: Superuser/BYPASSRLS/owner indevido/schema ausente impedem consumo; papel mínimo válido inicia; contexto é limpo após erro e reutilização do pool.
- Verificação: Bootstrap negativo com roles reais em DB descartável; Worker startup e continuous-worker-postgres.integration.test.ts.
- Evidência: `docs/04_audit/evidence/PROD-20260913/PROD-05/manifest.json`; resultado deve citar hashes e limites.
- Recuperação: preservar prova negativa e diff; reverter somente alteração da task quando seguro; mutação/efeito incerto exige reconciliação ou restore/roll-forward aprovado, não retry cego.

### PROD-06 — Preservar ator e correlação na auditoria da jornada

- Marco/prioridade: **M1/P1**. Papel: backend/persistência. Tamanho: M. Estado inicial PLANNED; atual no JSON.
- Origem: D13-06, Q-A14-01. Dependências: PROD-02. Gate: G_SPEC e autoridades aplicáveis.
- Onde: `packages/persistence/src/journeys.ts`; `packages/persistence/src/journeys-postgres.ts`; `apps/api/src/server.ts`; `apps/api/src/__tests__/journeys-api-postgres.test.ts`.
- Como: Propagar ator autenticado e correlationId pela porta; impedir autoridade do body. Eventos de sistema devem registrar causa/execução próprios, sem fingir ator humano.
- Pronto quando: Evento identifica ator autorizado, tenant e correlação originais; actor/body adulterado negado; auditoria continua atômica sob erro; timeline rastreia a chamada.
- Verificação: HTTP autenticado→SQL audit com contexto exato e negativos; Paridade memória/PostgreSQL.
- Evidência: `docs/04_audit/evidence/PROD-20260913/PROD-06/manifest.json`; resultado deve citar hashes e limites.
- Recuperação: preservar prova negativa e diff; reverter somente alteração da task quando seguro; mutação/efeito incerto exige reconciliação ou restore/roll-forward aprovado, não retry cego.

### PROD-07 — Retomar drafts e resolver ambiguidade tutor/pet no console

- Marco/prioridade: **M3/P1**. Papel: frontend. Tamanho: M. Estado inicial PLANNED; atual no JSON.
- Origem: D13-07, RF-R3-09, RF-024. Dependências: PROD-03, AAA-18, AAA-20. Gate: G_SPEC e autoridades aplicáveis.
- Onde: `apps/web/src/features/journeys/`; `apps/web/src/api/client.ts`; `tests/e2e/`.
- Como: Conectar listagens persistentes à sessão selecionada; recuperar após reload; permitir escolha explícita de pet entre candidatos; apresentar expirado/conflito/vazio/loading/error/retry.
- Pronto quando: Reload retoma mesmo draft sem duplicar; outro tenant não vê resultados; pet ambíguo exige seleção; slot expirado não pode gerar confirmação real.
- Verificação: E2E API+PostgreSQL com reload, TTL, dois candidatos e corrida; Teclado e viewports375/768/1440.
- Evidência: `docs/04_audit/evidence/PROD-20260913/PROD-07/manifest.json`; resultado deve citar hashes e limites.
- Recuperação: preservar prova negativa e diff; reverter somente alteração da task quando seguro; mutação/efeito incerto exige reconciliação ou restore/roll-forward aprovado, não retry cego.

### PROD-08 — Exibir handoff completo e timeline investigável

- Marco/prioridade: **M3/P1**. Papel: produto/backend/frontend. Tamanho: L. Estado inicial PLANNED; atual no JSON.
- Origem: D13-07, RF-050, RF-073, RF-084. Dependências: PROD-03, PROD-06, AAA-21. Gate: G_SPEC e autoridades aplicáveis.
- Onde: `packages/workflows/src/handoff/`; `packages/agent-core/src/queries/`; `apps/api/src/server.ts`; `apps/web/src/features/conversations/`; `apps/web/src/features/journeys/`.
- Como: Compor resumo com tutor/pet, intenção, risco operacional, ações, tools, fontes e pendências; contrato retorna identificador do handoff; consumir timeline completa de mensagens/runs/tools/approvals/safety/handoff sem expor conteúdo indevido.
- Pronto quando: Operador recebe resumo rastreável após takeover; itens sensíveis mascarados por papel; ausência de dados explícita; IDs ligam origem→decisão→efeito; retomada não duplica handoff.
- Verificação: Fluxo UC07 via HTTP→SQL→web; conflito/takeover e histórico; Teste de contrato do resumo e UI por papel.
- Evidência: `docs/04_audit/evidence/PROD-20260913/PROD-08/manifest.json`; resultado deve citar hashes e limites.
- Recuperação: preservar prova negativa e diff; reverter somente alteração da task quando seguro; mutação/efeito incerto exige reconciliação ou restore/roll-forward aprovado, não retry cego.

### PROD-09 — Paginar e atualizar filas operacionais

- Marco/prioridade: **M3/P2**. Papel: frontend. Tamanho: M. Estado inicial PLANNED; atual no JSON.
- Origem: D13-07, RF-080. Dependências: PROD-03, AAA-20. Gate: G_SPEC e autoridades aplicáveis.
- Onde: `apps/web/src/App.tsx`; `apps/web/src/features/conversations/`; `apps/web/src/api/client.ts`; `tests/e2e/`.
- Como: Consumir pageInfo e navegar todos lotes; refresh controlado com cancelamento de geração; preservar seleção e indicar total/limite sem apresentar lote como total; atualizar tarefas após criação.
- Pronto quando: 26+ conversas são acessíveis; inserções e refresh não misturam tenants nem apagam contexto; loading/error/retry em todos lotes; tarefa nova aparece.
- Verificação: E2E com >25 conversas, atualização concorrente e troca de identidade.
- Evidência: `docs/04_audit/evidence/PROD-20260913/PROD-09/manifest.json`; resultado deve citar hashes e limites.
- Recuperação: preservar prova negativa e diff; reverter somente alteração da task quando seguro; mutação/efeito incerto exige reconciliação ou restore/roll-forward aprovado, não retry cego.

### PROD-10 — Persistir justificativas e vínculos de decisões/tarefas

- Marco/prioridade: **M3/P2**. Papel: backend/frontend. Tamanho: M. Estado inicial PLANNED; atual no JSON.
- Origem: SPEC-0105, RF-052, RF-061, RF-062. Dependências: PROD-06, AAA-21. Gate: G_SPEC e autoridades aplicáveis.
- Onde: `packages/shared/src/schemas/application.ts`; `packages/agent-core/src/commands/`; `packages/persistence/src/`; `apps/api/src/server.ts`; `apps/web/src/`.
- Como: Revisar contrato de rejeição e cancelamento com motivo obrigatório quando SPEC exige; preservar nota no audit e estado; relacionar tarefa a contato/conversa/sessão por vínculo validado ou relação explícita aprovada, com minimização.
- Pronto quando: Rejeição/cancelamento sem motivo exigido nega; motivo bounded persiste com ator/horário; relacionamento não permite contato de outro tenant; transições concorrentes têm um final.
- Verificação: Matriz de decisões e task status por HTTP+SQL+UI; Contratos/versionamento e testes de compatibilidade.
- Evidência: `docs/04_audit/evidence/PROD-20260913/PROD-10/manifest.json`; resultado deve citar hashes e limites.
- Recuperação: preservar prova negativa e diff; reverter somente alteração da task quando seguro; mutação/efeito incerto exige reconciliação ou restore/roll-forward aprovado, não retry cego.

### PROD-11 — Completar jornadas conversacionais e proposta de approval

- Marco/prioridade: **M3/P1**. Papel: runtime/produto. Tamanho: L. Estado inicial PLANNED; atual no JSON.
- Origem: RF-010, RF-012, RF-030, RF-033, RF-041, RF-043. Dependências: AAA-21, AAA-25, PROD-08, PROD-10. Gate: G_SPEC e autoridades aplicáveis.
- Onde: `packages/workflows/src/`; `packages/agent-core/src/`; `packages/platform/src/`; `packages/agent-runtime/src/`.
- Como: Fechar coleta/estado multietapa, baixa confiança, emergência operacional e handoff; sugestão de slot gera proposta imutável e ApprovalRequest quando requerido. Usar runtime escolhido por D01, sem segundo caminho de autoridade.
- Pronto quando: UC01–09 demonstrados com mensagens reais do simulador, reload/restart, incompleto/ambíguo; approval liga o draft final; triagem não diagnostica/prescreve; nenhum agendamento real automático.
- Verificação: E2E conversacional através do entrypoint, não função de workflow isolada; Evals adversariais e logs por sessão/turno.
- Evidência: `docs/04_audit/evidence/PROD-20260913/PROD-11/manifest.json`; resultado deve citar hashes e limites.
- Recuperação: preservar prova negativa e diff; reverter somente alteração da task quando seguro; mutação/efeito incerto exige reconciliação ou restore/roll-forward aprovado, não retry cego.

### PROD-12 — Preparar artefato instalável e infraestrutura reproduzível

- Marco/prioridade: **M4/P1**. Papel: infra/supply-chain. Tamanho: L. Estado inicial PLANNED; atual no JSON.
- Origem: D13-08, Q-A18-01, Q-A18-03, Q-A20-01. Dependências: AAA-14, AAA-20, AAA-23. Gate: G_SPEC e autoridades aplicáveis.
- Onde: `Dockerfile`; `deploy/`; `.github/workflows/`; `docs/08_runtime/`.
- Como: Build limpo Node 22/lockfile; imagens API/web/worker por digest, non-root, secrets externos, TLS/rede/egress, persistência/backup e migração com papéis distintos; parâmetros por ambiente, probes corretos e runbook de instalação/atualização/rollback. Criar config de infra alvo após D03, sem deploy nesta task.
- Pronto quando: npm ci no alvo e smoke dos artefatos empacotados passam; restart mantém estado; imagem não contém segredos/tooling dev indevido; provisionamento reversível em ambiente descartável; versão anterior pode ser recuperada sem perda auditável.
- Verificação: Build imagem runtime/web/worker quando engine disponível; scan/SBOM/licenças; Smoke via imagem e restore/roll-forward de migração em staging sintético.
- Evidência: `docs/04_audit/evidence/PROD-20260913/PROD-12/manifest.json`; resultado deve citar hashes e limites.
- Recuperação: preservar prova negativa e diff; reverter somente alteração da task quando seguro; mutação/efeito incerto exige reconciliação ou restore/roll-forward aprovado, não retry cego.

### PROD-13 — Preparar liberação operacional e manutenção do candidato

- Marco/prioridade: **M6/P1**. Papel: operação/release. Tamanho: M. Estado inicial PLANNED; atual no JSON.
- Origem: Q-A20-01, Q-A20-02, Q-A20-03, Q-A20-04. Dependências: AAA-39, AAA-41, PROD-12, PROD-14. Gate: G_EXTERNAL_HUMAN e autoridades aplicáveis.
- Onde: `docs/08_runtime/`; `docs/04_audit/evidence/PROD-20260913/PROD-13/`.
- Como: Preparar checklist por digest/escopo, plantão e donos, runbooks, alertas e contingência. Ensaiar release/rollback supervisionados no ambiente autorizado, definir suporte, vulnerabilidades, backup/restore recorrente, regressão e requalificação após mudança.
- Pronto quando: Dossiê inclui evidência operacional no ambiente relevante e aceite humano datado com validade/escopo; nenhuma aprovação automática. Procedimento de deploy revisável separado da autorização de execução; recurso real só mediante autorização específica.
- Verificação: Drill de falha/rollback e restauração conforme D03 aprovado; Revisão humana do dossiê e checklist de release; rejeitar assinatura ausente ou candidato alterado.
- Evidência: `docs/04_audit/evidence/PROD-20260913/PROD-13/manifest.json`; resultado deve citar hashes e limites.
- Recuperação: preservar prova negativa e diff; reverter somente alteração da task quando seguro; mutação/efeito incerto exige reconciliação ou restore/roll-forward aprovado, não retry cego.

### PROD-14 — Registrar decisões e aprovações de produto/ambiente/dados

- Marco/prioridade: **M0/P1**. Papel: produto/arquitetura/operação. Tamanho: L (espera externa não estimada). Estado inicial PLANNED; atual no JSON.
- Origem: D01, D02, D03, D04, D05. Dependências: PROD-01, AAA-02. Gate: G_HUMAN e autoridades aplicáveis.
- Onde: `docs/01_prd/aaa_decision_brief.md`; `docs/02_spec/`; `docs/08_runtime/`.
- Como: Levar material concreto às autoridades: runtime/RF011; limite de draft; SLO/carga/custo/RPO/RTO; IdP/roles, endpoints, corpus e canais; retenção/dados/risco residual. Registrar opção, responsável, data, escopo, justificativa e validade; separar decisões independentes.
- Pronto quando: Cada decisão tem autoridade explícita ou permanece PENDING; D01 resolve contrato sem alegar cadeia já integrada; D04 separa fixtures, homologação e produção; decisões não concedem permissão irrestrita.
- Verificação: Conferência de decisão↔gate↔task↔candidato; Nenhum gate desbloqueado por silêncio, prazo ou nota.
- Evidência: `docs/04_audit/evidence/PROD-20260913/PROD-14/manifest.json`; resultado deve citar hashes e limites.
- Recuperação: preservar prova negativa e diff; reverter somente alteração da task quando seguro; mutação/efeito incerto exige reconciliação ou restore/roll-forward aprovado, não retry cego.

## Cobertura dos achados e áreas

| Origem | Tasks responsáveis                                                                                                                |
| ------ | --------------------------------------------------------------------------------------------------------------------------------- |
| D13-01 | PROD-02; AAA-18                                                                                                                   |
| D13-02 | PROD-03; AAA-28                                                                                                                   |
| D13-03 | AAA-02/06/21; PROD-01/14                                                                                                          |
| D13-04 | AAA-22/23                                                                                                                         |
| D13-05 | PROD-04; AAA-07/21                                                                                                                |
| D13-06 | PROD-05/06; AAA-19/24                                                                                                             |
| D13-07 | PROD-07/08/09; AAA-28                                                                                                             |
| D13-08 | PROD-01/12; AAA-13/14/15/35/36                                                                                                    |
| D13-09 | AAA-19/21/23/25/26/27/31/32; PROD-11/13                                                                                           |
| A01    | AAA-02, AAA-06, AAA-21, AAA-29, AAA-36, AAA-40, AAA-41, PROD-01, PROD-14                                                          |
| A02    | AAA-06, AAA-15, AAA-29, AAA-41                                                                                                    |
| A03    | AAA-30, AAA-34, AAA-41                                                                                                            |
| A04    | AAA-05, AAA-18, AAA-30, AAA-34, AAA-41, PROD-02, PROD-10                                                                          |
| A05    | AAA-02, AAA-06, AAA-20, AAA-28, AAA-33, AAA-37, AAA-41, PROD-03, PROD-14                                                          |
| A06    | AAA-05, AAA-16, AAA-17, AAA-24, AAA-30, AAA-33, AAA-41, PROD-03, PROD-05                                                          |
| A07    | AAA-03, AAA-07, AAA-09, AAA-33, AAA-41, PROD-04, PROD-11                                                                          |
| A08    | AAA-02, AAA-03, AAA-08, AAA-25, AAA-27, AAA-33, AAA-41                                                                            |
| A09    | AAA-03, AAA-09, AAA-10, AAA-11, AAA-21, AAA-27, AAA-40, AAA-41                                                                    |
| A10    | AAA-03, AAA-10, AAA-12, AAA-19, AAA-31, AAA-36, AAA-41, PROD-04                                                                   |
| A11    | AAA-05, AAA-10, AAA-16, AAA-17, AAA-18, AAA-24, AAA-32, AAA-41, PROD-02, PROD-06                                                  |
| A12    | AAA-06, AAA-25, AAA-33, AAA-37, AAA-41                                                                                            |
| A13    | AAA-06, AAA-12, AAA-21, AAA-26, AAA-37, AAA-41                                                                                    |
| A14    | AAA-05, AAA-22, AAA-23, AAA-24, AAA-31, AAA-41, PROD-06                                                                           |
| A15    | AAA-01, AAA-04, AAA-16, AAA-34, AAA-36, AAA-41                                                                                    |
| A16    | AAA-04, AAA-27, AAA-34, AAA-40, AAA-41                                                                                            |
| A17    | AAA-06, AAA-18, AAA-28, AAA-39, AAA-41, PROD-03, PROD-07, PROD-08, PROD-09                                                        |
| A18    | AAA-04, AAA-14, AAA-15, AAA-20, AAA-33, AAA-41, PROD-12                                                                           |
| A19    | AAA-01, AAA-04, AAA-13, AAA-24, AAA-35, AAA-36, AAA-38, AAA-41, AAA-42, PROD-01                                                   |
| A20    | AAA-02, AAA-04, AAA-19, AAA-22, AAA-31, AAA-32, AAA-36, AAA-37, AAA-38, AAA-39, AAA-40, AAA-41, AAA-42, PROD-12, PROD-13, PROD-14 |

Os [80 critérios](03_build/tracking/production_quality_traceability.json) estão mapeados com fronteira/testMethod; mapeamento não é prova de cumprimento. A matriz de auditoria cobre 39 RF, 31 RNF, 9 UC, 29 incrementais e plataforma. PROD-01 deve abrir toda linha ainda parcial/ausente/não verificada e vinculá-la ao contrato específico, antes de aceitar completude de produto. AAA-35/41 devem rejeitar requisito órfão ou apenas testado em biblioteca isolada.

## Protocolo de entrega ao próximo agente

1. Iniciar **PROD-01**: ler instruções/estado/log/backlog, comparar snapshot atual, identificar arquivos alterados desde auditoria e preparar SPEC das correções P1.
2. Reservar task pronta pelo DAG cumulativo, ler contrato inteiro, verificar autorização já existente e registrar somente decisão faltante. Não pedir autorização novamente para ação já coberta.
3. Implementar dentro dos paths; testar negativos e fronteira real; publicar IMPLEMENTED com evidências. Novo revisor julga e o integrador fecha.
4. Atualizar fonte canônica da task, evidência, índices/log/estado. Recalcular candidato depois de mudanças; certificados anteriores permanecem históricos.
5. Ao chegar a AAA-42, entregar pacote instalável e dossiê de prontidão autorizado, incluindo PROD-13; qualquer gate pendente implica conclusão limitada, nunca produção pronta por média.
