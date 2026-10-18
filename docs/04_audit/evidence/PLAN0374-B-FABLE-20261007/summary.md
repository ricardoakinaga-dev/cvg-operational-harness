# PLAN0374-B-FABLE-20261007 — Fase B de código (B1–B3, B5) e preparação da Fase C

- Task `PLAN0374-B-FABLE-20261007`, Fable (Claude Code) como lead com quatro agentes
  Opus em lanes disjuntas, 07/10/2026. Pedido do usuário: "implemente todo o plano de
  melhoria junto com o opus". Divisão registrada em
  [`agent_coordination.md`](../../../08_runtime/agent_coordination.md): Fase A e B4 com
  a sessão `PLAN0374-A`; A5/B6/C10 e `products/**` com o Codex. Base `31dc1c3`.
- Nada aqui concede aceite de HISO-005/009/010, release ou produção: as reauditorias
  independentes (Codex) continuam obrigatórias. Produção `NO_GO`.
- Verificação consolidada do lead: [`raw/lead-verification.json`](raw/lead-verification.json).

## B1 — HISO-005, gate de fronteira executável (lane Opus 1)

| Antes (FULLTEST, F-06)                                 | Depois                                                                 |
| ------------------------------------------------------ | ---------------------------------------------------------------------- |
| ~22 min, `INCOMPLETE`, 8.856 `UNVERIFIED_INSTALLED_DEPENDENCY` | 26 s, `PASS`, 0 violações, 0 diagnósticos bloqueantes, exit 0 (reproduzido pelo lead) |

- Mudança: dependências instaladas em `node_modules` viram nós terminais verificados
  contra o `package-lock.json` commitado (artefato de registro com `integrity`; links e
  o `.package-lock.json` oculto não são raiz de confiança); realpath que cai em
  `products/` é violação; tripwire por bytes para `@cvg/shift-assistant`/`products/<dir>`.
- O resultado `INCOMPLETE` antigo escondia **169 diagnósticos de primeira parte**
  (`UNVERIFIED_DYNAMIC_CODE_EXECUTION` 95, `MODULE_LOADER_ESCAPE` 70,
  `MODULE_LOADER_PROPERTY` 4): spies de `fetch` em testes, `shutdown.install(process)`,
  testes que fazem spawn de `tsx apps/*/src/main.ts`, reflexão para serialização
  canônica. Entraram numa tabela de exceções vinculada a arquivo + motivo + texto da
  linha + digest da expressão + contagem máxima; arestas para produto, leituras `SHIFT_*`,
  módulos não resolvidos e achados de pacote instalado nunca são excepcionáveis.
  `--strict` desliga a tabela (resultado bruto: `INCOMPLETE`, 169). **A tabela precisa
  de revisão independente** ([`raw/exceptions-review.json`](raw/exceptions-review.json)).
- Casos negativos cobertos por testes (128 em `tests/product-boundary.test.js`, 78
  originais intactos + 50 novos): import relativo direto de `packages/*` e `apps/*`, nome
  de pacote via link de workspace, intermediário A→B→produto (inclusive fora das raízes),
  alias tsconfig exato/wildcard, produto declarado nos quatro campos de dependência,
  symlink em `node_modules` para `products/`, instalação pertencente ao produto,
  `import()`/`createRequire`/`require` identificáveis. Os dois contraexemplos T2 citados
  na ADR-010 (`P1-R2-01` ponte de runtime escondida por `.d.mts`; `P1-R2-02` aliases de
  loader) agora falham; o arquivo de 73 sondas do crítico posterior dá 0 falsos PASS
  ([`raw/critic-probes-results.json`](raw/critic-probes-results.json)).
- Mudança de comportamento: 10 sondas construídas como instalações falsas (sem entrada
  no lock) passaram de PASS/FAIL para `INCOMPLETE` — continuam recusadas, sem testemunha
  de produto. Premissa de confiança: pacote de registro listado no lock commitado não
  constrói caminhos de produto dinamicamente. Deriva observada: `source-map-js` 1.2.1
  instalado vs 1.2.2 no lock (reportado, não é falha de fronteira).
- Saídas: [`raw/boundary-main-output.json`](raw/boundary-main-output.json),
  [`raw/boundary-main-strict-output.json`](raw/boundary-main-strict-output.json),
  [`raw/boundary-evidence.json`](raw/boundary-evidence.json).

## B2/B3 — HISO-009, exports suportados e consumidor neutro (lane Opus 2)

- `docs/architecture/PUBLIC_API.md`: seção "Superfície suportada para consumidores"
  com tabelas por pacote (`@cvg/harness-contracts`, `@cvg/harness`,
  `@cvg/harness-orchestrator`, `@cvg/model-gateway`, `@cvg/persistence`), marcadores
  `<!-- supported-exports:<pkg> -->` que são a fonte única do teste, regras de import,
  vocabulário de estabilidade, contrato de composição de `createOperationalHarness`,
  camadas da ADR-004 e a decisão sobre o consumidor atual.
- Decisão registrada (T1, produto intocado): `products/shift-assistant` usa
  `OpenAICompatibleProvider.execute` diretamente — uso suportado de adapter público; só
  as garantias do adapter se aplicam (SSRF, timeout, contrato JSON); orçamento, retry,
  circuit breaker, prompt registry e eventos do gateway, e orçamento/auditoria/telemetria
  do harness **não** se aplicam. Migrar para `generate`/`complete` muda comportamento
  observável (timeout, retries/custo, `budget_exceeded`, `tenantId: 'cvg'` inválido,
  `NO_MODEL` para `CLINICAL`, parse sem strip de cercas) e exige SPEC + gate T3.
- Fatos de código registrados para a reauditoria: `createOperationalHarness` aceita
  `pause`, `log`, `effects` pelo tipo mas não os repassa (padrões em memória sempre);
  `maxCostUsd` do pedido/perfil do `@cvg/model-gateway` é aceito pelo schema e não
  aplicado por `generate()`; não há ponte pronta da porta `complete` para `generate`.
- `examples/consumers/reception-agent/` (agente de recepção de hospital veterinário,
  sintético, sem canal/paciente/diagnóstico): compõe `createOperationalHarness` só por
  exports públicos; jornada de quatro turnos: saudação `COMPLETED`, horário
  `COMPLETED` (fonte fixa, journal `CONFIRMED`), agendamento `APPROVAL_REQUIRED` sem
  execução, pergunta clínica `HUMAN_TAKEOVER`.
- Testes: `tests/consumers-public-surface.test.ts` (7: tabelas do doc, `exports` só
  `"."`, deep import recusado `ERR_PACKAGE_PATH_NOT_EXPORTED` nos 5 pacotes, nomes
  existem no runtime/checker TS, AST do exemplo só com imports nomeados listados) e
  `tests/consumers-reception-agent.test.ts` (7: jornada, auditoria 4/4, telemetria 4/4,
  `fetch` nunca chamado). Mutação manual: 3 falhas esperadas ao inserir export desconhecido
  e import não suportado. Smoke isolado contra `dist` compilado (scratch, não arquivado):
  mesma jornada, 0 chamadas de rede.
- Limite: B3 "passa pelo gate de fronteira" foi verificado por grep (0 referências a
  `products/`, `shift-assistant`, `whatsapp`); o gate B1 percorre `packages/apps/legacy/products`
  e não inclui `examples/`.

## B5 — HISO-010, CI por artefato (lane Opus 3)

- `vitest.config.mts`: `CVG_TEST_SCOPE=all|core` (padrão `all` preserva o agregado;
  `core` remove `products/**` de testes e cobertura; valor inválido lança).
- `scripts/ci-bar.mjs` exporta `CVG_TEST_SCOPE=core` para todos os gates (inclusive os
  aninhados no `certify`), sela o escopo no estado/manifesto (`scope_mismatch` no
  finalize) e falha com `out_of_scope_tests`/`out_of_scope_coverage`/`unit_report_empty`.
  `scripts/ci-bar-contract.mjs`: gates `unit`/`coverage` chamam `test:core`; versão do
  contrato `rem21-014-v2-sealed` → `hiso-010-v1-core-sealed`; novas recusas
  `harness_bar_runs_product` e `core_suite_includes_products` (self-test 38 → 40).
- `.github/workflows/verify.yml`: attest exige a nova versão e o escopo; nome do job
  `REM21 CI bar (Node 22)` e 34 gates inalterados.
- `.github/workflows/product-shift-assistant.yml` (novo): PR/push com filtro de caminhos
  (`products/shift-assistant/**`, dependências de workspace `packages/model-gateway`,
  `packages/shared`, configs raiz, lock); jobs `bar` (prettier/eslint do produto,
  `build:shift-assistant`, `test:shift-assistant` com relatório JSON, denominador do
  produto com falha em suíte vazia/skip/arquivo fora do produto, artefato 90 dias) e
  `image` (Dockerfile do produto, usuário `cvg`). Nenhum gate do harness.
- Denominadores ([`raw/ci-denominators.json`](raw/ci-denominators.json)): antes
  360/2.953 (core 358/2.916 + produto 2/37); depois 362/2.977 (core 360/2.940 + produto
  2/37); all = core + produto nos dois momentos; nenhum arquivo perdeu testes.
- Cobertura core sem PostgreSQL fica abaixo dos limiares (89,6/84,5/91,5/90,6) por código
  dependente de PG; com PG (como no CI) o recálculo core a partir do agregado dá
  92,56/87,86/94,58/93,60 contra 90/85/90/90. Cobertura do produto (~74% statements)
  fica agora sem gate — pertence à barra 0368 do produto.
- **Pendente de revisão humana T3** (HISO-010 é T3/G3): mudança do contrato de evidência
  antes de SPEC aprovada; workflow do produto é filtrado por caminho (não serve como
  check obrigatório tal como está); format/lint/typecheck/docs do harness ainda cobrem
  `products/**` (fora do escopo B5: exigiria `package.json`/tsconfig/eslint/`phase10-certify`);
  nenhuma execução real no GitHub Actions ainda.

## Fase C — preparação sem destino real (lane Opus 4)

- `deploy/harness/`: `compose.production.yaml` (migrate one-shot → api/worker com
  `NODE_ENV=production`, read-only, cap-drop ALL, no-new-privileges, tmpfs, uid 10001,
  healthchecks, limites, logs rotacionados; proxy nginx com TLS 1.2/1.3; PostgreSQL
  externo por padrão, `--profile local-postgres` só para ensaio; imagem por digest
  obrigatório), `.env.example` (renomeado pelo lead de `.env.production.example`, que o
  `.gitignore` recusa), `proxy/nginx.conf`, `postgres/{roles,backup-grants,verify-roles}.sql`
  + README, `backup/{backup.sh,restore-drill.sh,chain-anchors.mjs,common.sh}` + units
  systemd, `secrets/README.md` (formatos, geração, cofre, rotação), `README.md`
  (runbook C1→C9 com aceite por item). `docker compose config` OK com e sem o profile.
- `scripts/production-target-smoke.ts` + `tests/production-target-smoke.test.ts` (5
  PASS): smoke remoto sem Docker (426 sem TLS, `/live`/`/ready`, cabeçalhos, CORS
  hostil, 401 sem sessão, login de dois operadores com papéis distintos, metrics
  exposure, digest, observação de rate limit); alvo falso em processo cobre PASS e FAIL.
- `docs/08_runtime/0805_runbook_ambiente_real.md`: C1 padrão VM + Compose + PostgreSQL
  gerenciado (justificativa: `API_TRUSTED_PROXY_ADDRESSES` só aceita IPs literais; barra
  0373 provada exatamente nessa imagem/flags), mapeamento dos 22 checks locais para o
  destino, achados G1–G8: `/health/metrics` 404 em produção (C7 exige mudança de código);
  sem emissor de token implantável (C8); `pg_dump` precisa de papel `BYPASSRLS` por
  `FORCE ROW LEVEL SECURITY` (exceção a decidir); grants ADMIN implícitos no PG 16;
  `CREATE SCHEMA IF NOT EXISTS` exige CREATE no banco a cada migrate; imagem precisa de
  registro + digest no CI (C9); `WEBHOOK_SIGNING_SECRET` único (rotação por cutover).
- Não executado: backup/restore ponta a ponta, `nginx -t`, units systemd, SQL contra PG.

## O que fica para quem

- Usuário/operação: destino e provedor (C1), DNS/CA, cofre e acessos, emissor de token e
  dois operadores (C8), receptor real do alerta (A3), destino dos anchors/dumps, exceção
  `BYPASSRLS`, coletor de logs e G1, exposição do console; revisão humana T3 do B5.
- Sessão `PLAN0374-A`: Fase A (proteção do `main`, allowlist, Trivy) e B4.
- Codex: A5, B6 (reauditoria da fronteira, da tabela de exceções e dos exports), C10.
