# AAA-34 — §10 capability/resource/role matrix (packages/policy-engine)

- Source of truth: `packages/policy-engine/src/capabilities.ts` (risk, resource scope, actions) and `packages/policy-engine/src/grants.ts` (grants, role ceilings).
- Behavioral validation: `packages/policy-engine/src/__tests__/execution-contract-matrix.test.ts` exercises the real engine against this matrix with synthetic input.
- Scope: controlled/synthetic only. No real appointment, patient, message or adapter is touched.

## 1. Decision order asserted by tests (fail-closed)

| #   | Check                                                                           | Reason on failure                                      | Test evidence                                                            |
| --- | ------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------ |
| 0   | Strict input schema (required fields, lengths, no extra keys)                   | `insufficient_context`                                 | missing/empty/unknown fields, extra field                                |
| 1   | Tenant (`resource.tenantId !== tenantId`)                                       | `tenant_mismatch`                                      | tenant wins over unknown resource type, action and grants                |
| 2   | Resource scope (capability × `resource.type`)                                   | `resource_type_required` / `resource_type_not_allowed` | wins over action mismatch, grants and policy documents                   |
| 3   | Action binding (`CAPABILITY_ACTIONS`)                                           | `action_capability_mismatch`                           | wins over grants                                                         |
| 4   | Profile grant (`AGENT_PROFILE_GRANTS`)                                          | `capability_not_granted`                               | wins over operator role                                                  |
| 5   | Operator role ceiling (`OPERATOR_ROLE_CAPABILITIES`)                            | `operator_role_denied`                                 | after grant, before documents                                            |
| 6   | Policy documents (tenant + effective window + priority, then effect precedence) | rule reason                                            | document identity reported; ALLOW cannot remove grant approval floor     |
| 7   | Grant fallback (`requiresMedicalOperator` → level → HIGH/ADMIN risk → allow)    | medical / approval / high-risk reason                  | `clinical.prescribe` without medical operator or emergency asks approval |

## 2. Capability × profile grant matrix

Legend: `A` = allow, `R` = require_approval, `R*` = require_approval + `requiresMedicalOperator`, `—` = no grant (DENY `capability_not_granted`).

| Capability               | Risk              | Resource scope (`resource.type`)   | secretary          | hospitalization | clinical | financial | admin |
| ------------------------ | ----------------- | ---------------------------------- | ------------------ | --------------- | -------- | --------- | ----- |
| `schedule.read`          | READ_ONLY         | not scoped                         | A                  | A               | —        | —         | —     |
| `appointment.create`     | MEDIUM_RISK_WRITE | `appointment`, `appointment_draft` | A                  | —               | —        | —         | —     |
| `appointment.modify`     | MEDIUM_RISK_WRITE | `appointment_draft` only           | A                  | —               | —        | —         | —     |
| `appointment.confirm`    | HIGH_RISK_WRITE   | `appointment`                      | —                  | —               | —        | —         | —     |
| `appointment.reschedule` | HIGH_RISK_WRITE   | `appointment`                      | —                  | —               | —        | —         | —     |
| `appointment.cancel`     | HIGH_RISK_WRITE   | `appointment`                      | R                  | —               | —        | —         | —     |
| `conversation.read`      | READ_ONLY         | not scoped                         | A                  | A               | A        | —         | A     |
| `message.draft`          | LOW_RISK_WRITE    | not scoped                         | A                  | A               | —        | —         | —     |
| `message.send`           | MEDIUM_RISK_WRITE | not scoped                         | A                  | A               | —        | —         | —     |
| `patient.summary.read`   | READ_ONLY         | not scoped                         | A (limited fields) | A               | A        | —         | —     |
| `patient.record.read`    | READ_ONLY         | not scoped                         | —                  | A               | A        | —         | —     |
| `patient.record.write`   | HIGH_RISK_WRITE   | not scoped                         | —                  | —               | R        | —         | —     |
| `exam.read`              | READ_ONLY         | not scoped                         | —                  | —               | A        | —         | —     |
| `exam.release`           | HIGH_RISK_WRITE   | not scoped                         | —                  | —               | R        | —         | —     |
| `finance.read`           | READ_ONLY         | not scoped                         | —                  | —               | —        | A         | A     |
| `finance.write`          | HIGH_RISK_WRITE   | not scoped                         | —                  | —               | —        | R         | —     |
| `hospitalization.manage` | HIGH_RISK_WRITE   | not scoped                         | —                  | R               | —        | —         | —     |
| `clinical.diagnose`      | HIGH_RISK_WRITE   | not scoped                         | —                  | —               | R        | —         | —     |
| `clinical.prescribe`     | HIGH_RISK_WRITE   | not scoped                         | —                  | —               | R\*      | —         | —     |
| `admin.policy.manage`    | ADMIN             | not scoped                         | —                  | —               | —        | —         | R     |
| `admin.agent.manage`     | ADMIN             | not scoped                         | —                  | —               | —        | —         | R     |

Asserted invariants:

- `appointment.confirm` and `appointment.reschedule` have **no grant in any profile** (and none in the raw `AGENT_PROFILE_GRANTS`), so ALLOW/RESOLVE is impossible; every profile × role returns `DENY` / `capability_not_granted`.
- `appointment.modify` only accepts `appointment_draft`; `appointment` (real) returns `resource_type_not_allowed` for every profile, even profiles without a grant and even with a tenant ALLOW document.
- `appointment.create` accepts `appointment` and `appointment_draft`; any other/absent type fails closed.
- `appointment.cancel` stays `REQUIRE_APPROVAL` for `secretary` and requires the `appointment` resource (real adapter still out of scope).

## 3. Resource scope outcomes per scoped capability

| Capability               | resource absent          | `appointment`                           | `appointment_draft`         | unknown type                |
| ------------------------ | ------------------------ | --------------------------------------- | --------------------------- | --------------------------- |
| `appointment.create`     | `resource_type_required` | allowed                                 | allowed                     | `resource_type_not_allowed` |
| `appointment.modify`     | `resource_type_required` | `resource_type_not_allowed`             | allowed                     | `resource_type_not_allowed` |
| `appointment.confirm`    | `resource_type_required` | allowed (then `capability_not_granted`) | `resource_type_not_allowed` | `resource_type_not_allowed` |
| `appointment.reschedule` | `resource_type_required` | allowed (then `capability_not_granted`) | `resource_type_not_allowed` | `resource_type_not_allowed` |
| `appointment.cancel`     | `resource_type_required` | allowed (then `REQUIRE_APPROVAL`)       | `resource_type_not_allowed` | `resource_type_not_allowed` |

A provided `resource` without a usable `type` (`{}`, numeric type, empty string) fails at the strict envelope schema with `insufficient_context` — also `DENY`. Tested for all scoped capabilities × all profiles (25 profiles/capability combinations each for unknown type and for absent resource).

## 4. Operator role ceiling × capability

| Role       | Allowed capabilities                                                                                                                                                   | Count |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| Operator   | `schedule.read`, `appointment.create`, `appointment.modify`, `conversation.read`, `message.draft`, `message.send`, `patient.summary.read`, `exam.read`, `finance.read` | 9     |
| Approver   | Operator set + `exam.release`, `finance.write`, `appointment.cancel`, `patient.record.write`                                                                           | 13    |
| Supervisor | every capability except `admin.*`                                                                                                                                      | 19    |
| Admin      | all catalog capabilities                                                                                                                                               | 21    |
| System     | all catalog capabilities                                                                                                                                               | 21    |

The engine consults the grant before the role, so a role that cannot exercise a capability only yields `operator_role_denied` when the profile actually has the grant. The approval authority helpers are asserted separately:

- `Operator` never approves (`canApproveCapability` false even for read capabilities).
- `Approver` approves `finance.write` and `exam.release`, but not `admin.policy.manage`.
- `Supervisor` approves `appointment.cancel` but not `admin.agent.manage`.
- `Admin`/`System` approve admin capabilities.

## 5. Full matrix execution

`matches grants, role ceiling and risk for every profile/role/capability` evaluates **5 profiles × 5 roles × 21 capabilities = 525** synthetic requests against the real engine and compares decision, reason, risk and capability echo to the matrix above. Zero mismatches.
