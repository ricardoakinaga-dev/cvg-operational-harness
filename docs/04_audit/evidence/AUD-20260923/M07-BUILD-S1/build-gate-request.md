# Pedido de gate BUILD local — M07-S1 — 2026-09-23

## Decisão solicitada

Autorizar ou corrigir o BUILD local/sintético de `M07-S1 — inventory vertical slice` no escopo, candidato, arquivos e comandos abaixo. A aprovação deste pedido autoriza somente essa fatia. Não aprova M07-S2/S3/S4, produção, integração externa, dados reais ou ações sensíveis.

## Base e estado

- Task: `M07-S1`, P1-S1; dependência: SPEC-M07-001 aprovada para preparação do gate e quatro recomendações aprovadas.
- SPEC: [0128](../../../../02_spec/0128_m07_package_dependency_governance.md), SHA-256 `f2ea6eee7925188cfb5da5ed9170e9f90c96d050f37373f534326bff434d0f48`.
- SPEC decision: [registro humano](../M07-SPEC/human-decision-20260923.md), resposta “eu aprovo a Spec e as propostas”; escopo documental de preparação somente.
- Barra congelada: [M07-S1-BUILD-v1](quality-bar.json), SHA-256 `65563f3478e305afecc3d98dca16c139c04b680171d877ff7cf82240613ed74d`.
- Baseline atual: [manifesto pré-implementação](../M07-SPEC/candidate-baseline.json), artifact SHA-256 `40b33ca1f63a2c263abcd621cb25d6c6fdf6aae0d0ab05be36b108717357675a`, candidate fingerprint `439e13cba5d32821fd57b5ba2c71160189667a8168bdb97c9eeb1df52211f404`.
- Baseline capturado em HEAD `05d1f33322a5b75e65ee3b6f0fa1a737c300d7bb`; Node `v24.20.0`; npm `11.19.0`; 25 owners, 813 arquivos TS/JS em apps/packages, 29 tsconfigs e 973 entradas hashadas. O worktree tinha 828 caminhos modificados/não rastreados no inventário expandido; os hashes capturam os inputs selecionados naquele estado.
- Os três caminhos de implementação listados abaixo estavam ausentes no baseline. O artefato é um baseline pré-implementação, não um resultado de BUILD nem o fingerprint final para execução dos checks.
- Revisão SPEC: D1–D9 `PASS_LEAD_ONLY`; I1 `UNAVAILABLE`; Gauntlet `CONDITIONAL_PASS`; verificação integrada `NOT_RUN`. Esses limites permanecem.

## Escopo autorizado se este gate for aprovado

Implementar somente o inventário vertical local e read-only: schema de política, expansão dos owners npm, classificador interno de arestas, relatório determinístico candidate-bound e fixtures sintéticas.

Arquivos de código permitidos:

1. `config/workspace-dependency-policy.json` — codifica somente decisões já aprovadas; cada owner fora dos três packages neutros permanece `UNKNOWN`, e nenhum project-reference profile é marcado `REQUIRED` sem decisão nominal.
2. `scripts/workspace-dependency-audit.mjs` — checker direto em Node, sem novo script npm; lê manifests, tsconfigs e fontes locais, não executa packages nem modifica manifests.
3. `tests/workspace-dependency-audit.test.js` — fixtures temporárias e sintéticas para comportamento positivo, negativo, determinismo, stale candidate e limites de saída.

Evidência permitida em `docs/04_audit/evidence/AUD-20260923/M07-BUILD-S1/`: manifesto do candidato de execução após implementação, relatório do scanner, registros exatos dos comandos e revisões. Alterações documentais requeridas em backlog/log/runtime são administrativas; não ampliam o escopo de código.

Não alterar `package.json`, lockfile, package manifests, tsconfigs, outras fontes, `tests/architecture/dependency-direction.test.ts` ou o teste preexistente `tests/workspace-dependency-manifest.test.js`. O teste AUD19-011 não faz parte do regressivo focal de M07; o `npm test` e `test:coverage` obrigatórios de repositório podem executá-lo como cobertura geral. Registrar esse resultado como regressão de repositório, não como prova específica de M07. Não fazer correções de arestas/manifests, builds isolados, consumer fixtures ou slices M07-S2/S3/S4.

## Congelamento e integridade do candidato

1. Antes da primeira execução de qualquer check, criar `execution-candidate-manifest.json` no diretório desta evidência. Hashar o código, policy, testes, manifests, tsconfigs, configs, lockfiles e demais inputs definidos pelo baseline; registrar HEAD, Node/npm e cada caminho/hash.
2. Confirmar que o candidate fingerprint-base `439e13cba5d32821fd57b5ba2c71160189667a8168bdb97c9eeb1df52211f404` ainda corresponde ao estado pré-implementação. Se algum input hash-bound mudou antes do BUILD, parar e preparar nova revisão deste pedido.
3. No manifesto pós-implementação, somente os três caminhos de código permitidos podem diferir do baseline; qualquer outra mudança em input de código/config invalida este gate. Arquivos de evidência e saídas geradas ficam fora do fingerprint do código. Registrar baseline-versus-candidate e então usar esse mesmo fingerprint em todos os comandos e relatórios.
4. Nenhum teste, build, typecheck, lint, scanner ou runtime check pode ser executado antes da aprovação humana deste pedido e do congelamento pós-implementação.

## Comandos exatos propostos

Executar nessa ordem, todos no mesmo candidato pós-implementação e com as variáveis de conexão PostgreSQL removidas. Os comandos de teste são locais; se algum tentar acessar serviço, banco, rede externa ou credencial, interromper esse comando, registrá-lo como `NOT_RUN`/bloqueado e não contornar a dependência.

1. Inventário completo, gravando só na pasta de evidência M07:

   ```sh
   node scripts/workspace-dependency-audit.mjs --policy config/workspace-dependency-policy.json --profile inventory --format json --output docs/04_audit/evidence/AUD-20260923/M07-BUILD-S1/workspace-dependency-report.json
   ```

2. Teste novo e regressão de direção existente:

   ```sh
   env -u DATABASE_URL -u TEST_DATABASE_URL -u PGHOST -u PGPORT -u PGDATABASE -u PGUSER -u PGPASSWORD npm test -- tests/workspace-dependency-audit.test.js tests/architecture/dependency-direction.test.ts
   ```

3. Gates locais exigidos pelo Build Engineer antes de encerrar sprint com código:

   ```sh
   env -u DATABASE_URL -u TEST_DATABASE_URL -u PGHOST -u PGPORT -u PGDATABASE -u PGUSER -u PGPASSWORD npm test
   env -u DATABASE_URL -u TEST_DATABASE_URL -u PGHOST -u PGPORT -u PGDATABASE -u PGUSER -u PGPASSWORD npm run typecheck
   env -u DATABASE_URL -u TEST_DATABASE_URL -u PGHOST -u PGPORT -u PGDATABASE -u PGUSER -u PGPASSWORD npm run lint
   env -u DATABASE_URL -u TEST_DATABASE_URL -u PGHOST -u PGPORT -u PGDATABASE -u PGUSER -u PGPASSWORD npm run test:coverage
   ```

Não executar `npm install`, `npx`, `npm run build`, builds de package, `test:postgres`, E2E, serviços, bancos, integrações ou comandos adicionais nesta fatia. Os testes PostgreSQL opcionais devem permanecer sem conexão disponível e quaisquer skips relevantes serão registrados, sem alegar prova PostgreSQL. O suite geral poderá incluir testes já existentes fora do escopo específico de M07; não alterá-los nem atribuir seus resultados à aceitação de M07.

## Aceite, revisão e recuperação

- Todos os owners e fontes configuradas do mesmo candidato aparecem no relatório ou existe gap explícito que impede claim de cobertura integral. Arestas unresolved são visíveis; não viram conformidade.
- Fixtures provam os quatro defaults aprovados, classificação de roles, entradas incompletas/ambíguas, comportamento stale, determinismo e rejeição de output path inseguro.
- Nenhum manifest foi alterado; relatório e comandos apontam para o mesmo fingerprint; teste direcionado, suíte total, typecheck, lint e coverage passam para fechar S1.
- Cada resultado registra comando exato, versão da ferramenta, fingerprint, exit code e caminho do artefato. Falha preexistente permanece separada; sem edição fora dos três arquivos para corrigi-la.
- Lead review usa `M07-S1-BUILD-v1`; pedir critic I1 fresh-context. Se o serviço não disponibilizar I1, declarar `UNAVAILABLE` e manter no máximo `CONDITIONAL_PASS`.
- Rollback remove apenas os três arquivos M07 criados nesta fatia e suas saídas específicas de evidência; não usar `git reset`, checkout amplo ou limpeza que toque trabalho preexistente. Preservar o baseline, as decisões e as evidências históricas.
- G21-5/G21-6 continuam fechados; produção `NO_GO`; nenhuma ação real, sensível ou externa.

## Estado

`PENDING_HUMAN_M07_S1_BUILD_GATE`. Nada nesta solicitação foi implementado ou executado. A decisão humana seguinte é aprovar exatamente este gate ou pedir correções específicas.
