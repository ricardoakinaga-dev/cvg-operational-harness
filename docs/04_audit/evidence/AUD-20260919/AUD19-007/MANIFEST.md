# Manifesto de verificação — AUD19-007

- task: `AUD19-007`; onda: `W1`; status: `VERIFIED`; fecha W1 (gate `G3`:
  nenhum P0 de integridade aberto, sem relaxamento fail-closed).
- runtime: Node `v22.23.2`; rede real somente loopback local (`node:http` em
  `127.0.0.1`); restante com DNS/fetch injetados (sem rede externa).
- autorização: prompt humano de 2026-09-19 (gate `G0`); sem commit/push,
  sem produção.

## Reparos (causas estruturais)

1. `resolveAndGuardOutboundUrl` (`shared/ssrf.ts`): estático + resolução de
   TODOS os endereços (inclusive allowlisted) + literais; falha/zero/privado
   → nega fail-closed. Default DNS = `node:dns` (`lookup all`).
2. `fetchWithSsrfGuard`: `redirect: manual` + revalidação integral por hop
   (absoluto/relativo), teto 5, sem `Location`/excesso → erro sem seguir.
3. Chamadores (`evolution`, `chatwoot`, `openai-compatible`, `ollama`):
   resolução+validação antes do fetch; `redirect: 'error'` mantido;
   `allowPrivateNetworks` opt-in explícito (default false); `dnsLookup`
   injetável.
4. Fixtures com host fictício declaram DNS público; loopback declara opt-in;
   testes por mock de guarda reescritos para o seam de DNS.

## Provas

| Prova                                                                                                                                    | Resultado    |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| egress (allowlist×privado, multi-answer, IPv6, ofuscação decimal, outage, vazio, rebinding, HTTPS/credenciais, redirects, loopback real) | 17/17 PASS   |
| ssrf estático existente                                                                                                                  | 30/30 PASS   |
| channel+model+shared (28 arq)                                                                                                            | 317/317 PASS |
| negação no adapter sem fetch (rebinding)                                                                                                 | PASS         |
| `typecheck` / `lint` / `format:check` / `git diff --check`                                                                               | PASS         |

## Arquivos desta evidência

`SPEC.md`, `MANIFEST.md` (este), `typecheck.txt`, `lint.txt`,
`format-after.txt`, `diffcheck.txt`, `node-version.txt`.

## Limitações declaradas

- TOCTOU check→connect sem pin de conexão (mitigado por re-resolução por
  request; pin é plataforma-específico, fora do escopo).
- Produção `NO_GO`.
