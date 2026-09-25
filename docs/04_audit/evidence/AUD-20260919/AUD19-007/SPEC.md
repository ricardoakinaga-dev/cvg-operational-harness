# SPEC — AUD19-007 — Endurecer egress contra SSRF

- programa: `AUD-20260919-REMEDIATION`; onda: `W1`; gate: `G1` ✅ + `AUD19-002` ✅.
- aprovação técnica: prompt humano de 2026-09-19; escopo local/sintético,
  reversível, fail-closed. Sem infra nova, sem dado real.

## Diagnóstico (F-09)

- `ssrf.ts:162-167`: hostname allowlisted → `allowed` imediato, sem validar
  endereços resolvidos (DNS rebinding/alias bypassa a allowlist).
- Caminho não-allowlisted: só estático, sem resolução.
- Chamadores (`evolution`, `chatwoot`, `openai-compatible`) usam só o estático
  e `redirect: 'error'` (sem seguir redirect — seguro, mas sem alternativa
  validada quando redirect é legítimo).

## Decisão de desenho

Composição obrigatória (estático + resolução + por-hop):

1. `resolveAndGuardOutboundUrl(rawUrl, options, deps?)` (`shared/ssrf.ts`):
   estático primeiro; hostname literal IP validado direto; senão resolve via
   `deps.dnsLookup` (default `node:dns/promises.lookup(all:true)`) e valida
   TODOS os endereços (inclusive para hosts allowlisted); falha de DNS,
   zero endereços ou qualquer privado/reservado → negar fail-closed.
2. `fetchWithSsrfGuard(fetchImpl, url, options, deps?)`: valida a URL inicial
   e executa com `redirect: 'manual'`; a cada 3xx com `Location`, resolve o
   destino (relativo incluso) e revalida integralmente; máximo 5 hops;
   sem `Location`, excesso de hops ou destino negado → erro sem seguir.
3. Chamadores: `evolution`, `chatwoot`, `openai-compatible` passam a
   resolver+validar antes do fetch (métodos já assíncronos); `redirect:
'error'` mantido onde o redirect não é legítimo.
4. Residual honesto: TOCTOU entre check e connect (sem pin de conexão no
   `fetch` portátil) — mitigado por re-resolução por request; pin de
   conexão é plataforma-específico e fica fora deste escopo.

## Critérios de aceite (congelados)

1. Allowlist sem bypass: hostname allowlisted que resolve para privado → nega.
2. IPv4/IPv6 literais privados, aliases, rebinding controlado (fake DNS que
   muda entre chamadas), redirects absoluto/relativo e excesso de hops.
3. HTTPS fixo por default; credenciais em URL negadas (existente, travado).
4. Chamadores verificados com DNS injetado (sem rede real nos unitários) +
   integração com `node:http` local e `allowPrivateNetworks`.
5. `typecheck`, `lint`, `format:check`, `git diff --check` PASS.

## Arquivos (congelados)

- editados: `packages/shared/src/ssrf.ts`,
  `packages/channel-gateway/src/adapters/evolution.ts`,
  `packages/channel-gateway/src/adapters/chatwoot.ts`,
  `packages/model-gateway/src/providers/openai-compatible.ts`;
- novos: `packages/shared/src/__tests__/ssrf-egress.test.ts`.

## Evidência

- `docs/04_audit/evidence/AUD-20260919/AUD19-007/`
