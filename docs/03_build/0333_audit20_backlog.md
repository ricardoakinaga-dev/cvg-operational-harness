# Backlog executivo — AUD-20260920-REAUDIT

## Contrato do backlog

- programa: `AUD-20260920-REAUDIT`;
- estado: `READY_FOR_NEXT_STEP / G20-1_AUTHORIZED`;
- produção: `NO_GO`;
- autoridade de origem: auditoria `0565`;
- `AUD20-001`–`AUD20-007` estão verificadas no escopo local; `AUD20-008` é a
  próxima task; `AUD20-009`–`AUD20-018` estão autorizadas por dependência
  sequencial e não podem avançar antes dos gates técnicos correspondentes;
- cada task exige DISCOVERY, PRD/SPEC quando aplicável, gate humano, testes e
  evidência própria;
- dados reais, serviços externos, piloto e produção permanecem proibidos sem
  autorização separada.

## P0 — barra e composição bloqueantes

### AUD20-001 — Tornar eval 97% bloqueante

- status: `IN_PROGRESS / G20-1_AUTHORIZED`;
- finding: `A20-F01`;
- owner sugerido: quality/agent-evals;
- escopo: runner, report, verifier, decision engine e `EV-016/021/031`;
- pronto quando: runtime integrado alcança `>=97%` em holdout selado e qualquer
  resultado inferior produz `FAIL`, nunca `PASS` ou promoção AAA;
- provas: negativos de threshold, corpus versionado e denominator report.

### AUD20-002 — Alinhar coverage e mutation guard ao contrato

- status: `VERIFIED_LOCAL / PASS_LOCAL`, dependência: `AUD20-001`;
- finding: `A20-F02`;
- owner sugerido: quality/test architecture;
- escopo: `vitest.config.mts`, módulos críticos e mutation testing selecionado;
- pronto quando: 90/90/90/85 globais, 95% branches nos módulos definidos e
  mutation guard de 100% demonstrado, com negativo para redução de threshold.
- evidencia: `docs/04_audit/evidence/AUD-20260920/AUD20-002/`; Node `v22.23.2`;
  global 90.15/85.20/92.32/90.75; critical branches 95.42%–99.42%; mutation
  3/3 mortos; focused 146 PASS/6 skipped; typecheck/lint/format/diff PASS.
- proxima dependencia: `AUD20-003`; `G20-2` continua fechado ate `AUD20-004`
  e os controles negativos do conjunto.

### AUD20-003 — Inventariar e governar todos os skips

- status: `VERIFIED_LOCAL / PASS_LOCAL`, dependência: `AUD20-001` e `G20-2`;
- finding: `A20-F03`;
- owner sugerido: quality/release;
- escopo: certificador, Vitest, catálogo PostgreSQL e testes condicionais;
- pronto quando: cada arquivo/teste skipped possui ID, motivo, owner e gate
  dedicado executado; skip desconhecido ou obrigatório falha a certificação;
- incluir `continuous-worker-entrypoint.integration.test.ts` no catálogo
  apropriado.
- evidencia: `docs/04_audit/evidence/AUD-20260920/AUD20-003/`; candidate/run
  definitivos estao vinculados no manifesto da evidencia; Node `v22.23.2`;
  catalogo 35 contratos, 138 skips deduplicados, zero falhas; PostgreSQL
  35/234 PASS sem skips.
- resultado: catalogo com hash de origem, owner, motivo e gate dedicado;
  self-test rejeita skip desconhecido e requerido; reports de unit, PostgreSQL
  e chaos estao vinculados ao mesmo candidate/run.
- proxima dependencia: `AUD20-004`; `G20-2` continua fechado ate AUD20-004 e
  seus controles negativos.

### AUD20-004 — Tornar a identidade Phase 4A exata

- status: `VERIFIED_LOCAL / PASS_LOCAL`, dependência: `AUD20-001` e `G20-2`;
- finding: `A20-F13`;
- owner sugerido: release/governance;
- escopo: `phase4a-gate-identity.mjs` e testes;
- pronto quando: cardinalidade e significado dos digests são exatos e o caso
  "âncora + digest extra" falha.
- evidencia: `docs/04_audit/evidence/AUD-20260920/AUD20-004/`; Node
  `v22.23.2`; anchor `6185c586e382...`; identidade live PASS com um único
  digest compartilhado; teste de cardinalidade extra PASS fechado.
- resultado: somente declarações semânticas `candidate:`/`Candidate digest:`
  são consideradas; fingerprints, hashes de reports e errata histórica não
  alteram a identidade autoritativa.
- proxima dependencia: `AUD20-005`; `G20-2` continua fechado ate seus
  controles negativos.

### AUD20-005 — Corrigir rate limiter least-privilege

- status: `VERIFIED_LOCAL / PASS_LOCAL`, dependência: `G20-2`;
- finding: `A20-F04`;
- owner sugerido: backend/data/security;
- escopo: migration 0023, grants, preflight e composição do servidor;
- pronto quando: papel runtime distinto executa request ordinário com limiter,
  falta de grant/tabela/índice falha o startup e `/health` não mascara o erro;
- incluir teste negativo por privilégio insuficiente.
- evidencia: `docs/04_audit/evidence/AUD-20260920/AUD20-005/`; Node
  `v22.23.2`; PostgreSQL descartável em `127.0.0.1:55432`; suite focada da
  API 35/35, gate PostgreSQL completo 35 arquivos/237 testes sem skips e
  request ordinária com runtime role separada.
- resultado: migration role passou a possuir a tabela operacional no catálogo;
  preflight estrutural verifica tabela/colunas/constraints/indices em todo modo
  PostgreSQL; runtime preflight exige SELECT/INSERT/UPDATE/DELETE e nega
  TRUNCATE/TRIGGER/REFERENCES; grants são explícitos na fixture.
- proxima dependencia: `AUD20-006`; `G20-2` continua fechado ate seus
  controles negativos.

### AUD20-006 — Tornar migration 0021 e preflight fail-closed

- status: `VERIFIED_LOCAL / PASS_LOCAL`, dependência: `G20-2`;
- finding: `A20-F09`;
- owner sugerido: data/integrity;
- escopo: duplicatas legadas, índice único, `indisvalid/indisready`, definição
  de índice/constraint e upgrade concorrente;
- pronto quando: duplicatas são reconciliadas deterministicamente ou bloqueiam
  a migration, o índice é obrigatório no preflight e concorrência converge.
- evidencia: `docs/04_audit/evidence/AUD-20260920/AUD20-006/`; Node
  `v22.23.2`; PostgreSQL descartavel 35/251 PASS sem skips; certificacao
  integrada 16/16 gates PASS; coverage critica e mutation guard PASS.
- resultado: migration fail-closed, preflight semantico do indice e concorrencia
  concorrente verificados localmente.
- proxima dependencia: `AUD20-007`; `G20-2` continua fechado ate seus
  controles restantes.

### AUD20-007 — Preservar causalidade imutável de approvals

- status: `VERIFIED_LOCAL / PASS_LOCAL`, dependência: `G20-2`;
- finding: `A20-F08`;
- owner sugerido: agent-core/data/audit;
- escopo: approval store, reconciliador, worker e audit event;
- SPEC: `docs/04_audit/evidence/AUD-20260920/AUD20-007/SPEC.md`;
- pronto quando: actor, reason, correlation, policy, payload hash e command key
  são persistidos na decisão e recuperados sem fabricação pelo worker;
- prova: crash depois da decisão e antes do audit, recuperado somente pelo
  worker, preserva a narrativa original uma única vez.
- evidencia: `docs/04_audit/evidence/AUD-20260920/AUD20-007/`; Node
  `v22.23.2`; PostgreSQL descartavel 35/252 PASS sem skips; certificacao
  integrada 16/16 gates PASS; coverage critica e mutation guard PASS.
- resultado: migration 0024, route, approval store e recovery fail-closed
  preservam actor, reason, correlation, policy, payload hash e command key sem
  valores fabricados pelo worker.
- proxima dependencia: `AUD20-008`; `G20-2` continua fechado ate seus
  controles restantes.

### AUD20-008 — Adicionar fencing ao replay/webhook lease

- status: `IMPLEMENTED_LOCAL / I1_REJECTED_EVIDENCE / G20-2_CLOSED`;
- revisão independente em 28/09/2026: [parecer I1](../04_audit/evidence/AUD-20260920/AUD20-008/I1-20260928.md) rejeitou fechamento histórico. Os seis arquivos próprios passaram SHA-256, mas 33 artefatos compartilhados, inclusive candidato/resultado, divergem; sentinel ainda não existe. Preservar `A21-F20` aberto até novo pacote verificável e parecer no mesmo run/candidate;
- finding: `A20-F10`;
- owner sugerido: security/data;
- escopo: reserve/commit/release em memory e PostgreSQL;
- pronto quando: cada reserva recebe geração/token e um holder antigo não
  consegue confirmar ou liberar o lease retomado por outro processo.

### AUD20-009 — Fechar replay de token e privacidade do rate key

- status: `READY / G20-1_AUTHORIZED`, dependência: `G20-2`;
- finding relacionado: `A20-F04` e auditoria de segurança;
- owner sugerido: identity/security;
- escopo: autenticar assinatura antes do claim distribuído, preservar
  atomicidade do `jti`, hashear chaves operacionais e evitar que eviction de
  bucket ativo resete orçamento;
- pronto quando: token forjado não polui/preclama o store e churn não reinicia
  limite de um subject ativo.

### AUD20-010 — Vincular egress validado à conexão

- status: `READY / G20-1_AUTHORIZED`, dependência: `G20-2`;
- finding: `A20-F07`;
- owner sugerido: security/integrations;
- escopo: shared SSRF guard e todos os adapters outbound;
- pronto quando: IP validado é o IP conectado, SNI/Host permanecem corretos,
  redirects repetem a regra e credenciais exigem HTTPS salvo loopback
  explicitamente controlado;
- prova: rebinding real entre check e connect não alcança rede privada.

## P1 — composição, recuperação e qualificação

### AUD20-011 — Compor identidade confiável no web

- status: `READY / G20-1_AUTHORIZED`, dependência: `G20-2`;
- finding: `A20-F05`;
- owner sugerido: frontend/security;
- escopo: bootstrap, `ApiSession`, token auth e remoção da autoridade
  simulada fora de perfil de teste explícito;
- pronto quando: login, expiração, 401/re-auth, troca de tenant e roles são
  definidos pela identidade confiável e cobertos por E2E.

### AUD20-012 — Corrigir preflight, readiness e health do worker homologado

- status: `READY / G20-1_AUTHORIZED`, dependência: `G20-2`;
- finding: `A20-F06`;
- owner sugerido: runtime/operations;
- escopo: entrypoint homologado, PostgreSQL/RLS preflight, readiness antes do
  consumo e health independente de sweep;
- pronto quando: outage de DB/fila/exporter aparece pelo processo real,
  readiness nunca é emitida no shutdown e falha de sweep não oculta health.

### AUD20-013 — Exportar telemetria e reduzir hotspots com caracterização

- status: `READY / G20-1_AUTHORIZED`, dependência: `G20-2`;
- finding relacionado: QAUD20-03/06;
- owner sugerido: architecture/observability;
- escopo: exporter não produtivo, alertas e extrações incrementais de
  `server.ts`, `postgres.ts`, approval engine e platform web;
- pronto quando: ownership é explícito, testes de caracterização preservam
  comportamento e falha do exporter não viola safety.

### AUD20-014 — Provar load, restore e rollback PostgreSQL

- status: `READY / G20-1_AUTHORIZED`, dependência: `G20-2`;
- finding: `A20-F11`;
- owner sugerido: data/SRE;
- escopo: API → PostgreSQL → worker, backup/restore e migration rollback;
- pronto quando: execuções repetidas medem workload declarado e comparam
  checksums/linhas, RLS, roles, grants, outbox, journals e leituras da aplicação;
- RPO/RTO produtivo continua fora de escopo até `G20-5`.

### AUD20-015 — Completar UX, acessibilidade e browser support

- status: `READY / G20-1_AUTHORIZED`, dependência: `G20-2`;
- finding: `A20-F14`;
- owner sugerido: frontend/quality;
- escopo: authz, dados tenant-specific, recovery, foco, contraste, WCAG A/AA,
  reduced motion e Firefox/WebKit;
- pronto quando: a matriz de suporte é decisão explícita e cada browser
  declarado passa; browser não suportado é documentado sem overclaim.

### AUD20-016 — Vincular CI, runtime, imagem e candidato

- status: `READY / G20-1_AUTHORIZED`, dependência: `G20-2`;
- finding: `A20-F12`;
- owner sugerido: release/supply-chain;
- escopo: Node 22, imagem por digest, build/smoke não-root, SBOM, licenses,
  load/restore e certificação no CI;
- pronto quando: source digest, runtime, image digest e todos os artefatos
  pertencem ao mesmo run e são verificáveis offline.

### AUD20-017 — Reconciliar autoridade documental e proveniência

- status: `READY / G20-1_AUTHORIZED`, dependência: `G20-2`;
- finding: `A20-F12`, `A20-F15`;
- owner sugerido: governance/docs;
- escopo: mapa novo de autoridade, escopo do candidate digest, links
  portáveis, histórico imutável e pacote de crítica;
- pronto quando: cada fonte tem owner/freshness, artefatos históricos não são
  tratados como atuais e crítica registra agent/session, timestamp, packet
  hash, independência e sentinel.

### AUD20-018 — Congelar e auditar o novo candidato

- status: `READY / G20-1_AUTHORIZED`, dependência: `AUD20-001`–`017`, `G20-4`;
- owner sugerido: audit/release;
- dependências: `AUD20-001` a `017` no escopo aprovado;
- pronto quando: todos os gates contratuais passam no mesmo candidato, pacote
  integral é selado, crítico I1 novo decide sem reparo e sentinel retorna
  `MATCH`;
- decisão humana permanece separada da decisão técnica.

## P2 — autoridade externa separada

### AUD20-019 — Validar IdP, provider e canais externos

- status: `BLOCKED_BY_G20-5`;
- owner sugerido: security/integrations/operations;
- escopo: somente após autorização, credenciais, ambiente, dados e rollback
  aprovados;
- pronto quando: identidade, provider e canais passam testes de contrato,
  falha, rate, observação e handoff sem ação sensível automática.

### AUD20-020 — Medir RPO/RTO e preparar piloto limitado

- status: `BLOCKED_BY_G20-5`;
- owner sugerido: SRE/business/security/privacy;
- escopo: ambiente explicitamente autorizado; nenhum piloto é executado por
  esta task de planejamento;
- pronto quando: RPO/RTO, rollback, incident response, privacy/security e
  signoffs humanos estão registrados, e o plano do piloto tem kill switch,
  limites e owners.

## Ordem recomendada

`001–004` → `005–010` → `011–013` → `014–015` → `016–018`.
`019–020` permanecem fora dessa autorização e dependem de `G20-5`.
