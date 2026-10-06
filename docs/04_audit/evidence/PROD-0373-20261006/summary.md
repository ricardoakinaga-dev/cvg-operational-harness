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
