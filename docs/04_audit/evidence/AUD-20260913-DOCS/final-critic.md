# Crítica final independente — I1

Data: 2026-09-13. Escopo: suficiência técnica do sistema perante `docs/02_spec/aaa_quality_contract.md` §2 e `docs/04_audit/evidence/AAA/AAA-04/quality-bar.json` v2; auditoria documental, sem BUILD. Candidato: `/tmp/cvg-docs-audit-20260913-_uu7d641/candidate`.

**Sistema perante a barra: REJECT. Evidência suporta os achados técnicos abaixo: APPROVE, nos limites declarados. Aceite integral do relatório por item/notas: BLOCKED nesta revisão, porque a tarefa deliberadamente vedou ler report-draft e pareceres anteriores; não atribuo aprovação a um relatório que não inspecionei.**

Independência: **I1 / sealed / none** — contexto fresco para esta crítica, sem notas/pareceres anteriores ou report-draft como insumo, sem subagentes. Os quatro documentos operacionais obrigatórios foram consultados como contexto de governança; suas alegações históricas não fundamentam o veredito. Nenhum dataset holdout foi aberto. `sealed` descreve o isolamento desta revisão, não certificação integral ou selo de produção.

## Contraexemplo decisivo

**Q-A14-02 (HIGH obrigatório): FAIL.** O contrato exige `/ready` consultar dependências com timeout e devolver 503 quando indisponíveis. `apps/api/src/readiness.ts:25` classifica persistência PostgreSQL como `ok` pelo modo configurado; `apps/api/src/server.ts:447` consome essa avaliação sem consulta ao banco. Executei independentemente:

`NODE_ENV=test node --import tsx /tmp/cvg-final-ready.ts`

O probe importa o servidor do candidato, injeta cliente PostgreSQL cuja query sempre lança erro sintético e chama os endpoints públicos via Fastify inject. Resultado atual em `/tmp/cvg-final-acceptance-readiness.log`: `/ready` HTTP 200, `ready:true`, todos checks `ok`, `queries:0`; `/live` HTTP 200. É prova suficiente para rejeitar ≥97 na área A14 e, pela regra de não compensação, o selo AAA global.

Limites: teste controlado, sem rede/banco real. Não prova que startup de produção aceita cliente não tenant-scoped: `/tmp/cvg-final-ready.log` mostra justamente rejeição dessa configuração em produção. Não extrapolo este contraexemplo para disponibilidade ou outage real. A falha de readiness, contudo, é literal contra o critério e independe dessa extrapolação. Nomes corretos dos probes fornecidos: `/tmp/cvg-final-ready.ts`, `...-ready-controlled.log` e `...-ready.log`.

## Outros achados sustentados

1. **Persistência de rascunho e auditoria sem atomicidade.** Li `/tmp/cvg-audit-backend-pg-probe.ts` e `.log`. O probe usa PostgreSQL descartável, cria trigger que rejeita INSERT em audit_events e chama createOwnerDraft. Log: erro sintético; `draftsAfterFailedMutation:1`; replay retorna `draft`; `auditRowsAfterReplay:0`. Código real em `packages/persistence/src/journeys-postgres.ts:450`: consulta por chave existente retorna antes de tentar auditoria; INSERT de rascunho precede appendJourneyAuditScoped (`:523`). `packages/persistence/src/tenant-scoped-postgres.ts:84` define contexto de sessão, sem BEGIN/COMMIT para a operação. Portanto o erro permite rascunho persistido sem sua trilha, e replay não a recompõe. Evidência suporta gap de integridade/auditoria; não alegar perda de consulta real ou efeito externo. Não reexecutei esse probe SQL nesta crítica; autoria anterior + log bruto + leitura independente de implementação sustentam o achado, com essa limitação explícita.

2. **Resposta antiga de tenant sobrescreve UI no tenant seguinte.** Li `/tmp/cvg-audit-ui/race.cjs` e `.log`. A interceptação Playwright retém busca de tenant_A, muda formulário para tenant_B e entrega resposta A. Log: `tenant_B`, `staleTenantCandidateVisible:true`. `apps/web/src/features/journeys/index.tsx:47` limpa estado ao mudar identityKey, mas `:83` aplica resultado assíncrono sem verificar geração/identidade ou cancelar pedido. Evidência sustenta mistura visual de contexto e lacuna A17; não prova bypass de RLS, acesso não autorizado a API ou ação real. Não reexecutei browser nem inspecionei screenshot nesta crítica. O mesmo log verifica skip-link com foco correto, o que é evidência positiva específica e não elimina a corrida.

Os seis arquivos centrais inspecionados (server, readiness, App, journeys UI, journeys-postgres e postgres) foram comparados por bytes entre origem e candidato: iguais. Isso vincula a inspeção da origem ao candidato; não substitui manifesto de execução retroativo dos probes SQL/UI.

## Evidência positiva e limites da conclusão

Logs brutos do diretório pai conferidos: coverage 233 arquivos PASS / 6 skipped, 1.616 testes PASS / 67 skipped; 95,56% statements, 92,06% branches, 95,81% functions, 96,18% lines; PostgreSQL 15 arquivos / 131 testes PASS; E2E 6 PASS; construction readiness 4 PASS. Não executei geradores ou suites globais no candidato. Estes resultados demonstram comportamentos testados; coverage global não substitui branches críticos/mutação, nem os 67 skips podem ser classificados como obrigatórios apenas pela contagem. Construction readiness não equivale ao contrato operacional de `/ready`.

Não validei integralmente 80 critérios, 20 notas, cada RF/SPEC ou artefatos externos. A barra exige ≥97 em cada área e todos BLOCKING/HIGH atuais; um HIGH comprovadamente falho já torna REJECT conclusivo. Não concedo produção, qualificação operacional, state of art ou autorização humana. O relatório final deve manter fonte documental, localização de código, evidência atual/histórica e limites por item; notas devem usar as cinco dimensões §2, sem substituir gates por média. Esta crítica não certifica essas propriedades editoriais ainda não inspecionadas.

## Sentinel e preservação

**Sentinel limpo, zero alterações** entre fingerprints pré/pós para origem e candidato. Arquivos: `/tmp/cvg-final-acceptance-before.json`, `/tmp/cvg-final-acceptance-after.json`, `/tmp/cvg-final-acceptance-sentinel.json`.

Fingerprint diagnóstico de mapa path→SHA256 (não candidateId canônico AAA): origem 2.614 arquivos, digest `12cef607459fed0d7e5d5a5fd0a5a39d86158970333ead84c43dd48cef7095aa`; candidato 2.532 arquivos, digest `91496a450d1ffd98767ee67941996ceee9180a2eae9856abe363a84d255fa54d`. Exclusões iguais antes/depois: `.git`, `node_modules`, `dist`, `coverage`, `.next`, `.turbo`, `test-results`, `playwright-report`. Inclusão de documentos/evidências torna esse sentinel mais amplo que o núcleo de fonte, mas não inclui caches/builds excluídos.

Nenhum arquivo da origem ou candidato escrito; somente artefatos próprios em `/tmp`. Nenhum dado real, chamada a provider externo, ação clínica/financeira, envio ou deploy. Atualizações de runtime/log/backlog ficam a cargo do coordenador desta rodada.
