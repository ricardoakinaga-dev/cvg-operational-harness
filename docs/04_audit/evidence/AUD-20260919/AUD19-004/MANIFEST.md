# Manifesto de verificação — AUD19-004

- task: `AUD19-004`; onda: `W1`; status: `VERIFIED`.
- runtime: Node `v22.23.2`; PostgreSQL descartável `postgres:16-alpine`
  (container `aud19-pg`, porta 5434, sintético).
- autorização: prompt humano de 2026-09-19 (gate `G0`); sem commit/push,
  sem produção.

## Diagnóstico confirmado (RED)

`memory-red.txt`: replay divergente devolvia o vencedor silenciosamente
(3/5 falham no código original; 2 passam).

## Reparos (causas estruturais)

1. `computeOutboxContentHash`/`assertSameOutboxContent`
   (`outbox-content-hash.ts`): vínculo canônico
   (tenant, tipo, versão, payload) via `canonicalizeJson` de `@cvg/shared`.
2. Memory `OutboxRepository.enqueue`: divergente → `DomainError conflict`.
3. PG `enqueue`: comparação em todos os retornos de vencedor (SELECT +
   re-leitura pós-conflito); `unique_violation` residual converge por
   re-leitura.
4. `findByIdempotencyKey` (memory + PG; opcional no adapter) + fallback
   durable-inbound converge redelivery no vencedor (antes aceitava
   silencioso com payload divergente).
5. Contrato atualizado onde o bug estava consagrado: `outbox-durability`
   (PG), `outbox-memory`, `outbox` (memory) — idêntico converge, divergente
   rejeita, cross-tenant preservado.

## Provas

| Prova                                                                                                                          | Resultado              |
| ------------------------------------------------------------------------------------------------------------------------------ | ---------------------- |
| vínculo memory (6 testes: hash canônico, idêntico, redação-equivalente, tipo/payload/versão divergentes)                       | 6/6 PASS (era 2/5 RED) |
| vínculo PG (replay cross-instância, 3 divergências, corrida concorrente)                                                       | 3/3 PASS               |
| PG sem env + `AUD19_PG_REQUIRED=1`                                                                                             | FAIL fechado           |
| regressão: persistence memory 25 arq/141, api memory 56 arq/280, worker memory 12 arq/75, PG outbox/durability/bridge 3 arq/11 | todas PASS             |
| `typecheck` / `lint` / `format:check` / `git diff --check`                                                                     | PASS                   |

## Arquivos desta evidência

`SPEC.md`, `MANIFEST.md` (este), `memory-red.txt`, `typecheck.txt`,
`lint.txt`, `format-after.txt`, `diffcheck.txt`, `node-version.txt`.

## Limitações declaradas

- Sem constraint DDL nova (comparação em aplicação sobre a chave única
  existente); dois writers verdadeiramente simultâneos serializam na chave
  única e o perdedor rejeita — provado.
- Produção `NO_GO`.
