# D012 — plano de segurança e matriz de exposição

Preparação T1; **NOT_APPLIED**. Lockfile Root somente leitura. Severidade máxima por grupo vem do audit preservado; não afirmar que cada advisory do mesmo grupo é HIGH. Dependência presente não comprova exploração ou reachability no bundle.

| Grupo | Severidade do grupo | Versão observada | Path no lock | Escopo | Consumidor |
| --- | --- | --- | --- | --- | --- |
| brace-expansion | HIGH | 5.0.9 | `node_modules/brace-expansion` | dev | tooling ESLint/minimatch/@typescript-eslint do Root, que analisa apps/packages/products; dev, não demonstrado no bundle runtime |
| fast-uri | HIGH | 3.1.6 | `node_modules/fast-uri` | runtime | runtime API via Fastify/AJV/stringify; dev legado secretary-journeys; produto não declara Fastify, acesso via consumidores do harness depende da composição |
| fast-uri | HIGH | 4.1.4 | `node_modules/fastify/node_modules/fast-json-stringify/node_modules/fast-uri` | runtime | runtime API via Fastify/AJV/stringify; dev legado secretary-journeys; produto não declara Fastify, acesso via consumidores do harness depende da composição |
| fastify | MODERATE | 5.12.3 | `node_modules/fastify` | runtime | runtime @cvg/api e dependency Root; dev legacy secretary-journeys; produto declara apenas zod/model-gateway, sem Fastify direto |
| undici | HIGH | 7.29.0 | `node_modules/undici` | dev | dev jsdom/Vitest Root e suites dos workspaces; Node fetch nativo não é este pacote npm |

Inputs exatos e advisories por grupo: [manifest](d012-exposure.json). Explicações npm preservadas em `../audit-actions/security-discovery/*-explain.json`. A classificação runtime/development é a do lock; consumidor/reachability adicional acima é inferência pela árvore de dependências, ainda sem SBOM/metafile final do deploy.

Candidatos de atualização, conferidos nas fontes oficiais em 03/10/2026, sem instalação: brace-expansion 5.0.12 ([release](https://github.com/juliangruber/brace-expansion/releases/tag/v5.0.12)); fast-uri 3.1.8/4.1.5 ([advisory](https://github.com/fastify/fast-uri/security/advisories/GHSA-hrr3-gc8f-f4qj)); Fastify 5.12.5 ([advisory](https://github.com/fastify/fastify/security/advisories/GHSA-4mh8-r7rc-xpvc)); Undici 7.29.1 ([release](https://github.com/nodejs/undici/releases/tag/v7.29.1)). Não equivalem a aceite de todas as advisories ou pacote integrado.

Execução futura de D012: após dependências D009/D011/HISO-005 e claim exclusivo de lock, congelar novo audit/lock, atualizar só grupos confirmados, provar oracles negativos das advisories e regressão por consumidor, types/lint/fullPG/E2E/neutral, novo audit/SBOM/licenças, crítica e integração no SHA. Se residual persistir, registrar FAIL ou pedir decisão de exceção específica; nenhuma exceção vigente. Não executar fix nesta rodada T1.
