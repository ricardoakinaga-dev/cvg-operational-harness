# Composição congelada antes da qualificação

Task MAIN-CONSOLIDATION-20261018, MC01–05. BUILD/VERIFY de integração de fontes existentes com SPECs aprovadas; nenhum contrato novo neste pacote.

- Base remota: b9f48a77, preservando Enable sandbox host capabilities e exclude dos testes de build:harness.
- Arquivo principal: 834a37a1, fontes promovidas e evidências já registradas.
- Fundação: 951c22ad, integra PARE100/Claude100 já aprovado e correções de integração; revisão R2 exige confirmar cobertura após fb5e72d1.
- Portabilidade: b8eab238, quatro commits finitos; helpers de diretório próprio/toolchain e corpus D8. Resolver manualmente os dois overlaps de differential preservando o comportamento ampliado da fundação e localização configurável da portabilidade.
- SDK observation/admission e HISO0240 já promovidos: não sobrepor fontes antigas só por divergência de ancestralidade.
- Reference capture cda464ea/R4: fora desta integração, preservado em worktree detached/backup após reconciliação. Correção do reconhecimento inicial: cda tem R3 APPROVE_CODE, mas captura nativa INCOMPATIBLE_TRANSCRIPT; R4 tem mudanças em andamento e falhas focais. Não qualifica a candidata por merge.

Gates atuais na candidata própria: Node22, build runtime+harness/SDK, typecheck, lint/formato, npm test, cobertura, PostgreSQL sintético próprio, E2E em portas exclusivas, docs/links/higiene, secret scan, certify e CI. Sem skip novo/threshold reduzido; falhas/pending devem ser resolvidos/classificados com evidência. Claims de certify/test:e2e/sbom/licenses/package-lock limitados a esta candidata, sem editar pacotes dos pares.

Recursos reservados após confirmar ausência: PG `cvg-main-consolidation-pg` loopback56301, API3461/web4461. Cache/TMP/logs e recursos de execução somente em `/home/ricardo/cvg-main-consolidation-20261018/runtime/**`. Não usar recurso/DB/portas das frentes ativas.

A limpeza só remove refs de branches depois de backup e integração/disposição; não remove diretórios de worktree, dados não commitados nem processos de outros agentes. R4 vivo deve permanecer intacto até checkpoint de owner.

## Salvamento delimitado das branches antigas

Após scout de16branches antigas, escolher somente as correções locais de build/smoke/diagnóstico: `package.json` e `tests/workspace-scripts.test.js` (compilar harness com force antes da web), `scripts/worker-startup-smoke.mjs` e `scripts/worker-controlled-smoke.mjs` (NODE_ENV=test explícito), `apps/worker/src/__tests__/operational-harness-homolog.integration.test.ts` (diagnóstico de timeout com causa, preservando o prazo original20s). Fontes históricas3a94/a933/81bb/7ef74/877943. Verificar pelos testes de scripts, build limpo, smokes sob NODE_ENV herdado diferente e gatePG existente.

Não incorporar as implementações antigas de OIDC/boot/HTTPS/preflight de catálogo: são features dormentes/contratos de segurança não qualificados nesta composição, não correções triviais aprovadas por ancestralidade. Preservar integralmente no bundle com disposição explícita, sem reintroduzir schemas/replay antigos superados. Fundação atual já absorve o subconjunto aprovado de a724PARE100.
