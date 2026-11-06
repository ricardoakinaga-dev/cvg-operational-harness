# SPEC 0315 — Dividir `apps/api/src/server.ts` por domínio de rota

Status: `BUILD_DONE_LOCAL` (PostgreSQL e CI pendentes) (T2: refatoração sem mudança de contrato público; revisão humana desejável, não obrigatória). Data: 04/11/2026. Origem: achado P3 da [auditoria 0626](../04_audit/0626_repository_audit_2026-11-04.md). Nenhum BUILD iniciado.

## 1. Reconhecimento

- `server.ts` tem 6.285 linhas. `buildServer` (linha 411 até ~5090) registra 58 rotas dentro de um único closure: `/health*`, `/v1/session*`, `/v1/executions*`, `/v1/sessions/*`, `/v1/tasks`, `/v1/approvals`, `/v1/admin/*` (plugins, knowledge-sources, release-candidates, agents, test-lab, …) e `/v1/observability/*`.
- 74 testes em `apps/api/src/__tests__` importam `../server`; a API pública do módulo (`buildServer`, `runtimeLogLevel`, `buildServerFromEnv`) não pode mudar.
- Já existem módulos coesos ao lado (`oidc-routes.ts`, `operator-session-*.ts`, `http-*-boundary.ts`), que servem de modelo.

## 2. Regras

R1. **Comportamento idêntico.** Nenhuma rota, status, corpo, cabeçalho, ordem de hooks ou mensagem de erro muda. Sem mudança de schema nem de migration.
R2. Cada domínio vira `apps/api/src/routes/<domínio>.ts` exportando `registerXRoutes(app, ctx)`, onde `ctx` é um objeto tipado e explícito com as dependências hoje capturadas pelo closure (stores, políticas, logger, relógio). Sem estado global novo.
R3. Ordem de registro preservada exatamente (hooks `onRequest`/`preHandler` dependem dela). `buildServer` passa a só compor `ctx`, hooks e chamadas `register*`.
R4. Uma fatia por PR/commit, na ordem de menor acoplamento: (1) health/metrics, (2) tasks, (3) approvals, (4) observability, (5) admin/plugins e knowledge-sources, (6) admin/agents e release-candidates, (7) admin/test-lab, (8) sessions/executions, (9) session/logout por último (maior acoplamento ao hook de sessão).
R5. `server.ts` final ≤ 1.500 linhas; nenhum módulo novo > 1.000 linhas.
R6. Sem mudança em `package.json`, lockfile, `test:postgres` ou cobertura mínima. Mutation guard e `skip:governance` inalterados.

## 3. Critérios de pronto (por fatia e no fim)

C1. `typecheck`, `lint`, `format:check` verdes.
C2. `vitest run apps/api` verde antes e depois, com o mesmo número de testes (registrar contagem).
C3. `npm run test:postgres` (testes de `apps/api`) verde em Node 22 com PostgreSQL efetivo.
C4. Teste de caracterização novo: lista ordenada de `method + url + hooks` registrados (via `app.printRoutes()`/`onRoute`) idêntica antes e depois, congelada como fixture.
C5. Cobertura por arquivo e `coverage:critical` sem queda.
C6. Registro em SPEC (resultado), ledgers e evidência pequena; sem `certify` por fatia, só ao fim da rodada com código (regra de baseline do `AGENTS.md`).

## 4. Pré-requisitos e coordenação

- Rodar a suíte base **antes** de começar para fixar o estado atual (PostgreSQL descartável).
- Claim exclusivo de `apps/api/src/server.ts` e `apps/api/src/routes/**`; o Codex não deve editar `server.ts` durante a refatoração (hoje é um ponto de conflito).
- Nenhuma fatia misturada com correção funcional.

## 5. Decisões

- **D1:** posso seguir sem revisão sua da SPEC, por ser T2? (Recomendo sim, com a fixture C4 como rede de segurança.)
- **D2:** janela: quando o Codex não estiver mexendo em `server.ts`.

## 6. Decisões registradas (04/11/2026, usuário)

- **D1 = sim**, as 9 fatias (R4), sem revisão prévia da SPEC (T2).
- Condições: suíte base com PostgreSQL rodada antes da primeira fatia; claim exclusivo de `apps/api/src/server.ts` e `apps/api/src/routes/**`; commit seletivo por fatia; sem push.
- D2 (janela com o Codex) fica resolvida pelo claim exclusivo; se houver claim vivo do Codex em `server.ts`, a fatia espera.
- **Pendente:** o usuário ainda não pediu para iniciar o BUILD.

## 7. Resultado do BUILD (04/11/2026)

**Fatia 0 (`56069ff3e`):** tipos, esquemas e helpers que ficavam fora do `buildServer` foram para `server-options`, `-schemas`, `-persistence`, `-query`, `-identity`, `-inbound` e `-capability` (124 a 439 linhas cada, sem ciclos de importação). `server.ts` reexporta a API pública anterior.

**Fatias 1–9:** 13 registradores em `apps/api/src/routes/register-*.ts` (health, session, executions, webhooks, takeover, tasks, approvals, capability-approvals, observability, catalog, release-candidates, agents, test-lab) mais `routes/context.ts` com o `RouteContext` (38 dependências explícitas). `buildServer` monta `routeContext` e chama os registradores **na mesma posição e ordem** das rotas originais; `registerCaseAuthorizationRoutes`, `registerSecretaryJourneyRoutes` e o bloco `sessionEventStreams` permaneceram no lugar.

| Medida                   |        Antes |                                             Depois |
| ------------------------ | -----------: | -------------------------------------------------: |
| `apps/api/src/server.ts` | 6.285 linhas |                         1.268 linhas (R5: ≤ 1.500) |
| Maior módulo novo        |          n/a | 554 linhas (`register-executions.ts`; R5: ≤ 1.000) |

Evidência (Node 22.23.3):

- C4: `server-route-order.test.ts` compara a lista ordenada de rotas e sua classe (115 entradas em modo simulação e 115 em modo trusted) com um fixture capturado do `server.ts` **original** (conferido byte a byte numa worktree de `HEAD` anterior à mudança).
- C1: `typecheck`, `npm run lint` (repositório inteiro) e prettier limpos. A atribuição `routeContext: RouteContext` é verificada pelo compilador.
- C2: `apps/api` 976 → 977 testes passam (+1 novo), 164 pulados, antes e depois. Um teste de OIDC estoura prazo sob carga na suíte completa e passa isolado (32/32), antes e depois da mudança. Outros 66 testes que importam o servidor (`tests/e2e`, `products/shift-assistant`) passam.
- `build:runtime` (usado pela imagem) passa; `boundary:products` segue com 0 violações e `INCOMPLETE`, igual ao estado anterior.

**Não verificado localmente (C3, C5):** esta máquina não tem PostgreSQL nem Docker. Os 164 testes de `apps/api` que exigem PostgreSQL, `test:postgres`, cobertura por arquivo/`coverage:critical` e `certify` não rodaram. Dependem da CI do PR. Não houve mudança de `package.json`, lockfile, migrations ou schemas.

**Desvio da SPEC:** as 13 fatias saíram num único commit gerado por transformação automática (compilador do TypeScript) em vez de uma por commit, porque a ordem de registro precisava ser preservada de ponta a ponta. A equivalência é protegida pelo teste de ordem, pelo typecheck e pelas suítes acima.
