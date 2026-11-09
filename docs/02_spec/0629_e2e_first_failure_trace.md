# SPEC0629 — Trace da primeira falha E2E

Status: DONE_LOCAL; integração canônica pendente. Task: AUD0627-FOLLOWUP/CI006.
Trilha T2: diagnóstico de testes sintéticos, sem contrato público ou efeito real.

## Reconhecimento e resultado

A qualificação CI003 em 531c8d27 falhou: 12 casos, 13 tentativas, uma
repetição. O primeiro caso mostrou página vazia; o único trace preservado
pertence à repetição aprovada. A causa permanece desconhecida. CI005 não
reproduziu a falha; seus erros de observador permanecem registrados.

Esta tarefa corrige a lacuna de captura, sem declarar correção da interface.
Baseline independente: feeda7e8ff3938b70bceb470a34f02161128ca06.
A candidata CI003 permanece congelada e reprovada; seu orçamento R3 não reabre.

## Implementação proposta

1. Em playwright.config.ts, usar trace retain-on-failure. Cada tentativa
   que falhar mantém seu trace; tentativas aprovadas descartam o trace.
2. Em .github/workflows/verify.yml, acrescentar upload separado de
   test-results/, certification/e2e-test-report.json e playwright-results.xml,
   condicionado a always() e à existência de test-results/\*\*/trace.zip.
   Nome cvg-e2e-diagnostics com run_id e run_attempt; retenção de 90 dias,
   mesmo SHA fixado de upload-artifact, if-no-files-found error e arquivos
   ocultos excluídos. O upload original cvg-ci-bar e seu layout permanecem
   byteidênticos. O novo artefato é diagnóstico, sem autoridade de certificado.

Invariantes: 12 casos canônicos; regras de binding e recusa de repetição;
workers, retries e timeouts originais; gates, seals, pins e thresholds;
nenhuma credencial, dado real, download, instalação ou mudança de lockfile.
As fixtures privadas de demonstração não entram em tests/e2e nem no Vitest.

## Verificação congelada antes do BUILD

- Fixture de navegador sintética com uma falha intencional, zero retries e
  configuração importada da fonte real: baseline sai 1 e não guarda trace;
  candidata sai 1 e guarda trace anexado à única primeira tentativa.
- Caso saudável na candidata sai 0 e não guarda trace. Não usar override
  de trace na CLI. Validar conteúdo e janela temporal do trace, sem exigir
  igualdade entre relógios independentes do Playwright.
- Comparar workflow anterior e novo: única etapa adicional; selos e upload
  original inalterados. Validar YAML e contrato dos caminhos/condição.
  Upload hospedado não executado localmente, logo não declarar seu PASS.
- Node 22: typecheck, lint, build, npm test completo, PostgreSQL completo e
  E2E canônico completo com binding e zero repetição. Guardar saídas brutas,
  fonte exata, revisão e cleanup. Cobertura/certify globais e integração
  no main continuam tarefas separadas, sem transferência de certificado.

Orçamento novo e restrito ao CI006: no máximo duas revisões HOW e duas CODE,
um retrabalho coerente por atividade; não rebatizar revisões da CI003.
Falha atual encerra a tentativa e exige disposição fundamentada antes de
outra execução. Nenhuma repetição automática para buscar resultado verde.

## Fontes e evidências

- [Fila própria](../03_build/0410_aud0627_followup_execution.md).
- [Playwright: opções de gravação](https://playwright.dev/docs/test-use-options#recording-options).
- [Ação fixada: caminhos e layout](https://github.com/actions/upload-artifact/blob/ea165f8d65b6e75b540449e92b4886f43607fa02/README.md#upload-using-multiple-paths-and-exclusions).
- Evidências CI006 serão registradas no pacote próprio da auditoria 0627;
  implementação, revisão, qualificação e aceite serão estados distintos.

## Resultado local — 02/11/2026

Fonte e98e1d3c033729591415aa6d7978811108914515, baseada em feeda7e8.
HOW e CODE aprovados sem achados obrigatórios. Prova de primeira falha
com trace e controle saudável isolado com saída zero aprovados.
Tipos, lint e build passaram em Node 22. Core: 10.434 testes/688 arquivos,
zero falhas, pendências ou todo, em 2.970,76 s; PostgreSQL: 482/47 em
294,29 s; E2E: 12/12 em 39,22 s, uma tentativa por caso e binding canônico.
Fonte limpa e dez inputs preservados. Container próprio removido após
zero clientes/produtores; portas livres e credencial descartável retirada.
Incidentes dos coletores foram preservados e conciliados sem repetir PG/E2E.

O [resultado terminal](../04_audit/evidence/AUD0627-FOLLOWUP-CODEX-20261101/ci006-trace/result.json)
e o [relatório](../04_audit/evidence/AUD0627-FOLLOWUP-CODEX-20261101/ci006-trace/REPORT.md)
registram a evidência atual. Upload hospedado não executado; integração e
certificação global continuam pendentes. CI003 permanece reprovada e
congelada, sem nova qualificação ou reabertura de R3. Produção NO_GO.
