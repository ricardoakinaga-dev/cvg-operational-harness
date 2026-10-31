# Onda 5 — suíte completa com cobertura por arquivo (sessão 07)

Base: `ca2c996cb6cd502182006de31a23c0859a5616aa` (contém `8364fc478` e `ca2c996cb`).
Comando: `npm run test:coverage:per-file -- --testTimeout=120000 --hookTimeout=120000`
com PG 16.15 real (`TEST_DATABASE_URL`, `PHASE4A_DISPOSABLE_PG=1`, `PHASE4A_PG_REQUIRED=1`), nice/ionice.
Os timeouts de 120 s valem só nesta rodada local; nenhuma config do repositório foi alterada.

Resultado: 621 arquivos e 9245 testes passaram, 0 falhas.
Gate por arquivo do núcleo (`CVG_COVERAGE_PER_FILE=1`): `[core-coverage] PASS`,
agregado statements 93.79 / branches 90.72 / functions 95.23 / lines 94.79.
`certification/` sem alteração (git status limpo).

## Defeitos (corrigidos, sem relaxar assert nem piso)
- F01 manifest: o teste do model-gateway importava `@cvg/harness-contracts`, dependência não declarada.
  A identidade do estimador passou para `packages/shared/src/__tests__/aud0625-estimator-identity.test.ts`.
- F02 product-boundary: a contagem de probes do host passou de 1 para 5 depois do probe Landlock revisado do X02.
  `tests/product-boundary.test.js` agora fixa os 5 sítios revisados, por arquivo:linha e fingerprint.
- Fixture `flood` do X01 (`tests/par-x01-process-persistent.test.ts`): escrita truncante, o leitor via arquivo vazio como 0.
  Agora usa escrita em `.tmp` e `renameSync`.

## Ambiente (sem mudança de código)
- IB0241 (9 testes "blocked != 0"): `node_modules`/TypeScript por symlink no checkout do revisor
  (`registerHooks` TARGET_LOAD_FORBIDDEN). `b6-0241` e `b6-0242` passam 40/40 numa árvore com `node_modules` real.
- PG com 512 MiB: OOM. Com PG de 2 GiB ou sem limite, passa.
- Flag da conversa PG ausente: exige `PHASE4A_DISPOSABLE_PG=1` e `PHASE4A_PG_REQUIRED=1`.
- Estouro de 15 s sob carga de cobertura (1ª rodada com PG, teto da casa), PG ocioso e sem locks.
  Todos passaram com 120 s:
  - `apps/api/src/__tests__/approval-decision-atomicity-postgres.test.ts` (4): guard exactly-once da migração 0021;
    bloqueio por chaves duplicadas legadas; índice com definição errada; índice inválido e not-ready.
  - `packages/persistence/src/__tests__/tenant-isolation.test.ts` (2): isolamento com papel non-BYPASSRLS; quarentena antes do RLS.
  - `security-scan-config` (15 s, passa isolado), na rodada sem PG.
  Candidatos a flake na barra: os 6 de PG acima. Todos criam e migram schema.
