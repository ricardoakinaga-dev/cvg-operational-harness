# C1 Builder — IMPLEMENTED

HISO-005 corrigido sob SPEC0178/B1 e barra C1. **IMPLEMENTED, sem aprovação**. Código/testes congelados; nenhum crítico ou descendente executado pelo Builder. Lead executa os gates T2 integrais e a única revisão fresh-context posterior.

## Mudança e rationale

O TypeScript substitui extensões para encontrar implementações/declarations de tipos: `transport.mjs` pode resolver para `transport.d.mts`. Esse resultado não demonstra o conteúdo do runtime. O checker conserva a closure TypeScript e resolve separadamente o arquivo físico com Node22 (`import.meta.resolve` versus `createRequire(...).resolve`), visitando ambos. A resolução Node não importa/executa módulos; uma frontier é processada em batch. As condições import/require/default e flags conditions do processo são respeitadas. Runtime ausente, frontier incompleta ou primitive desconhecido reprova.

Fontes ainda não compiladas mantêm somente a projeção explícita `.js`→`.ts`/`.tsx`, `.mjs`→`.mts`, `.cjs`→`.cts` e mappings `paths` configurados para implementação. A condição `types` de um pacote, isoladamente, não autoriza essa projeção; declarations nunca substituem runtime ausente. Isso preserva o core atual sem omitir diagnósticos. Type-only exports usam a condição Node do arquivo TS e não criam aresta runtime.

Capacidades require/module/createRequire/resolve propagam por aliases locais. Propriedade literal conhecida pode ser inspecionada; propriedade computada desconhecida de module/namespace, escapes, bases não ancoradas e opções `require.resolve` não suportadas recusam. Métodos de domínio chamados require, stylesheets, imports neutros e direção produto→core continuam cobertos.

## Evidência executada

- Node: `v22.23.2`, binário `/home/ricardo/.nvm/versions/node/v22.23.2/bin/node`.
- Scratch: `/home/ricardo/.cache/cvg-harness-audit-actions-20261003/c1-builder`; ZIP R2 extraído apenas nele. Nenhuma extração para packages/docs root.
- Archive SHA-256: `0ab9aa550325297a86976f0b64efde67db9da5d36fdd11cefe0b74b390184a10`.
- [Baseline R2](archived-baseline.json): 10/17 resultados esperados; sete falsos PASS reproduzidos independentemente, inclusive execução dos runtimes sintéticos e CLI.
- [R2 final](archived-final-frozen.json): 17/17 resultados esperados; sete antigos falsos PASS recusados. Quatro controles positivos CLI0, treze negativos CLI1.
- [48 testes originais](vitest-baseline.json): 48/48 antes da alteração.
- [78 regressões contra checker antigo](expanded-baseline.json): 54 PASS/24 FAIL, exit1 esperado. O harness detecta os defeitos.
- [78 regressões finais](focused-final.json): 78 PASS/0 FAIL/0 SKIP, exit0 em candidato privado. CLI e API públicos exercitados.
- [CLI root final](root-positive-final.stdout.log): exit0, 1151 fontes/796 core/26 workspaces/5587 arestas; zero violações/diagnósticos.
- [Preservação dos testes](test-preservation.json): todos os 17 statements originais iguais pela impressão AST normalizada; 12 novos statements/30 novos casos parametrizados.
- [Comandos exatos](commands.json): lint focal, formato focal e sintaxe dos dois arquivos exit0; logs stdout/stderr associados. Resultados intermediários e a falha do novo controle de tipos foram preservados, corrigidos antes do freeze.

## Paths e hashes congelados

- `scripts/check-product-boundary.mjs`: `9af2d658c61fe809d8a2e593f1118751851e2534e197304a3a72f7adc3b4798f`.
- `tests/product-boundary.test.js`: `aa8f5c99cdaa439da9100db987d779ada11ff9690102ae4c99f1882a414d29c3`.
- Evidências somente `docs/04_audit/evidence/HARNESS-ISO-EXEC-20261003/audit-actions/c1-builder/**`.

[Proof](proof.json), [estado anterior](source-before.json), [diff checker](check-product-boundary.mjs.diff), [diff testes](product-boundary.test.js.diff) e [manifesto de artefatos](artifacts-manifest.json) permitem revisão e reprodução. O candidato focal contém bytes idênticos aos arquivos root congelados.

## Limitações e próximo passo

Checks integrais T2 (typecheck, lint geral, testes gerais com PG, test:postgres e E2E) **NOT_RUN nesta lane**; pertencem ao Lead, assim como a única revisão independente posterior. Nenhum aceite C1/T2 ou produção é concedido. A gramática estática local é conservadora e não prova JavaScript arbitrário; node_modules externos continuam folhas pela política existente. Projeção TS de fonte não comprova exports construídos; o candidato integral do Lead deve verificá-los.

API exportada preservada. Sem alteração de consumidor, SPECs, lockfile, ledgers/controllers ou arquivos alheios; nenhum provider/dado real, segredo, push/deploy ou descendant. Continuidade documental preparada neste relatório; ledgers compartilhados ficam com seu owner. Próxima ação: Lead reconstruir candidato com esses dois hashes e executar regressão T2 antes da única review posterior.
