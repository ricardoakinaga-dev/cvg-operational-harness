# Próxima etapa entregue — A24-04 / preparação do gate corretivo M07

> Estado corrente AUD52 (24/09/2026): o reteste C1L parou por drift de baseline em `docs/02_spec/0190_spec_validation.md`, fora do allowlist; veja [resultado](../04_audit/evidence/AUD-20260924/M07-S1-C1L/final-gate-result.md). Os detalhes abaixo descrevem etapas anteriores e permanecem históricos.

Data: 23/09/2026. Estado de entrada: M07-S1 `FAIL / OPEN`; candidato histórico `a00127c13b165b81bd95d2671891e737f50bfb60c482816d0ef9c1b26fa4a797`; M05 Discovery aprovada e dependente de M07; G21-5/G21-6 fechados; produção `NO_GO`.

## A24-04 concluída por leitura

O [ledger de adjudicação](../04_audit/evidence/AUD-20260923/A24-04-R0/adjudication-ledger.md) vincula as 22 ocorrências a 19 relações owner-target-código em nove owners: dois imports de teste sem declaração, nove mismatches de categoria sem edge de produção e onze findings que compartilham uma dependência de produção type-only considerada segura pelo checker. Nenhum manifest foi alterado. O ledger propõe A24-12 para corrigir a semântica do scanner e mantém os findings originais intactos.

O [adendo SPEC R1](../04_audit/evidence/AUD-20260923/A24-04-R0/spec-r1-amendment.md) e o [pedido concreto de gate](../04_audit/evidence/AUD-20260923/A24-04-R0/r1-gate-request.md) registram que B3 mede inventário completo/visível e pode terminar `PASS_WITH_FINDINGS`; B6 mantém os gates de teste e os thresholds fixos. A cobertura histórica continua abaixo da barra. Não modificar `M07-S1-BUILD-v1`, seu resultado `FAIL` ou os manifests históricos.

## Pacote de gate R1 a entregar após A24-04

O pedido preparado delimita: adendo SPEC, paths de A24-01/A24-12/A24-03, conjunto exato de comandos, Node `22.23.2`, baseline histórico sem reutilizar o fingerprint não reproduzível, política de saída do inventário, thresholds imutáveis 90/85/90/90, rollback, evidência, reviewer e fronteira com M07-S2/S3/S4. O fingerprint novo deverá ser recalculável do JSON salvo. O teste de coverage deve cobrir regras de comportamento, não apenas aumentar contadores. Após aprovação humana específica, BUILD e checks ficam limitados ao pedido.

## Saída desta etapa

- Ledger A24-04 revisável e ligado às 22 ocorrências sem omissão: concluído documentalmente.
- Adendo prospectivo B3/B6 e gate R1 concreto preparados; aprovação posteriormente informada e vinculada ao SHA-256 do pedido. Crítico independente da adjudicação ficou `UNAVAILABLE` por limite de threads; R1 mantém I1 como requisito.
- Backlog, log e runtime reconciliados; gate R1 `APPROVED`, BUILD `NOT_STARTED` até preflights formais no processo executor.
- Com o gate aprovado, A24-01/A24-12/A24-03 formam o primeiro slice corretivo; A24-02 valida o novo candidato em Node 22 e A24-05 audita. M05 só recebe handoff após M07 auditada e aceita.

Nenhum dado real, integração externa, ação clínica/financeira/prontuário, consulta real automática, resposta RAG sem fonte aprovada ou produção é autorizado por este pacote.
