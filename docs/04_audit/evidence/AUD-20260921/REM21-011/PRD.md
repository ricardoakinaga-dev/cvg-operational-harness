# REM21-011 — PRD

## Objetivo

Qualificar a observabilidade operacional do harness para que eventos relevantes
tenham métricas, logs e traces seguros; exporters tenham comportamento composto
e testável; e sinais de SLI/SLO sejam acionáveis sem transformar a telemetria em
dependência do caminho de segurança ou de readiness.

## Usuários e resultado

O operador de homologação deve conseguir distinguir erro de dependência,
degradação do exporter, violação de orçamento e falha de processamento usando
somente eventos sintéticos e labels de baixa cardinalidade. A equipe de
engenharia deve conseguir reproduzir a falha de um exporter sem perder a
decisão fail-closed nem o estado de readiness.

## Requisitos de aceite

1. Todo evento exportado passa por redaction e somente labels allowlisted de
   baixa cardinalidade chegam ao collector.
2. O exporter composto tenta os sinks independentemente; a falha de um sink
   não lança exceção ao chamador, não descarta o buffer local bounded e fica
   visível em um estado de health/alerta.
3. Logs estruturados preservam correlação sintética; spans preservam relação
   pai/filho; métricas têm cardinalidade limitada.
4. O catálogo SLO avalia, no mínimo, persistência p95 ≤ 2s, acknowledgement
   p95 ≤ 10s, ações sensíveis fail-closed em 100%, duplicidade em 0 e cobertura
   de timeline investigável em 100% dos casos aplicáveis.
5. Alertas para exporter degradado, SLO violado, probe falha e cardinalidade
   excedida são puros, determinísticos e carregam ação recomendada.
6. A queda do exporter não altera `live`, `ready`, policy, approval, audit ou
   qualquer decisão sensível; readiness continua baseada apenas em suas probes.
7. Um collector sintético e fault injection reproduzem o caminho acima com
   fixtures locais, sem dados reais, provider, canal, IdP ou segredo.

## Não requisitos

Não há promessa de retenção, disponibilidade, latência ou SLO de produção. Não
há integração com serviço externo nem exposição pública de métricas.

## Critério de decisão

`VERIFIED_LOCAL / FINAL_CERT_DEFERRED` somente depois de dois runs do gate com
mesmo run/candidate, testes negativos para leak/cardinality/failure masking e
evidência hashada. Produção segue `NO_GO`.
