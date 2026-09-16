# AAA-21 failure taxonomy

The execution result distinguishes control-flow pauses from failures. This
prevents retry policy from turning a governance pause or an unknown side
effect into an automatic duplicate action.

| Class               | Durable state                           | Examples                                                                   | Automatic behavior                                 |
| ------------------- | --------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------- |
| Technical retryable | `FAILED_RETRYABLE`                      | transient model/tool/queue/DB error with no unknown effect                 | Retry after `retryAt`, subject to policy and lease |
| Semantic terminal   | `FAILED_TERMINAL`                       | invalid runtime result, unsupported contract, deterministic terminal error | No automatic retry                                 |
| Policy denied       | `FAILED_TERMINAL` with `POLICY_DENIED`  | policy denies before an effect                                             | No effect; operator/audit review only              |
| Approval pause      | `WAITING_APPROVAL`                      | approval is required and pending                                           | No effect; explicit approval resolution may queue  |
| User pause          | `WAITING_USER`                          | runtime needs user input                                                   | No effect; explicit user response may queue        |
| Unknown effect      | `FAILED_TERMINAL` with `UNKNOWN_EFFECT` | crash after effect start before confirmation                               | No silent retry; explicit reconciliation required  |
| Cancelled           | `CANCELLED`                             | authorized cancellation before completion                                  | Terminal; no resurrection                          |

The worker maps the governed runtime stop reason into this taxonomy in
`packages/harness/src/execution-spine.ts`. Tool-level `UNCERTAIN` is kept in
the effect journal and is surfaced as `unknown_effect` instead of being
collapsed into a generic technical retry.

The current neutral worker has synthetic deterministic model/policy/approval
adapters and no tools. Real provider and real effect classifications remain
future work and are not certified here.
