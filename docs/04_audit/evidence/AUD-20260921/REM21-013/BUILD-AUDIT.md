# REM21-013 — BUILD/AUDIT local

## Escopo

`A21-F15` / `AUD20-002`, executada sob `G21-1` somente com código, fixtures e
recursos locais. Não houve provider, canal, IdP, segredo, PostgreSQL externo,
usuário ou dado real. Produção permanece `NO_GO`.

## RED antes do BUILD

Antes da implementação, `npx vitest run tests/mutation-guard.test.js
--no-file-parallelism --maxWorkers=1` falhou na resolução de
`../scripts/lib/mutation-governance.mjs`. Isso reproduziu a ausência do
contrato de governança/manifesto no baseline.

## Implementação

- `scripts/mutation-manifest.json` declara dez mutantes, com os sete domínios
  críticos `identity`, `policy`, `ssrf`, `replay`, `approval`, `rate-limiter` e
  `persistence`, além dos três mutantes históricos de `coverage`;
- `scripts/lib/mutation-governance.mjs` valida schema, IDs, domínios, budgets,
  arquivos, selectors únicos e source hashes; também produz digest canônico;
- `scripts/mutation-guard.mjs` calcula candidate, verifica binding opcional,
  copia o repositório para diretório temporário, remove `TEST_DATABASE_URL`,
  aplica uma mutação por vez e falha para survivor, timeout ou erro;
- a caracterização de identity inclui expiração exatamente no segundo atual;
- o report continua no artefato bloqueante
  `certification/mutation-guard.json`.

## Run final

Comando:

```text
PATH=/home/ricardo/.nvm/versions/node/v22.23.2/bin:$PATH \
CI_RUN_ID=run-rem21-013-mut-1 npm run mutation:guard
```

Resultado observado:

| Campo | Resultado |
| --- | --- |
| runId | `run-rem21-013-mut-1` |
| candidateId | `5e2b52242b1a367573b6ea572b25adb784b451e73fe058ce5b75548a2e8f622e` |
| Node | `22.23.2` |
| contract | `rem21-013-v1` |
| manifestSha256 | `700210716713d583f80037838ac87be91e0af70765139601efbc756353a073da` |
| selected | `10` |
| killed | `10` |
| survived | `0` |
| timedOut | `0` |
| errors | `0` |
| verdict | `PASS` |

## Verificações complementares

- focused suite: 8 files, 97 tests, `97/97 PASS`, zero skips;
- `npm run format:check`: `PASS`;
- `npm run typecheck`: `PASS`;
- `npm run lint`: `PASS`;
- `npm run ci:bar:contract`: `PASS`;
- `git diff --check`: `PASS`;
- `npm run docs:check-links`: `broken: []`, `DOC_LINKS_OK`; as 11 referências
  absolutas históricas já conhecidas permanecem no escopo de REM21-017.

## AUDIT / limites

O teste negativo de alteração do manifest cobre selector, source drift, budget,
domínio obrigatório e digest. O report atual é verificável e excluído do
candidate por contrato da barra. O resultado é `VERIFIED_LOCAL /
FINAL_CERT_DEFERRED`; não constitui certificação Phase 10, revisão I1, freeze,
GO externo ou liberação de produção. `REM21-019` ainda deve executar a barra
integral e o freeze candidate-bound.
