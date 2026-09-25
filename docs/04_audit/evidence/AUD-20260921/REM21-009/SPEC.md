# REM21-009 — SPEC

## Gate e escopo

`SPEC_APPROVED_CONTROLLED_BUILD_OFFLINE / BLOCKED_BY_G21-5_FOR_EXTERNAL_EXECUTION`.

O BUILD desta task é documental e sintético. Ele pode produzir contratos,
fixtures, matrizes e runbooks locais; não pode abrir rede, criar credencial,
instalar integração ou executar efeito.

## File plan

1. `external-qualification-contract.schema.json` — schema fechado para o
   pacote, com domínios `identity`, `provider`, `channel`, `institutionalSource`
   e `egress`, autoridade, dados, observabilidade, rollback, abort e estado.
2. `external-qualification-fixtures.json` — casos sintéticos positivos,
   incompletos e adversariais; todos marcados `synthetic: true`.
3. `authority-matrix.json` — slots de owners/autoridades, todos `PENDING`,
   com escopo, evidência esperada, validade e revogação.
4. `THREAT-MODEL-ADDENDUM.md` — ameaças específicas de integração externa,
   segredo, supply chain, egress, tenant, fonte e ação sensível.
5. `QUALIFICATION-RUNBOOK.md` — sequência futura com pré-condições G21-5,
   checks por domínio, observabilidade, handoff e stop conditions.
6. `ROLLBACK-ABORT-RUNBOOK.md` — abort seguro, isolamento, preservação de
   evidência, reconciliação e rollback sem efeito sensível automático.
7. `DECISION-PACKET.md` — perguntas fechadas, autoridade requerida, estado
   `PENDING`, hashes esperados e decisão separada.

## Contrato mínimo

O contrato deve exigir:

- `schemaVersion`, `packetId`, `synthetic`, `status` e `createdAt`;
- cada domínio externo com `status`, `ownerSlot`, `environment`, `dataClass`;
- `endpointRef` e `secretRef` como referências redigidas, nunca valores;
- `auth`, `tenantBoundary`, `correlation`, `idempotency`, `rateLimit`,
  `redaction`, `observability`, `rollback` e `abortConditions`;
- `authority` com `requiredRole`, `decisionStatus`, `decidedAt`, `expiresAt`,
  `evidenceRef` e `evidenceSha256`, permanecendo `PENDING` antes do gate;
- `externalExecution: false` para qualquer fixture deste slice.

O schema deve rejeitar campos desconhecidos, endpoints operacionais,
credenciais materializadas, `decisionStatus: APPROVED` sem evidência e
`externalExecution: true` neste pacote.

## Matriz de validação offline

| Caso | Resultado esperado |
|---|---|
| pacote sintético completo, mas sem autoridade | `BLOCKED` |
| owner/role ausente | `BLOCKED` |
| endpoint/secret materializado | `REJECTED` |
| destino fora da allowlist declarada | `ABORT` |
| tenant ou audience incompatível | `DENY` |
| replay ou idempotency mismatch | `DENY` sem dispatch |
| fonte institucional ausente/revogada/stale | `HANDOFF` |
| output clínico/financeiro/agenda sensível | `HANDOFF` + `ABORT` |
| timeout/retry sem limite | `ABORT` |
| rollback não demonstrado | `BLOCKED` |
| contrato local fake/deterministic | `ACCEPTED_FOR_OFFLINE_ONLY` |

## Evidência e auditoria

Cada artefato deve registrar comando, runtime, timestamp, exit code, escopo,
`synthetic`, candidate/run quando houver e SHA-256. A evidência deve afirmar
claramente que não mede IdP/provider/canal real, RPO/RTO ou produção.

## Critérios de transição

- `DISCOVERY_COMPLETE`: superfícies e lacunas confirmadas.
- `PRD_COMPLETE`: resultado, autoridades, fora de escopo e aceite definidos.
- `SPEC_APPROVED_CONTROLLED_BUILD_OFFLINE`: file plan e negativos aprovados.
- `OFFLINE_PREPARATION_COMPLETE`: artefatos e validação local passam.
- `BLOCKED_BY_G21-5`: qualquer execução externa, credencial, dado real,
  homologação ou piloto.
- `WAITING_HUMAN_APPROVAL`: decisão sobre owner/ambiente/escopo/rollback.

Nenhuma transição documental pode produzir `GO` de produção.
