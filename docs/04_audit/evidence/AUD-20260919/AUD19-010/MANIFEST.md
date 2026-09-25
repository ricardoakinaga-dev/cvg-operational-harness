# Manifesto de verificação — AUD19-010

- task: `AUD19-010`; onda: `W2`; status: `VERIFIED`.
- runtime: Node `v22.23.2`; rede: `fetch` mockado (sem rede externa).
- autorização: prompt humano de 2026-09-19 (gate `G0`); sem commit/push,
  sem produção.

## Entregas (`apps/web/src/api/client.ts`, superfície preservada)

1. Adapter de auth (`simulation` byte-compatível + `token` trusted) e
   `ApiSession` (geração, limpeza na troca, 401 limpa token).
2. `request()` resiliente: timeout 30s com `AbortController` composto, parse
   JSON seguro, retry só GET idempotente (máx 2, só rede/5xx/429, nunca com
   abort), 401 → hook, offline → `network_unavailable`, timeout → `timeout`.

## Provas

| Prova                                                                                   | Resultado  |
| --------------------------------------------------------------------------------------- | ---------- |
| token em vez de simulação; 401 limpa; troca limpa+geração; `isStale`                    | PASS       |
| timeout, não-JSON, offline, retry-GET-503, sem-retry-POST, sem-retry-403, abort externo | PASS       |
| suíte web completa (23 arq, inclui existentes)                                          | 80/80 PASS |
| `typecheck` / `lint` / `format:check` / `git diff --check`                              | PASS       |

## Arquivos desta evidência

`SPEC.md`, `MANIFEST.md` (este), `typecheck.txt`, `lint.txt`,
`format-after.txt`, `diffcheck.txt`, `node-version.txt`.

## Limitações declaradas

- `App.tsx` preservado em simulação (tela de login/token em `AUD19-013`);
  caminho trusted exercido por fábrica + testes.
- Produção `NO_GO`.
