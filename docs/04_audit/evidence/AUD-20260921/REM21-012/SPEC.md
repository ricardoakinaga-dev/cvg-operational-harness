# REM21-012 — SPEC — inventário fail-closed de skips

## Schema do catálogo

Cada entry de `scripts/skip-catalog.json` terá:

```text
id, file, sourceSha256, expectedSkippedTests, reason, owner,
dedicatedGate, required, expiresAt
```

`expiresAt` deve ser uma data ISO-8601 com timezone e posterior ao relógio da
execução. A validação deve emitir falhas determinísticas para ausência,
formato inválido ou expiração. A janela é avaliada no BUILD/AUDIT; não há
renovação automática.

## Relatórios e cobertura

`buildSkipInventory` receberá exatamente uma coleção sem duplicatas de reports
`unit`, `postgres`, `chaos` e `e2e`. Cada report precisa ser parseável e ter
identidade de gate. Vitest usa `testResults`/`assertionResults`; Playwright usa
o JSON reporter e é normalizado para arquivo, nome, status e gate. Para cada
skip observado:

- o contrato por arquivo é localizado;
- `required` e expiração são aplicados;
- o `dedicatedGate` precisa existir entre os reports executados;
- o output preserva `observedGates`, `dedicatedGate`, `expiresAt`, owner, razão
  e hash;
- qualquer falha torna `verdict: FAIL`.

O inventário incluirá `reportCountByGate`, `skippedTestsByGate` e os hashes dos
reports. `validateSkipInventory` exigirá esses campos quando o artefato for
consumido pelo certificador.

## E2E e barra

O comando E2E usará o JSON reporter com `PLAYWRIGHT_JSON_OUTPUT_NAME` apontando
para `certification/e2e-test-report.json`. O contrato do gate E2E declara esse
artefato; o executor captura snapshot por run e falha se estiver ausente ou
vazio. O certificador passará esse report ao inventário. A imagem, mutation e
outros gates não são ampliados nesta task.

## Self-tests negativos

Os testes devem demonstrar RED/GREEN para: `expiresAt` ausente, inválido e
passado; gate dedicado inválido; report desconhecido/duplicado; dedicated gate
ausente; skip desconhecido/required/source drift; contagem por quatro gates;
E2E vazio; run/candidate mismatch.

## Rollback e limitações

Rollback é reversão do catálogo, parser e wiring; nenhum banco de negócio é
alterado. Reports E2E são sintéticos e não qualificam browser support completo.
O relógio da máquina e o ambiente CI remoto podem divergir; o artefato registra
`generatedAt` e a data usada. `REM21-014` continua responsável pela matriz de
browsers e acessibilidade.

## Gate

`SPEC_APPROVED_CONTROLLED_BUILD`.
