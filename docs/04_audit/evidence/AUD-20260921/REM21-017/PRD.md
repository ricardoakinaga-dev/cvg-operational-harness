# REM21-017 — PRD

Data: 2026-09-22  
Status: `PRD_READY_FOR_SPEC`  
Findings: `A21-F19`, `A21-F22`, `A21-F23`, `A21-F26`

## Problema

O checker de documentação não diferencia um alvo de arquivo com localização
`arquivo:linha`, não percorre toda a evidência e não fecha os dois links
quebrados conhecidos. Ao mesmo tempo, artefatos históricos vazios não
distinguem captura bem-sucedida de saída ausente, e os registros mestres exigem
leitura linear para encontrar a fonte corrente. Isso produz ruído, falso
negativo operacional e risco de promover documentação sem evidência.

## Objetivo

Entregar uma higiene documental local, determinística e reversível que:

1. valide links relativos em `README.md` e todo `docs/`, reconhecendo fragmentos
   e localizações `:linha` sem falso positivo;
2. reporte caminhos absolutos separadamente e falhe por qualquer referência
   não classificada; os onze links do critic hash-bound e o link externo do
   relatório 0562 permanecem explícitos na allowlist e não são reescritos;
3. preserve os 66 vazios históricos e associe cada um a status explícito,
   comando, exit code, timestamp, ambiente e razão, sem inventar conteúdo;
4. faça o JSON histórico vazio continuar semanticamente `capture_missing`, não
   um evento de teste fabricado;
5. ofereça um índice curto que aponta para as fontes de verdade e evidências,
   sem criar um segundo ledger mutável.

## Usuários e owners

| superfície | owner | consumidor |
| --- | --- | --- |
| parser/scan | documentação/CI | `docs:check-links` |
| catálogo de vazios | auditoria/evidência | `evidence:check-hygiene` |
| índice | controle operacional | agente/auditor |
| links históricos | owner do documento | checkout portátil |

## Requisitos funcionais

1. `arquivo.ext:123` e `arquivo.md#anchor` devem resolver para o arquivo base;
   um arquivo ausente continua sendo quebrado.
2. O scan completo deve incluir `README.md` e todos os Markdown abaixo de
   `docs/`, inclusive `docs/04_audit`.
3. Os dois links de `PROD-04/report.md` devem resolver; referências absolutas
   históricas devem pertencer à allowlist com razão e bytes preservados. Uma
   referência nova ou não classificada deve falhar o gate.
4. O checker deve manter a distinção `broken`/`nonPortableAbsolute` e retornar
   exit `1` somente por quebrados internos.
5. Todo arquivo vazio sob `docs/04_audit/evidence` deve estar no catálogo com
   `status`, `command`, `exitCode`, `timestamp`, `environment` e `reason`.
6. Todo JSON não vazio sob a evidência deve parsear; o JSON vazio histórico é
   coberto pelo catálogo e por um sidecar específico que referencia stderr/exit.
7. O índice deve apontar para `docs/99_runtime_state.md`,
   `docs/20_master_execution_log.md`, `docs/30_backlog_master.md`, o backlog
   `0337` e os diretórios de evidência sem copiar o status corrente.

## Fora de escopo

- alterar o conteúdo histórico dos logs ou fabricar a saída de probes;
- corrigir `A21-F24` ou `A21-F25`;
- reescrever os milhares de eventos dos masters;
- qualquer serviço externo, dado real, produção ou ação sensível.

## Critérios de aceite

- [ ] fixtures positivas/negativas provam localização, fragmento, absoluto e
  alvo ausente;
- [ ] scan completo passa com zero quebrados internos;
- [ ] zero referência absoluta não classificada; os 12 históricos esperados
  são reportados como `historical-preserved`;
- [ ] catálogo cobre os 66 vazios e o JSON não vazio parseia;
- [ ] `probe-after.json` mantém zero bytes, mas seu sidecar registra
  `capture_missing` com `exitCode=1` e `event=null`;
- [ ] índice é curto, linkado e explicitamente derivado;
- [ ] typecheck/lint/formato/diff e testes do checker/higiene passam;
- [ ] produção continua `NO_GO`.

## Métricas

| métrica | RED | alvo GREEN |
| --- | ---: | ---: |
| quebrados no scan `docs` | 43 | 0 |
| absolutos Markdown não classificados | 12 | 0 |
| vazios sem catálogo | 66 | 0 |
| JSONs não vazios inválidos | 0 observado | 0 |
