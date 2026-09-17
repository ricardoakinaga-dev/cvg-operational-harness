# Response composition and verification — AAA-4A

## Source precedence

The composer accepts typed source records only. It does not infer authority
from fluent wording, model confidence or persona style.

| Source               | Permitted claims                                   | Example                             |
| -------------------- | -------------------------------------------------- | ----------------------------------- |
| `USER_CONFIRMED`     | Facts explicitly supplied or corrected by the user | Requested date or room              |
| `TOOL_RESULT`        | Validated output from the existing Harness         | Effect reference and bounded result |
| `KNOWLEDGE_EVIDENCE` | Approved, versioned provider evidence              | Synthetic handbook citation         |
| `SYSTEM_STATE`       | Persisted status and references                    | Pending approval or handoff id      |

The verifier rejects drafts whose claims do not map to these sources. The
fallback is a bounded clarification/uncertainty response and carries a
`SYSTEM_STATE` repair reference. `FAILED`, `DENIED`, `UNCERTAIN`,
`WAITING_APPROVAL`, `HANDOFF` and delivery-pending states cannot use the
effect-success template. `SUCCEEDED` is accepted only when the Harness result
is bound to the proposal and includes an effect evidence reference.

The composer emits stable `responseId` and `deliveryKey` values derived from
the turn/plan identity. It never writes approval, policy or effect state. A
response that fails delivery remains a persisted response with a separate
delivery status, so replay can retry the message without invoking the action.

The synthetic Service Desk demonstrates proposal, approval-required response,
authenticated resume, effect-backed completion and replay. The Knowledge
Assistant demonstrates approved-source citation and excludes a decoy source.
