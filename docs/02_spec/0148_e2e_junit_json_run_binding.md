# 0148 — PR-009: vínculo de runId entre JUnit e JSON E2E

- Task: [PR-009](../03_build/0356_production_backlog_2026-09-26.md); trilha T2, artefatos de teste sem efeito externo ou mudança de contrato público.
- Estado: `BUILD_LOCAL_AUTHORIZED`; produção `NO_GO`.

## Recon

Em modo de certificação, `PLAYWRIGHT_JSON_OUTPUT_NAME` seleciona somente os
reporters JSON e line. O JUnit `playwright-results.xml` é produzido apenas
no modo CI sem essa variável, enquanto o relatório JSON do certificado não
contém `runId` em `config.metadata`. Logo não há como provar que ambos
representam a mesma execução. O runId do certificador já existe e o CI bar
expõe `CI_RUN_ID`; o Playwright JUnit instalado admite
`PLAYWRIGHT_JUNIT_SUITE_ID` para o atributo `id` da raiz `testsuites`.

## Regra

1. Em modo de certificação, produzir JSON **e** JUnit na mesma invocação do
   Playwright. Gravar `CI_RUN_ID` em `config.metadata.runId` do JSON e no
   `testsuites@id` do JUnit; quando o certificador gerar um runId, passá-lo
   explicitamente ao processo filho. Limpar o JUnit anterior antes da
   emissão, para que arquivo obsoleto não passe.
2. Tratar os dois relatórios como artefatos hash-bound do gate E2E e da barra
   CI. O verificador deve falhar se runId divergir, estiver ausente ou se o
   JUnit não tiver raiz `testsuites`; o gate CI deve checar a coerência antes
   de registrar PASS.
3. Testar runId igual, ausente e divergente sem navegador; rodar E2E 12/12,
   certificação completa e Verify remoto no candidato integrado. Quatro
   screenshots históricos continuam imutáveis.

## Aceite

- JSON e JUnit da mesma execução com `runId` idêntico ao certificado/CI;
  ambos gerados, não vazios, hash-bound e verificados.
- E2E, `typecheck`, `lint`, unitários, PostgreSQL e CI verdes; nenhuma
  tolerância nova a skip ou produção.
