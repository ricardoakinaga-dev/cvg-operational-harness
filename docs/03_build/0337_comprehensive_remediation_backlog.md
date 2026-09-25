# Backlog executivo de remediação — AUD21

## Estado atual e relação com a carteira de 50 melhorias — 23/09/2026

REM21-019 concluiu a barra local com CONDITIONAL_PASS / FINAL_CERT_DEFERRED; o parecer I1 é condicional e A21-F20 continua aberto. REM21-009 concluiu somente preparação offline e a qualificação externa permanece BLOCKED_BY_G21-5. REM21-020 está bloqueada pelo mesmo gate. G21-6 e produção continuam NO_GO.

As 50 propostas novas estão detalhadas no [backlog 0341](0341_50_improvements_backlog.md), com [plano 0339](0339_50_improvements_executive_plan.md) e [roadmap 0340](0340_50_improvements_roadmap.md). M01 / AUD22-DOC-001 foi concluída documentalmente; a [próxima fatia local P1-S1](0342_next_stage_p1_s1.md) inicia M07 e M05 em Discovery/PRD/SPEC. Esta seção não reabre task histórica nem concede gate externo.

> **Registro histórico — 2026-09-22 antes de REM21-019:** REM21-017 = VERIFIED_LOCAL /
> FINAL_CERT_DEFERRED; o BUILD/AUDIT documental passou no run
> `run-rem21-017-final-2` e candidate
> `9efe1a104d4f77546c5d8f4c15f8bec0f4a4c5bb48844eb759e477f42e9d2bd6`, com
> links quebrados `0`, referências absolutas não allowlisted `0`, vazios
> catalogados `66/66`, 300 arquivos pass, 20 skips, 2.105 testes pass e 146
> skips. `REM21-015 = VERIFIED_LOCAL / FINAL_CERT_DEFERRED`; o BUILD/AUDIT
> local dos quatro slices de ownership passou no run
> `run-rem21-015-final-1` e candidate
> `5fb42a3bbf5ab2be4ce51966773868a1c25c66eb6eef4e72fd7a6095d60f2da1`, com zero
> drift. `REM21-014 = VERIFIED_LOCAL / FINAL_CERT_DEFERRED`; o browser proof
> trusted passou duas vezes no run `run-rem21-014-final-2` e candidate
> `f4f88e037214fe0cc54e446c9094a1bf7603da1f1b255cb5328427e3a73dfcf9`.
> `REM21-010 = VERIFIED_LOCAL / FINAL_CERT_DEFERRED`; o proof PostgreSQL passou
> duas vezes no run `run-rem21-010-final-3` e candidate
> `7e3a7feb86e8f2cd2f1f3a611e2d25b1a5211f98643d42bd6c4db62844f39edb`.
> `REM21-012`, `REM21-013` e `REM21-016` permanecem verificadas localmente;
> a próxima ação é Discovery/PRD/SPEC de `REM21-018`.
> Produção segue `NO_GO`; G21-5, G21-6, I1 e freeze continuam fechados.

## Contrato histórico do backlog no início de AUD21

- programa: `AUD21-COMPREHENSIVE-REMEDIATION`;
- origem: [auditoria 0566](../04_audit/0566_comprehensive_repository_audit_2026-09-21.md);
- estado: `IN_PROGRESS / REM21-018`; `REM21-008`, `REM21-010`, `REM21-011`,
  `REM21-014` e `REM21-015`
  verificadas localmente com evidência em seus diretórios
  `docs/04_audit/evidence/AUD-20260921/`;
- produção: `NO_GO`;
- escopo após `G21-1`: somente local, sintético e descartável;
- fonte operacional corrente deste programa: este arquivo; o backlog `0333`
  permanece como histórico e evidência do programa AUD20;
- nenhuma task pode pular `DISCOVERY -> PRD -> SPEC -> BUILD -> AUDIT`;
- evidência AUD20 pode ser reaproveitada somente após verificação de
  contrato, candidate, freshness e limitações;
- status corrente: `REM21-004 = VERIFIED_LOCAL / FINAL_CERT_DEFERRED`;
  `REM21-006 = VERIFIED_LOCAL / FINAL_CERT_DEFERRED`; `REM21-001` está
  `VERIFIED_LOCAL / I1_PENDING`, `REM21-002` está
  `VERIFIED_LOCAL / FINAL_CERT_DEFERRED`, `REM21-005` está
  `VERIFIED_LOCAL / FINAL_CERT_DEFERRED` e `REM21-008` está
  `VERIFIED_LOCAL / FINAL_CERT_DEFERRED`; `REM21-012` está em
  `VERIFIED_LOCAL / FINAL_CERT_DEFERRED`; `REM21-013` está em
  `VERIFIED_LOCAL / FINAL_CERT_DEFERRED`; `REM21-016` está em
  `VERIFIED_LOCAL / FINAL_CERT_DEFERRED`; `REM21-010` está em
  `VERIFIED_LOCAL / FINAL_CERT_DEFERRED`; `REM21-017` está em
  `VERIFIED_LOCAL / FINAL_CERT_DEFERRED`; demais tasks internas continuam
  `PROPOSED / READY_AFTER_G21-1` ou aguardam dependências;
- tasks externas: `BLOCKED_BY_G21-5`.
- autoridade: o envio humano do prompt `0338` registra `G21-1` somente para
  trabalho local, sintético e descartável; produção continua `NO_GO`.

## Matriz completa de cobertura dos achados

| Achado    | Impacto | Task primária   | Task de fechamento |
| --------- | ------- | --------------- | ------------------ |
| `A21-F01` | alto    | `REM21-002`     | `REM21-019`        |
| `A21-F02` | alto    | `REM21-003`     | `REM21-019`        |
| `A21-F03` | alto    | `REM21-004`     | `REM21-019`        |
| `A21-F04` | alto    | `REM21-005`     | `REM21-014/019`    |
| `A21-F05` | alto    | `REM21-006`     | `REM21-020`        |
| `A21-F06` | alto    | `REM21-009`     | `REM21-020`        |
| `A21-F07` | alto    | `REM21-010`     | `REM21-020`        |
| `A21-F08` | alto    | `REM21-008`     | `REM21-019`        |
| `A21-F09` | alto    | `REM21-006`     | `REM21-019`        |
| `A21-F10` | alto    | `REM21-007`     | `REM21-019`        |
| `A21-F11` | alto    | `REM21-001`     | `REM21-019`        |
| `A21-F12` | alto    | `REM21-011`     | `REM21-020`        |
| `A21-F13` | médio   | `REM21-001/016` | `REM21-019`        |
| `A21-F14` | médio   | `REM21-012`     | `REM21-019`        |
| `A21-F15` | médio   | `REM21-013`     | `REM21-019`        |
| `A21-F16` | médio   | `REM21-014`     | `REM21-019`        |
| `A21-F17` | médio   | `REM21-015`     | `REM21-019`        |
| `A21-F18` | médio   | `REM21-016`     | `REM21-019`        |
| `A21-F19` | médio   | `REM21-017`     | `REM21-019`        |
| `A21-F20` | médio   | `REM21-001`     | `REM21-019`        |
| `A21-F21` | médio   | `REM21-008`     | `REM21-019`        |
| `A21-F22` | médio   | `REM21-001/017` | `REM21-019`        |
| `A21-F23` | baixo   | `REM21-017`     | `REM21-019`        |
| `A21-F24` | baixo   | `REM21-018`     | `REM21-019`        |
| `A21-F25` | baixo   | `REM21-018`     | `REM21-019`        |
| `A21-F26` | baixo   | `REM21-017`     | `REM21-019`        |

## P0 — verdade, segurança e composição

### REM21-001 — Reconciliar control plane e AUD20-008

- prioridade/impacto: `P0 / alto`;
- status: `VERIFIED_LOCAL / I1_PENDING`;
- achados: `A21-F11`, `A21-F13`, `A21-F20`, `A21-F22`;
- origem AUD20: `AUD20-008`, `AUD20-017`;
- dependências: `G21-1`;
- superfície: runtime state, execution log, master backlog, índices 0300–0302,
  backlog 0333 e evidência `AUD20-008`;
- implementar: inspecionar hashes/candidato/resultados, obter crítica I1
  fresca ou manter `I1_PENDING`, registrar a transição real e apontar uma
  única próxima task; nunca promover por inferência;
- pronto quando: todos os registros concordam sobre o último fato confirmado,
  a evidência histórica continua intacta e não existe status ativo duplicado;
- prova: checker de links/estado, sentinel da evidência e revisão do diff
  apenas dos documentos afetados.

### REM21-002 — Tornar findings e decisão computados e fail-closed

- prioridade/impacto: `P0 / alto`;
- status: `VERIFIED_LOCAL / FINAL_CERT_DEFERRED`;
- achado: `A21-F01`;
- dependências: `REM21-001`;
- superfície: `certification/findings.json`, regras de certificação,
  certifier/verifier e testes de decisão;
- implementar: schema/proveniência/freshness dos achados, cálculo determinístico
  de severidade/scores, ligação ao candidate/run e rejeição de input manual,
  stale, ausente ou contraditório;
- pronto quando: P0/P1 alto atual bloqueia promoção, achado fechado exige
  evidência fresca, e alteração manual do JSON não produz `GO`;
- prova: testes negativos para P0, freshness, candidate mismatch, score
  fabricado e findings ausentes.

### REM21-003 — Autenticar antes do claim de replay

- prioridade/impacto: `P0 / alto`;
- status: `VERIFIED_LOCAL / FINAL_CERT_DEFERRED`;
- achado: `A21-F02`;
- origem AUD20: parte de `AUD20-009`;
- dependências: `REM21-002`;
- superfície: operator identity, middleware do servidor, store de replay em
  memória/PostgreSQL e testes de concorrência;
- implementar: validar assinatura/issuer/audience/tempo antes de reservar,
  derivar chave sem expor token, manter claim atômico e rollback seguro;
- pronto quando: token forjado nunca preclama `jti`, duas instâncias aceitam
  no máximo uma requisição legítima e falha de store é fail-closed;
- prova: teste negativo com token forjado usando o `jti` do token válido e
  teste PostgreSQL concorrente.

### REM21-004 — Vincular SSRF validado à conexão e exigir HTTPS

- prioridade/impacto: `P0 / alto`;
- status: `VERIFIED_LOCAL / FINAL_CERT_DEFERRED`;
- achado: `A21-F03`;
- origem AUD20: `AUD20-010`;
- dependências: `REM21-002`;
- superfície: shared SSRF, providers HTTP e adapters Chatwoot/Evolution;
- implementar: dial do IP aprovado ou proxy de egress, SNI/Host corretos,
  revalidação por redirect, bloqueio IPv4/IPv6 especial e HTTPS obrigatório
  para credenciais fora de loopback controlado;
- pronto quando: rebinding entre validação e connect não alcança rede
  privada e redirect/HTTP inseguros são rejeitados;
- prova: servidor DNS mutável sintético, casos IPv4/IPv6/redirect e teste dos
  adapters reais sem serviço externo.

### REM21-005 — Compor identidade confiável no frontend

- prioridade/impacto: `P0 / alto`;
- status: `VERIFIED_LOCAL / FINAL_CERT_DEFERRED`;
- achado: `A21-F04`;
- origem AUD20: `AUD20-011`;
- dependências: `REM21-003`;
- superfície: bootstrap web, `ApiSession`, router/UI, API de sessão e E2E;
- evidência corrente: `docs/04_audit/evidence/AUD-20260921/REM21-005/BUILD-AUDIT.md`;
- implementar: separar perfil simulado explicitamente test-only, obter roles e
  tenant de token/sessão confiável, tratar expiração, 401, reauth e troca de
  tenant sem authority injection;
- pronto quando: build qualificado não expõe campos de operador/admin simulados
  e E2E prova login, expiração, authz e isolamento de tenant;
- prova local: testes API/componente, scan do bundle trusted, smoke Chromium
  locked e E2E simulation explicitamente controlado; produção e browser
  matrix permanecem `NO_GO`/deferred.

### REM21-006 — Corrigir lifecycle e perfil do worker

- prioridade/impacto: `P0 / alto`;
- status: `VERIFIED_LOCAL / FINAL_CERT_DEFERRED`;
- achados: `A21-F05`, `A21-F09`;
- origem AUD20: `AUD20-012`;
- dependências: `REM21-002`;
- superfície: worker principal/homolog, preflight, health/readiness, drain e
  runbooks;
- implementar: preflight de DB/RLS/fila/exporter antes de ready, ready antes
  do consumo, not-ready no shutdown, health independente de sweep e perfil
  operacional fail-closed sem habilitação automática de produção;
- pronto quando: outage e grant ausente bloqueiam startup, ready nunca aparece
  após shutdown e SIGTERM drena sem perda/duplicação;
- prova: testes de processo/PG descartável e fault injection.

### REM21-007 — Proteger chaves e budgets do rate limiter

- prioridade/impacto: `P0 / alto`;
- status: `VERIFIED_LOCAL / FINAL_CERT_DEFERRED`;
- achado: `A21-F10`;
- origem AUD20: parte de `AUD20-009`;
- dependências: `REM21-002`;
- superfície: middleware, rate-limit stores, migration e retention;
- implementar: HMAC/versionamento de key, rotação sem reset indevido,
  expiração por janela e eviction que não remove budget ativo;
- pronto quando: banco/logs não contêm IP em claro, churn não restaura
  budget e instâncias convergem;
- prova: inspeção de linhas PostgreSQL, teste de churn/eviction e rotação.
- gate documental: `DISCOVERY_COMPLETE / PRD_COMPLETE /
SPEC_APPROVED_CONTROLLED_BUILD / BUILD_AUDIT_RECORDED`, evidência em
  `docs/04_audit/evidence/AUD-20260921/REM21-007/`; resultado local PASS,
  certificação final deferred.

### REM21-008 — Vincular toda a barra ao CI em Node 22

- prioridade/impacto: `P0 / alto`;
- status: `VERIFIED_LOCAL / FINAL_CERT_DEFERRED`;
- achados: `A21-F08`, `A21-F21`;
- dependências: `REM21-002`, `REM21-003`–`007`;
- superfície: workflows, package scripts, engines/toolchain e relatórios;
- implementar: Node 22.23.2, matriz canônica de gates, runner candidate/run
  bound, jobs bloqueantes para unit, coverage crítico, mutation, skips, PG,
  chaos, eval, load, restore, docs, E2E, imagem e certificação; cache sem
  contaminar identidade; artefatos por run;
- pronto quando: workflow localmente inspecionável executa Node 22, toda
  dependência obrigatória entra na decisão, PostgreSQL ausente/skip falha e
  self-test prova falha individual de cada gate;
- prova: validação do workflow, self-test negativo e execução local dos
  scripts equivalentes no run `run-rem21-008-final-bar-4`; evidência em
  `docs/04_audit/evidence/AUD-20260921/REM21-008/`; produção continua
  `NO_GO`.

## P1 — operação, qualidade e supply chain

### REM21-009 — Preparar validação externa com autoridade explícita

- prioridade/impacto: `P1 / alto`;
- status: `OFFLINE_PREPARATION_COMPLETE / BLOCKED_BY_G21-5_FOR_EXTERNAL_EXECUTION`;
- achado: `A21-F06`;
- origem AUD20: `AUD20-019`;
- dependências: `G21-5`, `REM21-003`–`008`;
- superfície: contratos de IdP/provider/canal, threat model, privacy, owners,
  credenciais, ambiente, rollback e handoff;
- permitido antes do gate: mocks, testes de contrato offline, runbooks e
  pacote de decisão;
- evidência corrente: `docs/04_audit/evidence/AUD-20260921/REM21-009/`; Discovery,
  PRD, SPEC, BUILD e AUDIT offline concluídos; `OFFLINE-BUILD-AUDIT.md`
  registra hashes e 12/12 casos.
- pronto quando: owners e autoridade aprovam ambiente/dados/rollback e os
  testes externos passam sem ação sensível automática;
- proibição: não acessar serviço, credencial ou dado real por inferência.

### REM21-010 — Provar load, restore e rollback PostgreSQL

- prioridade/impacto: `P1 / alto`;
- status: `VERIFIED_LOCAL / FINAL_CERT_DEFERRED`;
- achado: `A21-F07`;
- origem AUD20: `AUD20-014`;
- dependências: `REM21-006`, `REM21-008`;
- superfície: API, worker, migrations, backup/restore e relatórios;
- implementar: workload declarado API→PG→worker, backup e restore em nova
  instância, comparação de checksums/linhas/RLS/roles/grants/outbox/journals,
  leituras da aplicação e rollback/roll-forward de migration;
- pronto quando: execuções repetidas convergem, corrupção intencional falha o
  gate e os relatórios distinguem ambiente local de RPO/RTO produtivo;
- prova: PostgreSQL descartável e artefatos determinísticos.
- resultado: `rem21-010-v1` passou duas vezes no run
  `run-rem21-010-final-3`, candidate
  `7e3a7feb86e8f2cd2f1f3a611e2d25b1a5211f98643d42bd6c4db62844f39edb`, Node
  `22.23.2`; 32 eventos, 45 tabelas, checksums/rows/RLS/roles/grants/outbox/
  journals iguais, corrupção detectada e `0025 -> 0026` rollback/roll-forward
  verificado. RPO/RTO produtivo permanece não medido.
- evidência: `docs/04_audit/evidence/AUD-20260921/REM21-010/`;
  report run-2 hash `9cb7cc2c1cf278ed82641953500a9b9d91e33df7cb460ac0eb0f7f137131efd9`.
- próxima ação: iniciar Discovery -> PRD -> SPEC de `REM21-011`.

### REM21-011 — Qualificar observabilidade, alertas e SLOs

- prioridade/impacto: `P1 / alto`;
- status: `VERIFIED_LOCAL / FINAL_CERT_DEFERRED`;
- achado: `A21-F12`;
- origem AUD20: parte de `AUD20-013`;
- dependências: `REM21-006`, `REM21-010`;
- superfície: observability package, API/worker, exporters, alerts e runbooks;
- implementar: métricas/logs/traces com cardinalidade e redaction, exporter
  composto, alertas testáveis, SLI/SLO e degradação segura;
- pronto quando: falhas relevantes disparam sinal acionável, nenhuma label
  expõe dado sensível e a queda do exporter não derruba safety nem mascara
  readiness;
- prova: collector sintético e fault injection.
- evidência de Discovery/PRD/SPEC: `docs/04_audit/evidence/AUD-20260921/REM21-011/`;
- resultado: `rem21-011-v1` passou duas vezes no run
  `run-local-376327-mucafskq`, candidate
  `2f4741c4947d356a81c9c238e6c3f67bf43bd3802377cb9ac9536133742544d8`, Node
  `22.23.2`; sem leak, labels não aprovadas `0`, exporter fault alertado e
  readiness isolada. Report hash
  `8a991fb9f0da6ece9202370c1b566ab079b3ad1688dad4fe096a1584ca11414e`.
- limitações: collector/retention são process-local; SLO produtivo, paging,
  external exporter, barra integral, freeze, I1 e signoff não foram medidos.
- próxima ação: iniciar Discovery -> PRD -> SPEC de `REM21-014`.

### REM21-012 — Tornar governança de skips obrigatória

- prioridade/impacto: `P1 / médio`;
- status: `VERIFIED_LOCAL / FINAL_CERT_DEFERRED`;
- achado: `A21-F14`;
- origem AUD20: `AUD20-003`;
- dependências: `REM21-008`;
- implementar: catálogo por teste/arquivo com owner, razão, gate, expiração e
  hash da origem; contabilizar unit/PG/E2E/chaos;
- pronto quando: skip desconhecido, expirado ou obrigatório falha CI e todo
  skip aceito aponta para cobertura equivalente executada;
- prova: self-tests negativos e report agregado;
- gate documental: `DISCOVERY_COMPLETE / PRD_COMPLETE /
SPEC_APPROVED_CONTROLLED_BUILD`; evidência em
  `docs/04_audit/evidence/AUD-20260921/REM21-012/`; BUILD/AUDIT local passou
  com run/candidate bound, zero skips e reports unit/PG/chaos/E2E.

### REM21-013 — Expandir mutation guard por risco

- prioridade/impacto: `P1 / médio`;
- status: `VERIFIED_LOCAL / FINAL_CERT_DEFERRED`;
- achado: `A21-F15`;
- origem AUD20: `AUD20-002`;
- dependências: `REM21-008`;
- implementar: manifesto incremental para identity, policy, SSRF, replay,
  approval, rate limiter e persistence, com budget de tempo explícito;
- pronto quando: todos os mutantes do conjunto crítico são mortos, sobrevivente
  bloqueia CI e alteração do manifesto é rastreada;
- prova: `scripts/mutation-manifest.json`, report por mutante e teste negativo
  do gate; evidência em `docs/04_audit/evidence/AUD-20260921/REM21-013/`;
  BUILD/AUDIT local passou.

### REM21-014 — Completar UX, acessibilidade e browser support

- prioridade/impacto: `P1 / médio`;
- status: `VERIFIED_LOCAL / FINAL_CERT_DEFERRED`;
- achado: `A21-F16`;
- origem AUD20: `AUD20-015`;
- dependências: `REM21-005`, `REM21-008`;
- implementar: matriz explícita Chromium/Firefox/WebKit, login/expiração,
  authz, tenant data, recovery, keyboard/focus, contraste, reduced motion e
  axe A/AA; documentar exclusão justificada de browser não suportado;
- pronto quando: cada browser declarado passa e violação moderada definida
  pela barra é bloqueante;
- prova: Playwright/axe sem autoridade simulada no perfil qualificado.
- evidência de Discovery/PRD/SPEC:
  `docs/04_audit/evidence/AUD-20260921/REM21-014/`;
- resultado: `rem21-014-v1` passou duas vezes no run
  `run-rem21-014-final-2`, candidate
  `f4f88e037214fe0cc54e446c9094a1bf7603da1f1b255cb5328427e3a73dfcf9`, Node
  `22.23.2`; Chromium/Firefox/WebKit `15/15`, zero skips/flaky/falhas, axe
  blocking `0`, negative binding PASS. Evidência hashada no diretório acima.
- limitações: session store e browsers são locais; IdP/device físico/produção,
  barra integral, freeze, I1 e signoff não foram medidos.
- próxima ação: iniciar Discovery -> PRD -> SPEC de `REM21-015`.

### REM21-015 — Decompor hotspots com caracterização

- prioridade/impacto: `P1 / médio`;
- status: `VERIFIED_LOCAL / FINAL_CERT_DEFERRED`;
- achado: `A21-F17`;
- origem AUD20: parte de `AUD20-013`;
- dependências: fronteiras correspondentes de `REM21-003`–`011` estabilizadas;
- implementar: medir complexidade/ownership e extrair slices coerentes de
  server, PostgreSQL, runtimes e platform web; sem refactor big-bang;
- pronto quando: cada extração reduz responsabilidade/complexidade, mantém API
  e passa caracterização e regressão;
- prova: diff pequeno por slice, testes antes/depois e mapa de ownership;
- evidência completa de Discovery/PRD/SPEC/BUILD/AUDIT:
  `docs/04_audit/evidence/AUD-20260921/REM21-015/`;
- resultado local: run `run-rem21-015-final-1`, candidate
  `5fb42a3bbf5ab2be4ce51966773868a1c25c66eb6eef4e72fd7a6095d60f2da1`, 299
  arquivos pass, 20 skips governados, 2.101 testes pass, 146 skips
  governados, zero falhas e zero drift; produção permanece `NO_GO`;
- próxima ação: iniciar Discovery -> PRD -> SPEC de `REM21-017`.

### REM21-016 — Produzir imagem reproduzível vinculada ao candidato

- prioridade/impacto: `P1 / médio`;
- status: `VERIFIED_LOCAL / FINAL_CERT_DEFERRED`;
- achados: `A21-F13`, `A21-F18`;
- origem AUD20: `AUD20-016`;
- dependências: `REM21-008`;
- implementar: build multi-stage pinado, artefatos compilados, contexto
  mínimo, usuário non-root, health/smoke, SBOM/licenças e digest no manifesto;
- pronto quando: imagem do mesmo source candidate executa sem `npx`/dev deps,
  smoke passa e verifier detecta imagem de outro run;
- resultado local: build Docker do target `runtime` com base Node 22 pinada,
  contexto sem fontes/testes/dev dependencies, `npm ci --omit=dev`, smoke
  `live=200`/`ready=200`, usuário `cvg`, entrypoint compilado e binding
  `runId`/`candidateId` no manifesto;
- prova: `docs/04_audit/evidence/AUD-20260921/REM21-016/`, incluindo teste
  negativo de candidate/run/image-id e inspeção non-root/read-only.

### REM21-017 — Sanear documentação e evidências

- prioridade/impacto: `P1 / médio`;
- status: `VERIFIED_LOCAL / FINAL_CERT_DEFERRED`;
- achados: `A21-F19`, `A21-F22`, `A21-F23`, `A21-F26`;
- origem AUD20: parte de `AUD20-017`;
- dependências: `REM21-001`;
- implementar: checker full-scope com suporte a `:linha`, corrigir dois links
  e referências absolutas, representar JSON histórico vazio sem fabricar
  conteúdo, exigir sidecar/status para log vazio e criar índices resumidos;
- resultado local: scan documental com links quebrados `0`, 12 referências
  absolutas históricas preservadas/catalogadas, zero não allowlisted; higiene
  com 66/66 vazios catalogados e 382 JSONs não vazios parseados; regressão com
  300 arquivos pass, 20 skips, 2.105 testes pass e 146 skips no run
  `run-rem21-017-final-2`, candidate
  `9efe1a104d4f77546c5d8f4c15f8bec0f4a4c5bb48844eb759e477f42e9d2bd6`;
- pronto quando: checker não tem falso positivo conhecido, links resolvem em
  checkout portátil, JSONs parseiam e vazio tem semântica explícita;
- prova: fixtures positivas/negativas do checker e scan completo.

### REM21-018 — Endurecer IDs e baseline de configuração

- prioridade/impacto: `P1 / baixo`;
- status: `VERIFIED_LOCAL / FINAL_CERT_DEFERRED`;
- achados: `A21-F24`, `A21-F25`;
- dependências: `REM21-003`, `REM21-006`, `REM21-011`;
- implementação aprovada em `docs/04_audit/evidence/AUD-20260921/REM21-018/SPEC.md`:
  trocar `Math.random` por UUID seguro/helper compartilhado e injeção de teste,
  completar `.env.example` com valores seguros e provar os validadores por
  perfil;
- pronto quando: IDs não dependem de RNG fraco, testes continuam
  determinísticos e config ausente/insegura falha fechado sem secret real;
- resultado local: 3 caminhos de identidade sem RNG fraco, `.env.example`
  completo por perfil, 301 arquivos pass, 20 skips, 2.113 testes pass,
  146 skips, zero falhas; candidate scoped
  `417b83f1f8366cd3de29287254c21a045cea86549ec994ed88053be2f56b8354`;
- prova: testes unitários/config e secret scan em
  `docs/04_audit/evidence/AUD-20260921/REM21-018/`;
- limitação: três críticos I1 não produziram inspeção válida; Gauntlet é
  `CONDITIONAL_PASS` e certificação final permanece deferred;
- próxima ação: `REM21-019`.

## P2 — qualificação e autoridade externa

### REM21-019 — Congelar e reauditar o candidato completo

- prioridade/impacto: `P0 de release / alto`;
- status: `CONDITIONAL_PASS / FINAL_CERT_DEFERRED`;
- dependências: `REM21-001`–`008`, `REM21-010`–`018` verificados;
- origem AUD20: `AUD20-018`;
- implementar: executar barra completa uma vez, congelar candidate/run/image,
  manifestar todos os artefatos, reauditar os 26 achados, obter crítica I1
  fresca e executar sentinel;
- pronto quando: zero P0/P1 alto aberto no escopo interno, todos os gates
  aplicáveis pertencem ao mesmo candidato, crítico decide sem reparo e humano
  registra decisão separada;
- prova: dossier final, hashes offline, relatório I1, sentinel `MATCH` e lista
  honesta de limitações externas;
- regra: qualquer modificação após freeze invalida a rodada.
- Discovery/PRD/SPEC aprovados em
  `docs/04_audit/evidence/AUD-20260921/REM21-019/`; o BUILD será executado
  pelo CI-bar sob Node `22.23.2`, com PostgreSQL descartável em loopback e
  closure registry candidate/run/source bound.
- resultado do BUILD/AUDIT: run `run-rem21-019-final-3`, candidate
  `8a889682d378c1d3e82a71c079c00390e98307ce4d6e5314f69f02c7c8cf3132`, 35/35
  gates ci-bar `PASS`, verifier offline/self-test/diff `PASS`, browser-proof
  trusted 15/15 e imagem non-root vinculada ao mesmo candidate/run.
- findings: 26 preservados; P0/P1 internos abertos `0`; `A21-F05`/`A21-F06`
  continuam `EXTERNAL_BLOCKED`; `A21-F20` continua `OPEN_INTERNAL`; Phase 10
  `CONDITIONAL_GO`.
- Gauntlet: sentinel `MATCH_WITH_CONDITIONS`; o crítico I1 fresh read-only
  retornou `CONDITIONAL_PASS` sem drift ou achado novo, mas não aceitou o
  candidato de forma limpa. F20 permanece `OPEN_INTERNAL`, a aceitação é
  `CONDITIONAL_PASS` e não `PASS`; produção permanece `NO_GO`.
- Uma segunda adjudicação fresh read-only não retornou relatório dentro do
  bounded window; nenhum veredicto foi inferido e a certificação não foi
  regenerada.
- estado de parada: `BLOCKED_PENDING_ACCEPTED_I1_AND_HUMAN_DECISION`; nenhuma
  alteração local adicional pode satisfazer F20 ou G21-6 sem nova autoridade.
- a tentativa `run-rem21-019-final-2` foi invalidada por mismatch de perfil
  entre E2E simulado e spec trusted; a rodada final repetiu todos os gates
  após separar o spec no projeto browser-proof dedicado.

### REM21-020 — Qualificar ambiente externo e piloto limitado

- prioridade/impacto: `P0 externo / alto`;
- status: `BLOCKED_BY_G21-5`;
- achados: `A21-F05`, `A21-F06`, parte produtiva de `A21-F07/F12`;
- origem AUD20: `AUD20-020`;
- dependências: `REM21-009`, `REM21-019`, `G21-5` e nova decisão humana;
- implementar somente após gate: validar IdP/providers/canais, medir RPO/RTO,
  incident response, privacy/security, kill switch e piloto assistido;
- pronto quando: owners assinam evidência, rollback foi ensaiado, limites e
  alertas estão operacionais e nenhuma ação sensível é automática;
- proibição: o agente não confirma, cancela ou reagenda consulta real, não
  executa ação clínica/financeira/prontuário e não libera produção.

## Ordem executável e próxima ação — registro histórico anterior a REM21-019

```text
G21-1
  -> 001 -> 002
  -> 003,004,006 -> 005,007
  -> 008 -> 012,013,016
  -> 010 -> 011
  -> 014,015,017,018
  -> 019 -> G21-6

009 e 020 permanecem BLOCKED_BY_G21-5.
```

Próxima ação singular corrente: iniciar Discovery/PRD/SPEC de `REM21-018` em
escopo local/sintético descartável; `REM21-019` continua responsável pela
barra integral/freeze final.
`G21-5` e `G21-6` continuam fechados.
