# SPEC-PR007-001 — denominador de cobertura e lint com tipos

- Task: [PR-007](../03_build/0356_production_backlog_2026-09-26.md), trilha
  T2. Estado: `SPEC_READY / BUILD_WAITING_PR003_AND_PATH_CLAIM`.
  Documentação desta fatia; nenhum arquivo de configuração, cobertura ou
  certificação foi alterado. `vitest.config.mts` está no claim PR-L04 e a
  baseline integrada depende da PR-003.

## Recon de 27/09/2026

O `vitest.config.mts` inclui `packages/**/*.ts`, `legacy/**/*.ts`,
`apps/**/*.ts` e `apps/**/*.tsx` na cobertura V8, mas exclui
`apps/web/src/**`, adapters PostgreSQL por padrão/nome e quatro repositórios
SQL explícitos. Exclui também `main.ts(x)` e testes. Os pisos globais
vigentes são statements 90%, branches 85%, functions 90% e lines 90%; o
guard crítico usa manifesto e rejeita fonte ausente. O `eslint.config.js`
usa `typescript-eslint` recomendado sem serviço de tipos. A
[AUD-0579](../04_audit/0579_current_candidate_deep_audit_2026-09-27.md)
mediu 92,41% statements, 87,37% branches, 94,84% functions e 93,40%
lines no denominador atual; essa medição é histórica, não baseline do
candidato final. Branches ficavam a 2,37 pontos do piso, abaixo da margem
de 3 pontos pedida pela PR-007. Duas execuções antigas variaram até 0,04
ponto; investigar antes de elevar limiar.

O [Vitest documenta](https://main.vitest.dev/guide/coverage) que
`coverage.include` traz inclusive fontes não importadas ao relatório e que
`coverage.exclude` retira os padrões listados. A
[documentação do typescript-eslint](https://typescript-eslint.io/getting-started/typed-linting/)
usa `recommendedTypeChecked` e `parserOptions.projectService: true` para
regras que exigem tipos; isso aumenta o custo do lint e requer que os
arquivos pertençam a projetos TypeScript válidos.

## Contrato de BUILD

1. Gerar e versionar um inventário de **fontes rastreadas** por grupo:
   núcleo, web e adapters PostgreSQL. Cada arquivo de produção TypeScript
   elegível pertence a exatamente um grupo; arquivo novo entra
   automaticamente no inventário. Testes, `dist/`, declarações geradas e
   arquivos de configuração ficam fora com motivo. Bootstraps `main.ts(x)`
   recebem grupo/relatório próprio ou prova de processo explicitamente
   inventariada, sem desaparecer do denominador auditável. Um guard falha
   quando arquivo esperado some do relatório ou um glob exclui fonte nova
   silenciosamente.
2. Preservar o relatório do núcleo usado pela certificação e criar um
   segundo relatório identificável para web/adapters PostgreSQL, com
   arquivos, contagens e percentuais de statements, branches, functions e
   lines por grupo. A suíte PostgreSQL usa banco descartável e não pode
   converter teste requerido em skip. Testes web em jsdom e o E2E Chromium
   são evidências diferentes; o relatório deixa claro o que cada um mede.
3. Não reduzir os pisos normativos do núcleo (90/85/90/90) nem os 95% de
   branches críticos. Para cada grupo novo, medir baseline em dois runs do
   mesmo candidato, congelar thresholds próprios antes de escrever testes
   para atingir o alvo e exigir margem de pelo menos 3 pontos nas quatro
   métricas. Se isso não for possível sem alterar o contrato de qualidade,
   registrar a diferença e obter decisão antes de relaxar qualquer piso.
   Cobertura só melhora com teste que observa comportamento ou falha real,
   não com exclusão, import artificial ou assert que espelha código.
4. Ativar lint com tipos em etapas: primeiro as regras
   `no-floating-promises` e `no-misused-promises` no código runtime TS,
   usando serviço de projeto; depois o conjunto
   `recommendedTypeChecked` onde o projeto suportar. JS/config/testes
   recebem overrides específicos quando os tipos não se aplicarem.
   Qualquer exceção precisa de caminho/regra/razão estreitos, sem disable
   global para obter verde. Corrigir promessas realmente não aguardadas e
   callbacks async de risco.
5. Investigar a variação histórica de cobertura com duas execuções
   controladas e comparar inventário, skips, contagens e percentuais antes
   de mudar thresholds. Registrar ferramenta, Node, banco, SHA, hashes dos
   relatórios e causa observada ou incerteza remanescente.

## Gate e aceite

- Casos negativos do guard: fonte web/SQL nova excluída, fonte crítica
  desaparecida, grupo duplicado, relatório ausente/vazio, skip PostgreSQL
  requerido, threshold/margem violados e mutação de arquivo após medição.
- Node 22: `typecheck`, lint tipado, formato, `npm test`, `test:postgres`,
  E2E, relatórios de cobertura, `coverage:critical`, links e diff verdes.
  A certificação e o CI remoto devem rodar no candidato integrado após a
  PR-L04 e a PR-003, não sobre `dist/` ou relatórios históricos.
- Pronto somente quando os dois denominadores estiverem publicados, os
  thresholds próprios forem congelados com a margem exigida e
  `npm run lint` sair 0 sem supressões amplas. Esta SPEC não concede
  autorização de deploy, dado real ou release.
