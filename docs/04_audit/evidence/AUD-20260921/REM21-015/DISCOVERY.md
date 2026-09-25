# REM21-015 — DISCOVERY

Data: 2026-09-22  
Finding: `A21-F17`  
Origem: `AUD20-013`, consolidada em
`docs/04_audit/0566_comprehensive_repository_audit_2026-09-21.md`  
Escopo: local, sintético, descartável, Node `22.23.2`; produção permanece
`NO_GO`.

## Achado confirmado

O achado corrente identifica concentração de responsabilidades em
`apps/api/src/server.ts` (~5.901 linhas),
`packages/persistence/src/postgres.ts` (~3.821),
`packages/harness/src/iterative-runtime.ts` (~2.503) e
`apps/web/src/features/platform/index.tsx` (~1.778). A contagem local foi
reproduzida antes do BUILD. Esses arquivos misturam composição, fronteiras de
segurança, persistência/migrations, política de loop e UI de múltiplos
control-centers; isso aumenta superfície de mudança e dificulta ownership.

Baseline reproduzível:

| hotspot | linhas | exports | funções/classes | `try`/`catch` | ownership observado |
| --- | ---: | ---: | ---: | ---: | --- |
| `apps/api/src/server.ts` | 5.901 | 12 | 44 | 185 | bootstrap, hooks, identidade, rotas e composição |
| `packages/persistence/src/postgres.ts` | 3.821 | 23 | 35 | 34 | migrations, outbox, runtime, audit, tasks e approvals |
| `packages/harness/src/iterative-runtime.ts` | 2.503 | 4 | 13 | 36 | loop, budgets, decisions, checkpoint e completion |
| `apps/web/src/features/platform/index.tsx` | 1.778 | 1 | 1 | 39 | state, efeitos, mutations e renderização de vários painéis |

O repositório já contém extrações anteriores (`http-security.ts`,
`operator-session.ts`, `request-metrics.ts`, `response-correlation.ts`,
`draft-helpers.ts`), portanto o trabalho deve continuar por seams de
comportamento e não por uma reescrita estrutural.

## Slices escolhidos

Foram selecionados quatro slices pequenos, cada um com um dono e uma API de
compatibilidade explícita:

1. **API / sessão de operador** — mover o hook trusted de sessão de
   `server.ts` para `operator-session-hook.ts`. O hook continua instalado na
   mesma ordem, preserva os `WeakMap`/`WeakSet` de request e mantém as respostas
   `401`/`503`, cookie de limpeza e exceções de `/v1/session`.
2. **PostgreSQL / migration runner** — mover leitura, aplicação com checksum e
   baseline explícito de migration para `postgres-migrations.ts`. O facade
   `postgres.ts` reexporta os contratos atuais, mantendo imports públicos e sem
   alterar SQL, advisory lock, transação ou fail-closed de checksum.
3. **Harness / loop-detection policy** — mover normalização, assinatura
   determinística e detecção de ciclos para `loop-detection.ts`, reexportando as
   funções existentes. O runtime continua dono de orçamento, checkpoint,
   dispatch e efeitos.
4. **Platform web / trace viewer** — mover a lista tenant-scoped de traces para
   `TraceViewer.tsx`, mantendo seleção, textos redigidos, links/âncoras e
   acessibilidade. O `PlatformPanel` continua dono dos efeitos e mutations.

Esses slices reduzem responsabilidade sem mudar contratos de domínio. Não serão
extraídos SQL de operações críticas, handlers completos de rota ou o formulário
inteiro do Control Center nesta rodada; isso exigiria uma especificação e uma
caracterização separadas.

## Caracterização existente e critério RED

Antes do BUILD, os comportamentos relevantes já tinham cobertura em:

- `apps/api/src/__tests__/operator-session.test.ts`;
- `apps/api/src/__tests__/trusted-replay-distributed.test.ts` e
  `apps/api/src/__tests__/rate-limit.test.ts`;
- `packages/persistence/src/__tests__/postgres-migration-smoke.test.ts`,
  `tenant-isolation.test.ts` e `conversation-intelligence-migration.test.ts`;
- `packages/harness/src/__tests__/iterative-runtime.test.ts`;
- `apps/web/src/features/platform/platform.test.tsx`,
  `multi-agent-creation.test.tsx` e `apps/web/src/__tests__/platform-panel.test.tsx`.

O critério RED de ownership é a ausência dos quatro módulos-alvo antes do
BUILD; o probe `test -e` deve falhar por arquivo inexistente. O BUILD adicionará
testes diretos mínimos para os seams novos e repetirá a caracterização acima.

## Riscos e limites

- a ordem dos hooks Fastify é comportamento observável;
- migrations e seus reexports são usados por muitos testes e pacotes;
- assinaturas de loop são parte da proteção contra efeitos repetidos;
- o Trace Viewer não pode perder `traceText`, filtro por agente ou seleção;
- nenhuma alteração de banco real, provider, IdP, canal, dado real ou produção é
  autorizada;
- a redução de linhas é métrica auxiliar, não critério para remover testes ou
  esconder responsabilidade.

## Gate de saída da descoberta

Discovery confirma o finding, seleciona slices disjuntos e define
caracterização/ownership. PRD e SPEC devem congelar os contratos, os limites de
API e os comandos de verificação antes de qualquer edição de código.
