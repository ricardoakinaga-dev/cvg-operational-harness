# Governance extraction analysis

## Fluxo governado confirmado

```text
tenant/operator/agent/capability/action/resource
→ profile/role ceiling + policy document
→ ALLOW / DENY / REQUIRE_APPROVAL
→ proposta imutável e payload hash
→ approval reserve/fencing
→ effect journal
→ tool
→ evidence/confirm/uncertain
→ outbox
→ audit/telemetry
```

Anchors: `packages/policy-engine/src/engine.ts:39-66`, `:104-340`; `grants.ts:10-160`; `packages/approval-engine/src/contracts.ts:30-212`; `engine.ts:228-266`, `:465+`; `packages/agent-runtime/src/runtime.ts:626-1013`; `packages/persistence/src/runtime-approval-store.ts:359-390`.

## Controles

- RBAC de endpoint: `packages/shared/src/auth.ts:4-57`.
- identity mode/trusted resolver: `shared/src/auth.ts:60-129`.
- token local assinado, replay cache e key rotation: `apps/api/src/operator-identity.ts:12-277`; explicitamente não é IdP externo.
- tenant resolution separa headers/body não confiáveis: `apps/api/src/server.ts:3535-3579`.
- self-approval negada na engine; decisão de role fica na borda API.
- três domínios de approval coexistem: atendimento, capability platform e runtime.

## Genericidade

Genéricos: evaluator determinístico, state machine de approval, proposal binding, fencing, effect certainty e ports. Secretary/CVG-specific: catálogo de 21 capabilities, profiles/grants, action/resource semantics, clinical/finance rules e controlled scheduling plugin.

Gaps: a engine de approval confia que o caller já autorizou o approver; replay de identity é process-local; namespaces de approval podem divergir; Admin não possui `approval:decide`; integração com IdP/secret manager é `UNKNOWN`.

Scores: Policy **8**, Approval **8**, RBAC **6**, Tenant Isolation **8**. Extração deve separar mecanismo de catálogo e exigir um `AuthorizationPort` explícito para callers diretos.
