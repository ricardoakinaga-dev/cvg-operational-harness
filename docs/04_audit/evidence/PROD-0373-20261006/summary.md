# PROD-0373 — AUD-0600 e barra 0373 até produção — 06/10/2026

- Task `PROD-0373-20261006`, Claude Code. Pedido do usuário: "avalia as
  colocações do auditor e faz as correções necessárias para colocar o programa
  em produção". Decisões do usuário: push e proteção do `main`; dispensar
  CodeQL #6/#7 como falso positivo; excluir `docs/04_audit/evidence/**` do
  CodeQL; Claude Code assume a condição 4.
- Base `5c97b40`. Dados sintéticos, sem provider, canal real ou deploy.
- Operação: [0802](../../../08_runtime/0802_harness_production_operations.md).

## AUD-0600

| Achado | Correção | Prova |
| --- | --- | --- |
| F01 | `turn/end` perdido mantém o motivo de um turno já parado | Conformidade AUD-0600 F01 (log inteiro fora) |
| F02 | Pausa estaciona a etapa como `WAITING`; toda parada terminal fecha a etapa pendente (`cancelled`/`deadline`/`not_started`; `RUNNING` vira `unknown_effect`) | Sondas do lead (5 casos) e de viabilidade (2) reexecutadas sem as asserções do defeito; 7 regressões novas |

Avaliado e mantido: retomada depois de `TOOL_FAILURE`/`INTERNAL_FAILURE`
redespacha a decisão, como fixa o P3-CHECKPOINT-002; a proteção contra
duplicata fica no journal de efeitos por `operationKey`. Uma trava extra foi
testada e revertida por mudar esse contrato.

## Barra 0373

| # | Resultado | Evidência |
| --- | --- | --- |
| 1 | `it.fails` zerados: I6 (`model.requested`), I7 (`policy_failed`) e I12 (`paused`) no `GovernedAgentRuntime` | `tests/conformance/agent-runtime.conformance.test.ts` |
| 2 | Suíte completa 358 arquivos, 2.925 PASS, zero falhas/skips/`it.fails`; PostgreSQL 37 arquivos, 296 PASS; typecheck/lint/formato verdes | rodada final local |
| 3 | Smoke 16/16 na imagem: API e worker `NODE_ENV=production`, papéis separados, webhook assinado, aprovação com um efeito, reuso sem duplicata, replay recusado após reinício | [production-stack-smoke.json](production-stack-smoke.json) |
| 4 | Bootstrap de sessão PostgreSQL (promovido do cache GREEN do Codex): login 200, protegida 200, sem sessão 401 | smoke; `production-bootstrap-postgres-own.test.ts` |
| 5 | Config CodeQL e #6/#7 dispensados; aguarda push, CI e proteção do `main` | pendente |
| 6 | `npm audit` 0; gitleaks 8.28.0 na imagem: 0 achados (regras padrão pulam `node_modules`) | [image-inspection.json](image-inspection.json) |
| 7 | Distroless `cc-debian12:nonroot`, Node 22.23.2, sem shell/apt/npm, `cvg`, arquivos de app só leitura, worker na imagem | [image-inspection.json](image-inspection.json) |
| 8 | Restore com cadeia do kernel íntegra (16 eventos, mesmo hash de cabeça) e adulteração detectada | [restore-audit-chain.json](restore-audit-chain.json) |
| 9 | Heartbeat e fila (migração 0027), monitor na API, alerta HMAC; receptor recebeu `worker_down` com o worker parado | teste PG `worker-operations-postgres`; smoke |
| 10 | Interruptor durável: worker não pega item, kernel não inicia efeito; pendentes intactos; retomada drena | C12; teste PG; smoke; `scripts/ops-kernel-pause.mjs` |

Imagem verificada: `sha256:416d227edd8b7aae1997a5cac643cffcc07ac4e05076d6d62cd40b64ffe02486`.

## Limites

- Condição 5 depende de publicação: o push foi bloqueado pela permissão do
  terminal nesta sessão e precisa ser feito pelo usuário.
- Limiares e destino reais do alerta são decisão de operação; os padrões são
  120 s (worker) e 300 s (fila).
- Instabilidade conhecida: `chaos-postgres` encerra conexões do banco
  compartilhado e já derrubou, numa rodada, um teste de
  `postgres-persistence-mode` que passa isolado.

## Rodada 2 — Verify publicado e AUD-0601

O Verify de `dc4a3cb` falhou em `coverage-critical` (grupo `channel` 94,85%,
mínimo 95%) e pulou os gates seguintes. Rodados localmente num worktree
isolado, apareceram três falhas latentes, todas corrigidas:

| Gate | Causa | Correção |
| --- | --- | --- |
| coverage-critical | Ramos novos de `baseUrl` ausente nos adaptadores | Testes de configuração e de erro de envio: `channel` 96,48% |
| skip governance | Hashes de 5 arquivos (3 de outras frentes) e 2 suítes PostgreSQL novas fora do catálogo | Catálogo atualizado com contagens remedidas |
| postgres-proof (rem21-010) | Prova fixa na 0026; a 0027 criava tabelas fora do dump | Avanço para a 0027, permissões reaplicadas e rollback documentado |
| docs | Link para o relatório AUD-0600, ainda não commitado | Citado como caminho |

AUD-0601 (Codex) — todos os achados procedem e foram corrigidos:

| Achado | Correção | Prova |
| --- | --- | --- |
| F01 P1 | Pausa relida imediatamente antes do corpo; reserva liquidada sem efeito; retomada executa uma vez | Conformidade C12 nas três janelas (aprovação e journal reais) |
| F02 P1 | Rotação de sessão com `replace` na mesma família; logout de qualquer elo revoga a linhagem | Teste PostgreSQL com os papéis do bootstrap |
| F03 P2 | Cookie limpo só depois da revogação confirmada | Teste PostgreSQL com `EXECUTE` revogado e retry |
| F04 P2 | Healthcheck único: `/live` na API, arquivo de vida no worker | Smoke: os dois contêineres `healthy` |
| F05 P2 | Um heartbeat por vez, delta reservado antes do `await` e devolvido em falha | Teste com persistência lenta e falha |
| F06 P2 | Worker sanitiza o payload antes de encadear; verificador estrito e com âncoras | Testes; restore com adulteração de payload detectada |
| F07 P3 | Prova de restore exige `NODE_ENV=test` explicitamente | Recusa sem o perfil; PASS com ele |

Achado extra no smoke: com `API_REQUIRE_HTTPS=true` a sonda `/live` da própria
imagem recebia 426 (também na sonda antiga), deixando a API `unhealthy`. Só
`GET`/`HEAD /live` por loopback sem cabeçalhos de proxy ficou isento.

Imagem final: `sha256:a0f647b1eaa75b2ced1b59e42886d83ef72b737f783b78f5d5613aa61a1b627c`
— smoke 18/18 e inspeção PASS (gitleaks 0).

## Rodada 3 — AUD-0602 e CI de `4aa4d8f`

| Item | Causa | Correção |
| --- | --- | --- |
| AUD0602-F01 P1 | A última leitura da pausa é assíncrona e vinha depois da checagem de cancelamento/prazo | Leitura da pausa antes do `beginStage`; a checagem síncrona de cancelamento/prazo fica imediatamente antes do corpo; negação liquida a reserva sem efeito |
| AUD0602-F02 P2 | Troca de operador/papel emitia o cookie novo antes de revogar a família antiga | Família anterior revogada primeiro; falha responde 503 sem `Set-Cookie` e sem sessão nova; cookie só depois da mudança durável |
| Security `secret-scan` | Checkout raso: um push de um commit parecia commit raiz e a árvore inteira era revarrida (101 achados heurísticos, todos sintéticos/prosa/evidência), sem casar as impressões digitais | `fetch-depth: 0`; simulação local do intervalo do push: 3 commits, zero achados |
| Verify `certify` | No Actions o Vitest colore o resumo mesmo em pipe; `parseVitestSummary` não removia ANSI e `metrics.unit` virava nulo | Remoção de ANSI no parser, como o de Playwright; regressão com o resumo colorido real |

Regressões: cancelamento e prazo vencidos durante a última leitura (corpo 0,
aprovação `APPROVED`, retomada executa uma vez); troca de papel com revogação
falhando e retry (PostgreSQL real com os papéis do bootstrap). Gates locais
no worktree isolado: suíte com cobertura 358 arquivos/2.943 PASS, PostgreSQL
37/299, cobertura crítica, skips, mutação, docs, startup do worker.

## Rodada 4 — AUD-0603

| Achado | Causa | Correção |
| --- | --- | --- |
| AUD0603-F01 P2 (regressão de `7088342`) | Revogar e criar eram duas operações; criação falhando depois da revogação derrubava a sessão anterior | `switchIdentity` no store PostgreSQL: revogação da família e criação na mesma transação; falha em qualquer passo faz `ROLLBACK`, responde 503 sem `Set-Cookie` e a sessão anterior segue válida |
| AUD0603-F02 P2 (herdado) | Cookie predecessor (já rotacionado) não era a sessão viva, então a troca não aposentava a linhagem e a sucessora seguia válida | A rota usa o cookie apresentado mesmo quando não está vivo: a família inteira dele é aposentada na mesma transação da troca |
| Observação de precedência | Pausa e cancelamento na mesma leitura | Comentário explícito: `paused` prevalece (devolve o trabalho à fila); nos dois casos o efeito não começa |

Regressões PostgreSQL com os papéis do bootstrap: criação falhando (cookie
anterior 200 depois da falha; retry troca e aposenta), e predecessor A1 →
sucessora A2 → troca com A1 (A1 e A2 401, nova sessão 200). Gates no worktree
isolado: suíte com cobertura 359/2.948 PASS, PostgreSQL 37/301, cobertura
crítica, skips, mutação, docs, formato/lint/typecheck. Smoke 18/18 e inspeção
PASS na imagem `sha256:4115fad62784956a286fa244c14453c5d7f8dbc869913559f35db3016c30389b`.
