# Revisão independente F18 (SPEC 0280) — fatia 1 do Codex (D9, 29/10/2026)

Commit revisado: `66ad2137e` (branch `codex/aud0625-f18-build-20261029`, base `02c1002a3`), em cópia
destacada própria; também conferido o commit seguinte `1d7db9328` (só a renomeação da SPEC).
Node 22.23.2, sem PostgreSQL. Sintético.

## Veredito: APPROVE (fatia 1), 3 P3 de acompanhamento para a fatia 2

## Verificado

- **Fail-closed** (`controls.ts`): `requiresGrant(call)` = `tool.requiresApproval || needsApproval ||
  policyDecision.outcome === 'REQUIRE_APPROVAL'`. No `tool/execute`, sem `call.grant` e com exigência, a
  chamada vira `not_started` com `INSUFFICIENT_EVIDENCE` e `cause: approval_unbound`, sem chegar a
  `next`; sem exigência segue `next()`. O `pre-execute` passa a usar a mesma função, então as três
  fontes pedem aprovação de forma independente (antes, uma política REQUIRE sem `needsApproval` não
  perguntava).
- **Caminho legítimo com grant intacto**: os positivos do arquivo RED (`clean`, `policy-only`,
  `confirm-failure`) continuam reservando 1, executando 1 e confirmando 1; `packages/harness` inteiro
  passa (ver abaixo). O ramo com grant não foi tocado.
- **Mutantes D9 sobre a fatia** (todos mortos): retirar o termo da política (2 falhas: caso 2 e o RED
  de needsApproval), retirar `needsApproval` (caso 1), retirar o
  descritor (caso 0), e ramo de execute sempre `next` (4 falhas). Fonte restaurada com `git checkout`.
- **P3 da fase 1 incorporados**: R2 exige `TOOL_FAILURE` + `unknown_effect` + `complete=1`; R4 exige
  `POLICY_DENIED` + corpo 0 + reserva 0 + efeitos vazios; REDs novos para needsApproval, política,
  reserva (`drop-approval`) e `next` duplicado/ausente.
- **SPEC e recibo byte a byte**: `docs/02_spec/0280_...md` e a cópia de evidência no commit revisado têm
  sha256 `8e15a9d3f7a59ee70eb941039ad19327b3ea247fb1c2ba25bb557d4f7cd76ebe`, igual ao do checkout
  compartilhado; `1d7db9328` é renomeação pura para `.md.txt` (0 linhas) com o mesmo sha;
  `human-decisions-11.json` = `1acc726123eb...bff4`, igual ao do checkout.
- **Testes**: `tests/aud0625-f18-approval-admission.test.ts` + RED + `packages/harness`: 40 arquivos,
  569 passam e 7 `expected fail` (os da fatia 2), 0 falha. `policy-engine/engine.ts` e catálogos fora do
  diff, então não há religação de skip-catalog nem de mutation-manifest.

## P3 para a fatia 2

1. O teste de admissão invoca `host.listeners('tool/execute')[0]`: depende de o controle de aprovação
   ser o primeiro ouvinte. Hoje o host tem 3 controles; vale buscar o ouvinte pelo nome do plugin.
2. Os 7 `it.fails` passam por qualquer falha; ao virarem `it` na fatia 2, conferir que cada um falhava
   pela causa descrita (a evidência `baseline-causality.json` ajuda).
3. O fail-closed ainda lê flags mutáveis (`needsApproval`, `policyDecision`); isso é a fatia 2 (estado
   privado/projeções e reconciliação de hooks). Até lá o `rewrite-policy` segue em RED.
