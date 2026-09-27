# Backlog AUD54 — achados RA25 da auditoria 0573 — 24/09/2026

Fonte: [auditoria 0573](../04_audit/0573_repository_audit_executed_gates_2026-09-24.md).
Sequência e gates em [roadmap 0350](0350_audit0573_roadmap.md). Este backlog
não substitui [0344](0344_reaudit_m07_backlog.md), que continua sendo o
registro do ciclo M07-S1. Produção `NO_GO`.

## Estado na emissão de 24/09/2026

Os estados nos itens abaixo são a fotografia da emissão original. Para o
estado vigente reconciliado, consulte o [backlog mestre](../30_backlog_master.md)
e o [programa de produção 0356](0356_production_backlog_2026-09-26.md).

Atualização de 27/09/2026: [0574](../04_audit/0574_aud0573_execution_evidence_2026-09-25.md)
comprova RA25-01/02/03/06/08/09 concluídas e RA25-10 com política registrada;
[0575](../04_audit/0575_aud53_closure_rebind_decision_packet.md) concluiu
RA25-04/11. RA25-07 teve fatias 1–3 executadas e permanece aberta para as
fatias restantes; RA25-05 requer matriz atual e decisão humana aplicável.
Nenhum estado histórico `PROPOSED` abaixo deve ser lido como estado vigente.

- Todos os itens abaixo estão `PROPOSED / NOT_STARTED` até decisão humana de
  escopo; nenhum comando de produto foi executado por esta auditoria.
- RA25-03 corresponde à `RA24-04-CHECKER` já proposta na
  [priorização 0349](0349_ra24_resolution_priorities.md); RA25-06 corresponde
  a `RA24-05`. As duas reaproveitam o ID novo só para manter a rastreabilidade
  desta auditoria; o vínculo deve ser preservado ao executar.

## D0 — preservar e desbloquear o CI

### RA25-01 — Commit do trabalho pendente (P0)

- Estado: `PROPOSED / WAITING_HUMAN_APPROVAL`.
- O que/onde: 344 entradas de `git status --porcelain` (179 modificados com
  +31.784/−7.673 e 165 não rastreados com ~22k LOC), incluindo
  `apps/api/src/operator-session.ts`, `apps/worker/src/homolog-worker.ts`,
  `apps/web/src/auth/` e `apps/web/src/features/platform/TraceViewer.tsx`.
- Como: revisar o diff por lógica coerente, separar em lotes temáticos
  (testes, features de sessão/homolog, correções de CI, documentação) e
  commitar com mensagens no padrão do repositório; se a separação não for
  segura nesta rodada, registrar `git stash` explícito com inventário em
  evidência.
- Dependência/gate: decisão humana de escopo; não exige gate de BUILD porque
  não altera comportamento, mas exige que `npm test`, `typecheck` e `lint`
  continuem verdes após o commit.
- Critério de pronto: `git status --porcelain` vazio ou com escopo declarado
  em evidência; `npm run typecheck`, `npm run lint` e `npm test` `PASS`;
  `git log --oneline` mostra os lotes.

### RA25-02 — Formatação Prettier (P0)

- Estado: `PROPOSED`.
- O que/onde: 24 arquivos apontados por `npm run format:check`, incluindo
  `docs/20_master_execution_log.md`, `docs/99_runtime_state.md`,
  `docs/30_backlog_master.md`, `docs/README.md`,
  `docs/04_audit/0572_repository_score_assessment_2026-09-24.md`,
  `packages/conversation/src/__tests__/postgres-store.unit.test.ts`,
  `scripts/workspace-dependency-audit.mjs` e
  `tests/workspace-dependency-audit.test.js`.
- Como: `npx prettier --write` somente nos arquivos listados; conferir com
  `git diff --word-diff` que nenhuma mudança foi semântica em ledgers
  append-only.
- Dependência/gate: RA25-01 deve estar decidido para não misturar formatação
  com trabalho pendente no mesmo commit.
- Critério de pronto: `npm run format:check` exit 0; `npm run diff:check`
  `PASS`; `npm test` `PASS`.

### RA25-08 — Arquivo LICENSE

- Estado: `PROPOSED`.
- O que/onde: criar `LICENSE` na raiz compatível com `"license": "ISC"` em
  `package.json`.
- Como: confirmar a licença pretendida com o usuário antes de escrever o
  texto; incluir o arquivo no diff check e no SBOM.
- Dependência/gate: decisão humana sobre a licença; nenhum gate de BUILD.
- Critério de pronto: `LICENSE` presente, `npm run licenses:check` `PASS` e
  `npm run sbom` gera artefato sem aviso de licença ausente.

## D1 — gates de documentação verdes

### RA25-03 — Corrigir falsos positivos do checker de links (alias RA24-04-CHECKER)

- Estado: `PROPOSED / SPEC_AND_BUILD_GATE_REQUIRED`.
- O que/onde: `scripts/check-doc-links.mjs` e seus testes; hoje exit 1 com 5
  ocorrências de extração em `docs/02_spec/0129_l03_operational_index_generator.md`
  e `docs/04_audit/evidence/AUD-20260924/L03-generator-spec/critique-and-revision-03.md`.
- Como: congelar fixtures positivas e negativas (inline code, fences, exemplos
  Markdown em prosa, links relativos válidos e quebrados); fazer o parser não
  atravessar blocos; preservar a detecção de link realmente quebrado.
- Dependência/gate: SPEC curta e gate de BUILD próprios; não editar a SPEC L03
  draft nem a crítica histórica, pois isso mudaria hashes já registrados.
- Critério de pronto: `node scripts/check-doc-links.mjs README.md docs` exit
  0; um link propositalmente quebrado continua rejeitado; `npm test` `PASS`.

### RA25-04 — Reconciliar frescor e ponteiros de navegação

- Estado: `PROPOSED / DOCUMENTARY`.
- O que/onde: `README.md` raiz (seção `Estado atual — 2026-09-20`),
  `docs/README.md`, `docs/99_operational_index.md` e a divergência entre
  AUD53/C1M em `docs/03_build/0344_reaudit_m07_backlog.md` e AUD52/C1L nos
  ledgers mestres.
- Como: atualizar a data e o estado do README para o ciclo corrente;
  reconciliar os ponteiros sem alterar registros históricos nem apagar
  resultados `FAIL / OPEN`; preservar os hashes já citados.
- Dependência/gate: trabalho documental; recomenda-se concluir após RA25-01 e
  RA25-02 para não reabrir o diff.
- Critério de pronto: README, índice e ledgers apontam o mesmo ciclo;
  `npm run docs:check-links` sem regressão; `npm test` (pacote documental)
  `PASS`.

## D2 — matriz fresca de produto

### RA25-05 — Candidate novo e matriz completa sob gate próprio

- Estado: `PROPOSED / BLOCKED_BY_C1M`.
- O que/onde: concluir o packet `A24-03-C1M-PACKET` em
  `docs/04_audit/evidence/AUD-20260924/M07-S1-C1M/`, obter decisão hash-bound
  e executar a matriz sobre candidate novo.
- Como: manter a sequência já descrita em [0344](0344_reaudit_m07_backlog.md)
  (baseline de 973 inputs, preview limitado, quality bar, rollback, hashes
  reproduzíveis); sob Node 22 executar freeze, inventário, testes
  focados/completos, typecheck, lint, cobertura e pós-check.
- Dependência/gate: D0 e D1 concluídos; decisão humana hash-bound para C1M;
  I1 e Final Critic obrigatórios e devem estar disponíveis.
- Critério de pronto: candidate novo sem drift de pós-check; matriz inteira
  `PASS` com relatórios datados desta rodada; I1 e Final Critic aceitos; os 11
  findings de inventário tratados ou explicitamente adiados para M07-S4.

### RA25-09 — Reprovar gates históricos não executados nesta rodada

- Estado: `PROPOSED`.
- O que/onde: `npm run test:postgres`, `npm run test:load`,
  `npm run test:restore`, `npm run test:chaos` e `npm run test:evals` — hoje
  disponíveis no `verify.yml` mas não executados nesta auditoria.
- Como: rodar sob Node 22 com Postgres 16 descartável e registrar saídas
  novas em `certification/`, sem sobrescrever logs históricos.
- Dependência/gate: D0 concluído (para não poluir o worktree) e ambiente com
  Postgres descartável.
- Critério de pronto: relatórios novos com data desta rodada; `npm run verify`
  completo exit 0.

## D3 — qualidade estrutural

### RA25-06 — Redação de erro no entrypoint do worker (alias RA24-05)

- Estado: `PROPOSED / SPEC_AND_BUILD_GATE_REQUIRED`.
- O que/onde: `apps/worker/src/main.ts`, catchs de startup que registram
  `error.message` fora do `CompositeTelemetry`.
- Como: caso negativo com mensagem sintética contendo segredo, token, URL com
  credencial e PII; aplicar a política de redação no boundary; verificar
  saída JSON sem exposição.
- Dependência/gate: D2 concluído; SPEC curta e gate de BUILD próprios.
- Critério de pronto: teste negativo verde; `typecheck`, `lint`, `npm test` e
  cobertura `PASS`; nenhuma mudança de exit code nem de fail-closed.

### RA25-07 — Reduzir hotspots de arquivo

- Estado: `IN_PROGRESS / SLICE_1_AND_2_COMPLETED`.
- Fatia 1 (2026-09-25): 1 065 linhas movidas para
  `packages/harness/src/iterative-dispatch.ts`; `iterative-runtime.ts` caiu de
  2 455 para 1 488 linhas. Commit `a8d38ac`.
- Fatia 2 (2026-09-25): 816 linhas movidas para
  `packages/persistence/src/postgres-outbox.ts` (900 linhas);
  `postgres.ts` caiu de 3 354 para 2 572. Commit `916f684`; SPEC em
  [0134](../02_spec/0134_postgres_slice_extraction.md). Faltam as fatias 3
  (auditoria/checkpoint, 526 linhas) e 4 (inbound e sessão/task, ~907) para
  `postgres.ts` atingir ~1 400.
- Recon: [SPEC-STRUCT-001](../02_spec/0133_iterative_runtime_slice_extraction.md)
  mede a god-class de `packages/harness/src/iterative-runtime.ts` (classe aberta
  na linha 312, 49 métodos, 2 302 linhas) e fixa o plano da primeira fatia.
  Restam `server.ts` e `runtime.ts`, cada um com SPEC própria.
- O que/onde: `apps/api/src/server.ts` (5.857 linhas),
  `packages/persistence/src/postgres.ts` (3.354),
  `packages/agent-runtime/src/runtime.ts` (2.603),
  `packages/harness/src/iterative-runtime.ts` (2.455).
- Como: extrair módulos por domínio em slices pequenas e independentes, uma
  por gate, sem alterar comportamento nem contratos públicos.
- Dependência/gate: D2 concluído; cada fatia com task própria; proibido
  mistar extração com mudança de regra.
- Critério de pronto: fatia entregue com typecheck/lint/testes/coverage
  verdes; tamanho por arquivo abaixo de ~1.500 linhas nas fatias tocadas;
  nenhum drift de baseline não explicado.

## D4 — sustentação

### RA25-10 — Política de retenção de evidência

- Estado: `PROPOSED / DOCUMENTARY`.
- O que/onde: `docs/04_audit/evidence/` (47 MB, 2.988 arquivos) e os 231
  arquivos vazios já catalogados em
  `docs/04_audit/evidence/empty-artifact-status.json`.
- Como: propor política de arquivamento que preserv hashes e registros de
  comando auditados; nunca apagar evidência citada por gate; mover apenas o
  que não for referenciado.
- Dependência/gate: D2 concluído; aprovação humana sobre o que pode sair do
  alcance da varredura.
- Critério de pronto: política registrada em `docs/`; após aplicação,
  `npm run evidence:check-hygiene` exit 0 e `npm run docs:check-links` exit 0.

## AUD53 — correção estrutural do certificado

### RA25-11 — Closure registry vinculado à execução

- Estado: `COMPLETED` sob aprovação direta do usuário (“vamos de opção A”,
  2026-09-25) sobre o packet
  [0575](../04_audit/0575_aud53_closure_rebind_decision_packet.md).
- O que/onde: `scripts/lib/finding-governance.mjs`, `scripts/phase10-certify.mjs`,
  `scripts/lib/certification-rules.mjs`, `.gitignore`,
  `tests/rem21-findings.test.js`.
- Como: separar adjudicação (imutável, em REM21-019) de vínculo (gerado por
  execução). `issueClosureRegistry` emite `certification/finding-closure.json`
  com candidato, `runId` e `generatedAt` correntes; o arquivo passa a ser
  artefato gerado, excluído do candidato, e continua registrado no manifesto.
- Critério de pronto: `npm run certify` com 16 gates `PASS` sob `CI_RUN_ID`
  fixado e `npm run certification:verify` exit 0 com os 37 hashes verificados.
  **Cumprido** — ver [0575](../04_audit/0575_aud53_closure_rebind_decision_packet.md)
  e a SPEC [0132](../02_spec/0132_run_bound_closure_registry.md).
- Limite: não adjudica findings; `RA25-05` continua `BLOCKED_BY_C1M` e a janela
  de 24h e as checagens de vínculo não foram afrouxadas.

## Fora de escopo deste backlog

- M07-S2/S3/S4, M05 e os 50 melhoria de `0339`/`0340`/`0341` seguem os
  backlogs próprios.
- G21-5/G21-6 fechados; produção `NO_GO`; nenhum item aqui autoriza dado real,
  provider/canal, IdP, deploy ou ação clínica/financeira.
- As revisões I1 e Final Critic continuam obrigatórias e não podem ser
  substituídas por esta auditoria single-context.
