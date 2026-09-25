# REM21-015 — Decision Record

Data: 2026-09-22  
Finding: `A21-F17`  
Decision: `SPEC_APPROVED_CONTROLLED_BUILD`  
Contract: `rem21-015-v1`

## Decisão

Executar quatro extrações incrementais e independentes: sessão trusted do API,
lifecycle de migrations PostgreSQL, loop detection do harness e Trace Viewer do
platform web. O contrato público e a semântica observável ficam congelados; a
task não autoriza refactor integral dos hotspots.

## Base da decisão

- `DISCOVERY.md` confirmou as quatro concentrações com métricas reproduzidas;
- `INDEPENDENT-DISCOVERY.md` registrou a revisão sidecar e a decisão de manter
  fora desta rodada as extrações mais sensíveis de Test Lab, execution routes e
  outbox transacional;
- `PRD.md` definiu owners, métricas mínimas, limites e critérios de aceite;
- `SPEC.md` definiu file plan, preservação de API/ordem/SQL/semântica e matriz
  de testes;
- o RED probe registrou os quatro módulos-alvo ausentes antes do BUILD;
- a evidência independente anterior do REM21-014 foi usada apenas como
  contexto de governança, não como prova de REM21-015 nem como aprovação.

## Guardrails

O BUILD usa somente fixtures sintéticas e recursos locais. Falha de
caracterização encerra o slice correspondente; não será corrigida reduzindo
threshold, removendo teste ou reclassificando skip. Produção, G21-5, G21-6,
IdP, providers, canais e dados reais continuam fechados.

## Próximo gate

Implementar os quatro slices na ordem API → PostgreSQL → harness → web; depois
executar AUDIT com métricas antes/depois, testes focados, regressão, hashes e
limitações honestas.
